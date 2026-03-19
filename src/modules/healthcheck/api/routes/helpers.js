// ============================================================================
// HealthCheck Module — Shared API Helpers
//
// PURPOSE: Shared utilities used across all HealthCheck API route files.
//   - Module ID constant
//   - Config file I/O
//   - Module config loader (from DB — hc_module_config key-value store)
//   - Database path resolver for Schema.json / DefaultData.json
//   - Re-exports DatabaseService for convenience
//
// USED BY: All route files and services in the HealthCheck module.
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseService from '#core/database/databaseService.js';
import { config as appConfig } from '#config';
import { createHcLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';

const log = createHcLogger('Helpers');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Exported constants ───────────────────────────────────────────────────────
export const MODULE_ID = 'healthcheck';
export const dbSchema = appConfig.db.schema || 'pulseops';
export const CONFIG_DIR = path.resolve(__dirname, '..', 'config');
export { DatabaseService };

// ── Database-related paths ───────────────────────────────────────────────────
export function resolveModuleDbFile(filename) {
  const distPath = path.resolve(__dirname, '..', '..', 'database', filename);
  if (fs.existsSync(distPath)) return distPath;
  const srcPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', 'healthcheck', 'database', filename);
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

// ── Module config (from DB — hc_module_config key-value store) ───────────────
export async function loadModuleConfig(configKey) {
  try {
    const result = await DatabaseService.query(
      `SELECT config_value FROM ${dbSchema}.hc_module_config WHERE config_key = $1`,
      [configKey]
    );
    if (result.rows.length > 0) return result.rows[0].config_value;
  } catch { /* table may not exist yet */ }
  return null;
}

export async function saveModuleConfig(configKey, configValue, description) {
  await DatabaseService.query(
    `INSERT INTO ${dbSchema}.hc_module_config (config_key, config_value, description, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`,
    [configKey, JSON.stringify(configValue), description || null]
  );
}

// ── Poller config defaults ──────────────────────────────────────────────────
const POLLER_CONFIG_DEFAULTS = {
  enabled: false,
  intervalSeconds: 60,
  timeoutMs: 10000,
  retryOnFailure: false,
  maxRetries: 1,
};

export async function loadPollerConfig() {
  const stored = await loadModuleConfig('poller_config');
  return { ...POLLER_CONFIG_DEFAULTS, ...(stored || {}) };
}

// ── General settings defaults ───────────────────────────────────────────────
const GENERAL_SETTINGS_DEFAULTS = {
  defaultSlaTargetPercent: 99.00,
  defaultExpectedStatusCode: 200,
  defaultTimeoutMs: 10000,
};

export async function loadGeneralSettings() {
  const stored = await loadModuleConfig('general_settings');
  return { ...GENERAL_SETTINGS_DEFAULTS, ...(stored || {}) };
}

// ── Planned downtime source defaults ────────────────────────────────────────
const DOWNTIME_SOURCE_DEFAULTS = {
  enabled: false,
  sourceModule: 'servicenow',
  apiUrl: '',
  autoSync: false,
  syncIntervalMinutes: 60,
};

export async function loadDowntimeSourceConfig() {
  const stored = await loadModuleConfig('planned_downtime_source');
  return { ...DOWNTIME_SOURCE_DEFAULTS, ...(stored || {}) };
}
