// ============================================================================
// ServiceNow Module — Connection Configuration Routes
//
// ENDPOINTS:
//   GET  /config        → Return current config (password redacted)
//   PUT  /config        → Save connection + SLA + sync settings
//   POST /config/test   → Test connectivity to ServiceNow instance
//
// MOUNT: router.use('/', configRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import {
  loadConnectionConfig, saveConnectionConfig, loadDefaultsConfig,
  writeJsonFile, DEFAULTS_CONFIG,
} from '#modules/servicenow/api/routes/helpers.js';
import { snowGet, isSnowSuccess } from '#modules/servicenow/api/lib/SnowApiClient.js';
import { snowUrls, apiErrors, apiMessages } from '#modules/servicenow/api/config/index.js';

const router = Router();

// ── GET /config — Return current config (password redacted) ─────────────────
router.get('/config', (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();
    const safeConn = {
      ...conn,
      password: conn.password ? '••••••••' : '',
      hasPassword: !!conn.password,
    };
    return res.json({
      success: true,
      data: { connection: safeConn, sla: defaults.sla, sync: defaults.sync },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.config.loadFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config — Save connection + SLA + sync settings ─────────────────────
router.put('/config', (req, res) => {
  try {
    const { connection, sla, sync } = req.body;
    const current = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    const resolvedPassword =
      connection?.password && connection.password !== '••••••••'
        ? connection.password
        : current.password;

    const isConfigured = !!(connection?.instanceUrl && connection?.username && resolvedPassword);

    const updatedConn = {
      instanceUrl:  connection?.instanceUrl ?? current.instanceUrl,
      username:     connection?.username ?? current.username,
      password:     resolvedPassword,
      authMethod:   connection?.authMethod ?? current.authMethod ?? 'basic',
      apiVersion:   connection?.apiVersion ?? current.apiVersion ?? 'v2',
      isConfigured,
      lastTested:   current.lastTested,
      testStatus:   current.testStatus,
    };

    const updatedDefaults = {
      ...defaults,
      sla: {
        critical: Number(sla?.critical ?? defaults.sla?.critical ?? 4),
        high:     Number(sla?.high ?? defaults.sla?.high ?? 8),
        medium:   Number(sla?.medium ?? defaults.sla?.medium ?? 24),
        low:      Number(sla?.low ?? defaults.sla?.low ?? 72),
      },
      sync: {
        enabled:         Boolean(sync?.enabled ?? defaults.sync?.enabled),
        intervalMinutes: Number(sync?.intervalMinutes ?? defaults.sync?.intervalMinutes ?? 30),
        maxIncidents:    Number(sync?.maxIncidents ?? defaults.sync?.maxIncidents ?? 500),
        lastSync:        defaults.sync?.lastSync,
      },
    };

    saveConnectionConfig(updatedConn);
    writeJsonFile(DEFAULTS_CONFIG, updatedDefaults);

    return res.json({ success: true, message: apiMessages.config.saved });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.config.saveFailed.replace('{message}', err.message) } });
  }
});

// ── POST /config/test — Test connection to ServiceNow instance ──────────────
// Returns: success, testedAt, per-API statuses, incident count
router.post('/config/test', async (req, res) => {
  try {
    const { instanceUrl, username, password, apiToken } = req.body;
    const current = loadConnectionConfig();

    const rawPassword = apiToken || password;
    const resolvedPassword =
      rawPassword && rawPassword !== '••••••••' ? rawPassword : current.password;

    if (!instanceUrl || !username || !resolvedPassword) {
      return res.status(400).json({ success: false, error: { message: apiErrors.connection.requiredFields } });
    }

    const connObj = { instanceUrl, username, password: resolvedPassword, apiVersion: current.apiVersion || 'v2' };
    const testedAt = new Date().toISOString();
    const apis = { incidents: { status: 'failed' }, ritms: { status: 'failed' }, changes: { status: 'failed' } };
    let incidentCount = null;
    let overallSuccess = false;

    // Test Incidents API + get count
    try {
      const incResult = await snowGet(connObj, snowUrls.snow.tables.incident, 'sysparm_limit=1');
      if (isSnowSuccess(incResult.statusCode)) {
        apis.incidents = { status: 'connected' };
        overallSuccess = true;
        try {
          const statsResult = await snowGet(connObj, snowUrls.snow.tables.statsIncident, 'sysparm_count=true');
          if (isSnowSuccess(statsResult.statusCode) && statsResult.data?.result?.stats?.count) {
            incidentCount = Number(statsResult.data.result.stats.count);
          }
        } catch { /* count is optional */ }
      }
    } catch { /* incidents test failed */ }

    // Test RITMs API
    try {
      const ritmResult = await snowGet(connObj, snowUrls.snow.tables.scReqItem, 'sysparm_limit=1');
      if (isSnowSuccess(ritmResult.statusCode)) apis.ritms = { status: 'connected' };
    } catch { /* ritms test failed */ }

    // Test Changes API
    try {
      const changeResult = await snowGet(connObj, snowUrls.snow.tables.changeRequest, 'sysparm_limit=1');
      if (isSnowSuccess(changeResult.statusCode)) apis.changes = { status: 'connected' };
    } catch { /* changes test failed */ }

    // Save test result
    const conn = loadConnectionConfig();
    conn.lastTested = testedAt;
    conn.testStatus = overallSuccess ? 'success' : 'failed';
    saveConnectionConfig(conn);

    return res.json({
      success: true,
      data: {
        success: overallSuccess,
        testedAt,
        apis,
        incidentCount,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.connection.testFailed.replace('{message}', err.message) } });
  }
});

export default router;
