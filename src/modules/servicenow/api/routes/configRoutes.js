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
router.post('/config/test', async (req, res) => {
  try {
    const { instanceUrl, username, password } = req.body;
    const current = loadConnectionConfig();

    const resolvedPassword =
      password && password !== '••••••••' ? password : current.password;

    if (!instanceUrl || !username || !resolvedPassword) {
      return res.status(400).json({
        success: false,
        error: { message: 'Instance URL, username, and password are required.' },
      });
    }

    const startMs = Date.now();
    try {
      const result = await snowRequest(
        { instanceUrl, username, password: resolvedPassword, apiVersion: current.apiVersion || 'v2' },
        'table/incident',
        'sysparm_limit=1'
      );
      const latencyMs = Date.now() - startMs;

      const testSuccess = result.statusCode >= 200 && result.statusCode < 300;

      const conn = loadConnectionConfig();
      conn.lastTested = new Date().toISOString();
      conn.testStatus = testSuccess ? 'success' : 'failed';
      saveConnectionConfig(conn);

      return res.json({
        success: true,
        data: {
          success: testSuccess,
          latencyMs,
          statusCode: result.statusCode,
          error: testSuccess ? null : `ServiceNow returned HTTP ${result.statusCode}`,
        },
      });
    } catch (connErr) {
      return res.json({
        success: true,
        data: {
          success: false,
          latencyMs: Date.now() - startMs,
          error: connErr.message,
        },
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Connection test failed: ${err.message}` } });
  }
});

export default router;
