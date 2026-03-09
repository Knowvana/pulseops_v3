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

// ── Helper: make write request (POST/PATCH/PUT) to ServiceNow Table API ──
function snowRequestWrite(config, tablePath, method = 'POST', bodyStr = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/now/${config.apiVersion || 'v2'}/${tablePath}`, config.instanceUrl);
    const authStr = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${authStr}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Request timeout (15s)')); });
    req.write(bodyStr);
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

// ═════════════════════════════════════════════════════════════════════════════
// INCIDENT CRUD
// ═════════════════════════════════════════════════════════════════════════════

// ── POST /incidents — Create an incident ─────────────────────────────────
router.post('/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }
    const { shortDescription, priority, state, category, impact, urgency } = req.body;
    if (!shortDescription) {
      return res.status(400).json({ success: false, error: { message: 'shortDescription is required.' } });
    }
    const payload = JSON.stringify({
      short_description: shortDescription,
      priority: priority || '3 - Medium',
      state: state || 'New',
      category: category || 'General',
      impact: impact || '3 - Low',
      urgency: urgency || '3 - Low',
    });
    const result = await snowRequestWrite(conn, 'table/incident', 'POST', payload);
    if (result.statusCode >= 200 && result.statusCode < 300) {
      _incidentCache = { data: null, fetchedAt: null };
      return res.json({ success: true, data: result.data?.result || result.data, message: 'Incident created successfully.' });
    }
    return res.status(result.statusCode || 502).json({ success: false, error: { message: `ServiceNow returned HTTP ${result.statusCode}` } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Create incident failed: ${err.message}` } });
  }
});

// ── PUT /incidents/:id — Update an incident ──────────────────────────────
router.put('/incidents/:id', async (req, res) => {
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
    const result = await snowRequestWrite(conn, `table/incident/${id}`, 'PATCH', JSON.stringify(payload));
    if (result.statusCode >= 200 && result.statusCode < 300) {
      _incidentCache = { data: null, fetchedAt: null };
      return res.json({ success: true, data: result.data?.result || result.data, message: 'Incident updated successfully.' });
    }
    return res.status(result.statusCode || 502).json({ success: false, error: { message: `ServiceNow returned HTTP ${result.statusCode}` } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Update incident failed: ${err.message}` } });
  }
});

// ── POST /incidents/:id/close — Close an incident ────────────────────────
router.post('/incidents/:id/close', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }
    const { id } = req.params;
    const { closeNotes, closeCode } = req.body;
    const payload = JSON.stringify({
      state: '7',
      close_notes: closeNotes || 'Closed via PulseOps',
      close_code: closeCode || 'Solved (Permanently)',
    });
    const result = await snowRequestWrite(conn, `table/incident/${id}`, 'PATCH', payload);
    if (result.statusCode >= 200 && result.statusCode < 300) {
      _incidentCache = { data: null, fetchedAt: null };
      return res.json({ success: true, data: result.data?.result || result.data, message: 'Incident closed successfully.' });
    }
    return res.status(result.statusCode || 502).json({ success: false, error: { message: `ServiceNow returned HTTP ${result.statusCode}` } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Close incident failed: ${err.message}` } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// RITM CRUD
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// SLA CONFIG / BUSINESS HOURS / SETTINGS / DATA MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

// ── GET/PUT /sla/config ──────────────────────────────────────────────────
router.get('/sla/config', (req, res) => {
  try {
    const slaConfig = readJsonFile(path.join(CONFIG_DIR, 'servicenow_sla.json')) || [];
    return res.json({ success: true, data: slaConfig });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load SLA config: ${err.message}` } });
  }
});

router.put('/sla/config', (req, res) => {
  try {
    writeJsonFile(path.join(CONFIG_DIR, 'servicenow_sla.json'), req.body);
    return res.json({ success: true, message: 'SLA configuration saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save SLA config: ${err.message}` } });
  }
});

// ── GET/PUT /business-hours ──────────────────────────────────────────────
router.get('/business-hours', (req, res) => {
  try {
    const hours = readJsonFile(path.join(CONFIG_DIR, 'servicenow_business_hours.json')) || [];
    return res.json({ success: true, data: hours });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load business hours: ${err.message}` } });
  }
});

router.put('/business-hours', (req, res) => {
  try {
    writeJsonFile(path.join(CONFIG_DIR, 'servicenow_business_hours.json'), req.body);
    return res.json({ success: true, message: 'Business hours saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save business hours: ${err.message}` } });
  }
});

// ── GET/PUT /config/settings ─────────────────────────────────────────────
router.get('/config/settings', (req, res) => {
  try {
    const settings = readJsonFile(path.join(CONFIG_DIR, 'servicenow_settings.json')) || {};
    return res.json({ success: true, data: settings });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load settings: ${err.message}` } });
  }
});

router.put('/config/settings', (req, res) => {
  try {
    writeJsonFile(path.join(CONFIG_DIR, 'servicenow_settings.json'), req.body);
    return res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save settings: ${err.message}` } });
  }
});

// ── GET /sync/status ─────────────────────────────────────────────────────
router.get('/sync/status', (req, res) => {
  try {
    const defaults = loadDefaultsConfig();
    return res.json({
      success: true,
      data: {
        running: !!defaults.sync?.enabled,
        lastSyncTime: defaults.sync?.lastSync || null,
        syncIntervalMinutes: defaults.sync?.intervalMinutes || 30,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Sync status failed: ${err.message}` } });
  }
});

// ── GET/PUT /sync/schedule ───────────────────────────────────────────────
router.get('/sync/schedule', (req, res) => {
  try {
    const defaults = loadDefaultsConfig();
    return res.json({
      success: true,
      data: {
        syncEnabled: !!defaults.sync?.enabled,
        syncIntervalMinutes: defaults.sync?.intervalMinutes || 60,
        syncIncidents: defaults.sync?.syncIncidents !== false,
        syncRitms: defaults.sync?.syncRitms !== false,
        syncChanges: defaults.sync?.syncChanges !== false,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Sync schedule fetch failed: ${err.message}` } });
  }
});

router.put('/sync/schedule', (req, res) => {
  try {
    const { syncEnabled, syncIntervalMinutes, syncIncidents, syncRitms, syncChanges } = req.body;
    const defaults = loadDefaultsConfig();
    defaults.sync = {
      ...defaults.sync,
      enabled: Boolean(syncEnabled),
      intervalMinutes: Number(syncIntervalMinutes) || 60,
      syncIncidents: syncIncidents !== false,
      syncRitms: syncRitms !== false,
      syncChanges: syncChanges !== false,
    };
    writeJsonFile(DEFAULTS_CONFIG, defaults);
    return res.json({ success: true, message: 'Sync schedule saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Sync schedule save failed: ${err.message}` } });
  }
});

// ── GET /schema/info ─────────────────────────────────────────────────────
router.get('/schema/info', (req, res) => {
  try {
    return res.json({ success: true, data: { initialized: true, existing: ['servicenow_config'], missing: [] } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Schema info failed: ${err.message}` } });
  }
});

// ── POST /data/demo — Load demo/default data ────────────────────────────
router.post('/data/demo', (req, res) => {
  try {
    const slaPath = path.join(CONFIG_DIR, 'servicenow_sla.json');
    if (!fs.existsSync(slaPath)) {
      writeJsonFile(slaPath, [
        { priority: '1 - Critical', recordType: 'incident', responseTimeMinutes: 15, resolutionTimeMinutes: 120 },
        { priority: '2 - High', recordType: 'incident', responseTimeMinutes: 30, resolutionTimeMinutes: 360 },
        { priority: '3 - Medium', recordType: 'incident', responseTimeMinutes: 120, resolutionTimeMinutes: 960 },
        { priority: '4 - Low', recordType: 'incident', responseTimeMinutes: 480, resolutionTimeMinutes: 2400 },
        { priority: '1 - Critical', recordType: 'ritm', responseTimeMinutes: 30, resolutionTimeMinutes: 240 },
        { priority: '2 - High', recordType: 'ritm', responseTimeMinutes: 60, resolutionTimeMinutes: 960 },
        { priority: '3 - Medium', recordType: 'ritm', responseTimeMinutes: 240, resolutionTimeMinutes: 2400 },
        { priority: '4 - Low', recordType: 'ritm', responseTimeMinutes: 480, resolutionTimeMinutes: 4800 },
      ]);
    }
    const bhPath = path.join(CONFIG_DIR, 'servicenow_business_hours.json');
    if (!fs.existsSync(bhPath)) {
      writeJsonFile(bhPath, [
        { dayOfWeek: 0, dayName: 'Sunday', isBusinessDay: false, startTime: '00:00', endTime: '00:00' },
        { dayOfWeek: 1, dayName: 'Monday', isBusinessDay: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 2, dayName: 'Tuesday', isBusinessDay: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 3, dayName: 'Wednesday', isBusinessDay: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 4, dayName: 'Thursday', isBusinessDay: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 5, dayName: 'Friday', isBusinessDay: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 6, dayName: 'Saturday', isBusinessDay: false, startTime: '00:00', endTime: '00:00' },
      ]);
    }
    return res.json({ success: true, data: { message: 'Default data loaded successfully.' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Demo data load failed: ${err.message}` } });
  }
});

// ── DELETE /data/reset — Hard reset all module data ──────────────────────
router.delete('/data/reset', (req, res) => {
  try {
    const filesToDelete = [
      'servicenow_sla.json', 'servicenow_business_hours.json',
      'servicenow_settings.json', 'servicenow_connection.json', 'servicenow_defaults.json',
    ];
    const droppedTables = [];
    for (const file of filesToDelete) {
      const fp = path.join(CONFIG_DIR, file);
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
        droppedTables.push({ name: file, status: 'dropped' });
      } else {
        droppedTables.push({ name: file, status: 'not_found' });
      }
    }
    _incidentCache = { data: null, fetchedAt: null };
    return res.json({ success: true, data: { droppedTables, message: 'All ServiceNow module data deleted.' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Hard reset failed: ${err.message}` } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// DETAILED REPORTS
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /reports/incidents — Incident report ─────────────────────────────
router.get('/reports/incidents', async (req, res) => {
  try {
    const incidents = _incidentCache.data || [];
    const { startDate, endDate } = req.query;
    let filtered = [...incidents];
    if (startDate) filtered = filtered.filter(i => i.opened_at >= startDate);
    if (endDate) filtered = filtered.filter(i => i.opened_at <= endDate);
    const byPriority = {}, byState = {}, byCategory = {};
    const closed = filtered.filter(i => ['6', '7'].includes(String(i.state)));
    for (const inc of filtered) {
      byPriority[String(inc.priority || '4')] = (byPriority[String(inc.priority || '4')] || 0) + 1;
      byState[String(inc.state || 'unknown')] = (byState[String(inc.state || 'unknown')] || 0) + 1;
      byCategory[inc.category || 'General'] = (byCategory[inc.category || 'General'] || 0) + 1;
    }
    return res.json({
      success: true,
      data: {
        totalCount: filtered.length, totalClosed: closed.length,
        reportingPeriod: { start: startDate || null, end: endDate || null },
        byPriority, byState, byCategory,
        averageResponseTime: null, averageResolutionTime: null,
        incidents: filtered.slice(0, 100).map(i => ({
          number: i.number, shortDescription: i.short_description, priority: i.priority,
          state: i.state, category: i.category, assignmentGroup: i.assignment_group,
          openedAt: i.opened_at, responseTime: null, resolutionTime: null,
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Incident report failed: ${err.message}` } });
  }
});

// ── GET /reports/ritms — RITM report ─────────────────────────────────────
router.get('/reports/ritms', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const { startDate, endDate } = req.query;
    let ritms = [];
    if (conn.isConfigured) {
      try {
        const result = await snowRequest(conn, 'table/sc_req_item', 'sysparm_limit=200');
        if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) ritms = result.data.result;
      } catch { /* use empty */ }
    }
    if (startDate) ritms = ritms.filter(r => r.opened_at >= startDate);
    if (endDate) ritms = ritms.filter(r => r.opened_at <= endDate);
    const byPriority = {}, byState = {}, byCatalogItem = {};
    for (const r of ritms) {
      byPriority[String(r.priority || '4')] = (byPriority[String(r.priority || '4')] || 0) + 1;
      byState[String(r.state || 'unknown')] = (byState[String(r.state || 'unknown')] || 0) + 1;
      byCatalogItem[r.cat_item || 'General'] = (byCatalogItem[r.cat_item || 'General'] || 0) + 1;
    }
    return res.json({
      success: true,
      data: {
        totalCount: ritms.length,
        reportingPeriod: { start: startDate || null, end: endDate || null },
        byPriority, byState, byCatalogItem,
        ritms: ritms.slice(0, 100).map(r => ({
          number: r.number, shortDescription: r.short_description, priority: r.priority,
          state: r.state, catalogItem: r.cat_item, assignmentGroup: r.assignment_group,
          openedAt: r.opened_at, fulfillmentTime: null,
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `RITM report failed: ${err.message}` } });
  }
});

// ── GET /reports/sla — SLA compliance report ─────────────────────────────
router.get('/reports/sla', (req, res) => {
  try {
    const defaults = loadDefaultsConfig();
    const slaConfig = readJsonFile(path.join(CONFIG_DIR, 'servicenow_sla.json')) || [];
    const incidents = _incidentCache.data || [];
    const slaThresholds = defaults.sla || { critical: 4, high: 8, medium: 24, low: 72 };
    if (slaConfig.length === 0) {
      return res.json({ success: true, data: { message: 'No SLA configuration found. Configure SLA thresholds first.' } });
    }
    const incidentSlaByPriority = {};
    for (const inc of incidents) {
      const p = String(inc.priority || '4');
      const pLabel = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
      if (!incidentSlaByPriority[pLabel]) {
        const cfg = slaConfig.find(s => s.priority === pLabel && s.recordType === 'incident');
        incidentSlaByPriority[pLabel] = {
          responseTarget: cfg?.responseTimeMinutes || null,
          resolutionTarget: cfg?.resolutionTimeMinutes || null,
          responseMet: 0, responseBreached: 0, resolutionMet: 0, resolutionBreached: 0,
        };
      }
      if (inc.opened_at) {
        const hours = (Date.now() - new Date(inc.opened_at).getTime()) / 3600000;
        const threshold = slaThresholds[p === '1' ? 'critical' : p === '2' ? 'high' : p === '3' ? 'medium' : 'low'];
        if (hours <= threshold) incidentSlaByPriority[pLabel].resolutionMet++;
        else incidentSlaByPriority[pLabel].resolutionBreached++;
      }
    }
    for (const val of Object.values(incidentSlaByPriority)) {
      const total = val.resolutionMet + val.resolutionBreached;
      val.resolutionCompliance = total > 0 ? Math.round((val.resolutionMet / total) * 100) : null;
      val.responseCompliance = val.resolutionCompliance;
      val.responseMet = val.resolutionMet;
      val.responseBreached = val.resolutionBreached;
    }
    return res.json({
      success: true,
      data: {
        incidentSla: { byPriority: incidentSlaByPriority },
        ritmSla: { byPriority: {} },
        reportingPeriod: { start: null, end: null },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `SLA report failed: ${err.message}` } });
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
