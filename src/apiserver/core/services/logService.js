// ============================================================================
// LogService — PulseOps V3 API
//
// PURPOSE: Enterprise log management service that handles reading, writing,
// and deleting logs from PostgreSQL database.
// Supports two log types: UI Logs and API Logs via a unified
// `system_logs` table with a `log_type` column.
//
// STORAGE: Database-only (PostgreSQL). Storage mode is always "database".
//
// HOT-RELOAD: Configuration is read from DB (system_config key='logs_config')
// on every operation via getLogsConfig(). Falls back to seed file if DB unavailable.
//
// TABLE: pulseops.system_logs (from DefaultDatabaseSchema.json)
//   Common:   id, transaction_id, correlation_id, session_id,
//             log_type, level, source, event, message, module, file_name,
//             data (JSONB), user_id, user_email, ip_address, user_agent, created_at
//   UI-only:  page_url
//   API-only: http_method, api_url, status_code, duration_ms,
//             request_body (JSONB), response_body (JSONB)
//
// ARCHITECTURE:
//   - Reads config from DB on every operation (honors changes without restart)
//   - Falls back to core/database/seedData/LogsConfig.json if DB unavailable
//   - All modules write logs with a `module` column for filtering
//   - Core platform logs use "Core" as the module identifier
//   - Supports batch inserts for performance
//
// DEPENDENCIES:
//   - fs/path               → File-based log I/O (fallback)
//   - DatabaseService        → Database-based log I/O
//   - SettingsService        → DB-backed config read/write
//   - APIMessages.json       → Response messages
//   - APIErrors.json         → Error messages
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '#config';
import { logger, updateLoggerLevel } from '#shared/logger.js';
import { loadJson, loadSeedJson, messages, errors } from '#shared/loadJson.js';
import SettingsService from '#core/services/settingsService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '../../..');

// In-memory cache for logs config (refreshed from DB on each call via async path)
let _cachedLogsConfig = null;

const DEFAULT_LOGS_CONFIG = {
  enabled: true,
  storage: 'database',
  defaultLevel: 'info',
  captureOptions: { uiLogs: true, apiLogs: true, consoleLogs: false, moduleLogs: true },
  management: { maxUiEntries: 1000, maxApiEntries: 500, pushIntervalMs: 30000, notifyDebounceMs: 250, maxBodyBytes: 10000 },
};

/**
 * Get the current logs configuration (synchronous — uses cached value).
 * The cache is refreshed from DB by refreshLogsConfig().
 * @returns {Object} Current LogsConfig
 */
function getLogsConfig() {
  return _cachedLogsConfig || DEFAULT_LOGS_CONFIG;
}

/**
 * Refresh logs config from DB asynchronously. Falls back to seed file.
 * Called at service startup and before operations that need fresh config.
 */
async function refreshLogsConfig() {
  try {
    const cfg = await SettingsService.get('logs_config');
    if (cfg) {
      _cachedLogsConfig = cfg;
      return cfg;
    }
  } catch (err) {
    logger.warn('Failed to load logs config from DB, using fallback', { error: err.message });
  }
  // Fallback to seed file (core/database/seedData/)
  try {
    _cachedLogsConfig = loadSeedJson('LogsConfig.json');
  } catch {
    _cachedLogsConfig = DEFAULT_LOGS_CONFIG;
  }
  return _cachedLogsConfig;
}

// Initialize cache on module load
refreshLogsConfig().catch(() => {});

/**
 * Get the current storage mode.
 * @returns {string} "file" or "database"
 */
function getStorageMode() {
  const config = getLogsConfig();
  return config.storage || 'database';
}

/**
 * Resolve the absolute path for a log file.
 * @param {string} logType - "ui" or "api"
 * @returns {string} Absolute path to the log file
 */
function getLogFilePath(logType) {
  const cfg = getLogsConfig();
  const relativePath = logType === 'ui'
    ? cfg.file?.uiLogsPath
    : cfg.file?.apiLogsPath;
  return path.resolve(apiRoot, relativePath || 'api/logs');
}

/**
 * Ensure the log file exists with a valid JSON array.
 * @param {string} filePath
 */
function ensureLogFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf8');
  }
}

// ── File-Based Operations ────────────────────────────────────────────────────

/**
 * Read all logs from a JSON file.
 * @param {string} logType - "ui" or "api"
 * @returns {Array} Array of log entries
 */
function readLogsFromFile(logType) {
  const filePath = getLogFilePath(logType);
  ensureLogFile(filePath);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Write logs array to a JSON file.
 * @param {string} logType - "ui" or "api"
 * @param {Array} logs - Array of log entries
 */
function writeLogsToFile(logType, logs) {
  const filePath = getLogFilePath(logType);
  ensureLogFile(filePath);
  const cfg = getLogsConfig();
  const maxEntries = cfg.file?.maxEntries || 5000;
  const trimmed = logs.length > maxEntries ? logs.slice(-maxEntries) : logs;
  fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2), 'utf8');
}

/**
 * Append log entries to a JSON file.
 * @param {string} logType - "ui" or "api"
 * @param {Array} entries - New log entries to append
 * @returns {number} Total count after append
 */
function appendLogsToFile(logType, entries) {
  const existing = readLogsFromFile(logType);
  const updated = [...existing, ...entries];
  writeLogsToFile(logType, updated);
  return updated.length;
}

/**
 * Delete all logs from a JSON file.
 * @param {string} logType - "ui" or "api"
 */
function deleteLogsFromFile(logType) {
  const filePath = getLogFilePath(logType);
  ensureLogFile(filePath);
  fs.writeFileSync(filePath, '[]', 'utf8');
}

/**
 * Get file log stats (count, file size, last modified).
 * @param {string} logType - "ui" or "api"
 * @returns {Object} { count, fileSize, lastModified }
 */
function getFileLogStats(logType) {
  const filePath = getLogFilePath(logType);
  ensureLogFile(filePath);
  try {
    const stat = fs.statSync(filePath);
    const logs = readLogsFromFile(logType);
    return {
      count: logs.length,
      fileSize: stat.size,
      lastModified: stat.mtime.toISOString(),
    };
  } catch {
    return { count: 0, fileSize: 0, lastModified: null };
  }
}

// ── Database-Based Operations ────────────────────────────────────────────────

/**
 * Get the database table name for a log type.
 * @param {string} logType - "ui" or "api"
 * @returns {string} Fully qualified table name (schema.table)
 */
function getLogTable(logType) {
  const schema = config.db.schema || 'pulseops';
  const cfg = getLogsConfig();
  const table = cfg.database?.logsTable || 'system_logs';
  return `${schema}.${table}`;
}

/**
 * Lazily import DatabaseService to avoid circular deps.
 * @returns {Promise<Object>} DatabaseService
 */
async function getDbService() {
  const mod = await import('#core/database/databaseService.js');
  return mod.default;
}

/**
 * Read logs from database with optional filters.
 * Queries the unified system_logs table, filtered by log_type.
 * Column names match DefaultDatabaseSchema.json.
 * @param {string} logType - "ui" or "api"
 * @param {Object} filters - { level, search, module, limit, offset }
 * @returns {Promise<Array>}
 */
async function readLogsFromDb(logType, filters = {}) {
  const db = await getDbService();
  const table = getLogTable(logType);
  const conditions = [`log_type = $1`];
  const params = [logType];
  let paramIndex = 2;

  // Filter by log level (column: level)
  if (filters.level && filters.level !== 'all') {
    conditions.push(`level = $${paramIndex++}`);
    params.push(filters.level);
  }
  // Full-text search across message, file_name, event, api_url, user_email columns
  if (filters.search) {
    conditions.push(`(message ILIKE $${paramIndex} OR file_name ILIKE $${paramIndex} OR event ILIKE $${paramIndex} OR api_url ILIKE $${paramIndex} OR user_email ILIKE $${paramIndex})`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }
  // Filter by module (column: module)
  if (filters.module) {
    conditions.push(`module = $${paramIndex++}`);
    params.push(filters.module);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const limit = filters.limit || 500;
  const offset = filters.offset || 0;

  const result = await db.query(
    `SELECT * FROM ${table} ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );
  logger.debug(`readLogsFromDb: Read ${result.rows.length} ${logType} logs from database`);
  return result.rows;
}

/**
 * Insert log entries into the unified system_logs database table.
 * Column names match DefaultDatabaseSchema.json exactly.
 * Both UI and API logs go into the same table, differentiated by log_type.
 *
 * Columns used:
 *   Common:  log_type, transaction_id, correlation_id, session_id, level,
 *            source, event, message, module, file_name, data, user_email, created_at
 *   UI-only: page_url
 *   API-only: http_method, api_url, status_code, duration_ms, request_body, response_body
 *
 * @param {string} logType - "ui" or "api"
 * @param {Array} entries - Log entries to insert
 * @returns {Promise<number>} Number of rows inserted
 */
async function writeLogsToDb(logType, entries) {
  if (!entries || entries.length === 0) return 0;
  const db = await getDbService();
  const table = getLogTable(logType);

  // Unified INSERT — all columns from DefaultDatabaseSchema.json system_logs table
  const sql = `INSERT INTO ${table}
    (log_type, transaction_id, correlation_id, session_id,
     level, source, event, message, module, file_name, page_url,
     http_method, api_url, status_code, duration_ms,
     request_body, response_body, data, user_email, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`;

  for (const entry of entries) {
    await db.query(sql, [
      logType,                                                          // $1  log_type
      entry.transactionId || null,                                      // $2  transaction_id
      entry.correlationId || null,                                      // $3  correlation_id
      entry.sessionId || null,                                          // $4  session_id
      entry.level || 'info',                                            // $5  level
      entry.source || (logType === 'ui' ? 'UI' : 'API'),               // $6  source
      entry.event || null,                                              // $7  event
      entry.message || '',                                              // $8  message
      entry.module || 'Core',                                           // $9  module
      entry.fileName || null,                                           // $10 file_name
      entry.pageUrl || null,                                            // $11 page_url (UI logs)
      entry.method || null,                                             // $12 http_method (API logs)
      entry.url || null,                                                // $13 api_url (API logs)
      entry.statusCode != null ? entry.statusCode : null,                 // $14 status_code (API logs)
      entry.responseTime != null ? entry.responseTime : (entry.durationMs != null ? entry.durationMs : null), // $15 duration_ms
      entry.requestBody ? JSON.stringify(entry.requestBody) : null,     // $16 request_body (API logs, JSONB)
      entry.responseBody ? JSON.stringify(entry.responseBody) : null,   // $17 response_body (API logs, JSONB)
      entry.data ? JSON.stringify(entry.data) : null,                   // $18 data (JSONB — context/metadata)
      entry.user || entry.userEmail || null,                            // $19 user_email
      entry.timestamp || new Date().toISOString(),                      // $20 created_at
    ]);
  }
  logger.debug(`writeLogsToDb: Inserted ${entries.length} ${logType} log entries into database`);
  return entries.length;
}

/**
 * Delete all logs for a specific log type from the unified system_logs table.
 * Uses log_type column to filter — only deletes the requested type.
 * @param {string} logType - "ui" or "api"
 * @returns {Promise<number>} Number of rows deleted
 */
async function deleteLogsFromDb(logType) {
  const db = await getDbService();
  const table = getLogTable(logType);
  const result = await db.query(`DELETE FROM ${table} WHERE log_type = $1`, [logType]);
  logger.info(`deleteLogsFromDb: Deleted ${result.rowCount} ${logType} log entries`);
  return result.rowCount;
}

/**
 * Get database log stats (count, last entry) for a specific log type.
 * Filters by log_type column in the unified system_logs table.
 * @param {string} logType - "ui" or "api"
 * @returns {Promise<Object>} { count, lastEntry }
 */
async function getDbLogStats(logType) {
  const db = await getDbService();
  const table = getLogTable(logType);
  try {
    const countResult = await db.query(`SELECT COUNT(*) FROM ${table} WHERE log_type = $1`, [logType]);
    const lastResult = await db.query(`SELECT created_at FROM ${table} WHERE log_type = $1 ORDER BY created_at DESC LIMIT 1`, [logType]);
    return {
      count: parseInt(countResult.rows[0].count, 10),
      lastEntry: lastResult.rows[0]?.created_at || null,
    };
  } catch {
    return { count: 0, lastEntry: null };
  }
}

/**
 * Check if log tables exist in the database.
 * @returns {Promise<boolean>}
 */
async function checkLogTablesExist() {
  try {
    const db = await getDbService();
    const schema = config.db.schema || 'pulseops';
    const cfg = getLogsConfig();
    const table = cfg.database?.logsTable || 'system_logs';
    const result = await db.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [schema, table]
    );
    return result.rows.length === 1;
  } catch {
    return false;
  }
}

/**
 * Create log tables in the database if they don't exist.
 * Uses the system_logs table from DefaultDatabaseSchema.json
 * @returns {Promise<Object>} { created, tables }
 */
async function createLogTables() {
  const db = await getDbService();
  const schema = config.db.schema || 'pulseops';
  const cfg = getLogsConfig();
  const table = cfg.database?.logsTable || 'system_logs';

  await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

  // Create unified system_logs table (matches DefaultDatabaseSchema.json exactly)
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.${table} (
      id BIGSERIAL PRIMARY KEY,
      transaction_id VARCHAR(100),
      correlation_id VARCHAR(100),
      session_id VARCHAR(100),
      log_type VARCHAR(10) NOT NULL DEFAULT 'ui',
      level VARCHAR(10) NOT NULL,
      source VARCHAR(255),
      event VARCHAR(255),
      message TEXT NOT NULL,
      module VARCHAR(100),
      file_name VARCHAR(255),
      page_url VARCHAR(500),
      http_method VARCHAR(10),
      api_url TEXT,
      status_code INTEGER,
      duration_ms INTEGER,
      request_body JSONB,
      response_body JSONB,
      data JSONB,
      user_id INTEGER,
      user_email VARCHAR(255),
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Create indexes for query performance
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_level ON ${schema}.${table}(level)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_log_type ON ${schema}.${table}(log_type)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_module ON ${schema}.${table}(module)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_created_at ON ${schema}.${table}(created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_transaction_id ON ${schema}.${table}(transaction_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_correlation_id ON ${schema}.${table}(correlation_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_session_id ON ${schema}.${table}(session_id)`);

  logger.info('Log tables created successfully');
  return { created: true, tables: [`${schema}.${table}`] };
}

// ── Public API ───────────────────────────────────────────────────────────────

const LogService = {
  /**
   * Get the current logging configuration.
   * @returns {Promise<Object>} Current LogsConfig
   */
  async getConfig() {
    await refreshLogsConfig();
    return getLogsConfig();
  },

  /**
   * Get the current storage mode.
   * @returns {string} "file" or "database"
   */
  getStorageMode() {
    return getStorageMode();
  },

  /**
   * Update logging configuration fields (enabled, level, captureOptions, management).
   * Merges provided fields into existing config and persists to DB.
   * Configuration changes are immediately honored without restart.
   * @param {Object} updates - Partial config to merge { enabled?, defaultLevel?, captureOptions?, management? }
   * @returns {Object} Updated config
   */
  async updateConfig(updates) {
    const logsConfig = { ...getLogsConfig() };

    // Allowed top-level fields that callers may update
    const allowed = ['enabled', 'defaultLevel', 'captureOptions', 'management'];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
          logsConfig[key] = { ...logsConfig[key], ...updates[key] };
        } else {
          logsConfig[key] = updates[key];
        }
      }
    }
    // Storage is always 'database' — never override
    logsConfig.storage = 'database';
    await SettingsService.set('logs_config', logsConfig, 'Logging configuration (storage, levels, capture options, management)');
    _cachedLogsConfig = logsConfig;
    
    // Also update Winston logger level if defaultLevel changed
    if (updates.defaultLevel) {
      updateLoggerLevel(updates.defaultLevel);
    }
    
    logger.info('Log configuration updated and persisted to DB', { enabled: logsConfig.enabled, level: logsConfig.defaultLevel });
    return logsConfig;
  },

  /**
   * Update the storage mode (kept for backward compat — storage is now always 'database').
   * @param {string} mode - only "database" is accepted
   */
  async setStorageMode(mode) {
    if (mode !== 'database') {
      throw new Error('Only database storage is supported. File-based logging has been removed.');
    }
    const cfg = { ...getLogsConfig(), storage: 'database' };
    await SettingsService.set('logs_config', cfg);
    _cachedLogsConfig = cfg;
    logger.info('Storage mode set to database');
  },

  /**
   * Read logs with optional filters.
   * @param {string} logType - "ui" or "api"
   * @param {Object} filters - { level, search, module, limit, offset }
   * @returns {Promise<Array>}
   */
  async getLogs(logType, filters = {}) {
    const mode = getStorageMode();
    if (mode === 'database') {
      try {
        return await readLogsFromDb(logType, filters);
      } catch (err) {
        logger.warn(`getLogs: DB read failed, returning empty — ${err.message}`);
        return [];
      }
    }
    // File mode — apply filters in memory
    let logs = readLogsFromFile(logType);

    if (filters.level && filters.level !== 'all') {
      logs = logs.filter(l => l.level === filters.level);
    }
    if (filters.search) {
      const term = filters.search.toLowerCase();
      logs = logs.filter(l =>
        (l.message && l.message.toLowerCase().includes(term)) ||
        (l.fileName && l.fileName.toLowerCase().includes(term)) ||
        (l.event && l.event.toLowerCase().includes(term)) ||
        (l.url && l.url.toLowerCase().includes(term))
      );
    }
    if (filters.module) {
      logs = logs.filter(l => l.module === filters.module);
    }

    // Sort by timestamp descending
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const offset = filters.offset || 0;
    const limit = filters.limit || 500;
    return logs.slice(offset, offset + limit);
  },

  /**
   * Write log entries. Respects ALL LogsConfig.json settings:
   *   - enabled (global on/off)
   *   - captureOptions.uiLogs / captureOptions.apiLogs (per-type on/off)
   *   - defaultLevel (minimum log level threshold)
   * @param {string} logType - "ui" or "api"
   * @param {Array} entries - Log entries to write
   * @returns {Promise<Object>} { written, total }
   */
  async writeLogs(logType, entries) {
    if (!entries || entries.length === 0) return { written: 0, total: 0 };

    // ── Hot-load config from disk (honors changes without restart) ──
    const cfg = getLogsConfig();

    // Global on/off switch
    if (!cfg.enabled) {
      logger.debug(`writeLogs: Logging globally disabled — discarding ${entries.length} ${logType} entries`);
      return { written: 0, total: 0 };
    }

    // Per-type capture option check (uiLogs / apiLogs)
    const captureKey = logType === 'ui' ? 'uiLogs' : 'apiLogs';
    if (cfg.captureOptions && cfg.captureOptions[captureKey] === false) {
      logger.debug(`writeLogs: captureOptions.${captureKey} is disabled — discarding ${entries.length} entries`);
      return { written: 0, total: 0 };
    }

    // Log level threshold — discard entries below the configured minimum level
    const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
    const minLevel = LEVEL_ORDER[cfg.defaultLevel] ?? LEVEL_ORDER.info;
    const filtered = entries.filter(e => {
      const entryLevel = LEVEL_ORDER[(e.level || 'info').toLowerCase()] ?? 0;
      return entryLevel >= minLevel;
    });

    if (filtered.length === 0) {
      return { written: 0, total: 0 };
    }

    // Add timestamp if missing
    const timestamped = filtered.map(e => ({
      ...e,
      timestamp: e.timestamp || new Date().toISOString(),
    }));

    const mode = getStorageMode();
    if (mode === 'database') {
      try {
        const written = await writeLogsToDb(logType, timestamped);
        const stats = await getDbLogStats(logType);
        logger.debug(`writeLogs: Wrote ${written} ${logType} entries to database`);
        return { written, total: stats.count };
      } catch (err) {
        // DB unavailable or schema mismatch — log full error for diagnosis
        logger.error(`writeLogs: DB write FAILED for ${logType} (${timestamped.length} entries) — ${err.message}`, {
          logType, entryCount: timestamped.length, error: err.message, detail: err.detail || null
        });
        return { written: 0, total: 0 };
      }
    }
    const total = appendLogsToFile(logType, timestamped);
    return { written: timestamped.length, total };
  },

  /**
   * Delete all logs for a log type.
   * @param {string} logType - "ui" or "api"
   * @returns {Promise<Object>} { deleted }
   */
  async deleteLogs(logType) {
    const mode = getStorageMode();
    if (mode === 'database') {
      const deleted = await deleteLogsFromDb(logType);
      return { deleted };
    }
    const stats = getFileLogStats(logType);
    deleteLogsFromFile(logType);
    return { deleted: stats.count };
  },

  /**
   * Get log statistics (count, last entry, storage info).
   * @param {string} logType - "ui" or "api"
   * @returns {Promise<Object>} Stats object
   */
  async getStats(logType) {
    const mode = getStorageMode();
    if (mode === 'database') {
      let dbStats;
      try {
        dbStats = await getDbLogStats(logType);
      } catch (err) {
        logger.warn(`getStats: DB stats failed, returning empty — ${err.message}`);
        return { count: 0, lastEntry: null, storage: 'database' };
      }
      return {
        storage: 'database',
        count: dbStats.count,
        lastEntry: dbStats.lastEntry,
        lastSync: new Date().toISOString(),
      };
    }
    const fileStats = getFileLogStats(logType);
    return {
      storage: 'file',
      count: fileStats.count,
      fileSize: fileStats.fileSize,
      lastModified: fileStats.lastModified,
      lastSync: new Date().toISOString(),
    };
  },

  /**
   * Check if database logging is available (tables exist).
   * @returns {Promise<boolean>}
   */
  async isDatabaseLoggingAvailable() {
    return checkLogTablesExist();
  },

  /**
   * Create log tables in the database.
   * @returns {Promise<Object>}
   */
  async createLogTables() {
    return createLogTables();
  },

  /**
   * Write a single API log entry (called by middleware).
   * @param {Object} entry - API log entry
   */
  async writeApiLog(entry) {
    try {
      await this.writeLogs('api', [entry]);
    } catch (err) {
      logger.error('Failed to write API log', { error: err.message });
    }
  },

  /**
   * Get total stats for both log types.
   * @returns {Promise<Object>} { ui, api, storage }
   */
  async getAllStats() {
    const [uiStats, apiStats] = await Promise.all([
      this.getStats('ui'),
      this.getStats('api'),
    ]);
    return {
      storage: getStorageMode(),
      ui: uiStats,
      api: apiStats,
    };
  },
};

export default LogService;
