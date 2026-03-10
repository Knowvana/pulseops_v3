// ============================================================================
// ServiceNow Module — RITM CRUD Routes
//
// ENDPOINTS:
//   GET    /ritms          → List RITMs from SNOW
//   POST   /ritms          → Create a RITM in SNOW
//   PUT    /ritms/:id      → Update a RITM in SNOW
//   POST   /ritms/:id/close → Close a RITM in SNOW
//
// MOUNT: router.use('/', ritmRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import { loadConnectionConfig, snowRequest, snowRequestWrite } from './helpers.js';

const router = Router();

// ── GET /ritms — List RITMs ──────────────────────────────────────────────
router.get('/ritms', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.json({ success: true, data: { ritms: [], total: 0, fromCache: false } });
    }
    const { state, priority, search, limit = '50', offset = '0' } = req.query;
    const result = await snowRequest(conn, 'table/sc_req_item',
      `sysparm_limit=${limit}&sysparm_offset=${offset}&sysparm_fields=number,short_description,priority,state,cat_item,assignment_group,opened_at,closed_at`
    );
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      let ritms = result.data.result;
      if (state) ritms = ritms.filter(r => String(r.state) === state);
      if (priority) ritms = ritms.filter(r => String(r.priority) === priority);
      if (search) {
        const q = search.toLowerCase();
        ritms = ritms.filter(r => (r.number || '').toLowerCase().includes(q) || (r.short_description || '').toLowerCase().includes(q));
      }
      return res.json({ success: true, data: { ritms, total: ritms.length, fromCache: false } });
    }
    return res.json({ success: true, data: { ritms: [], total: 0, fromCache: false } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `RITMs fetch failed: ${err.message}` } });
  }
});

// ── POST /ritms — Create a RITM ──────────────────────────────────────────
router.post('/ritms', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }
    const { shortDescription, priority, catalogItem } = req.body;
    if (!shortDescription) {
      return res.status(400).json({ success: false, error: { message: 'shortDescription is required.' } });
    }
    const payload = JSON.stringify({
      short_description: shortDescription,
      priority: priority || '3 - Medium',
      cat_item: catalogItem || '',
    });
    const result = await snowRequestWrite(conn, 'table/sc_req_item', 'POST', payload);
    if (result.statusCode >= 200 && result.statusCode < 300) {
      return res.json({ success: true, data: result.data?.result || result.data, message: 'RITM created successfully.' });
    }
    return res.status(result.statusCode || 502).json({ success: false, error: { message: `ServiceNow returned HTTP ${result.statusCode}` } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Create RITM failed: ${err.message}` } });
  }
});

// ── PUT /ritms/:id — Update a RITM ───────────────────────────────────────
router.put('/ritms/:id', async (req, res) => {
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
    const result = await snowRequestWrite(conn, `table/sc_req_item/${id}`, 'PATCH', JSON.stringify(payload));
    if (result.statusCode >= 200 && result.statusCode < 300) {
      return res.json({ success: true, data: result.data?.result || result.data, message: 'RITM updated successfully.' });
    }
    return res.status(result.statusCode || 502).json({ success: false, error: { message: `ServiceNow returned HTTP ${result.statusCode}` } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Update RITM failed: ${err.message}` } });
  }
});

// ── POST /ritms/:id/close — Close a RITM ─────────────────────────────────
router.post('/ritms/:id/close', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }
    const { id } = req.params;
    const { closeNotes } = req.body;
    const payload = JSON.stringify({
      state: '3',
      close_notes: closeNotes || 'Closed via PulseOps',
    });
    const result = await snowRequestWrite(conn, `table/sc_req_item/${id}`, 'PATCH', payload);
    if (result.statusCode >= 200 && result.statusCode < 300) {
      return res.json({ success: true, data: result.data?.result || result.data, message: 'RITM closed successfully.' });
    }
    return res.status(result.statusCode || 502).json({ success: false, error: { message: `ServiceNow returned HTTP ${result.statusCode}` } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Close RITM failed: ${err.message}` } });
  }
});

export default router;
