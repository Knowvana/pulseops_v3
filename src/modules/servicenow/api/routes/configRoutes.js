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
  writeJsonFile, DEFAULTS_CONFIG, snowRequest,
} from './helpers.js';

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
    return res.status(500).json({ success: false, error: { message: `Failed to load config: ${err.message}` } });
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

    return res.json({ success: true, message: 'ServiceNow configuration saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save config: ${err.message}` } });
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
      return res.status(400).json({
        success: false,
        error: { message: 'Instance URL, username, and password/apiToken are required.' },
      });
    }

    const connObj = { instanceUrl, username, password: resolvedPassword, apiVersion: current.apiVersion || 'v2' };
    const testedAt = new Date().toISOString();
    const apis = { incidents: { status: 'failed' }, ritms: { status: 'failed' }, changes: { status: 'failed' } };
    let incidentCount = null;
    let overallSuccess = false;

    // Test Incidents API + get count
    try {
      const incResult = await snowRequest(connObj, 'table/incident', 'sysparm_limit=1');
      if (incResult.statusCode >= 200 && incResult.statusCode < 300) {
        apis.incidents = { status: 'connected' };
        overallSuccess = true;
        // Get total count
        try {
          const countResult = await snowRequest(connObj, 'table/incident', 'sysparm_limit=1&sysparm_fields=sys_id');
          if (countResult.statusCode >= 200 && countResult.statusCode < 300) {
            const xTotal = countResult.data?.result ? countResult.data.result.length : 0;
            // Use stats API for count if available
            const statsResult = await snowRequest(connObj, 'stats/incident', 'sysparm_count=true');
            if (statsResult.statusCode >= 200 && statsResult.statusCode < 300 && statsResult.data?.result?.stats?.count) {
              incidentCount = Number(statsResult.data.result.stats.count);
            }
          }
        } catch { /* count is optional */ }
      }
    } catch { /* incidents test failed */ }

    // Test RITMs API
    try {
      const ritmResult = await snowRequest(connObj, 'table/sc_req_item', 'sysparm_limit=1');
      if (ritmResult.statusCode >= 200 && ritmResult.statusCode < 300) {
        apis.ritms = { status: 'connected' };
      }
    } catch { /* ritms test failed */ }

    // Test Changes API
    try {
      const changeResult = await snowRequest(connObj, 'table/change_request', 'sysparm_limit=1');
      if (changeResult.statusCode >= 200 && changeResult.statusCode < 300) {
        apis.changes = { status: 'connected' };
      }
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
    return res.status(500).json({ success: false, error: { message: `Connection test failed: ${err.message}` } });
  }
});

export default router;
