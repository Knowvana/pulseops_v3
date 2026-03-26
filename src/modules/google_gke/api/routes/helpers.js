// ============================================================================
// Google GKE Module — Shared API Helpers
//
// PURPOSE: Shared utilities used across all Google GKE API route files and
// services. This is the FIRST file you should understand when learning the
// module's backend architecture.
//
// WHAT THIS FILE PROVIDES:
//   - MODULE_ID:          The unique identifier for this module ('google_gke')
//   - dbSchema:           The PostgreSQL schema name (from app config)
//   - CONFIG_DIR:         Absolute path to this module's config directory
//   - DatabaseService:    Re-exported for convenience (avoids repeated imports)
//   - resolveModuleDbFile: Resolves database files (Schema.json, DefaultData.json)
//   - readJsonFile:       Read and parse a JSON file from disk
//   - writeJsonFile:      Write a JSON object to disk (pretty-printed)
//   - loadModuleConfig:   Load a config value from the gke_module_config DB table
//   - saveModuleConfig:   Save a config value to the gke_module_config DB table
//   - loadClusterConfig:  Load cluster connection settings (with defaults)
//   - loadPollerConfig:   Load poller settings (with defaults)
//   - loadGeneralSettings: Load general settings (with defaults)
//   - loadAlertConfig:    Load alert threshold settings (with defaults)
//
// HOW MODULE CONFIG WORKS:
//   The module uses a key-value store pattern in the database:
//   Table: gke_module_config
//   ┌────────────┬─────────────────────────────────────────────────────────┐
//   │ config_key │ config_value (JSONB)                                   │
//   ├────────────┼─────────────────────────────────────────────────────────┤
//   │ cluster    │ { "authMode": "auto", "kubeconfig": "~/.kube/config" } │
//   │ poller     │ { "enabled": false, "intervalSeconds": 30 }            │
//   │ general    │ { "defaultNamespace": "default" }                      │
//   │ alerts     │ { "podRestartThreshold": 5, "cpuThreshold": 90 }      │
//   └────────────┴─────────────────────────────────────────────────────────┘
//
// PATTERN SOURCE: Identical to HealthCheck module's routes/helpers.js
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseService from '#core/database/databaseService.js';
import { config as appConfig } from '#config';
import { createGkeLogger } from '../lib/moduleLogger.js';

const log = createGkeLogger('Helpers');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTED CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MODULE_ID — The unique identifier for this module.
 * MUST match the "id" field in ui/config/constants.json.
 * Used by:
 *   - dynamicRouteLoader.js to mount routes at /api/google_gke
 *   - moduleGateway.js to identify this module
 *   - Database table prefixes (gke_*)
 */
export const MODULE_ID = 'google_gke';

/**
 * dbSchema — The PostgreSQL schema name from app configuration.
 * All SQL queries must use this: `SELECT * FROM ${dbSchema}.gke_workloads`
 * Default: 'pulseops' (from DatabaseConfig.json)
 */
export const dbSchema = appConfig.db.schema || 'pulseops';

/**
 * CONFIG_DIR — Absolute path to the api/config directory.
 * Used for reading/writing config files if needed.
 */
export const CONFIG_DIR = path.resolve(__dirname, '..', 'config');

/**
 * Re-export DatabaseService for convenience.
 * Route files can do: import { DatabaseService } from './helpers.js';
 * Instead of: import DatabaseService from '#core/database/databaseService.js';
 */
export { DatabaseService };

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE FILE RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the path to a module database file (Schema.json or DefaultData.json).
 * Checks two locations:
 *   1. Relative to this file (for compiled dist-modules builds)
 *   2. Source path (for dev mode)
 *
 * @param {string} filename - 'Schema.json' or 'DefaultData.json'
 * @returns {string|null} Absolute path to the file, or null if not found
 */
export function resolveModuleDbFile(filename) {
  const distPath = path.resolve(__dirname, '..', '..', 'database', filename);
  if (fs.existsSync(distPath)) return distPath;
  const srcPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', 'google_gke', 'database', filename);
  if (fs.existsSync(srcPath)) return srcPath;
  return null;
}

/** Schema.json filename constant */
export const SCHEMA_JSON_FILE = 'Schema.json';

/** DefaultData.json filename constant */
export const DEFAULT_DATA_FILE = 'DefaultData.json';

// ═══════════════════════════════════════════════════════════════════════════════
// JSON FILE I/O
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read and parse a JSON file from disk.
 * @param {string} filePath - Absolute path to the JSON file
 * @returns {object|null} Parsed JSON object, or null if file doesn't exist
 */
export function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Write a JSON object to disk (pretty-printed with 2-space indent).
 * Creates parent directories if they don't exist.
 * @param {string} filePath - Absolute path to the output file
 * @param {object} data - Object to serialize as JSON
 */
export function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE CONFIG (Database Key-Value Store)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The gke_module_config table stores all module settings as JSONB values.
// This is the same pattern used by the HealthCheck module (hc_module_config).
//
// Benefits:
//   - No schema changes needed when adding new settings
//   - JSONB allows complex nested config objects
//   - ON CONFLICT upsert makes saves idempotent

/**
 * Load a config value from the gke_module_config table.
 *
 * @param {string} configKey - The config key to look up (e.g., 'cluster', 'poller')
 * @returns {Promise<object|null>} The config_value JSONB object, or null if not found
 *
 * @example
 *   const pollerConfig = await loadModuleConfig('poller');
 *   // Returns: { enabled: false, intervalSeconds: 30 }
 */
export async function loadModuleConfig(configKey) {
  try {
    const result = await DatabaseService.query(
      `SELECT config_value FROM ${dbSchema}.gke_module_config WHERE config_key = $1`,
      [configKey]
    );
    if (result.rows.length > 0) return result.rows[0].config_value;
  } catch { /* table may not exist yet — first run before schema provisioning */ }
  return null;
}

/**
 * Save a config value to the gke_module_config table.
 * Uses UPSERT (INSERT ... ON CONFLICT DO UPDATE) so it works for both
 * new and existing keys.
 *
 * @param {string} configKey - The config key (e.g., 'cluster', 'poller')
 * @param {object} configValue - The config object to store as JSONB
 * @param {string} [description] - Optional human-readable description
 *
 * @example
 *   await saveModuleConfig('poller', { enabled: true, intervalSeconds: 30 }, 'Poller config');
 */
export async function saveModuleConfig(configKey, configValue, description) {
  await DatabaseService.query(
    `INSERT INTO ${dbSchema}.gke_module_config (config_key, config_value, description, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`,
    [configKey, JSON.stringify(configValue), description || null]
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPED CONFIG LOADERS (with defaults)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Each loader provides sensible defaults so the module works even before
// the admin has configured anything. Stored DB values override defaults.

/**
 * Default cluster configuration.
 * Unified approach: same parameters for local and production.
 * - apiServerUrl: Kubernetes API server URL (e.g., https://10.0.0.1:443)
 * - serviceAccountToken: Service account token for authentication
 * - projectId: GCP project ID (optional, for reference)
 * - region: Cluster region (optional, for reference)
 * - clusterName: Cluster name (optional, for reference)
 */
const CLUSTER_CONFIG_DEFAULTS = {
  connection: {
    apiServerUrl: '',
    serviceAccountToken: '',
    projectId: '',
    region: '',
    clusterName: '',
  },
  connectionStatus: {
    isConfigured: false,
    lastTested: null,
    testStatus: null,
    clusterInfo: {
      name: null,
      version: null,
      nodeCount: 0,
    },
  },
};

/**
 * Load cluster connection configuration with defaults.
 * @returns {Promise<object>} Cluster config merged with defaults
 */
export async function loadClusterConfig() {
  const stored = await loadModuleConfig('cluster');
  return { ...CLUSTER_CONFIG_DEFAULTS, ...(stored || {}) };
}

/**
 * Default poller configuration.
 * The poller periodically checks cluster health (workloads, pods, jobs).
 */
const POLLER_CONFIG_DEFAULTS = {
  enabled: false,
  intervalSeconds: 30,
  timeoutMs: 15000,
  monitorWorkloads: true,
  monitorCronjobs: true,
  monitorPubsub: true,
  monitorDataflow: true,
  monitorEmail: false,
};

/**
 * Load poller configuration with defaults.
 * @returns {Promise<object>} Poller config merged with defaults
 */
export async function loadPollerConfig() {
  const stored = await loadModuleConfig('poller');
  return { ...POLLER_CONFIG_DEFAULTS, ...(stored || {}) };
}

/**
 * Default general settings.
 */
const GENERAL_SETTINGS_DEFAULTS = {
  defaultNamespace: 'default',
  monitoredNamespaces: ['default'],
  refreshIntervalSeconds: 30,
  retentionDays: 90,
};

/**
 * Load general settings with defaults.
 * @returns {Promise<object>} General settings merged with defaults
 */
export async function loadGeneralSettings() {
  const stored = await loadModuleConfig('general');
  return { ...GENERAL_SETTINGS_DEFAULTS, ...(stored || {}) };
}

/**
 * Default alert configuration.
 * Thresholds that trigger alerts in the dashboard and notifications.
 */
const ALERT_CONFIG_DEFAULTS = {
  podRestartThreshold: 5,
  podCrashLoopEnabled: true,
  cpuThresholdPercent: 90,
  memoryThresholdPercent: 90,
  cronjobFailureEnabled: true,
  dataflowFailureEnabled: true,
  pubsubBacklogThreshold: 1000,
  emailDeliveryFailureEnabled: true,
};

/**
 * Load alert configuration with defaults.
 * @returns {Promise<object>} Alert config merged with defaults
 */
export async function loadAlertConfig() {
  const stored = await loadModuleConfig('alerts');
  return { ...ALERT_CONFIG_DEFAULTS, ...(stored || {}) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER CONFIG FILE I/O (ClusterConfig.json)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Unified cluster configuration that works identically for both production GKE
// and local development (Kind/Podman). Stores only standard Kubernetes connection
// parameters. Auto-detection handles environment-specific authentication:
//   - Production GKE: Uses in-cluster service account token (auto-injected by K8s)
//   - Local Dev: Uses kubeconfig file (auto-created by Kind)
//
// SAME UI, SAME CONFIG, ZERO CODE CHANGES between environments.

// Hot-plug-and-play: Read from source in dev mode, dist-modules in prod
// This ensures config changes are picked up immediately without rebuild
const CLUSTER_CONFIG_FILE = (() => {
  // Try source first (dev mode with hot-reload)
  // Find project root by looking for package.json
  let currentDir = __dirname;
  let projectRoot = null;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      projectRoot = currentDir;
      break;
    }
    currentDir = path.dirname(currentDir);
  }
  
  if (projectRoot) {
    const srcPath = path.join(projectRoot, 'src', 'modules', 'google_gke', 'api', 'config', 'ClusterConfig.json');
    if (fs.existsSync(srcPath)) {
      log.debug(`Loading ClusterConfig from source: ${srcPath}`);
      return srcPath;
    }
  }
  
  // Fall back to dist-modules (production)
  const distPath = path.join(CONFIG_DIR, 'ClusterConfig.json');
  log.debug(`Loading ClusterConfig from dist-modules: ${distPath}`);
  return distPath;
})();

/**
 * Default unified cluster configuration.
 * Works for both production GKE and local development.
 * - apiServerUrl: Kubernetes API server URL (e.g., https://127.0.0.1:6443)
 * - serviceAccountToken: Service account token for authentication
 * - projectId: GCP project ID (optional, for reference)
 * - region: Cluster region (optional, for reference)
 * - clusterName: Cluster name (optional, for reference)
 */
const CLUSTER_CONFIG_FILE_DEFAULTS = {
  connection: {
    apiServerUrl: '',
    serviceAccountToken: '',
    projectId: '',
    region: '',
    clusterName: '',
  },
  connectionStatus: {
    isConfigured: false,
    testStatus: null,
    lastTested: null,
    clusterInfo: {
      name: null,
      version: null,
      nodeCount: 0,
    },
  },
};

/**
 * Load cluster configuration from ClusterConfig.json.
 * Returns defaults if file doesn't exist yet.
 *
 * @returns {object} Cluster config with defaults
 */
export function loadClusterConfigFile() {
  if (!fs.existsSync(CLUSTER_CONFIG_FILE)) {
    return { ...CLUSTER_CONFIG_FILE_DEFAULTS };
  }

  try {
    const stored = JSON.parse(fs.readFileSync(CLUSTER_CONFIG_FILE, 'utf8'));
    return { ...CLUSTER_CONFIG_FILE_DEFAULTS, ...stored };
  } catch (err) {
    log.warn('Failed to parse ClusterConfig.json, using defaults', { error: err.message });
    return { ...CLUSTER_CONFIG_FILE_DEFAULTS };
  }
}

/**
 * Save cluster configuration to ClusterConfig.json.
 *
 * @param {object} config - The cluster config object to save
 */
export function saveClusterConfigFile(config) {
  writeJsonFile(CLUSTER_CONFIG_FILE, config);
  log.info('Cluster config saved to file');
}
