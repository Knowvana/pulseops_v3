// ============================================================================
// ServiceNow Module — Incident Configuration + Schema + SLA Config Routes
//
// ENDPOINTS:
//   GET  /config/incidents              → Read full incident configuration
//   PUT  /config/incidents/columns      → Save selected columns only
//   PUT  /config/incidents/sla-mapping  → Save SLA column mapping only
//   PUT  /config/incidents/assignment-group → Save assignment group only
//   GET  /schema/columns               → Fetch SNOW incident column metadata
//                                         from sys_dictionary + sample values
//   GET  /config/sla                   → List all SLA configurations
//   POST /config/sla                   → Create a new SLA row
//   PUT  /config/sla/:id               → Update an SLA row
//   DELETE /config/sla/:id             → Delete an SLA row
//   GET  /business-hours               → Get business hours
//   PUT  /business-hours               → Update business hours
//
// MOUNT: router.use('/', incidentConfigRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import {
  loadConnectionConfig, loadIncidentConfig, loadModuleConfig, saveModuleConfig,
  loadBusinessHours, snowRequest, snowVal,
  buildAssignmentGroupQuery, DatabaseService, dbSchema,
} from './helpers.js';

const router = Router();

// ═════════════════════════════════════════════════════════════════════════════
// INCIDENT CONFIGURATION (DB-backed via sn_module_config, key='incident_config')
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /config/incidents — Read full incident configuration ────────────
router.get('/config/incidents', async (req, res) => {
  try {
    const config = await loadIncidentConfig();
    return res.json({ success: true, data: config });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load incident config: ${err.message}` } });
  }
});

// ── PUT /config/incidents/columns — Save selected columns only ──────────
router.put('/config/incidents/columns', async (req, res) => {
  try {
    const { selectedColumns } = req.body;
    if (!selectedColumns || !Array.isArray(selectedColumns)) {
      return res.status(400).json({ success: false, error: { message: 'selectedColumns must be an array.' } });
    }
    if (!selectedColumns.includes('number')) {
      return res.status(400).json({ success: false, error: { message: 'Incident number column is mandatory.' } });
    }
    const current = await loadIncidentConfig();
    await saveModuleConfig('incident_config', { ...current, selectedColumns }, 'Incident table configuration');
    return res.json({ success: true, message: 'Selected columns saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save columns: ${err.message}` } });
  }
});

// ── PUT /config/incidents/sla-mapping — Save SLA column mapping only ────
router.put('/config/incidents/sla-mapping', async (req, res) => {
  try {
    const { createdColumn, closedColumn, priorityColumn } = req.body;
    if (!createdColumn || !closedColumn) {
      return res.status(400).json({ success: false, error: { message: 'Both createdColumn and closedColumn are required.' } });
    }
    const current = await loadIncidentConfig();
    const updated = { ...current, createdColumn, closedColumn };
    if (priorityColumn) updated.priorityColumn = priorityColumn;
    await saveModuleConfig('incident_config', updated, 'Incident table configuration');
    return res.json({ success: true, message: 'SLA column mapping saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save SLA mapping: ${err.message}` } });
  }
});

// ── PUT /config/incidents/assignment-group — Save assignment group only ──
router.put('/config/incidents/assignment-group', async (req, res) => {
  try {
    const { assignmentGroup } = req.body;
    const current = await loadIncidentConfig();
    await saveModuleConfig('incident_config', { ...current, assignmentGroup: assignmentGroup || '' }, 'Incident table configuration');
    return res.json({ success: true, message: 'Assignment group saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save assignment group: ${err.message}` } });
  }
});

// ── PUT /config/incidents (saves all at once) ───────────────────────────
router.put('/config/incidents', async (req, res) => {
  try {
    const { selectedColumns, createdColumn, closedColumn, priorityColumn, assignmentGroup } = req.body;
    if (!selectedColumns || !Array.isArray(selectedColumns)) {
      return res.status(400).json({ success: false, error: { message: 'selectedColumns must be an array.' } });
    }
    if (!selectedColumns.includes('number')) {
      return res.status(400).json({ success: false, error: { message: 'Incident number column is mandatory.' } });
    }
    await saveModuleConfig('incident_config', {
      selectedColumns,
      createdColumn: createdColumn || 'opened_at',
      closedColumn: closedColumn || 'closed_at',
      priorityColumn: priorityColumn || 'priority',
      assignmentGroup: assignmentGroup || '',
    }, 'Incident table configuration');
    return res.json({ success: true, message: 'Incident configuration saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save incident config: ${err.message}` } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SCHEMA / COLUMN METADATA (from SNOW sys_dictionary + sample incident)
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /schema/columns — Fetch SNOW incident column metadata ────────────
router.get('/schema/columns', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }

    // 1. Query sys_dictionary for column metadata
    const dictResult = await snowRequest(conn, 'table/sys_dictionary',
      'sysparm_query=name=incident^elementISNOTEMPTY^elementNOT LIKEsys_^ORDERBYcolumn_label' +
      '&sysparm_fields=element,column_label,internal_type,max_length,mandatory,read_only,comments' +
      '&sysparm_limit=300'
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

    // Fallback: if sys_dictionary didn't work, get column names from a sample record
    if (columns.length === 0) {
      const fallbackResult = await snowRequest(conn, 'table/incident', 'sysparm_limit=1');
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

    // 2. Fetch one sample incident to get actual values for each column
    let sampleValues = {};
    try {
      const sampleResult = await snowRequest(conn, 'table/incident', 'sysparm_limit=1&sysparm_query=ORDERBYDESCsys_created_on');
      if (sampleResult.statusCode >= 200 && sampleResult.statusCode < 300 && sampleResult.data?.result?.length > 0) {
        const sample = sampleResult.data.result[0];
        for (const [key, val] of Object.entries(sample)) {
          sampleValues[key] = snowVal(val);
        }
      }
    } catch { /* sample fetch is best-effort */ }

    // 3. Merge sample values into column metadata
    for (const col of columns) {
      col.sampleValue = sampleValues[col.name] !== undefined ? String(sampleValues[col.name] ?? '') : null;
    }

    // 4. Also add any columns that appear in the sample but not in sys_dictionary
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

    // Sort by label
    columns.sort((a, b) => (a.label || '').localeCompare(b.label || ''));

    return res.json({
      success: true,
      data: {
        columns,
        totalColumns: columns.length,
        source: usedDictionary ? 'sys_dictionary' : 'sample_record',
        hasSampleValues: Object.keys(sampleValues).length > 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to fetch SNOW columns: ${err.message}` } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SLA CONFIGURATION (DB-backed CRUD)
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /config/sla — List all SLA configurations ────────────────────────
router.get('/config/sla', async (req, res) => {
  try {
    const result = await DatabaseService.query(
      `SELECT * FROM ${dbSchema}.sn_sla_config ORDER BY sort_order, id`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load SLA config: ${err.message}` } });
  }
});

// ── POST /config/sla — Create a new SLA row ─────────────────────────────
router.post('/config/sla', async (req, res) => {
  try {
    const { priority, priorityValue, responseMinutes, resolutionMinutes, enabled = true, sortOrder } = req.body;
    if (!priority) {
      return res.status(400).json({ success: false, error: { message: 'priority is required.' } });
    }
    if (!priorityValue) {
      return res.status(400).json({ success: false, error: { message: 'priorityValue is required.' } });
    }
    const result = await DatabaseService.query(
      `INSERT INTO ${dbSchema}.sn_sla_config (priority, priority_value, response_minutes, resolution_minutes, enabled, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`,
      [priority, String(priorityValue), Number(responseMinutes) || 60, Number(resolutionMinutes) || 480, Boolean(enabled), Number(sortOrder) || 99]
    );
    return res.json({ success: true, data: result.rows[0], message: 'SLA configuration created.' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: { message: `SLA for priority "${req.body.priority}" already exists.` } });
    }
    return res.status(500).json({ success: false, error: { message: `Failed to create SLA config: ${err.message}` } });
  }
});

// ── PUT /config/sla/:id — Update an SLA row ─────────────────────────────
router.put('/config/sla/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { priority, priorityValue, responseMinutes, resolutionMinutes, enabled, sortOrder } = req.body;
    const result = await DatabaseService.query(
      `UPDATE ${dbSchema}.sn_sla_config
       SET priority = COALESCE($2, priority),
           priority_value = COALESCE($3, priority_value),
           response_minutes = COALESCE($4, response_minutes),
           resolution_minutes = COALESCE($5, resolution_minutes),
           enabled = COALESCE($6, enabled),
           sort_order = COALESCE($7, sort_order),
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, priority, priorityValue != null ? String(priorityValue) : null, responseMinutes != null ? Number(responseMinutes) : null, resolutionMinutes != null ? Number(resolutionMinutes) : null, enabled != null ? Boolean(enabled) : null, sortOrder != null ? Number(sortOrder) : null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'SLA config not found.' } });
    }
    return res.json({ success: true, data: result.rows[0], message: 'SLA configuration updated.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to update SLA config: ${err.message}` } });
  }
});

// ── DELETE /config/sla/:id — Delete an SLA row ──────────────────────────
router.delete('/config/sla/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await DatabaseService.query(
      `DELETE FROM ${dbSchema}.sn_sla_config WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'SLA config not found.' } });
    }
    return res.json({ success: true, message: 'SLA configuration deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to delete SLA config: ${err.message}` } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// BUSINESS HOURS (DB-backed — sn_business_hours, 7 fixed rows)
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /business-hours — List all 7 days ────────────────────────────────
router.get('/business-hours', async (req, res) => {
  try {
    const rows = await loadBusinessHours();
    if (!rows || rows.length === 0) {
      return res.json({ success: true, data: [] });
    }
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load business hours: ${err.message}` } });
  }
});

// ── POST /data/seed-business-hours — Seed default business hours ────────────
router.post('/data/seed-business-hours', async (req, res) => {
  try {
    const defaultHours = [
      { day_of_week: 0, day_name: 'Sunday',    is_business_day: false, start_time: '00:00', end_time: '00:00' },
      { day_of_week: 1, day_name: 'Monday',    is_business_day: true,  start_time: '09:00', end_time: '17:00' },
      { day_of_week: 2, day_name: 'Tuesday',   is_business_day: true,  start_time: '09:00', end_time: '17:00' },
      { day_of_week: 3, day_name: 'Wednesday', is_business_day: true,  start_time: '09:00', end_time: '17:00' },
      { day_of_week: 4, day_name: 'Thursday',  is_business_day: true,  start_time: '09:00', end_time: '17:00' },
      { day_of_week: 5, day_name: 'Friday',    is_business_day: true,  start_time: '09:00', end_time: '17:00' },
      { day_of_week: 6, day_name: 'Saturday',  is_business_day: false, start_time: '00:00', end_time: '00:00' }
    ];
    
    for (const day of defaultHours) {
      await DatabaseService.query(
        `INSERT INTO ${dbSchema}.sn_business_hours (day_of_week, day_name, is_business_day, start_time, end_time, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (day_of_week) DO UPDATE SET is_business_day = $3, start_time = $4, end_time = $5, updated_at = NOW()`,
        [day.day_of_week, day.day_name, day.is_business_day, day.start_time, day.end_time]
      );
    }
    
    return res.json({ success: true, message: 'Business hours seeded successfully', data: defaultHours });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to seed business hours: ${err.message}` } });
  }
});

// ── PUT /business-hours — Bulk update all 7 days ─────────────────────────
router.put('/business-hours', async (req, res) => {
  try {
    const { hours } = req.body;
    if (!hours || !Array.isArray(hours) || hours.length !== 7) {
      return res.status(400).json({ success: false, error: { message: 'Exactly 7 day entries are required.' } });
    }

    for (const day of hours) {
      if (day.day_of_week == null || !day.day_name) {
        return res.status(400).json({ success: false, error: { message: `Invalid day entry: day_of_week and day_name are required.` } });
      }
      await DatabaseService.query(
        `UPDATE ${dbSchema}.sn_business_hours
         SET is_business_day = $2, start_time = $3, end_time = $4, updated_at = NOW()
         WHERE day_of_week = $1`,
        [day.day_of_week, Boolean(day.is_business_day), day.start_time || '09:00', day.end_time || '17:00']
      );
    }

    const updated = await loadBusinessHours();
    return res.json({ success: true, data: updated, message: 'Business hours updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to update business hours: ${err.message}` } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// LIVE SEARCH: Assignment Groups from ServiceNow
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /search/assignment-groups?q=<query> — Search assignment groups live ──
router.get('/search/assignment-groups', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }
    const { q = '' } = req.query;
    const queryParts = ['active=true'];
    if (q.trim()) queryParts.push(`nameLIKE${q.trim()}`);
    queryParts.push('ORDERBYname');

    const result = await snowRequest(conn, 'table/sys_user_group',
      `sysparm_query=${queryParts.join('^')}&sysparm_fields=sys_id,name,description,manager&sysparm_limit=50`
    );

    let groups = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      groups = result.data.result.map(g => ({
        sysId: snowVal(g.sys_id),
        name: snowVal(g.name),
        description: snowVal(g.description) || '',
        manager: snowVal(g.manager) || '',
      }));
    }

    return res.json({ success: true, data: { groups, total: groups.length, query: q } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Assignment group search failed: ${err.message}` } });
  }
});

// ── GET /incidents/open — Fetch open incidents for close dropdown ────────────
router.get('/incidents/open', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.json({ success: true, data: { incidents: [] } });
    }
    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const queryParts = ['stateNOT IN6,7,8'];
    if (agQuery) queryParts.push(agQuery);
    queryParts.push('ORDERBYDESCnumber');

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_query=${queryParts.join('^')}&sysparm_fields=sys_id,number,short_description,priority,state,assigned_to&sysparm_limit=200`
    );

    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result.map(inc => ({
        sysId: snowVal(inc.sys_id),
        number: snowVal(inc.number),
        shortDescription: snowVal(inc.short_description),
        priority: snowVal(inc.priority),
        state: snowVal(inc.state),
        assignedTo: snowVal(inc.assigned_to),
      }));
    }

    return res.json({ success: true, data: { incidents, total: incidents.length } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Open incidents fetch failed: ${err.message}` } });
  }
});

export default router;
