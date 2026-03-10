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
//
// MOUNT: router.use('/', incidentConfigRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import {
  loadConnectionConfig, loadIncidentConfig, snowRequest, snowVal,
  DatabaseService, dbSchema,
} from './helpers.js';

const router = Router();

// ═════════════════════════════════════════════════════════════════════════════
// INCIDENT CONFIGURATION (DB-backed, singleton row id=1)
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

    await DatabaseService.query(
      `INSERT INTO ${dbSchema}.sn_incident_config (id, selected_columns, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET selected_columns = $1, updated_at = NOW()`,
      [JSON.stringify(selectedColumns)]
    );

    return res.json({ success: true, message: 'Selected columns saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save columns: ${err.message}` } });
  }
});

// ── PUT /config/incidents/sla-mapping — Save SLA column mapping only ────
router.put('/config/incidents/sla-mapping', async (req, res) => {
  try {
    const { createdColumn, closedColumn } = req.body;
    if (!createdColumn || !closedColumn) {
      return res.status(400).json({ success: false, error: { message: 'Both createdColumn and closedColumn are required.' } });
    }

    await DatabaseService.query(
      `INSERT INTO ${dbSchema}.sn_incident_config (id, created_column, closed_column, updated_at)
       VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET created_column = $1, closed_column = $2, updated_at = NOW()`,
      [createdColumn, closedColumn]
    );

    return res.json({ success: true, message: 'SLA column mapping saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save SLA mapping: ${err.message}` } });
  }
});

// ── PUT /config/incidents/assignment-group — Save assignment group only ──
router.put('/config/incidents/assignment-group', async (req, res) => {
  try {
    const { assignmentGroup } = req.body;

    await DatabaseService.query(
      `INSERT INTO ${dbSchema}.sn_incident_config (id, assignment_group, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET assignment_group = $1, updated_at = NOW()`,
      [assignmentGroup || '']
    );

    return res.json({ success: true, message: 'Assignment group saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save assignment group: ${err.message}` } });
  }
});

// ── Backward-compatible PUT /config/incidents (saves all at once) ────────
router.put('/config/incidents', async (req, res) => {
  try {
    const { selectedColumns, createdColumn, closedColumn, assignmentGroup } = req.body;
    if (!selectedColumns || !Array.isArray(selectedColumns)) {
      return res.status(400).json({ success: false, error: { message: 'selectedColumns must be an array.' } });
    }
    if (!selectedColumns.includes('number')) {
      return res.status(400).json({ success: false, error: { message: 'Incident number column is mandatory.' } });
    }

    await DatabaseService.query(
      `INSERT INTO ${dbSchema}.sn_incident_config (id, selected_columns, created_column, closed_column, assignment_group, updated_at)
       VALUES (1, $1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         selected_columns = $1, created_column = $2, closed_column = $3, assignment_group = $4, updated_at = NOW()`,
      [JSON.stringify(selectedColumns), createdColumn || 'opened_at', closedColumn || 'closed_at', assignmentGroup || '']
    );

    return res.json({ success: true, message: 'Incident configuration saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save incident config: ${err.message}` } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SCHEMA / COLUMN METADATA (from SNOW sys_dictionary + sample incident)
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /schema/columns — Fetch SNOW incident column metadata ────────────
// Queries sys_dictionary for real field definitions (element, label, type,
// max_length, mandatory, read_only, help_text) and also fetches ONE sample
// incident to show actual values for each column.
router.get('/schema/columns', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }

    // 1. Query sys_dictionary for column metadata
    //    Filter: name=incident (table name), internal_type is not empty
    //    Fields: element, column_label, internal_type, max_length, mandatory, read_only, comments
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
      })).filter(c => c.name); // filter out any empty element rows
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
    //    (e.g. sys_ columns that were filtered out, or custom fields)
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
      `SELECT * FROM ${dbSchema}.sn_sla_config ORDER BY id`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load SLA config: ${err.message}` } });
  }
});

// ── POST /config/sla — Create a new SLA row ─────────────────────────────
router.post('/config/sla', async (req, res) => {
  try {
    const { priority, responseMinutes, resolutionMinutes, enabled = true } = req.body;
    if (!priority) {
      return res.status(400).json({ success: false, error: { message: 'priority is required.' } });
    }
    const result = await DatabaseService.query(
      `INSERT INTO ${dbSchema}.sn_sla_config (priority, response_minutes, resolution_minutes, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
      [priority, Number(responseMinutes) || 60, Number(resolutionMinutes) || 480, Boolean(enabled)]
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
    const { priority, responseMinutes, resolutionMinutes, enabled } = req.body;
    const result = await DatabaseService.query(
      `UPDATE ${dbSchema}.sn_sla_config
       SET priority = COALESCE($2, priority),
           response_minutes = COALESCE($3, response_minutes),
           resolution_minutes = COALESCE($4, resolution_minutes),
           enabled = COALESCE($5, enabled),
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, priority, responseMinutes != null ? Number(responseMinutes) : null, resolutionMinutes != null ? Number(resolutionMinutes) : null, enabled != null ? Boolean(enabled) : null]
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

export default router;
