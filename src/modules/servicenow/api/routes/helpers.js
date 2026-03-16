// ============================================================================
// ServiceNow Module — Shared API Helpers
//
// PURPOSE: Shared utilities used across all ServiceNow API route files.
//   - Config file I/O (connection, defaults)
//   - Incident config loader (from DB)
//   - Assignment group query builder
//   - Re-exports from SnowApiClient (snowVal, buildSnowFields)
//   - Compatibility shims for snowRequest / snowRequestWrite
//
// USED BY: All route files and services in the ServiceNow module.
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseService from '#core/database/databaseService.js';
import { config as appConfig } from '#config';
import { createSnowLogger } from '#modules/servicenow/api/lib/moduleLogger.js';
const log = createSnowLogger('Helpers');
import { snowGet, snowWrite, snowVal as _snowVal, buildSnowFields as _buildSnowFields } from '#modules/servicenow/api/lib/SnowApiClient.js';

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

// ── Module config (from DB — sn_module_config key-value store) ───────────────
export async function loadModuleConfig(configKey) {
  try {
    const result = await DatabaseService.query(
      `SELECT config_value FROM ${dbSchema}.sn_module_config WHERE config_key = $1`,
      [configKey]
    );
    if (result.rows.length > 0) return result.rows[0].config_value;
  } catch { /* table may not exist yet */ }
  return null;
}

export async function saveModuleConfig(configKey, configValue, description) {
  await DatabaseService.query(
    `INSERT INTO ${dbSchema}.sn_module_config (config_key, config_value, description, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`,
    [configKey, JSON.stringify(configValue), description || null]
  );
}

// ── Incident config (from DB — consolidated into sn_module_config) ───────────
const INCIDENT_CONFIG_DEFAULTS = {
  selectedColumns: ['number','short_description','priority','state','assigned_to','opened_at'],
  createdColumn: 'opened_at',
  closedColumn: 'closed_at',
  priorityColumn: 'priority',
  assignmentGroup: '',
};

export async function loadIncidentConfig() {
  const stored = await loadModuleConfig('incident_config');
  return { ...INCIDENT_CONFIG_DEFAULTS, ...(stored || {}) };
}

// ── Business hours (from DB — sn_business_hours table) ───────────────────────
export async function loadBusinessHours() {
  try {
    const result = await DatabaseService.query(
      `SELECT * FROM ${dbSchema}.sn_business_hours ORDER BY day_of_week`
    );
    if (result && result.rows && result.rows.length > 0) {
      log.debug(`loadBusinessHours: loaded ${result.rows.length} rows from DB`);
      return result.rows;
    }
    log.debug('loadBusinessHours: DB returned no rows, using fallback');
  } catch (err) {
    log.warn(`loadBusinessHours: DB query failed (${err.code}): ${err.message}, using fallback`);
  }
  // Fallback to default business hours (Mon-Fri, 09:00-17:00)
  // IMPORTANT: This ensures business hour calculations always work, even if DB is empty
  const fallback = [
    { day_of_week: 0, day_name: 'Sunday',    is_business_day: false, start_time: '00:00', end_time: '00:00' },
    { day_of_week: 1, day_name: 'Monday',    is_business_day: true,  start_time: '09:00', end_time: '17:00' },
    { day_of_week: 2, day_name: 'Tuesday',   is_business_day: true,  start_time: '09:00', end_time: '17:00' },
    { day_of_week: 3, day_name: 'Wednesday', is_business_day: true,  start_time: '09:00', end_time: '17:00' },
    { day_of_week: 4, day_name: 'Thursday',  is_business_day: true,  start_time: '09:00', end_time: '17:00' },
    { day_of_week: 5, day_name: 'Friday',    is_business_day: true,  start_time: '09:00', end_time: '17:00' },
    { day_of_week: 6, day_name: 'Saturday',  is_business_day: false, start_time: '00:00', end_time: '00:00' }
  ];
  log.debug('loadBusinessHours: using Mon-Fri 09:00-17:00 fallback');
  return fallback;
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

// ── Re-exports from SnowApiClient ────────────────────────────────────────────
// Provides backward-compatible named exports so existing code that imports
// snowVal / buildSnowFields from helpers.js continues to work.
export const snowVal          = _snowVal;
export const buildSnowFields  = _buildSnowFields;

// ── Backward-compatible shims ─────────────────────────────────────────────────
// Routes that haven't migrated to SnowApiClient yet can still call these.
// New code should import snowGet / snowWrite from #modules/servicenow/api/lib/SnowApiClient.js
export const snowRequest      = snowGet;
export const snowRequestWrite = snowWrite;
