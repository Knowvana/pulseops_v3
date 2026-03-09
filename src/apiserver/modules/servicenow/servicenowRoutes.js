// ============================================================================
// ServiceNow Routes — PulseOps V2 API
//
// PURPOSE: Express router exposing all ServiceNow integration endpoints.
// Thin HTTP layer — all business logic delegated to servicenowService.js.
//
// MOUNT PATH: /api/servicenow (registered in api/src/app.js)
//
// ENDPOINTS (all protected — valid JWT cookie or Bearer token required):
//   GET  /api/servicenow/config         → Get current connection config (token redacted)
//   PUT  /api/servicenow/config         → Save connection, SLA, and sync settings
//   POST /api/servicenow/config/test    → Test connectivity to ServiceNow instance
//   GET  /api/servicenow/stats          → Dashboard statistics (totals, SLA breach count)
//   GET  /api/servicenow/incidents      → Paginated + filtered incident list
//   POST /api/servicenow/sync           → Trigger manual data synchronization
//   GET  /api/servicenow/reports        → SLA compliance + incident volume data
//
// SECURITY:
//   - JWT authentication enforced via authenticate middleware on all routes
//   - API token NEVER returned in GET /config (redacted to '••••••••')
//   - Basic Auth header built server-side; credentials never leave API process
//
// DEPENDENCIES:
//   - #core/middleware/auth.js                            → authenticate
//   - #shared/logger.js                                   → Winston logger
//   - #shared/loadJson.js                                 → messages, errors
//   - #modules/servicenow/servicenowService.js            → Business logic
// ============================================================================

import { Router } from 'express';
import { authenticate } from '#core/middleware/auth.js';
import { logger } from '#shared/logger.js';
import { messages, errors } from '#shared/loadJson.js';
import {
  loadConfig,
  saveConfig,
  testConnection,
  fetchIncidents,
  getDashboardStats,
  getReportsData,
  triggerSync,
} from '#modules/servicenow/servicenowService.js';

const router = Router();

// ── Auth gate: all ServiceNow endpoints require a valid session ───────────────
router.use(authenticate);

// ── GET /servicenow/config ────────────────────────────────────────────────────
// Returns the current ServiceNow configuration.
// The API token is ALWAYS redacted — frontend shows '••••••••' if a token exists.
router.get('/config', async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] ServiceNow:GET /config — user ${req.user?.userId}`);
  try {
    const config = loadConfig();

    // Redact plaintext token — never expose credentials to the frontend
    const safeConfig = {
      ...config,
      connection: {
        ...config.connection,
        apiToken: config.connection.apiToken ? '••••••••' : '',
        hasToken: !!config.connection.apiToken,
      },
    };

    logger.debug(`[${requestId}] ServiceNow:GET /config — returning config`, {
      isConfigured: safeConfig.connection.isConfigured,
    });
    return res.json({ success: true, data: safeConfig });
  } catch (err) {
    logger.error(`[${requestId}] ServiceNow:GET /config — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.snConfigLoadFailed, code: 'SN_CONFIG_LOAD_FAILED', requestId },
    });
  }
});

// ── PUT /servicenow/config ────────────────────────────────────────────────────
// Saves connection, SLA, and sync settings.
// If the frontend sends '••••••••' as the token, the existing stored token is preserved.
router.put('/config', async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] ServiceNow:PUT /config — user ${req.user?.userId}`);

  try {
    const { connection, sla, sync } = req.body;
    const current = loadConfig();

    // Preserve stored token if frontend sends placeholder
    const resolvedToken =
      connection?.apiToken && connection.apiToken !== '••••••••'
        ? connection.apiToken
        : current.connection.apiToken;

    const isConfigured = !!(connection?.instanceUrl && connection?.username && resolvedToken);

    const updated = {
      connection: {
        instanceUrl:  connection?.instanceUrl  ?? current.connection.instanceUrl,
        username:     connection?.username     ?? current.connection.username,
        apiToken:     resolvedToken,
        isConfigured,
        lastTested:   current.connection.lastTested,
        testStatus:   current.connection.testStatus,
      },
      sla: {
        critical: Number(sla?.critical ?? current.sla.critical),
        high:     Number(sla?.high     ?? current.sla.high),
        medium:   Number(sla?.medium   ?? current.sla.medium),
        low:      Number(sla?.low      ?? current.sla.low),
      },
      sync: {
        enabled:         Boolean(sync?.enabled ?? current.sync.enabled),
        intervalMinutes: Number(sync?.intervalMinutes ?? current.sync.intervalMinutes),
        maxIncidents:    Number(sync?.maxIncidents    ?? current.sync.maxIncidents),
        lastSync:        current.sync.lastSync, // Preserved — only updated on actual sync
      },
    };

    saveConfig(updated);
    logger.info(`[${requestId}] ServiceNow:PUT /config — saved`, { isConfigured });
    return res.json({ success: true, message: messages.success.snConfigSaved });
  } catch (err) {
    logger.error(`[${requestId}] ServiceNow:PUT /config — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.snConfigSaveFailed, code: 'SN_CONFIG_SAVE_FAILED', requestId },
    });
  }
});

// ── POST /servicenow/config/test ──────────────────────────────────────────────
// Tests connectivity to the ServiceNow instance with the provided credentials.
// On success, updates lastTested + testStatus in the config file.
router.post('/config/test', async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] ServiceNow:POST /config/test — user ${req.user?.userId}`);

  try {
    const { instanceUrl, username, apiToken } = req.body;

    // If token placeholder sent, resolve to stored token
    const config = loadConfig();
    const resolvedToken =
      apiToken && apiToken !== '••••••••' ? apiToken : config.connection.apiToken;

    const result = await testConnection({ instanceUrl, username, apiToken: resolvedToken });

    // Update connection test status in config
    if (result.success) {
      const updated = loadConfig();
      updated.connection.lastTested = new Date().toISOString();
      updated.connection.testStatus = 'success';
      saveConfig(updated);
    }

    logger.info(`[${requestId}] ServiceNow:POST /config/test — result: ${result.success ? 'SUCCESS' : 'FAILED'}`, {
      latencyMs: result.latencyMs,
      error: result.error,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[${requestId}] ServiceNow:POST /config/test — unexpected error`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.snConnectionTestFailed, code: 'SN_CONN_TEST_FAILED', requestId },
    });
  }
});

// ── GET /servicenow/stats ─────────────────────────────────────────────────────
// Returns dashboard statistics: open/critical/sla-breached counts, last sync.
router.get('/stats', async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] ServiceNow:GET /stats — user ${req.user?.userId}`);
  try {
    const stats = await getDashboardStats();
    logger.debug(`[${requestId}] ServiceNow:GET /stats — returned`, { connectionStatus: stats.connectionStatus });
    return res.json({ success: true, data: stats });
  } catch (err) {
    logger.error(`[${requestId}] ServiceNow:GET /stats — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.snStatsFailed, code: 'SN_STATS_FAILED', requestId },
    });
  }
});

// ── GET /servicenow/incidents ─────────────────────────────────────────────────
// Returns paginated + filtered incidents.
// Query params: state, priority, search, limit (default 50), offset (default 0)
router.get('/incidents', async (req, res) => {
  const requestId = req.requestId;
  const { state, priority, search, limit, offset } = req.query;
  logger.info(`[${requestId}] ServiceNow:GET /incidents`, { state, priority, limit, offset });
  try {
    const result = await fetchIncidents({ state, priority, search, limit, offset });
    logger.debug(`[${requestId}] ServiceNow:GET /incidents — returned`, {
      count: result.incidents.length,
      total: result.total,
      fromCache: result.fromCache,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[${requestId}] ServiceNow:GET /incidents — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.snIncidentsFetchFailed, code: 'SN_INCIDENTS_FAILED', requestId },
    });
  }
});

// ── POST /servicenow/sync ─────────────────────────────────────────────────────
// Triggers a manual data synchronization from ServiceNow.
// Clears cache and re-fetches all incidents.
router.post('/sync', async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] ServiceNow:POST /sync — manual sync triggered by user ${req.user?.userId}`);
  try {
    const result = await triggerSync();
    logger.info(`[${requestId}] ServiceNow:POST /sync — completed`, { count: result.count });
    return res.json({
      success: true,
      data: result,
      message: messages.success.snSyncComplete,
    });
  } catch (err) {
    logger.error(`[${requestId}] ServiceNow:POST /sync — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.snSyncFailed, code: 'SN_SYNC_FAILED', requestId },
    });
  }
});

// ── GET /servicenow/reports ───────────────────────────────────────────────────
// Returns reports data: SLA compliance %, volume by priority, resolution times.
router.get('/reports', async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] ServiceNow:GET /reports — user ${req.user?.userId}`);
  try {
    const data = await getReportsData();
    logger.debug(`[${requestId}] ServiceNow:GET /reports — returned`, {
      slaCompliance: data.slaCompliance,
      totalIncidents: data.totalIncidents,
    });
    return res.json({ success: true, data });
  } catch (err) {
    logger.error(`[${requestId}] ServiceNow:GET /reports — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.snReportsFailed, code: 'SN_REPORTS_FAILED', requestId },
    });
  }
});

export default router;
