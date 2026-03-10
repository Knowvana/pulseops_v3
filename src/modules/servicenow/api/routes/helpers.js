// ============================================================================
// ServiceNow Module — Shared API Helpers
//
// PURPOSE: Shared utilities used across all ServiceNow API route files.
//   - Config file I/O (connection, defaults)
//   - Incident config loader (from DB)
//   - SNOW API request helpers (GET + write)
//   - snowVal() for extracting values from {link, value} objects
//   - Assignment group query builder
//
// USED BY: All route files in src/modules/servicenow/api/routes/
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import DatabaseService from '#core/database/databaseService.js';
import { config as appConfig } from '#config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Exported constants ───────────────────────────────────────────────────────
export const dbSchema = appConfig.db.schema || 'pulseops';
export const CONFIG_DIR = path.resolve(__dirname, '..', 'config');
export const CONNECTION_CONFIG = path.join(CONFIG_DIR, 'servicenow_connection.json');
export const DEFAULTS_CONFIG = path.join(CONFIG_DIR, 'servicenow_defaults.json');
export { DatabaseService };

// ── Database-related paths ───────────────────────────────────────────────────
export function resolveModuleDbFile(filename) {
  const distPath = path.resolve(__dirname, '..', '..', 'database', filename);
  if (fs.existsSync(distPath)) return distPath;
  const srcPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', 'servicenow', 'database', filename);
  if (fs.existsSync(srcPath)) return srcPath;
  return null;
}
export const SCHEMA_JSON_FILE = 'Schema.json';
export const DEFAULT_DATA_FILE = 'DefaultData.json';

// ── JSON file I/O ────────────────────────────────────────────────────────────
export function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ── Connection config ────────────────────────────────────────────────────────
export function loadConnectionConfig() {
  const defaults = {
    instanceUrl: '', username: '', password: '',
    authMethod: 'basic', apiVersion: 'v2',
    isConfigured: false, lastTested: null, testStatus: null,
  };
  const stored = readJsonFile(CONNECTION_CONFIG);
  return { ...defaults, ...(stored || {}) };
}

export function saveConnectionConfig(config) {
  writeJsonFile(CONNECTION_CONFIG, config);
}

// ── Defaults config ──────────────────────────────────────────────────────────
export function loadDefaultsConfig() {
  return readJsonFile(DEFAULTS_CONFIG) || {
    sla: { critical: 4, high: 8, medium: 24, low: 72 },
    sync: { enabled: false, intervalMinutes: 30, maxIncidents: 500, lastSync: null },
  };
}

// ── Incident config (from DB) ────────────────────────────────────────────────
export async function loadIncidentConfig() {
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

// ── Assignment group query builder ───────────────────────────────────────────
export function buildAssignmentGroupQuery(assignmentGroup) {
  if (!assignmentGroup) return '';
  const trimmed = String(assignmentGroup).trim();
  if (!trimmed) return '';
  const isSysId = /^[0-9a-f]{32}$/i.test(trimmed);
  if (isSysId) {
    return `assignment_group=${trimmed}`;
  }
  return `assignment_group.nameLIKE${encodeURIComponent(trimmed)}`;
}

// ── Extract primitive value from SNOW {link, value} objects ──────────────────
export function snowVal(field) {
  if (!field) return field;
  return typeof field === 'object' && field?.value !== undefined ? field.value : field;
}

// ── HTTPS GET request to ServiceNow Table API ────────────────────────────────
export function snowRequest(config, tablePath, query = '') {
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

// ── Write request (POST/PATCH/PUT) to ServiceNow Table API ──────────────────
export function snowRequestWrite(config, tablePath, method = 'POST', bodyStr = '') {
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
