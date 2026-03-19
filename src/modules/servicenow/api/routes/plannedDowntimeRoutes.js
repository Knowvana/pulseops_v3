// ============================================================================
// ServiceNow Module — Planned Downtime / Change Configuration Routes
//
// PURPOSE: Expose planned downtime from ServiceNow Change Requests and
// Implementation Tasks (ITASKs) as a REST API. Consumed by the HealthCheck
// module to exclude planned maintenance from uptime SLA calculations.
//
// ENDPOINTS:
//   GET  /config/change                          → Load change configuration
//   PUT  /config/change                          → Save change configuration
//   PUT  /config/change/columns                  → Save selected columns for change grid
//   PUT  /config/change/downtime-mapping         → Save downtime field mapping (start/end fields)
//   GET  /schema/change-columns                  → Fetch SNOW column metadata for change table
//   GET  /schema/change-columns/:col/values      → Fetch sample values for a column
//   GET  /planned-downtime                       → Fetch changes with query params (?startDate, ?endDate, ?filter)
//   POST /planned-downtime/sync                  → Force sync (same as GET, explicit semantics)
//
// SNOW TABLES USED:
//   - change_request   → Standard change records
//   - change_task      → Change tasks (implementation tasks / ITASKs)
// ============================================================================
import { Router } from 'express';
import { snowUrls, apiErrors, apiMessages } from '#modules/servicenow/api/config/index.js';
import {
  loadConnectionConfig, loadIncidentConfig, loadModuleConfig, saveModuleConfig,
  buildAssignmentGroupQuery, snowVal,
} from '#modules/servicenow/api/routes/helpers.js';
import { snowGet, snowWrite, isSnowSuccess } from '#modules/servicenow/api/lib/SnowApiClient.js';
import { createSnowLogger } from '#modules/servicenow/api/lib/moduleLogger.js';
import { getEffectiveTimezone } from '#modules/servicenow/api/services/TimezoneService.js';
import { convertToTimezone } from '#modules/servicenow/api/lib/dateUtils.js';

const log = createSnowLogger('plannedDowntimeRoutes.js');
const router = Router();
const routes = snowUrls.routes;

// ── Change config defaults ───────────────────────────────────────────────────
const CHANGE_CONFIG_DEFAULTS = {
  selectedColumns: ['number', 'short_description', 'state', 'assignment_group', 'work_start', 'work_end'],
  downtimeMapping: {
    startDateField: 'work_start',
    endDateField: 'work_end',
  },
};

// Source tables are fixed by architecture:
//   change_request  → parent change record (created by user)
//   change_task     → implementation task (downtime window lives here)
const CHANGE_TABLE = 'change_request';
const TASK_TABLE   = 'change_task';

async function loadChangeConfig() {
  const stored = await loadModuleConfig('change_config');
  const merged = { ...CHANGE_CONFIG_DEFAULTS, ...(stored || {}) };
  // Clean up: 'type' was incorrectly included in defaults in earlier versions — strip it
  if (Array.isArray(merged.selectedColumns)) {
    merged.selectedColumns = merged.selectedColumns.filter(c => c !== 'type');
  }
  return merged;
}

// ═════════════════════════════════════════════════════════════════════════════
// CHANGE CONFIGURATION (DB-backed via sn_module_config, key='change_config')
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /config/change ───────────────────────────────────────────────────────
router.get(routes.configChange, async (req, res) => {
  try {
    const config = await loadChangeConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    log.error('GET change config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.change.loadConfigFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config/change ───────────────────────────────────────────────────────
router.put(routes.configChange, async (req, res) => {
  try {
    const config = req.body;
    log.info('Saving change config', config);
    await saveModuleConfig('change_config', config, 'Change/planned downtime configuration');
    res.json({ success: true, data: config, message: apiMessages.change.configSaved });
  } catch (err) {
    log.error('PUT change config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.change.saveConfigFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config/change/columns — Save selected columns for change grid ───────
router.put(routes.configChangeColumns, async (req, res) => {
  try {
    const { selectedColumns } = req.body;
    if (!selectedColumns || !Array.isArray(selectedColumns)) {
      return res.status(400).json({ success: false, error: { message: 'selectedColumns must be an array.' } });
    }
    if (!selectedColumns.includes('number')) {
      return res.status(400).json({ success: false, error: { message: 'Change number column is mandatory.' } });
    }
    const current = await loadChangeConfig();
    await saveModuleConfig('change_config', { ...current, selectedColumns }, 'Change/planned downtime configuration');
    return res.json({ success: true, message: 'Selected change columns saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.change.saveConfigFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config/change/downtime-mapping — Save downtime field mapping ────────
router.put(routes.configChangeDowntimeMapping, async (req, res) => {
  try {
    const { startDateField, endDateField } = req.body;
    if (!startDateField || !endDateField) {
      return res.status(400).json({ success: false, error: { message: 'Both startDateField and endDateField are required.' } });
    }
    const current = await loadChangeConfig();
    await saveModuleConfig('change_config', {
      ...current,
      downtimeMapping: { startDateField, endDateField },
    }, 'Change/planned downtime configuration');
    return res.json({ success: true, message: 'Downtime column mapping saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.change.saveConfigFailed.replace('{message}', err.message) } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SCHEMA / COLUMN METADATA FOR CHANGE TABLES
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /schema/change-columns — Fetch SNOW column metadata for change table ─
// Query param: ?table=change_request | change_task (defaults to current config)
router.get(routes.schemaChangeColumns, async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    }

    // Default to change_task for downtime column metadata (task columns are mapped)
    const table = req.query.table || TASK_TABLE;
    log.info('Fetching change columns', { table, requestedTable: req.query.table, defaultTable: TASK_TABLE });

    // 1. Query sys_dictionary for column metadata
    // Fetch all columns except internal system fields (sys_id, sys_class_name, etc.)
    const dictResult = await snowGet(conn, snowUrls.snow.tables.sysDictionary,
      `sysparm_query=name=${table}^elementISNOTEMPTY^elementNOT INsys_id,sys_class_name,sys_class_path,sys_mod_count,sys_scope^ORDERBYcolumn_label` +
      `&sysparm_fields=element,column_label,internal_type,max_length,mandatory,read_only,comments` +
      `&sysparm_limit=500`
    );

    let columns = [];
    let usedDictionary = false;

    if (dictResult.statusCode >= 200 && dictResult.statusCode < 300 && dictResult.data?.result?.length > 0) {
      usedDictionary = true;
      columns = dictResult.data.result.map(field => ({
        name:      snowVal(field.element),
        label:     snowVal(field.column_label) || snowVal(field.element)?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        type:      snowVal(field.internal_type) || 'string',
        maxLength: Number(snowVal(field.max_length)) || null,
        mandatory: snowVal(field.mandatory) === 'true' || snowVal(field.mandatory) === true,
        readOnly:  snowVal(field.read_only) === 'true' || snowVal(field.read_only) === true,
        helpText:  snowVal(field.comments) || null,
      })).filter(c => c.name);
    }

    // Fallback: get column names from a sample record
    if (columns.length === 0) {
      const fallbackResult = await snowGet(conn, `table/${table}`, 'sysparm_limit=1');
      if (fallbackResult.statusCode >= 200 && fallbackResult.statusCode < 300 && fallbackResult.data?.result?.length > 0) {
        const sampleRecord = fallbackResult.data.result[0] || {};
        columns = Object.keys(sampleRecord).sort().map(col => ({
          name:      col,
          label:     col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          type:      'string',
          maxLength: null,
          mandatory: false,
          readOnly:  false,
          helpText:  null,
        }));
      }
    }

    // 2. Fetch one sample record to get actual values for each column
    let sampleValues = {};
    try {
      const sampleResult = await snowGet(conn, `table/${table}`, 'sysparm_limit=1&sysparm_query=ORDERBYDESCsys_created_on');
      if (sampleResult.statusCode >= 200 && sampleResult.statusCode < 300 && sampleResult.data?.result?.length > 0) {
        const sample = sampleResult.data.result[0];
        for (const [key, val] of Object.entries(sample)) {
          sampleValues[key] = snowVal(val);
        }
      }
    } catch { /* best-effort */ }

    // 3. Merge sample values into column metadata
    for (const col of columns) {
      col.sampleValue = sampleValues[col.name] !== undefined ? String(sampleValues[col.name] ?? '') : null;
    }

    // 4. Add columns from sample that aren't in sys_dictionary
    if (usedDictionary) {
      const knownNames = new Set(columns.map(c => c.name));
      for (const [key, val] of Object.entries(sampleValues)) {
        if (!knownNames.has(key)) {
          columns.push({
            name:        key,
            label:       key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            type:        'string',
            maxLength:   null,
            mandatory:   false,
            readOnly:    false,
            helpText:    null,
            sampleValue: String(val ?? ''),
          });
        }
      }
    }

    columns.sort((a, b) => (a.label || '').localeCompare(b.label || ''));

    return res.json({
      success: true,
      data: {
        columns,
        totalColumns: columns.length,
        table,
        source: usedDictionary ? 'sys_dictionary' : 'sample_record',
        hasSampleValues: Object.keys(sampleValues).length > 0,
      },
    });
  } catch (err) {
    log.error('GET change columns failed', { message: err.message });
    return res.status(500).json({ success: false, error: { message: apiErrors.change.loadConfigFailed.replace('{message}', err.message) } });
  }
});

// ── GET /schema/change-columns/:columnName/values — Sample values for a column
router.get(routes.schemaChangeColumnValues, async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    }

    const { columnName } = req.params;
    if (!columnName || /[^a-zA-Z0-9_]/.test(columnName)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid column name.' } });
    }

    const table = req.query.table || TASK_TABLE;

    // Use the stored assignment group for filtering
    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const baseFilter = agQuery
      ? `${columnName}ISNOTEMPTY^${agQuery}^ORDERBYDESCsys_created_on`
      : `${columnName}ISNOTEMPTY^ORDERBYDESCsys_created_on`;

    const query = [
      `sysparm_query=${baseFilter}`,
      `sysparm_fields=${columnName}`,
      'sysparm_limit=100',
    ].join('&');

    const snowResp = await snowGet(conn, `table/${table}`, query);
    if (!isSnowSuccess(snowResp.statusCode)) {
      const message = snowResp.data?.error?.message || `ServiceNow responded with HTTP ${snowResp.statusCode}`;
      return res.status(snowResp.statusCode || 502).json({ success: false, error: { message } });
    }

    const records = snowResp.data?.result || [];
    const seen = new Set();
    const values = [];
    for (const record of records) {
      const raw = snowVal(record[columnName]);
      const val = raw != null ? String(raw).trim() : '';
      if (val && !seen.has(val)) {
        seen.add(val);
        values.push(val);
        if (values.length >= 5) break;
      }
    }

    return res.json({ success: true, data: { column: columnName, values, total: values.length, table } });
  } catch (err) {
    log.error('GET change column values failed', { message: err.message });
    return res.status(500).json({ success: false, error: { message: `Failed to fetch column values: ${err.message}` } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PLANNED DOWNTIME (fetches from SNOW with date query params)
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /planned-downtime ────────────────────────────────────────────────────
// Query params:
//   ?startDate=YYYY-MM-DD   → Start of date range (required)
//   ?endDate=YYYY-MM-DD     → End of date range (required)
//   ?filter=<sysparm_query> → Additional SNOW query filter (optional)
router.get(routes.plannedDowntime, async (req, res) => {
  try {
    const config = await loadChangeConfig();

    const connConfig = loadConnectionConfig();
    if (!connConfig.isConfigured || !connConfig.instanceUrl) {
      return res.status(400).json({ success: false, error: { message: apiErrors.plannedDowntime.notConfigured } });
    }

    const { startDate, endDate, filter } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: { message: 'startDate and endDate query parameters are required (YYYY-MM-DD).' } });
    }

    const tz = await getEffectiveTimezone();
    const entries = await fetchPlannedDowntimeFromSnow(config, connConfig, startDate, endDate, filter, tz);
    res.json({
      success: true,
      data: entries,
      count: entries.length,
      message: apiMessages.plannedDowntime.fetched.replace('{count}', String(entries.length)),
    });
  } catch (err) {
    log.error('GET planned downtime failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.plannedDowntime.fetchFailed.replace('{message}', err.message) } });
  }
});

// ── POST /planned-downtime/sync ──────────────────────────────────────────────
// Body: { startDate, endDate, filter }
router.post(routes.plannedDowntimeSync, async (req, res) => {
  try {
    const config = await loadChangeConfig();

    const connConfig = loadConnectionConfig();
    if (!connConfig.isConfigured || !connConfig.instanceUrl) {
      return res.status(400).json({ success: false, error: { message: apiErrors.plannedDowntime.notConfigured } });
    }

    const { startDate, endDate, filter } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: { message: 'startDate and endDate are required (YYYY-MM-DD).' } });
    }

    log.info('Syncing planned downtime from ServiceNow', { startDate, endDate });
    const tz = await getEffectiveTimezone();
    const entries = await fetchPlannedDowntimeFromSnow(config, connConfig, startDate, endDate, filter, tz);
    log.info('Planned downtime sync complete', { count: entries.length });

    res.json({
      success: true,
      data: entries,
      count: entries.length,
      message: apiMessages.plannedDowntime.synced.replace('{count}', String(entries.length)),
    });
  } catch (err) {
    log.error('POST planned downtime sync failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.plannedDowntime.syncFailed.replace('{message}', err.message) } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL: Fetch planned downtime from ServiceNow
// ═════════════════════════════════════════════════════════════════════════════
async function fetchPlannedDowntimeFromSnow(config, connConfig, startDate, endDate, extraFilter, targetTz) {
  const table = TASK_TABLE;
  const mapping = config.downtimeMapping || {};
  const startField = mapping.startDateField || 'work_start';
  const endField = mapping.endDateField || 'work_end';

  // Use the selected columns from config for fetching
  const selectedColumns = config.selectedColumns || CHANGE_CONFIG_DEFAULTS.selectedColumns;
  // Always include sys_id, change_request (for Change Number), and the downtime mapping fields
  const fieldsSet = new Set([...selectedColumns, 'sys_id', 'change_request', startField, endField]);
  const fields = [...fieldsSet].join(',');

  // Format dates for SNOW: YYYY-MM-DD → "YYYY-MM-DD 00:00:00"
  const snowStart = `${startDate} 00:00:00`;
  const snowEnd = `${endDate} 23:59:59`;

  // Build sysparm_query with date range on the start date field
  let sysparmQuery = `${startField}>=${snowStart}^${startField}<=${snowEnd}`;

  // Use assignment group from the stored SNOW incident config
  const incidentConfig = await loadIncidentConfig();
  const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
  if (agQuery) sysparmQuery += `^${agQuery}`;

  // Append any extra filter from the caller
  if (extraFilter) sysparmQuery += `^${extraFilter}`;

  // Use sysparm_display_value=all so every field returns { display_value, value }.
  // For reference fields we use display_value; for date fields we use value (raw UTC) so
  // our own timezone conversion produces the correct result.
  const queryString = `sysparm_query=${encodeURIComponent(sysparmQuery)}&sysparm_fields=${encodeURIComponent(fields)}&sysparm_display_value=all&sysparm_limit=500`;

  log.info('Fetching planned downtime from SNOW', { table, startDate, endDate, query: sysparmQuery.substring(0, 200) });

  const snowResponse = await snowGet(connConfig, `table/${table}`, queryString);

  if (!isSnowSuccess(snowResponse.statusCode)) {
    const errMsg = snowResponse.data?.error?.message || `ServiceNow HTTP ${snowResponse.statusCode}`;
    throw new Error(errMsg);
  }

  const results = snowResponse?.data?.result || [];
  if (results.length === 0) {
    log.info('SNOW returned 0 records for planned downtime', { startDate, endDate });
    return [];
  }

  // Log first record to debug reference field structure and timezone conversion
  if (results.length > 0) {
    const sample = results[0];
    log.debug('Sample change_task record (display_value=all)', {
      change_request: sample.change_request,
      [startField]: sample[startField],
      [endField]: sample[endField],
      targetTz,
    });
  }

  // With sysparm_display_value=all, every field comes back as { display_value, value }.
  // - For date fields: use .value (raw UTC "YYYY-MM-DD HH:MM:SS") then convertToTimezone.
  // - For reference fields: use .display_value (human-readable name/number).
  // - For everything else: use .display_value (already human-friendly).
  const dateFieldNames = new Set([startField, endField, 'sys_created_on', 'sys_updated_on', 'work_start', 'work_end', 'opened_at', 'closed_at']);

  const entries = results.map(record => {
    const row = {};
    for (const col of fieldsSet) {
      const raw = record[col];
      if (raw && typeof raw === 'object' && ('display_value' in raw || 'value' in raw)) {
        if (dateFieldNames.has(col)) {
          // Date field: use raw UTC value, then convert to target timezone
          const utcVal = snowVal(raw.value) ?? null;
          row[col] = (targetTz && utcVal) ? convertToTimezone(utcVal, targetTz) : utcVal;
        } else {
          // Reference or other field: use display_value for readability
          row[col] = snowVal(raw.display_value) ?? snowVal(raw.value) ?? null;
        }
      } else {
        row[col] = snowVal(raw) ?? null;
      }
    }
    // Add computed meta fields
    row._change_type = 'task';
    row._source = 'servicenow';
    row._start_time = row[startField] || null;
    row._end_time = row[endField] || null;
    return row;
  });

  return entries;
}

// ═════════════════════════════════════════════════════════════════════════════
// CHANGE CRUD — Create, Update, Close changes in ServiceNow
// Architecture: POST /changes creates a change_request AND a linked change_task.
// The change_task carries the downtime window (start/end dates).
// Close operates on the change_request (the parent record).
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /changes/open — Fetch open changes for configured assignment group ───
router.get(routes.changesOpen, async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    }

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);

    // Open change_request states: -5=New, -4=Assess, -3=Authorize, -2=Scheduled, -1=Implement, 0=Review
    let sysparmQuery = 'stateNOT IN3,4,7^ORDERBYDESCsys_created_on';
    if (agQuery) sysparmQuery = `${agQuery}^${sysparmQuery}`;

    const query = `sysparm_query=${encodeURIComponent(sysparmQuery)}&sysparm_fields=sys_id,number,short_description,state,assignment_group,priority&sysparm_limit=50`;

    const snowResp = await snowGet(conn, `table/${CHANGE_TABLE}`, query);
    if (!isSnowSuccess(snowResp.statusCode)) {
      const errMsg = snowResp.data?.error?.message || `ServiceNow HTTP ${snowResp.statusCode}`;
      return res.status(snowResp.statusCode || 502).json({ success: false, error: { message: errMsg } });
    }

    const records = (snowResp.data?.result || []).map(r => ({
      sysId:            snowVal(r.sys_id),
      number:           snowVal(r.number),
      shortDescription: snowVal(r.short_description),
      state:            snowVal(r.state),
      assignmentGroup:  snowVal(r.assignment_group),
      priority:         snowVal(r.priority),
    }));

    return res.json({ success: true, data: { changes: records, count: records.length } });
  } catch (err) {
    log.error('GET open changes failed', { message: err.message });
    return res.status(500).json({ success: false, error: { message: `Failed to fetch open changes: ${err.message}` } });
  }
});

// ── POST /changes — Create a change_request + linked change_task ─────────────
router.post(routes.changes, async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    }

    const config = await loadChangeConfig();

    const {
      shortDescription, description, type, category, assignmentGroup,
      startDate, endDate, impact, urgency,
    } = req.body;

    if (!shortDescription) {
      return res.status(400).json({ success: false, error: { message: 'shortDescription is required.' } });
    }

    // 1. Create the parent change_request
    const changeBody = { short_description: shortDescription };
    if (description) changeBody.description = description;
    if (type) changeBody.type = type;
    if (category) changeBody.category = category;
    if (assignmentGroup) changeBody.assignment_group = assignmentGroup;
    if (impact) changeBody.impact = impact;
    if (urgency) changeBody.urgency = urgency;

    log.info('Creating change_request', { shortDescription: shortDescription.substring(0, 60) });
    const chgResp = await snowWrite(conn, `table/${CHANGE_TABLE}`, 'POST', JSON.stringify(changeBody));
    if (!isSnowSuccess(chgResp.statusCode)) {
      const errMsg = chgResp.data?.error?.message || `ServiceNow HTTP ${chgResp.statusCode}`;
      return res.status(chgResp.statusCode || 502).json({ success: false, error: { message: errMsg } });
    }

    const chg = chgResp.data?.result || {};
    const chgNumber = snowVal(chg.number);
    const chgSysId = snowVal(chg.sys_id);
    log.info('Change request created', { number: chgNumber, sysId: chgSysId });

    // 2. Create a linked change_task under the change_request
    const mapping = config.downtimeMapping || {};
    const startField = mapping.startDateField || 'work_start';
    const endField = mapping.endDateField || 'work_end';

    const taskBody = {
      change_request: chgSysId,
      short_description: `Implementation Task - ${shortDescription}`,
    };
    if (assignmentGroup) taskBody.assignment_group = assignmentGroup;
    if (startDate) taskBody[startField] = startDate;
    if (endDate) taskBody[endField] = endDate;

    let taskNumber = null;
    let taskSysId = null;
    try {
      log.info('Creating change_task linked to change', { parentChange: chgNumber });
      const taskResp = await snowWrite(conn, `table/${TASK_TABLE}`, 'POST', JSON.stringify(taskBody));
      if (isSnowSuccess(taskResp.statusCode)) {
        const task = taskResp.data?.result || {};
        taskNumber = snowVal(task.number);
        taskSysId = snowVal(task.sys_id);
        log.info('Change task created', { number: taskNumber, sysId: taskSysId, parent: chgNumber });
      } else {
        log.warn('Change task creation failed (non-fatal)', { status: taskResp.statusCode, error: taskResp.data?.error?.message });
      }
    } catch (taskErr) {
      log.warn('Change task creation error (non-fatal)', { error: taskErr.message });
    }

    return res.json({
      success: true,
      data: {
        number: chgNumber,
        sysId: chgSysId,
        table: CHANGE_TABLE,
        task: taskNumber ? { number: taskNumber, sysId: taskSysId, table: TASK_TABLE } : null,
      },
      message: taskNumber
        ? `Change ${chgNumber} + Task ${taskNumber} created successfully.`
        : `Change ${chgNumber} created (task creation may have failed).`,
    });
  } catch (err) {
    log.error('POST create change failed', { message: err.message });
    return res.status(500).json({ success: false, error: { message: `Failed to create change: ${err.message}` } });
  }
});

// ── PATCH /changes/:sysId — Update a change_request ─────────────────────────
router.patch(routes.changeById, async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    }

    const { sysId } = req.params;

    const body = { ...req.body };
    delete body.sysId;
    delete body.table;

    const bodyStr = JSON.stringify(body);
    log.info('Updating change_request', { sysId });

    const snowResp = await snowWrite(conn, `table/${CHANGE_TABLE}/${sysId}`, 'PATCH', bodyStr);
    if (!isSnowSuccess(snowResp.statusCode)) {
      const errMsg = snowResp.data?.error?.message || `ServiceNow HTTP ${snowResp.statusCode}`;
      return res.status(snowResp.statusCode || 502).json({ success: false, error: { message: errMsg } });
    }

    const updated = snowResp.data?.result || {};
    log.info('Change updated', { number: snowVal(updated.number) });

    return res.json({
      success: true,
      data: { number: snowVal(updated.number), sysId },
      message: `Change ${snowVal(updated.number) || sysId} updated.`,
    });
  } catch (err) {
    log.error('PATCH update change failed', { message: err.message });
    return res.status(500).json({ success: false, error: { message: `Failed to update change: ${err.message}` } });
  }
});

// ── POST /changes/:sysId/close — Close a change_request ─────────────────────
// ServiceNow enforces state transitions via Business Rules.
// SEQUENCE: 1) Close all linked change_tasks first, 2) Transition change_request through states to Closed.
// change_task states: 1=Open, 2=Work in Progress, 3=Closed Complete, 4=Closed Incomplete
// change_request states: -5=New, -4=Assess, -3=Authorize, -2=Scheduled, -1=Implement, 0=Review, 3=Closed
router.post(routes.changeClose, async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    }

    const { sysId } = req.params;
    const { closeNotes } = req.body;

    // Step 1: Find all linked change_tasks for this change_request
    log.info('Closing change: step 1 — finding linked change_tasks', { changeSysId: sysId });
    const taskQuery = `sysparm_query=${encodeURIComponent(`change_request=${sysId}^stateNOT IN3,4`)}&sysparm_fields=sys_id,number,state&sysparm_limit=100`;
    const taskListResp = await snowGet(conn, `table/${TASK_TABLE}`, taskQuery);

    if (isSnowSuccess(taskListResp.statusCode)) {
      const openTasks = taskListResp.data?.result || [];
      log.info('Found open change_tasks to close', { count: openTasks.length });

      // Close each open change_task (state=3 = Closed Complete)
      for (const task of openTasks) {
        const taskSysId = snowVal(task.sys_id);
        const taskNumber = snowVal(task.number);
        try {
          const taskCloseBody = JSON.stringify({
            state: '3',
            close_notes: closeNotes || 'Closed via PulseOps',
            close_code: 'successful',
          });
          log.info('Closing change_task', { taskNumber, taskSysId });
          const taskCloseResp = await snowWrite(conn, `table/${TASK_TABLE}/${taskSysId}`, 'PATCH', taskCloseBody);
          if (!isSnowSuccess(taskCloseResp.statusCode)) {
            const errMsg = taskCloseResp.data?.error?.message || `HTTP ${taskCloseResp.statusCode}`;
            log.warn('Failed to close change_task (non-fatal)', { taskNumber, error: errMsg });
          } else {
            log.info('Change_task closed', { taskNumber });
          }
        } catch (taskErr) {
          log.warn('Error closing change_task (non-fatal)', { taskNumber, error: taskErr.message });
        }
      }
    } else {
      log.warn('Could not fetch linked change_tasks (continuing with change close)', { statusCode: taskListResp.statusCode });
    }

    // Step 2: Transition change_request to Implement state (-1)
    log.info('Closing change: step 2 — transition to Implement', { sysId });
    await snowWrite(conn, `table/${CHANGE_TABLE}/${sysId}`, 'PATCH', JSON.stringify({ state: '-1' }));

    // Step 3: Transition change_request to Review state (0)
    log.info('Closing change: step 3 — transition to Review', { sysId });
    await snowWrite(conn, `table/${CHANGE_TABLE}/${sysId}`, 'PATCH', JSON.stringify({ state: '0' }));

    // Step 4: Close the change_request (state=3)
    const closeBody = {
      state: '3',
      close_notes: closeNotes || 'Closed via PulseOps',
      close_code: 'successful',
    };
    log.info('Closing change: step 4 — set to Closed', { sysId });
    const closeResp = await snowWrite(conn, `table/${CHANGE_TABLE}/${sysId}`, 'PATCH', JSON.stringify(closeBody));

    if (!isSnowSuccess(closeResp.statusCode)) {
      const errMsg = closeResp.data?.error?.message || closeResp.data?.status || `ServiceNow HTTP ${closeResp.statusCode}`;
      log.error('ServiceNow close change_request failed', { statusCode: closeResp.statusCode, error: errMsg, responseData: closeResp.data });
      return res.status(closeResp.statusCode || 502).json({ success: false, error: { message: errMsg } });
    }

    const closed = closeResp.data?.result || {};
    log.info('Change closed successfully', { number: snowVal(closed.number), sysId, state: '3' });

    return res.json({
      success: true,
      data: { number: snowVal(closed.number), sysId, state: '3' },
      message: `Change ${snowVal(closed.number) || sysId} closed successfully.`,
    });
  } catch (err) {
    log.error('POST close change failed', { message: err.message });
    return res.status(500).json({ success: false, error: { message: `Failed to close change: ${err.message}` } });
  }
});

export default router;
