// ============================================================================
// ServiceNow Module — Report Routes
//
// ENDPOINTS:
//   GET /stats                          → Dashboard statistics (live from SNOW)
//   GET /reports/incidents              → Incident report (live from SNOW)
//   GET /reports/ritms                  → RITM report
//   GET /reports/sla                    → SLA compliance report
//   GET /reports/sla/incidents          → Incident resolution SLA with time filter
//   GET /reports/sla/incidents/response → Incident response SLA with time filter
//   GET /config/settings                → Get general settings
//   PUT /config/settings                → Save general settings
//
// MOUNT: router.use('/', reportRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import {
  loadConnectionConfig, loadDefaultsConfig, loadIncidentConfig,
  loadModuleConfig, saveModuleConfig,
} from '#modules/servicenow/api/routes/helpers.js';
import {
  getStats, getIncidentReport, getRitmReport,
  getSlaReport, getSlaResolutionReport, getSlaResponseReport,
} from '#modules/servicenow/api/services/ReportService.js';
import { getEffectiveTimezone } from '#modules/servicenow/api/services/TimezoneService.js';
import { apiErrors, apiMessages } from '#modules/servicenow/api/config/index.js';

const router = Router();

// ── GET /stats ───────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const conn     = loadConnectionConfig();
    const defaults = loadDefaultsConfig();
    if (!conn.isConfigured) {
      return res.json({ success: true, data: { notConfigured: true, connectionStatus: 'not_configured', total: 0, open: 0, inProgress: 0, critical: 0, slaBreached: 0, resolvedToday: 0, lastSync: defaults.sync?.lastSync || null } });
    }
    const incidentConfig = await loadIncidentConfig();
    const data = await getStats(conn, incidentConfig, defaults);
    return res.json({ success: true, data: { connectionStatus: 'connected', ...data } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.reports.statsFailed.replace('{message}', err.message) } });
  }
});

// ── GET /reports/incidents ────────────────────────────────────────────────────
router.get('/reports/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.json({ success: true, data: { totalCount: 0, incidents: [] } });
    const [incidentConfig, tz] = await Promise.all([loadIncidentConfig(), getEffectiveTimezone()]);
    const data = await getIncidentReport(conn, incidentConfig, tz, req.query);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.reports.incidentReportFailed.replace('{message}', err.message) } });
  }
});

// ── GET /reports/ritms ────────────────────────────────────────────────────────
router.get('/reports/ritms', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const tz   = await getEffectiveTimezone();
    const data = await getRitmReport(conn, tz, req.query);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.reports.ritmReportFailed.replace('{message}', err.message) } });
  }
});

// ── GET /reports/sla ─────────────────────────────────────────────────────────
router.get('/reports/sla', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.json({ success: true, data: { incidentSla: { byPriority: {} }, ritmSla: { byPriority: {} } } });
    const incidentConfig = await loadIncidentConfig();
    const data = await getSlaReport(conn, incidentConfig);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.reports.slaReportFailed.replace('{message}', err.message) } });
  }
});

// ── GET /reports/sla/incidents (resolution SLA) ───────────────────────────────
router.get('/reports/sla/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    const [incidentConfig, tz] = await Promise.all([loadIncidentConfig(), getEffectiveTimezone()]);
    const data = await getSlaResolutionReport(conn, incidentConfig, tz, req.query);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.reports.slaIncidentReportFailed.replace('{message}', err.message) } });
  }
});

// ── GET /reports/sla/incidents/response ──────────────────────────────────────
router.get('/reports/sla/incidents/response', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    const [incidentConfig, tz] = await Promise.all([loadIncidentConfig(), getEffectiveTimezone()]);
    const data = await getSlaResponseReport(conn, incidentConfig, tz, req.query);
    return res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'RESPONSE_COLUMN_NOT_CONFIGURED') {
      return res.status(400).json({ success: false, error: { message: apiErrors.incidentConfig.responseColumnRequired } });
    }
    return res.status(500).json({ success: false, error: { message: apiErrors.reports.responseReportFailed.replace('{message}', err.message) } });
  }
});

// ── GET /config/settings ─────────────────────────────────────────────────────
router.get('/config/settings', async (req, res) => {
  try {
    const settings = await loadModuleConfig('general_settings') || {};
    return res.json({ success: true, data: settings });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.config.loadSettingsFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config/settings ─────────────────────────────────────────────────────
router.put('/config/settings', async (req, res) => {
  try {
    await saveModuleConfig('general_settings', req.body, 'General module settings');
    return res.json({ success: true, message: apiMessages.settings.saved });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.config.saveSettingsFailed.replace('{message}', err.message) } });
  }
});

export default router;
