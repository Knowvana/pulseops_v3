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
import DatabaseService from '#core/database/databaseService.js';
import { config as appConfig } from '#config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
const dbSchema = appConfig.db.schema || 'pulseops';

// ── Config file paths ────────────────────────────────────────────────────────
// Config files live alongside the API entry point in dist-modules/servicenow/api/config/
const CONFIG_DIR = path.resolve(__dirname, 'config');
const CONNECTION_CONFIG = path.join(CONFIG_DIR, 'servicenow_connection.json');
const DEFAULTS_CONFIG = path.join(CONFIG_DIR, 'servicenow_defaults.json');

// ── Database-related paths ───────────────────────────────────────────────────
// Schema.json and DefaultData.json live in the module's database/ folder.
// Resolve from dist-modules first (prod), then src/modules (dev).
function resolveModuleDbFile(filename) {
  const distPath = path.resolve(__dirname, '..', 'database', filename);
  if (fs.existsSync(distPath)) return distPath;
  // Dev fallback — walk up from dist-modules/servicenow/api → project root → src/modules/servicenow/database
  const srcPath = path.resolve(__dirname, '..', '..', '..', 'src', 'modules', 'servicenow', 'database', filename);
  if (fs.existsSync(srcPath)) return srcPath;
  return null;
}
const SCHEMA_JSON_FILE = 'Schema.json';
const DEFAULT_DATA_FILE = 'DefaultData.json';

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

// ── Helper: load incident config from database ────────────────────────────
async function loadIncidentConfig() {
  try {
    const result = await DatabaseService.query(
      `SELECT * FROM ${dbSchema}.sn_incident_config WHERE id = 1`
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        selectedColumns: row.selected_columns || ['number','short_description','priority','state','assigned_to','opened_at'],
        createdColumn: row.created_column || 'opened_at',
        closedColumn: row.closed_column || 'closed_at',
        assignmentGroup: row.assignment_group || '',
      };
    }
  } catch { /* table may not exist yet */ }
  return {
    selectedColumns: ['number','short_description','priority','state','assigned_to','opened_at'],
    createdColumn: 'opened_at',
    closedColumn: 'closed_at',
    assignmentGroup: '',
  };
}

// ── Helper: build sysparm_query for assignment group filtering ──────────────
function buildAssignmentGroupQuery(assignmentGroup) {
  if (!assignmentGroup) return '';
  return `assignment_group=${encodeURIComponent(assignmentGroup)}`;
}

// ── Helper: extract primitive value from SNOW {link,value} objects ──────────
function snowVal(field) {
  if (!field) return field;
  return typeof field === 'object' && field?.value !== undefined ? field.value : field;
}

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

// ── GET /stats — Dashboard statistics (always fetches live from SNOW) ────────
router.get('/stats', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.json({
        success: true,
        data: {
          notConfigured: true,
          connectionStatus: 'not_configured',
          total: 0, open: 0, inProgress: 0, critical: 0, slaBreached: 0, resolvedToday: 0,
          lastSync: defaults.sync?.lastSync || null,
        },
      });
    }

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const queryParts = [`sysparm_limit=${defaults.sync?.maxIncidents || 500}`, 'sysparm_fields=number,short_description,priority,state,opened_at,resolved_at,closed_at,assigned_to'];
    if (agQuery) queryParts.push(`sysparm_query=${agQuery}`);

    let incidents = [];
    try {
      const result = await snowRequest(conn, 'table/incident', queryParts.join('&'));
      if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
        incidents = result.data.result;
      }
    } catch { /* SNOW unreachable — return zeros */ }

    // Load SLA thresholds from DB
    let slaThresholds = {};
    try {
      const slaResult = await DatabaseService.query(`SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true`);
      for (const row of slaResult.rows) {
        slaThresholds[row.priority] = { responseMinutes: Number(row.response_minutes || 0), resolutionMinutes: Number(row.resolution_minutes || 0) };
      }
    } catch { /* use empty */ }

    const total = incidents.length;
    const open = incidents.filter(i => String(snowVal(i.state)) === '1').length;
    const inProgress = incidents.filter(i => ['2', '3'].includes(String(snowVal(i.state)))).length;
    const critical = incidents.filter(i => String(snowVal(i.priority)) === '1' && !['6', '7', '8'].includes(String(snowVal(i.state)))).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const resolvedToday = incidents.filter(i => {
      if (!['6', '7'].includes(String(snowVal(i.state)))) return false;
      const resolvedDate = snowVal(i.resolved_at) || snowVal(i.closed_at);
      return resolvedDate && String(resolvedDate).slice(0, 10) === todayStr;
    }).length;

    let slaBreached = 0;
    for (const inc of incidents) {
      const openedAt = snowVal(inc.opened_at);
      const resolvedAt = snowVal(inc.resolved_at);
      const st = String(snowVal(inc.state));
      if (openedAt && !resolvedAt && !['6', '7', '8'].includes(st)) {
        const openedMinutesAgo = (Date.now() - new Date(openedAt).getTime()) / 60000;
        const p = String(snowVal(inc.priority));
        const pKey = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
        const threshold = slaThresholds[pKey]?.resolutionMinutes || (p === '1' ? 120 : p === '2' ? 360 : p === '3' ? 960 : 2400);
        if (openedMinutesAgo > threshold) slaBreached++;
      }
    }

    return res.json({
      success: true,
      data: {
        connectionStatus: 'connected',
        total, open, inProgress, critical, slaBreached, resolvedToday,
        lastSync: defaults.sync?.lastSync || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Stats failed: ${err.message}` } });
  }
});

// ── GET /incidents — Paginated + filtered incident list (always live from SNOW)
router.get('/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.json({
        success: true,
        data: { incidents: [], total: 0 },
      });
    }

    const { state, priority, search, limit = '50', offset = '0', sort = 'number', order = 'desc' } = req.query;
    const incidentConfig = await loadIncidentConfig();

    // Build sysparm_query
    const queryParts = [];
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    if (agQuery) queryParts.push(agQuery);
    if (state) queryParts.push(`state=${state}`);
    if (priority) queryParts.push(`priority=${priority}`);
    if (search) queryParts.push(`numberLIKE${search}^ORshort_descriptionLIKE${search}`);

    // Sort — SNOW uses ORDERBYDESCfield or ORDERBYfield
    const sortField = sort || 'number';
    const sortOrder = order === 'asc' ? `ORDERBY${sortField}` : `ORDERBYDESC${sortField}`;
    queryParts.push(sortOrder);

    // Build fields list from incident config
    const defaultFields = ['sys_id','number','short_description','priority','state','assigned_to','opened_at','resolved_at','closed_at','sys_created_on'];
    const fields = [...new Set([...defaultFields, ...incidentConfig.selectedColumns, incidentConfig.createdColumn, incidentConfig.closedColumn])];

    const pageLimit = parseInt(limit, 10) || 50;
    const pageOffset = parseInt(offset, 10) || 0;

    const params = [
      `sysparm_limit=${pageLimit}`,
      `sysparm_offset=${pageOffset}`,
      `sysparm_fields=${fields.join(',')}`,
    ];
    if (queryParts.length > 0) params.push(`sysparm_query=${queryParts.join('^')}`);

    const result = await snowRequest(conn, 'table/incident', params.join('&'));

    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      // Get total count from SNOW response header (X-Total-Count) — not available via our helper,
      // so estimate from result length
      const incidents = result.data.result;
      return res.json({
        success: true,
        data: { incidents, total: incidents.length < pageLimit ? pageOffset + incidents.length : pageOffset + incidents.length + 1 },
      });
    }
    return res.json({ success: true, data: { incidents: [], total: 0 } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Incidents failed: ${err.message}` } });
  }
});

// ── POST /sync — Trigger manual sync with detailed summary ──────────────────
router.post('/sync', async (req, res) => {
  const startTime = Date.now();
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.status(400).json({
        success: false,
        error: { message: 'ServiceNow connection is not configured.' },
      });
    }

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);

    // Fetch incidents from SNOW
    const queryParts = ['ORDERBYDESCnumber'];
    if (agQuery) queryParts.unshift(agQuery);
    const incidentResult = await snowRequest(conn, 'table/incident',
      `sysparm_limit=${defaults.sync?.maxIncidents || 500}&sysparm_query=${queryParts.join('^')}`
    );

    const summary = { tables: [], totalFetched: 0, errors: [] };

    if (incidentResult.statusCode >= 200 && incidentResult.statusCode < 300 && incidentResult.data?.result) {
      summary.tables.push({ name: 'incident', recordsFetched: incidentResult.data.result.length });
      summary.totalFetched += incidentResult.data.result.length;
    } else {
      summary.errors.push({ table: 'incident', status: incidentResult.statusCode, message: `HTTP ${incidentResult.statusCode}` });
    }

    // Update last sync time
    defaults.sync = defaults.sync || {};
    defaults.sync.lastSync = new Date().toISOString();
    writeJsonFile(DEFAULTS_CONFIG, defaults);

    const durationMs = Date.now() - startTime;

    return res.json({
      success: summary.errors.length === 0,
      data: {
        summary,
        syncedAt: defaults.sync.lastSync,
        durationMs,
      },
      message: summary.errors.length === 0
        ? `Sync completed successfully. Fetched ${summary.totalFetched} record(s) from ${summary.tables.length} table(s) in ${durationMs}ms.`
        : `Sync completed with ${summary.errors.length} error(s).`,
    });
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

// ═════════════════════════════════════════════════════════════════════════════
// INCIDENT CONFIGURATION (DB-backed)
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /config/incidents — Read incident configuration ──────────────────
router.get('/config/incidents', async (req, res) => {
  try {
    const config = await loadIncidentConfig();
    return res.json({ success: true, data: config });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load incident config: ${err.message}` } });
  }
});

// ── PUT /config/incidents — Save incident configuration ──────────────────
router.put('/config/incidents', async (req, res) => {
  try {
    const { selectedColumns, createdColumn, closedColumn, assignmentGroup } = req.body;
    if (!selectedColumns || !Array.isArray(selectedColumns)) {
      return res.status(400).json({ success: false, error: { message: 'selectedColumns must be an array.' } });
    }
    if (!selectedColumns.includes('number')) {
      return res.status(400).json({ success: false, error: { message: 'Incident number column is mandatory.' } });
    }

    // Upsert into DB (id=1 is the singleton config row)
    await DatabaseService.query(
      `INSERT INTO ${dbSchema}.sn_incident_config (id, selected_columns, created_column, closed_column, assignment_group, updated_at)
       VALUES (1, $1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         selected_columns = $1, created_column = $2, closed_column = $3, assignment_group = $4, updated_at = NOW()`,
      [JSON.stringify(selectedColumns), createdColumn || 'opened_at', closedColumn || 'closed_at', assignmentGroup || '']
    );

    return res.json({ success: true, message: 'Incident configuration saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save incident config: ${err.message}` } });
  }
});

// ── GET /schema/columns — Fetch available SNOW incident columns ──────────
router.get('/schema/columns', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }

    // Use SNOW Table API to get column metadata for incident table
    const result = await snowRequest(conn, 'table/incident', 'sysparm_limit=1');
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      // Extract column names from the first record
      const sampleRecord = result.data.result[0] || {};
      const columns = Object.keys(sampleRecord).sort().map(col => ({
        name: col,
        label: col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      }));
      return res.json({ success: true, data: { columns } });
    }
    return res.status(502).json({ success: false, error: { message: `ServiceNow returned HTTP ${result.statusCode}` } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to fetch SNOW columns: ${err.message}` } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SLA CONFIGURATION (DB-backed CRUD)
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /config/sla — List all SLA configurations ────────────────────────
router.get('/config/sla', async (req, res) => {
  try {
    const result = await DatabaseService.query(
      `SELECT * FROM ${dbSchema}.sn_sla_config ORDER BY id`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load SLA config: ${err.message}` } });
  }
});

// ── POST /config/sla — Create a new SLA row ─────────────────────────────
router.post('/config/sla', async (req, res) => {
  try {
    const { priority, responseMinutes, resolutionMinutes, enabled = true } = req.body;
    if (!priority) {
      return res.status(400).json({ success: false, error: { message: 'priority is required.' } });
    }
    const result = await DatabaseService.query(
      `INSERT INTO ${dbSchema}.sn_sla_config (priority, response_minutes, resolution_minutes, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
      [priority, Number(responseMinutes) || 60, Number(resolutionMinutes) || 480, Boolean(enabled)]
    );
    return res.json({ success: true, data: result.rows[0], message: 'SLA configuration created.' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: { message: `SLA for priority "${req.body.priority}" already exists.` } });
    }
    return res.status(500).json({ success: false, error: { message: `Failed to create SLA config: ${err.message}` } });
  }
});

// ── PUT /config/sla/:id — Update an SLA row ─────────────────────────────
router.put('/config/sla/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { priority, responseMinutes, resolutionMinutes, enabled } = req.body;
    const result = await DatabaseService.query(
      `UPDATE ${dbSchema}.sn_sla_config
       SET priority = COALESCE($2, priority),
           response_minutes = COALESCE($3, response_minutes),
           resolution_minutes = COALESCE($4, resolution_minutes),
           enabled = COALESCE($5, enabled),
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, priority, responseMinutes != null ? Number(responseMinutes) : null, resolutionMinutes != null ? Number(resolutionMinutes) : null, enabled != null ? Boolean(enabled) : null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'SLA config not found.' } });
    }
    return res.json({ success: true, data: result.rows[0], message: 'SLA configuration updated.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to update SLA config: ${err.message}` } });
  }
});

// ── DELETE /config/sla/:id — Delete an SLA row ──────────────────────────
router.delete('/config/sla/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await DatabaseService.query(
      `DELETE FROM ${dbSchema}.sn_sla_config WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'SLA config not found.' } });
    }
    return res.json({ success: true, message: 'SLA configuration deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to delete SLA config: ${err.message}` } });
  }
});

// ── GET /reports/sla/incidents — Incident SLA report with time filter ────
router.get('/reports/sla/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }

    const { period = 'monthly' } = req.query; // daily, weekly, monthly
    const incidentConfig = await loadIncidentConfig();

    // Calculate date range based on period
    const now = new Date();
    let startDate;
    if (period === 'daily') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    } else if (period === 'weekly') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = weekAgo.toISOString().slice(0, 10);
    } else {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      startDate = monthAgo.toISOString().slice(0, 10);
    }

    // Build SNOW query
    const queryParts = [`${incidentConfig.createdColumn}>=${startDate}`, 'ORDERBYDESCnumber'];
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    if (agQuery) queryParts.unshift(agQuery);

    const fields = ['sys_id','number','short_description','priority','state','assigned_to',
      incidentConfig.createdColumn, incidentConfig.closedColumn, 'resolved_at'].filter(Boolean);

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=500&sysparm_fields=${[...new Set(fields)].join(',')}&sysparm_query=${queryParts.join('^')}`
    );

    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    // Load SLA thresholds from DB
    let slaThresholds = {};
    try {
      const slaResult = await DatabaseService.query(`SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true`);
      for (const row of slaResult.rows) {
        slaThresholds[row.priority] = { responseMinutes: Number(row.response_minutes), resolutionMinutes: Number(row.resolution_minutes) };
      }
    } catch { /* use empty */ }

    // Load business hours config
    let businessHours = null;
    try {
      businessHours = readJsonFile(path.join(CONFIG_DIR, 'servicenow_business_hours.json'));
    } catch { /* ignore */ }

    // Calculate SLA for each incident
    const incidentSlaData = incidents.map(inc => {
      const p = String(snowVal(inc.priority));
      const pKey = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
      const createdAt = snowVal(inc[incidentConfig.createdColumn]);
      const closedAt = snowVal(inc[incidentConfig.closedColumn]) || snowVal(inc.resolved_at);
      const threshold = slaThresholds[pKey] || { responseMinutes: 60, resolutionMinutes: 480 };

      let resolutionMinutes = null;
      let slaMet = null;
      if (createdAt && closedAt) {
        // Calculate resolution time considering business hours if configured
        const created = new Date(createdAt);
        const closed = new Date(closedAt);
        resolutionMinutes = Math.round((closed - created) / 60000);

        // Business hours calculation
        if (businessHours && Array.isArray(businessHours) && businessHours.length > 0) {
          let bizMinutes = 0;
          const cursor = new Date(created);
          while (cursor < closed) {
            const dayOfWeek = cursor.getDay();
            const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek];
            const dayConfig = businessHours.find(d => d.day === dayName);
            if (dayConfig?.isBusinessDay && dayConfig.startTime && dayConfig.endTime) {
              const [sh, sm] = dayConfig.startTime.split(':').map(Number);
              const [eh, em] = dayConfig.endTime.split(':').map(Number);
              const dayStart = new Date(cursor); dayStart.setHours(sh, sm, 0, 0);
              const dayEnd = new Date(cursor); dayEnd.setHours(eh, em, 0, 0);
              const effectiveStart = cursor > dayStart ? cursor : dayStart;
              const effectiveEnd = closed < dayEnd ? closed : dayEnd;
              if (effectiveStart < effectiveEnd) {
                bizMinutes += (effectiveEnd - effectiveStart) / 60000;
              }
            }
            cursor.setDate(cursor.getDate() + 1);
            cursor.setHours(0, 0, 0, 0);
          }
          resolutionMinutes = Math.round(bizMinutes);
        }

        slaMet = resolutionMinutes <= threshold.resolutionMinutes;
      }

      return {
        number: snowVal(inc.number),
        shortDescription: snowVal(inc.short_description),
        priority: pKey,
        state: snowVal(inc.state),
        assignedTo: snowVal(inc.assigned_to),
        createdAt,
        closedAt,
        resolutionMinutes,
        targetMinutes: threshold.resolutionMinutes,
        slaMet,
      };
    });

    // Summary by priority
    const summaryByPriority = {};
    for (const inc of incidentSlaData) {
      if (!summaryByPriority[inc.priority]) {
        summaryByPriority[inc.priority] = { total: 0, met: 0, breached: 0, pending: 0, targetMinutes: inc.targetMinutes };
      }
      summaryByPriority[inc.priority].total++;
      if (inc.slaMet === true) summaryByPriority[inc.priority].met++;
      else if (inc.slaMet === false) summaryByPriority[inc.priority].breached++;
      else summaryByPriority[inc.priority].pending++;
    }

    return res.json({
      success: true,
      data: {
        period,
        startDate,
        endDate: now.toISOString().slice(0, 10),
        totalIncidents: incidents.length,
        summaryByPriority,
        incidents: incidentSlaData,
        incidentConfig: { createdColumn: incidentConfig.createdColumn, closedColumn: incidentConfig.closedColumn },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `SLA report failed: ${err.message}` } });
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
// Returns dynamic schema status by reading Schema.json and checking actual DB tables.
// Includes table row counts and schema initialization date.
router.get('/schema/info', async (req, res) => {
  const startTime = Date.now();
  const logContext = { endpoint: 'GET /schema/info', requestId: req.headers['x-request-id'] };
  
  try {
    console.log('[ServiceNow API] Schema info request started', logContext);
    
    // 1. Read Schema.json to know what tables are expected
    const schemaPath = resolveModuleDbFile(SCHEMA_JSON_FILE);
    if (!schemaPath) {
      return res.json({
        success: true,
        data: {
          initialized: false,
          hasSchema: false,
          tables: [],
          message: 'No Schema.json found for this module.',
          checkedAt: new Date().toISOString(),
        },
      });
    }
    
    const schemaDef = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tableDefs = schemaDef.tables || [];
    
    // 2. Check each table in the database: existence + row count
    const tables = [];
    let allExist = true;
    
    for (const tableDef of tableDefs) {
      const tableName = tableDef.name;
      let exists = false;
      let rowCount = 0;
      
      try {
        // Check if table exists in the schema
        const existsResult = await DatabaseService.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = $1 AND table_name = $2
          ) AS "exists"`,
          [dbSchema, tableName]
        );
        exists = existsResult.rows[0]?.exists === true;
        
        if (exists) {
          // Get row count
          const countResult = await DatabaseService.query(
            `SELECT COUNT(*) AS count FROM ${dbSchema}.${tableName}`
          );
          rowCount = parseInt(countResult.rows[0]?.count || '0', 10);
        }
      } catch (dbErr) {
        console.warn('[ServiceNow API] Table check failed', { table: tableName, error: dbErr.message });
        exists = false;
      }
      
      if (!exists) allExist = false;
      
      tables.push({
        name: tableName,
        description: tableDef.description || '',
        exists,
        rowCount,
        columnCount: (tableDef.columns || []).length,
        indexCount: (tableDef.indexes || []).length,
      });
    }
    
    // 3. Get schema initialization date from system_modules
    let schemaInitializedAt = null;
    let schemaInitialized = false;
    try {
      const modResult = await DatabaseService.query(
        `SELECT schema_initialized, updated_at FROM ${dbSchema}.system_modules WHERE module_id = $1`,
        ['servicenow']
      );
      if (modResult.rows.length > 0) {
        schemaInitialized = modResult.rows[0].schema_initialized === true;
        if (schemaInitialized) {
          schemaInitializedAt = modResult.rows[0].updated_at;
        }
      }
    } catch { /* DB may not be available */ }
    
    // 4. Check for default data availability
    const defaultDataPath = resolveModuleDbFile(DEFAULT_DATA_FILE);
    const hasDefaultData = !!defaultDataPath;
    
    // 5. Check if default data is loaded (e.g., sn_sla_config has rows)
    let defaultDataLoaded = false;
    if (hasDefaultData && allExist) {
      try {
        const defaultDataDef = JSON.parse(fs.readFileSync(defaultDataPath, 'utf8'));
        const seedTables = Object.keys(defaultDataDef).filter(k => k !== '_meta');
        if (seedTables.length > 0) {
          const firstTable = seedTables[0];
          const checkResult = await DatabaseService.query(
            `SELECT COUNT(*) AS count FROM ${dbSchema}.${firstTable}`
          );
          defaultDataLoaded = parseInt(checkResult.rows[0]?.count || '0', 10) > 0;
        }
      } catch { /* ignore */ }
    }
    
    const initialized = schemaInitialized && allExist;
    const duration = Date.now() - startTime;
    
    console.log('[ServiceNow API] Schema info retrieved', {
      ...logContext,
      initialized,
      tableCount: tables.length,
      allTablesExist: allExist,
      duration,
    });
    
    return res.json({
      success: true,
      data: {
        initialized,
        schemaInitialized,
        schemaInitializedAt,
        hasSchema: true,
        moduleId: schemaDef._meta?.moduleId || 'servicenow',
        schemaVersion: schemaDef._meta?.version || '1.0.0',
        tables,
        hasDefaultData,
        defaultDataLoaded,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('[ServiceNow API] Schema info failed', {
      ...logContext,
      error: err.message,
      stack: err.stack,
      duration,
    });
    return res.status(500).json({
      success: false,
      error: { message: `Schema info failed: ${err.message}` },
    });
  }
});

// ── POST /data/defaults — Load default data into database tables ─────────
// Reads database/DefaultData.json and inserts seed rows into the corresponding
// tables defined in Schema.json. Uses ON CONFLICT DO NOTHING to be idempotent.
router.post('/data/defaults', async (req, res) => {
  const startTime = Date.now();
  const logContext = { endpoint: 'POST /data/defaults', requestId: req.headers['x-request-id'] };
  
  try {
    console.log('[ServiceNow API] Default data load started', logContext);
    
    // 1. Locate DefaultData.json
    const defaultDataPath = resolveModuleDbFile(DEFAULT_DATA_FILE);
    if (!defaultDataPath) {
      return res.status(404).json({
        success: false,
        error: { message: 'DefaultData.json not found for this module.' },
      });
    }
    
    const defaultDataDef = JSON.parse(fs.readFileSync(defaultDataPath, 'utf8'));
    const seedEntries = Object.entries(defaultDataDef).filter(([k]) => k !== '_meta');
    
    if (seedEntries.length === 0) {
      return res.json({
        success: true,
        data: { message: 'DefaultData.json has no seed data entries.', tablesSeeded: 0, rowsInserted: 0 },
      });
    }
    
    // 2. Insert seed data in a transaction
    const client = await DatabaseService.getPool().connect();
    const tablesSeeded = [];
    let totalRowsInserted = 0;
    
    try {
      await client.query('BEGIN');
      
      for (const [tableName, rows] of seedEntries) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        
        let tableRowsInserted = 0;
        let tableRowsSkipped = 0;
        
        for (const row of rows) {
          const cols = Object.keys(row);
          const vals = Object.values(row);
          const placeholders = cols.map((_, i) => `$${i + 1}`);
          const insertSQL = `INSERT INTO ${dbSchema}.${tableName} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`;
          const result = await client.query(insertSQL, vals);
          if (result.rowCount > 0) {
            tableRowsInserted += result.rowCount;
          } else {
            tableRowsSkipped++;
          }
        }
        
        totalRowsInserted += tableRowsInserted;
        tablesSeeded.push({
          table: tableName,
          rowsInserted: tableRowsInserted,
          rowsSkipped: tableRowsSkipped,
          totalRows: rows.length,
        });
        
        console.log('[ServiceNow API] Seeded table', {
          ...logContext,
          table: tableName,
          inserted: tableRowsInserted,
          skipped: tableRowsSkipped,
        });
      }
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    
    const duration = Date.now() - startTime;
    
    console.log('[ServiceNow API] Default data load completed', {
      ...logContext,
      tablesSeeded: tablesSeeded.length,
      totalRowsInserted,
      duration,
    });
    
    return res.json({
      success: true,
      data: {
        message: `Default data loaded successfully. Seeded ${tablesSeeded.length} table(s), inserted ${totalRowsInserted} row(s).`,
        tablesSeeded,
        totalRowsInserted,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('[ServiceNow API] Default data load failed', {
      ...logContext,
      error: err.message,
      stack: err.stack,
      duration,
    });
    return res.status(500).json({
      success: false,
      error: { message: `Default data load failed: ${err.message}` },
    });
  }
});

// ── POST /data/demo — Backward-compatible alias for /data/defaults ───────
router.post('/data/demo', async (req, res) => {
  // Forward to /data/defaults handler
  req.url = '/data/defaults';
  router.handle(req, res);
});

// ── DELETE /data/reset — Delete Module Data (Tables and Objects) ──────────
// Dynamically reads Schema.json and drops ALL database tables + indexes defined
// in it. Also clears in-memory caches. This is irreversible.
router.delete('/data/reset', async (req, res) => {
  const startTime = Date.now();
  const logContext = { endpoint: 'DELETE /data/reset', requestId: req.headers['x-request-id'] };
  
  try {
    console.log('[ServiceNow API] Delete module data started', logContext);
    console.warn('[ServiceNow API] ⚠️  DANGER ZONE: Dropping all module database objects', logContext);
    
    // 1. Read Schema.json to know what tables to drop
    const schemaPath = resolveModuleDbFile(SCHEMA_JSON_FILE);
    if (!schemaPath) {
      return res.status(404).json({
        success: false,
        error: { message: 'Schema.json not found — no database objects to delete.' },
      });
    }
    
    const schemaDef = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tableDefs = schemaDef.tables || [];
    
    if (tableDefs.length === 0) {
      return res.json({
        success: true,
        data: { message: 'Schema.json has no table definitions.', tablesDropped: 0 },
      });
    }
    
    // 2. Drop tables in a transaction (reverse order for FK dependencies)
    const client = await DatabaseService.getPool().connect();
    const droppedTables = [];
    const skippedTables = [];
    const errors = [];
    
    try {
      await client.query('BEGIN');
      
      for (let i = tableDefs.length - 1; i >= 0; i--) {
        const tableName = tableDefs[i].name;
        try {
          // Check if table exists first
          const existsResult = await client.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = $1 AND table_name = $2
            ) AS "exists"`,
            [dbSchema, tableName]
          );
          
          if (existsResult.rows[0]?.exists) {
            // Get row count before dropping
            const countResult = await client.query(`SELECT COUNT(*) AS count FROM ${dbSchema}.${tableName}`);
            const rowCount = parseInt(countResult.rows[0]?.count || '0', 10);
            
            await client.query(`DROP TABLE IF EXISTS ${dbSchema}.${tableName} CASCADE`);
            droppedTables.push({
              name: tableName,
              description: tableDefs[i].description || '',
              rowsDeleted: rowCount,
              status: 'dropped',
            });
            console.log('[ServiceNow API] Dropped table', { ...logContext, table: tableName, rows: rowCount });
          } else {
            skippedTables.push({ name: tableName, status: 'not_found' });
            console.log('[ServiceNow API] Table not found (skip)', { ...logContext, table: tableName });
          }
        } catch (tableErr) {
          errors.push({ name: tableName, status: 'error', error: tableErr.message });
          console.error('[ServiceNow API] Failed to drop table', { ...logContext, table: tableName, error: tableErr.message });
        }
      }
      
      // 3. Reset schema_initialized flag in system_modules
      try {
        await client.query(
          `UPDATE ${dbSchema}.system_modules SET schema_initialized = false, updated_at = NOW() WHERE module_id = $1`,
          ['servicenow']
        );
      } catch { /* DB flag reset is best-effort */ }
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    
    // 4. Caches cleared (no in-memory caching used)
    console.log('[ServiceNow API] Data reset complete', logContext);
    
    const duration = Date.now() - startTime;
    const totalRowsDeleted = droppedTables.reduce((sum, t) => sum + t.rowsDeleted, 0);
    
    console.log('[ServiceNow API] Delete module data completed', {
      ...logContext,
      tablesDropped: droppedTables.length,
      tablesSkipped: skippedTables.length,
      totalRowsDeleted,
      errors: errors.length,
      duration,
    });
    
    return res.json({
      success: true,
      data: {
        message: `Module data deleted. Dropped ${droppedTables.length} table(s) (${totalRowsDeleted} row(s)), ${skippedTables.length} not found, ${errors.length} error(s).`,
        droppedTables,
        skippedTables,
        errors,
        totalRowsDeleted,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('[ServiceNow API] Delete module data failed', {
      ...logContext,
      error: err.message,
      stack: err.stack,
      duration,
    });
    return res.status(500).json({
      success: false,
      error: { message: `Delete module data failed: ${err.message}` },
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// DETAILED REPORTS
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /reports/incidents — Incident report (live from SNOW) ─────────────
router.get('/reports/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.json({ success: true, data: { totalCount: 0, incidents: [] } });

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const { startDate, endDate } = req.query;

    const queryParts = [];
    if (agQuery) queryParts.push(agQuery);
    if (startDate) queryParts.push(`opened_at>=${startDate}`);
    if (endDate) queryParts.push(`opened_at<=${endDate}`);
    queryParts.push('ORDERBYDESCnumber');

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=200&sysparm_fields=number,short_description,priority,state,category,assignment_group,opened_at,resolved_at&sysparm_query=${queryParts.join('^')}`
    );

    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    const byPriority = {}, byState = {}, byCategory = {};
    const closed = incidents.filter(i => ['6', '7'].includes(String(snowVal(i.state))));
    for (const inc of incidents) {
      byPriority[String(snowVal(inc.priority) || '4')] = (byPriority[String(snowVal(inc.priority) || '4')] || 0) + 1;
      byState[String(snowVal(inc.state) || 'unknown')] = (byState[String(snowVal(inc.state) || 'unknown')] || 0) + 1;
      byCategory[snowVal(inc.category) || 'General'] = (byCategory[snowVal(inc.category) || 'General'] || 0) + 1;
    }
    return res.json({
      success: true,
      data: {
        totalCount: incidents.length, totalClosed: closed.length,
        reportingPeriod: { start: startDate || null, end: endDate || null },
        byPriority, byState, byCategory,
        incidents: incidents.slice(0, 100).map(i => ({
          number: snowVal(i.number), shortDescription: snowVal(i.short_description), priority: snowVal(i.priority),
          state: snowVal(i.state), category: snowVal(i.category), assignmentGroup: snowVal(i.assignment_group),
          openedAt: snowVal(i.opened_at),
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

// ── GET /reports/sla — SLA compliance report (live from SNOW + DB SLA config)
router.get('/reports/sla', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.json({ success: true, data: { incidentSla: { byPriority: {} }, ritmSla: { byPriority: {} } } });

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const queryParts = [];
    if (agQuery) queryParts.push(agQuery);
    queryParts.push('ORDERBYDESCnumber');

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=500&sysparm_fields=number,priority,state,opened_at,resolved_at,closed_at&sysparm_query=${queryParts.join('^')}`
    );
    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    // Load SLA thresholds from DB
    let slaThresholds = {};
    try {
      const slaResult = await DatabaseService.query(`SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true`);
      for (const row of slaResult.rows) {
        slaThresholds[row.priority] = { responseMinutes: Number(row.response_minutes), resolutionMinutes: Number(row.resolution_minutes) };
      }
    } catch { /* empty */ }

    const incidentSlaByPriority = {};
    for (const inc of incidents) {
      const p = String(snowVal(inc.priority) || '4');
      const pLabel = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
      if (!incidentSlaByPriority[pLabel]) {
        const threshold = slaThresholds[pLabel] || { responseMinutes: 60, resolutionMinutes: 480 };
        incidentSlaByPriority[pLabel] = {
          responseTarget: threshold.responseMinutes,
          resolutionTarget: threshold.resolutionMinutes,
          responseMet: 0, responseBreached: 0, resolutionMet: 0, resolutionBreached: 0,
        };
      }
      const openedAt = snowVal(inc.opened_at);
      const resolvedAt = snowVal(inc.resolved_at) || snowVal(inc.closed_at);
      if (openedAt) {
        const threshold = slaThresholds[pLabel] || { resolutionMinutes: 480 };
        if (resolvedAt) {
          const resolutionMinutes = (new Date(resolvedAt) - new Date(openedAt)) / 60000;
          if (resolutionMinutes <= threshold.resolutionMinutes) incidentSlaByPriority[pLabel].resolutionMet++;
          else incidentSlaByPriority[pLabel].resolutionBreached++;
        } else if (!['6', '7', '8'].includes(String(snowVal(inc.state)))) {
          const openMinutes = (Date.now() - new Date(openedAt).getTime()) / 60000;
          if (openMinutes > threshold.resolutionMinutes) incidentSlaByPriority[pLabel].resolutionBreached++;
          else incidentSlaByPriority[pLabel].resolutionMet++;
        }
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
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `SLA report failed: ${err.message}` } });
  }
});

// ── GET /reports — SLA compliance + volume analytics (live from SNOW) ────────
router.get('/reports', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.json({ success: true, data: { notConfigured: true, totalIncidents: 0, slaCompliance: 100, lastSync: defaults.sync?.lastSync || null } });
    }

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const queryParts = [];
    if (agQuery) queryParts.push(agQuery);
    queryParts.push('ORDERBYDESCnumber');

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=500&sysparm_fields=number,priority,state,opened_at,resolved_at,closed_at&sysparm_query=${queryParts.join('^')}`
    );

    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    // Load SLA thresholds from DB
    let slaThresholds = {};
    try {
      const slaResult = await DatabaseService.query(`SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true`);
      for (const row of slaResult.rows) {
        slaThresholds[row.priority] = { resolutionMinutes: Number(row.resolution_minutes) };
      }
    } catch { /* empty */ }

    const totalIncidents = incidents.length;
    let slaBreaches = 0;
    const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    const byState = {};
    let totalResolved = 0;
    const resolutionByPriority = {};

    for (const inc of incidents) {
      const p = String(snowVal(inc.priority) || '4');
      const pKey = p === '1' ? 'critical' : p === '2' ? 'high' : p === '3' ? 'medium' : 'low';
      priorityCounts[pKey] = (priorityCounts[pKey] || 0) + 1;

      const s = String(snowVal(inc.state) || 'unknown');
      byState[s] = (byState[s] || 0) + 1;

      if (['6', '7'].includes(s)) totalResolved++;

      const openedAt = snowVal(inc.opened_at);
      const resolvedAt = snowVal(inc.resolved_at) || snowVal(inc.closed_at);
      const pLabel = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
      const threshold = slaThresholds[pLabel]?.resolutionMinutes || (p === '1' ? 120 : p === '2' ? 360 : p === '3' ? 960 : 2400);

      if (openedAt && resolvedAt) {
        const resHours = Math.round((new Date(resolvedAt) - new Date(openedAt)) / 3600000 * 10) / 10;
        if (!resolutionByPriority[pKey]) resolutionByPriority[pKey] = { total: 0, count: 0 };
        resolutionByPriority[pKey].total += resHours;
        resolutionByPriority[pKey].count++;
        if ((resHours * 60) > threshold) slaBreaches++;
      } else if (openedAt && !['6', '7', '8'].includes(s)) {
        const openMinutes = (Date.now() - new Date(openedAt).getTime()) / 60000;
        if (openMinutes > threshold) slaBreaches++;
      }
    }

    const slaCompliance = totalIncidents > 0
      ? Math.round(((totalIncidents - slaBreaches) / totalIncidents) * 100)
      : 100;

    // Compute avg resolution hours per priority
    const avgResolution = {};
    for (const [k, v] of Object.entries(resolutionByPriority)) {
      avgResolution[k] = v.count > 0 ? Math.round((v.total / v.count) * 10) / 10 : null;
    }

    // SLA threshold hours for display
    const slaThresholdHours = {};
    for (const [label, cfg] of Object.entries(slaThresholds)) {
      const key = label.startsWith('1') ? 'critical' : label.startsWith('2') ? 'high' : label.startsWith('3') ? 'medium' : 'low';
      slaThresholdHours[key] = Math.round(cfg.resolutionMinutes / 60 * 10) / 10;
    }

    return res.json({
      success: true,
      data: {
        totalIncidents,
        totalResolved,
        slaCompliance,
        slaBreaches,
        priorityCounts,
        byState,
        resolutionByPriority: avgResolution,
        slaThresholds: slaThresholdHours,
        lastSync: defaults.sync?.lastSync || null,
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
  // No caching to clear — all data fetched live from SNOW API
}

export { router };
export default router;
