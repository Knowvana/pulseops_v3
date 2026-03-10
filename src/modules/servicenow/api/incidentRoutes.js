// ============================================================================
// ServiceNow Module — Incident CRUD Routes
//
// ENDPOINTS:
//   GET    /incidents          → Paginated + filtered incident list (live from SNOW)
//   POST   /incidents          → Create an incident in SNOW
//   PUT    /incidents/:id      → Update an incident in SNOW
//   POST   /incidents/:id/close → Close an incident in SNOW
//
// MOUNT: router.use('/', incidentRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import {
  loadConnectionConfig, loadDefaultsConfig, loadIncidentConfig,
  buildAssignmentGroupQuery, snowRequest, snowRequestWrite,
} from './helpers.js';

const router = Router();

// ── GET /incidents — Paginated + filtered incident list (always live from SNOW)
router.get('/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.json({ success: true, data: { incidents: [], total: 0 } });
    }

    const { state, priority, search, limit = '50', offset = '0', sort = 'number', order = 'desc' } = req.query;
    const incidentConfig = await loadIncidentConfig();

    // Build sysparm_query
    const queryParts = [];
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    if (agQuery) queryParts.push(agQuery);
    if (state) queryParts.push(`state=${state}`);
    if (priority) queryParts.push(`priority=${priority}`);
    if (search) queryParts.push(`numberLIKE${search}^ORshort_descriptionLIKE${search}`);

    // Sort — SNOW uses ORDERBYDESCfield or ORDERBYfield
    const sortField = sort || 'number';
    const sortOrder = order === 'asc' ? `ORDERBY${sortField}` : `ORDERBYDESC${sortField}`;
    queryParts.push(sortOrder);

    // Build fields list from incident config
    const defaultFields = ['sys_id','number','short_description','priority','state','assigned_to','opened_at','resolved_at','closed_at','sys_created_on'];
    const fields = [...new Set([...defaultFields, ...incidentConfig.selectedColumns, incidentConfig.createdColumn, incidentConfig.closedColumn])];

    const pageLimit = parseInt(limit, 10) || 50;
    const pageOffset = parseInt(offset, 10) || 0;

    const params = [
      `sysparm_limit=${pageLimit}`,
      `sysparm_offset=${pageOffset}`,
      `sysparm_fields=${fields.join(',')}`,
    ];
    if (queryParts.length > 0) params.push(`sysparm_query=${queryParts.join('^')}`);

    const result = await snowRequest(conn, 'table/incident', params.join('&'));

    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      const incidents = result.data.result;
      return res.json({
        success: true,
        data: { incidents, total: incidents.length < pageLimit ? pageOffset + incidents.length : pageOffset + incidents.length + 1 },
      });
    }
    return res.json({ success: true, data: { incidents: [], total: 0 } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Incidents failed: ${err.message}` } });
  }
});

// ── POST /incidents — Create an incident ─────────────────────────────────
router.post('/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }
    const { shortDescription, priority, state, category, impact, urgency } = req.body;
    if (!shortDescription) {
      return res.status(400).json({ success: false, error: { message: 'shortDescription is required.' } });
    }
    const payload = JSON.stringify({
      short_description: shortDescription,
      priority: priority || '3 - Medium',
      state: state || 'New',
      category: category || 'General',
      impact: impact || '3 - Low',
      urgency: urgency || '3 - Low',
    });
    const result = await snowRequestWrite(conn, 'table/incident', 'POST', payload);
    if (result.statusCode >= 200 && result.statusCode < 300) {
      return res.json({ success: true, data: result.data?.result || result.data, message: 'Incident created successfully.' });
    }
    return res.status(result.statusCode || 502).json({ success: false, error: { message: `ServiceNow returned HTTP ${result.statusCode}` } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Create incident failed: ${err.message}` } });
  }
});

// ── PUT /incidents/:id — Update an incident ──────────────────────────────
router.put('/incidents/:id', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }
    const { id } = req.params;
    const { shortDescription, priority, state, comment } = req.body;
    const payload = {};
    if (shortDescription !== undefined) payload.short_description = shortDescription;
    if (priority !== undefined) payload.priority = priority;
    if (state !== undefined) payload.state = state;
    if (comment !== undefined) payload.comments = comment;
    const result = await snowRequestWrite(conn, `table/incident/${id}`, 'PATCH', JSON.stringify(payload));
    if (result.statusCode >= 200 && result.statusCode < 300) {
      return res.json({ success: true, data: result.data?.result || result.data, message: 'Incident updated successfully.' });
    }
    return res.status(result.statusCode || 502).json({ success: false, error: { message: `ServiceNow returned HTTP ${result.statusCode}` } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Update incident failed: ${err.message}` } });
  }
});

// ── POST /incidents/:id/close — Close an incident ────────────────────────
router.post('/incidents/:id/close', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }
    const { id } = req.params;
    const { closeNotes, closeCode } = req.body;
    const payload = JSON.stringify({
      state: '7',
      close_notes: closeNotes || 'Closed via PulseOps',
      close_code: closeCode || 'Solved (Permanently)',
    });
    const result = await snowRequestWrite(conn, `table/incident/${id}`, 'PATCH', payload);
    if (result.statusCode >= 200 && result.statusCode < 300) {
      return res.json({ success: true, data: result.data?.result || result.data, message: 'Incident closed successfully.' });
    }
    return res.status(result.statusCode || 502).json({ success: false, error: { message: `ServiceNow returned HTTP ${result.statusCode}` } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Close incident failed: ${err.message}` } });
  }
});

export default router;
