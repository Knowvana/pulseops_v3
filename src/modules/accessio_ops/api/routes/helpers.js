// ============================================================================
// Accessio Operations Module — Shared API Helpers
//
// PURPOSE: Shared utilities used across all Accessio Operations API route files.
//   - Module ID constant
//   - Config file I/O
//   - Module config loader (from DB — ao_module_config key-value store)
//   - Database path resolver for Schema.json / DefaultData.json
//   - Re-exports DatabaseService for convenience
//
// USED BY: All route files and services in the Accessio Operations module.
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseService from '#core/database/databaseService.js';
import { config as appConfig } from '#config';
import { createAoLogger } from '../lib/moduleLogger.js';

const log = createAoLogger('Helpers');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Exported constants ───────────────────────────────────────────────────────
export const dbSchema = appConfig.db.schema || 'pulseops';
export const CONFIG_DIR = path.resolve(__dirname, '..', 'config');
export const CLUSTER_CONFIG_FILE = path.join(CONFIG_DIR, 'ClusterConfig.json');
export { DatabaseService };

// ── Database-related paths ───────────────────────────────────────────────────
export function resolveModuleDbFile(filename) {
  const distPath = path.resolve(__dirname, '..', '..', 'database', filename);
  if (fs.existsSync(distPath)) return distPath;
  const srcPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', 'accessio_ops', 'database', filename);
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

// ── Module config (from DB — ao_module_config key-value store) ───────────────
export async function loadModuleConfig(configKey) {
  try {
    const result = await DatabaseService.query(
      `SELECT config_value FROM ${dbSchema}.ao_module_config WHERE config_key = $1`,
      [configKey]
    );
    if (result.rows.length > 0) return result.rows[0].config_value;
  } catch { /* table may not exist yet */ }
  return null;
}

export async function saveModuleConfig(configKey, configValue, description) {
  await DatabaseService.query(
    `INSERT INTO ${dbSchema}.ao_module_config (config_key, config_value, description, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`,
    [configKey, JSON.stringify(configValue), description || null]
  );
}

// ── General settings defaults ───────────────────────────────────────────────
const GENERAL_SETTINGS_DEFAULTS = {
  placeholder: true,
};

export async function loadGeneralSettings() {
  const stored = await loadModuleConfig('general_settings');
  return { ...GENERAL_SETTINGS_DEFAULTS, ...(stored || {}) };
}

// ── Cluster configuration ─────────────────────────────────────────────────────
export function loadClusterConfigFile() {
  const defaults = {
    connection: {
      apiServerUrl: '',
      serviceAccountToken: '',
      projectId: '',
      region: '',
      clusterName: '',
    },
    connectionStatus: {
      isConfigured: false,
      testStatus: '',
      lastTested: '',
    },
  };
  
  // Read config directly without using readJsonFile to avoid conflicts
  try {
    if (!fs.existsSync(CLUSTER_CONFIG_FILE)) {
      return { ...defaults };
    }
    const stored = JSON.parse(fs.readFileSync(CLUSTER_CONFIG_FILE, 'utf8'));
    return { ...defaults, ...(stored || {}) };
  } catch (err) {
    log.warn('Failed to parse ClusterConfig.json, using defaults', { error: err.message });
    return { ...defaults };
  }
}

export function saveClusterConfigFile(config) {
  // Write config directly without using writeJsonFile to avoid conflicts
  try {
    fs.mkdirSync(path.dirname(CLUSTER_CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CLUSTER_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    log.info('Cluster config saved to file');
  } catch (err) {
    log.error('Failed to save cluster config', { error: err.message });
    throw err;
  }
}
