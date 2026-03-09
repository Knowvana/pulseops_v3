// ============================================================================
// ServiceNow Module — API Entry Point (Dynamic Route Loader Compatible)
//
// PURPOSE: This is the API entry point for the ServiceNow module. It is loaded
// dynamically by dynamicRouteLoader.js when the module is enabled via the
// Module Manager UI. Exports the Express router and optional lifecycle hooks.
//
// ARCHITECTURE:
//   - Deployed to dist-modules/servicenow/api/index.js (via build-module.js)
//   - Loaded at runtime via dynamic import() — zero server restart
//   - Router is mounted at /api/servicenow by the dynamic route loader
//   - All routes require JWT authentication (applied by dynamicRouteLoader)
//
// LIFECYCLE HOOKS:
//   - onEnable()  → Called when module is enabled (initialize caches, etc.)
//   - onDisable() → Called when module is disabled (cleanup resources)
//
// EXPORTS:
//   - default: Express Router
//   - router:  Express Router (alias)
//   - onEnable:  async () => void
//   - onDisable: async () => void
//
// DEPENDENCIES:
//   - express       → Router
//   - fs, path      → Config file I/O
//   - node:https    → ServiceNow API calls
// ============================================================================
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// ── Config file paths ────────────────────────────────────────────────────────
// Config files live alongside the API entry point in dist-modules/servicenow/api/config/
const CONFIG_DIR = path.resolve(__dirname, 'config');
const CONNECTION_CONFIG = path.join(CONFIG_DIR, 'servicenow_connection.json');
const DEFAULTS_CONFIG = path.join(CONFIG_DIR, 'servicenow_defaults.json');

// ── Helper: read/write JSON config ──────────────────────────────────────────
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ── Helper: load connection config with defaults ────────────────────────────
function loadConnectionConfig() {
  const defaults = {
    instanceUrl: '',
    username: '',
    password: '',
    authMethod: 'basic',
    apiVersion: 'v2',
    isConfigured: false,
    lastTested: null,
    testStatus: null,
  };
  const stored = readJsonFile(CONNECTION_CONFIG);
  return { ...defaults, ...(stored || {}) };
}

function saveConnectionConfig(config) {
  writeJsonFile(CONNECTION_CONFIG, config);
}

// ── Helper: load defaults config ────────────────────────────────────────────
function loadDefaultsConfig() {
  return readJsonFile(DEFAULTS_CONFIG) || { sla: { critical: 4, high: 8, medium: 24, low: 72 }, sync: { enabled: false, intervalMinutes: 30, maxIncidents: 500, lastSync: null } };
}

// ── In-memory incident cache (survives between requests, cleared on disable) ─
let _incidentCache = { data: null, fetchedAt: null };

// ── Helper: make HTTPS request to ServiceNow Table API ──────────────────────
function snowRequest(config, tablePath, query = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/now/${config.apiVersion || 'v2'}/${tablePath}`, config.instanceUrl);
    if (query) url.search = query;

    const authStr = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authStr}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Request timeout (15s)')); });
    req.end();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═════════════════════════════════════════════════════════════════════════════

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

    // Preserve stored password if placeholder sent
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

      // Update connection test status
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

// ── GET /stats — Dashboard statistics ───────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.json({
        success: true,
        data: {
          connectionStatus: 'not_configured',
          totalIncidents: 0, openIncidents: 0, criticalIncidents: 0, slaBreaches: 0,
          lastSync: defaults.sync?.lastSync || null,
        },
      });
    }

    // Use cached incidents if available and fresh (< intervalMinutes)
    const cacheAge = _incidentCache.fetchedAt
      ? (Date.now() - _incidentCache.fetchedAt) / 60000
      : Infinity;
    const cacheTtl = defaults.sync?.intervalMinutes || 30;

    let incidents = _incidentCache.data;
    if (!incidents || cacheAge > cacheTtl) {
      try {
        const result = await snowRequest(conn, 'table/incident',
          `sysparm_limit=${defaults.sync?.maxIncidents || 500}&sysparm_fields=number,short_description,priority,state,opened_at,resolved_at`
        );
        if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
          incidents = result.data.result;
          _incidentCache = { data: incidents, fetchedAt: Date.now() };
        }
      } catch {
        incidents = _incidentCache.data || [];
      }
    }

    if (!incidents) incidents = [];

    const slaThresholds = defaults.sla || { critical: 4, high: 8, medium: 24, low: 72 };
    const openStates = ['1', '2', '3', '4', '5'];

    const totalIncidents = incidents.length;
    const openIncidents = incidents.filter(i => openStates.includes(String(i.priority || i.state))).length;
    const criticalIncidents = incidents.filter(i => String(i.priority) === '1').length;

    // SLA breach calculation (simplified)
    let slaBreaches = 0;
    for (const inc of incidents) {
      if (inc.opened_at && !inc.resolved_at) {
        const openedHoursAgo = (Date.now() - new Date(inc.opened_at).getTime()) / 3600000;
        const priority = String(inc.priority);
        const threshold = slaThresholds[priority === '1' ? 'critical' : priority === '2' ? 'high' : priority === '3' ? 'medium' : 'low'];
        if (openedHoursAgo > threshold) slaBreaches++;
      }
    }

    return res.json({
      success: true,
      data: {
        connectionStatus: 'connected',
        totalIncidents, openIncidents, criticalIncidents, slaBreaches,
        lastSync: defaults.sync?.lastSync || _incidentCache.fetchedAt ? new Date(_incidentCache.fetchedAt).toISOString() : null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Stats failed: ${err.message}` } });
  }
});

// ── GET /incidents — Paginated + filtered incident list ─────────────────────
router.get('/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.json({
        success: true,
        data: { incidents: [], total: 0, fromCache: false },
      });
    }

    const { state, priority, search, limit = '50', offset = '0' } = req.query;

    // Fetch or use cache
    const cacheAge = _incidentCache.fetchedAt
      ? (Date.now() - _incidentCache.fetchedAt) / 60000
      : Infinity;
    const cacheTtl = defaults.sync?.intervalMinutes || 30;

    let allIncidents = _incidentCache.data;
    let fromCache = true;

    if (!allIncidents || cacheAge > cacheTtl) {
      try {
        const result = await snowRequest(conn, 'table/incident',
          `sysparm_limit=${defaults.sync?.maxIncidents || 500}`
        );
        if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
          allIncidents = result.data.result;
          _incidentCache = { data: allIncidents, fetchedAt: Date.now() };
          fromCache = false;
        }
      } catch {
        allIncidents = _incidentCache.data || [];
      }
    }

    if (!allIncidents) allIncidents = [];

    // Apply filters
    let filtered = [...allIncidents];
    if (state) filtered = filtered.filter(i => String(i.state) === state);
    if (priority) filtered = filtered.filter(i => String(i.priority) === priority);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(i =>
        (i.number || '').toLowerCase().includes(q) ||
        (i.short_description || '').toLowerCase().includes(q)
      );
    }

    const total = filtered.length;
    const pageOffset = parseInt(offset, 10) || 0;
    const pageLimit = parseInt(limit, 10) || 50;
    const paged = filtered.slice(pageOffset, pageOffset + pageLimit);

    return res.json({
      success: true,
      data: { incidents: paged, total, fromCache },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Incidents failed: ${err.message}` } });
  }
});

// ── POST /sync — Trigger manual sync ────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.status(400).json({
        success: false,
        error: { message: 'ServiceNow connection is not configured.' },
      });
    }

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=${defaults.sync?.maxIncidents || 500}`
    );

    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      _incidentCache = { data: result.data.result, fetchedAt: Date.now() };

      // Update last sync time
      defaults.sync = defaults.sync || {};
      defaults.sync.lastSync = new Date().toISOString();
      writeJsonFile(DEFAULTS_CONFIG, defaults);

      return res.json({
        success: true,
        data: { count: result.data.result.length, syncedAt: defaults.sync.lastSync },
        message: 'ServiceNow data synchronization completed successfully.',
      });
    } else {
      return res.status(502).json({
        success: false,
        error: { message: `ServiceNow returned HTTP ${result.statusCode}` },
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Sync failed: ${err.message}` } });
  }
});

// ── GET /reports — SLA compliance + volume analytics ────────────────────────
router.get('/reports', (req, res) => {
  try {
    const defaults = loadDefaultsConfig();
    const incidents = _incidentCache.data || [];
    const slaThresholds = defaults.sla || { critical: 4, high: 8, medium: 24, low: 72 };

    const totalIncidents = incidents.length;
    let slaBreaches = 0;
    const byPriority = { '1': 0, '2': 0, '3': 0, '4': 0 };
    const byState = {};

    for (const inc of incidents) {
      const p = String(inc.priority || '4');
      byPriority[p] = (byPriority[p] || 0) + 1;

      const s = String(inc.state || 'unknown');
      byState[s] = (byState[s] || 0) + 1;

      if (inc.opened_at && !inc.resolved_at) {
        const hours = (Date.now() - new Date(inc.opened_at).getTime()) / 3600000;
        const threshold = slaThresholds[p === '1' ? 'critical' : p === '2' ? 'high' : p === '3' ? 'medium' : 'low'];
        if (hours > threshold) slaBreaches++;
      }
    }

    const slaCompliance = totalIncidents > 0
      ? Math.round(((totalIncidents - slaBreaches) / totalIncidents) * 100)
      : 100;

    return res.json({
      success: true,
      data: {
        totalIncidents,
        slaCompliance,
        slaBreaches,
        byPriority,
        byState,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Reports failed: ${err.message}` } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// LIFECYCLE HOOKS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Called when the module is enabled. Initialize config directory.
 */
export async function onEnable() {
  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Create default config files if they don't exist
  if (!fs.existsSync(CONNECTION_CONFIG)) {
    writeJsonFile(CONNECTION_CONFIG, {
      instanceUrl: 'https://dev300418.service-now.com',
      username: 'admin',
      password: 'FHV7Ffzxy7*%',
      authMethod: 'basic',
      apiVersion: 'v2',
      isConfigured: true,
      lastTested: null,
      testStatus: null,
    });
  }

  if (!fs.existsSync(DEFAULTS_CONFIG)) {
    writeJsonFile(DEFAULTS_CONFIG, {
      sla: { critical: 4, high: 8, medium: 24, low: 72 },
      sync: { enabled: false, intervalMinutes: 30, maxIncidents: 500, lastSync: null },
    });
  }
}

/**
 * Called when the module is disabled. Cleanup resources.
 */
export async function onDisable() {
  // Clear in-memory cache
  _incidentCache = { data: null, fetchedAt: null };
}

export { router };
export default router;
