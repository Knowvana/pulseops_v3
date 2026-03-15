// ============================================================================
// ServiceNow Module — Incident Routes
//
// ENDPOINTS:
//   GET    /incidents           → List incidents (filtered, paginated)
//   POST   /incidents           → Create incident
//   PUT    /incidents/:id       → Update incident
//   POST   /incidents/:id/close → Close incident
//
// MOUNT: router.use('/', incidentRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import { loadConnectionConfig, loadIncidentConfig } from '#modules/servicenow/api/routes/helpers.js';
import { isSnowSuccess, extractSnowError } from '#modules/servicenow/api/lib/SnowApiClient.js';
import {
  listIncidents, createIncident,
  updateIncident, closeIncident,
} from '#modules/servicenow/api/services/IncidentService.js';
import { getEffectiveTimezone } from '#modules/servicenow/api/services/TimezoneService.js';
import { apiErrors, apiMessages } from '#modules/servicenow/api/config/index.js';

const router = Router();

// ── GET /incidents — List incidents ─────────────────────────────────────────
router.get('/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.json({ success: true, data: { incidents: [], total: 0 } });

    const [incidentConfig, tz] = await Promise.all([loadIncidentConfig(), getEffectiveTimezone()]);
    const { state, priority, search, limit, offset, sort, order } = req.query;

    const { incidents, total } = await listIncidents(conn, incidentConfig, tz, { state, priority, search, limit, offset, sort, order });
    return res.json({ success: true, data: { incidents, total } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.incidents.fetchFailed.replace('{message}', err.message) } });
  }
});

// ── POST /incidents — Create incident ───────────────────────────────────────
router.post('/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    }
    if (!req.body.shortDescription) {
      return res.status(400).json({ success: false, error: { message: apiErrors.incidents.shortDescriptionRequired } });
    }

    const result = await createIncident(conn, req.body);
    if (isSnowSuccess(result.statusCode)) {
      return res.status(201).json({ success: true, data: result.data?.result || {}, message: apiMessages.incidents.created });
    }
    return res.status(result.statusCode).json({ success: false, error: { message: apiErrors.incidents.snowRejected.replace('{status}', result.statusCode).replace('{detail}', extractSnowError(result.data)) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.incidents.createFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /incidents/:id — Update incident ────────────────────────────────────
router.put('/incidents/:id', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    }

    const result = await updateIncident(conn, req.params.id, req.body);
    if (isSnowSuccess(result.statusCode)) {
      return res.json({ success: true, data: result.data?.result || {}, message: apiMessages.incidents.updated });
    }
    return res.status(result.statusCode).json({ success: false, error: { message: apiErrors.incidents.snowRejected.replace('{status}', result.statusCode).replace('{detail}', extractSnowError(result.data)) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.incidents.updateFailed.replace('{message}', err.message) } });
  }
});

// ── POST /incidents/:id/close — Close incident ──────────────────────────────
router.post('/incidents/:id/close', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    }

    const result = await closeIncident(conn, req.params.id, req.body);
    if (isSnowSuccess(result.statusCode)) {
      return res.json({ success: true, message: apiMessages.incidents.closed });
    }
    return res.status(result.statusCode).json({ success: false, error: { message: apiErrors.incidents.snowRejected.replace('{status}', result.statusCode).replace('{detail}', extractSnowError(result.data)) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.incidents.closeFailed.replace('{message}', err.message) } });
  }
});

export default router;
