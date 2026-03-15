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
import { loadConnectionConfig } from '#modules/servicenow/api/routes/helpers.js';
import { isSnowSuccess, extractSnowError } from '#modules/servicenow/api/lib/SnowApiClient.js';
import { listRitms, createRitm, updateRitm, closeRitm } from '#modules/servicenow/api/services/RitmService.js';
import { getEffectiveTimezone } from '#modules/servicenow/api/services/TimezoneService.js';
import { apiErrors, apiMessages } from '#modules/servicenow/api/config/index.js';

const router = Router();

// ── GET /ritms — List RITMs ──────────────────────────────────────────────
router.get('/ritms', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.json({ success: true, data: { ritms: [], total: 0 } });
    const tz = await getEffectiveTimezone();
    const { state, priority, search, limit, offset } = req.query;
    const { ritms, total } = await listRitms(conn, tz, { state, priority, search, limit, offset });
    return res.json({ success: true, data: { ritms, total } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.ritms.fetchFailed.replace('{message}', err.message) } });
  }
});

// ── POST /ritms — Create a RITM ──────────────────────────────────────────
router.post('/ritms', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    if (!req.body.shortDescription) return res.status(400).json({ success: false, error: { message: apiErrors.ritms.shortDescriptionRequired } });
    const result = await createRitm(conn, req.body);
    if (isSnowSuccess(result.statusCode)) return res.status(201).json({ success: true, data: result.data?.result || {}, message: apiMessages.ritms.created });
    return res.status(result.statusCode).json({ success: false, error: { message: apiErrors.ritms.snowRejected.replace('{status}', result.statusCode) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.ritms.createFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /ritms/:id — Update a RITM ───────────────────────────────────────
router.put('/ritms/:id', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    const result = await updateRitm(conn, req.params.id, req.body);
    if (isSnowSuccess(result.statusCode)) return res.json({ success: true, data: result.data?.result || {}, message: apiMessages.ritms.updated });
    return res.status(result.statusCode).json({ success: false, error: { message: apiErrors.ritms.snowRejected.replace('{status}', result.statusCode) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.ritms.updateFailed.replace('{message}', err.message) } });
  }
});

// ── POST /ritms/:id/close — Close a RITM ─────────────────────────────────
router.post('/ritms/:id/close', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    const result = await closeRitm(conn, req.params.id, req.body);
    if (isSnowSuccess(result.statusCode)) return res.json({ success: true, message: apiMessages.ritms.closed });
    return res.status(result.statusCode).json({ success: false, error: { message: apiErrors.ritms.snowRejected.replace('{status}', result.statusCode) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.ritms.closeFailed.replace('{message}', err.message) } });
  }
});

export default router;
