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
import { createSnowLogger } from '#modules/servicenow/api/lib/moduleLogger.js';

const log = createSnowLogger('Reports');
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
    log.debug(`GET /stats — total:${data.total || 0} open:${data.open || 0} critical:${data.critical || 0}`);
    return res.json({ success: true, data: { connectionStatus: 'connected', ...data } });
  } catch (err) {
    log.error(`GET /stats failed: ${err.message}`);
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
    log.info(`GET /reports/incidents — count:${data.totalCount || 0}`);
    return res.json({ success: true, data });
  } catch (err) {
    log.error(`GET /reports/incidents failed: ${err.message}`);
    return res.status(500).json({ success: false, error: { message: apiErrors.reports.incidentReportFailed.replace('{message}', err.message) } });
  }
});

// ── GET /reports/ritms ────────────────────────────────────────────────────────
router.get('/reports/ritms', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const tz   = await getEffectiveTimezone();
    const data = await getRitmReport(conn, tz, req.query);
    log.info(`GET /reports/ritms — count:${data.totalCount || 0}`);
    return res.json({ success: true, data });
  } catch (err) {
    log.error(`GET /reports/ritms failed: ${err.message}`);
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
    log.info('GET /reports/sla — SLA compliance report generated');
    return res.json({ success: true, data });
  } catch (err) {
    log.error(`GET /reports/sla failed: ${err.message}`);
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
    log.info(`GET /reports/sla/incidents — period:${req.query.period || 'monthly'} total:${data.totalIncidents || 0}`);
    return res.json({ success: true, data });
  } catch (err) {
    log.error(`GET /reports/sla/incidents failed: ${err.message}`);
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
    log.info(`GET /reports/sla/incidents/response — period:${req.query.period || 'monthly'} total:${data.totalIncidents || 0}`);
    return res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'RESPONSE_COLUMN_NOT_CONFIGURED') {
      log.warn('Response SLA report requested but response column not configured');
      return res.status(400).json({ success: false, error: { message: apiErrors.incidentConfig.responseColumnRequired } });
    }
    log.error(`GET /reports/sla/incidents/response failed: ${err.message}`);
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
    log.info('General settings saved');
    return res.json({ success: true, message: apiMessages.settings.saved });
  } catch (err) {
    log.error(`PUT /config/settings failed: ${err.message}`);
    return res.status(500).json({ success: false, error: { message: apiErrors.config.saveSettingsFailed.replace('{message}', err.message) } });
  }
});

export default router;
