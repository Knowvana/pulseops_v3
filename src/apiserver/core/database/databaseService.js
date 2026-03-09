// ============================================================================
// Database Service — PulseOps V2 API
//
// PURPOSE: Core database operations using pg (node-postgres). Handles
// connection pooling, schema management, health checks, data seeding,
// and CRUD operations for the platform.
//
// SCHEMA: All tables are created under the configured schema (default: pulseops)
//   - system_users   → Application authentication and authorization
//   - system_config   → Key-value configuration storage (JSONB)
//   - system_modules  → Module management and hot-drop tracking
//   - system_logs     → Centralized log storage
//
// ARCHITECTURE:
//   - Singleton connection pool (lazy initialization)
//   - All queries use parameterized statements (SQL injection prevention)
//   - Transactions with BEGIN/COMMIT/ROLLBACK for multi-step operations
//   - Pool error handling with auto-recovery
//   - Graceful shutdown support for K8s
//
// USAGE:
//   import DatabaseService from '../database/databaseService.js';
//   const result = await DatabaseService.testConnection();
//   await DatabaseService.createSchema();
//   await DatabaseService.query('SELECT * FROM pulseops.system_users');
//
// DEPENDENCIES:
//   - pg (npm) — PostgreSQL client
//   - bcryptjs (npm) — password hashing for default admin
//   - ../../config/index.js → database config (host, port, name, schema, etc.)
//   - ../../shared/loadJson.js → messages, errors from JSON
//   - ../../shared/logger.js → structured logging
// ============================================================================
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { config } from '#config';
import { logger } from '#shared/logger.js';
import { messages, errors, loadJson, loadSeedJson } from '#shared/loadJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaJsonPath = path.resolve(__dirname, 'DefaultDatabaseSchema.json');

const { Pool } = pg;

let pool = null;

/**
 * Get or create the shared connection pool.
 * Lazy initialization — pool is created on first use.
 * @returns {pg.Pool} PostgreSQL connection pool
 */
function getPool() {
  if (!pool) {
    pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.name,
      user: config.db.user,
      password: config.db.password,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
      max: config.db.poolSize,
      idleTimeoutMillis: config.db.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.db.connectionTimeoutMillis || 5000,
    });
    pool.on('error', (err) => {
      logger.error(errors.errors.dbConnectionFailed, { error: err.message });
    });
  }
  return pool;
}

const schema = config.db.schema || 'pulseops';

const DatabaseService = {
  /**
   * Reset the shared pool so next operation creates a fresh pool
   * with updated config values. Called after save-config + reloadDbConfig.
   */
  async resetPool() {
    if (pool) {
      await pool.end().catch(() => {});
      pool = null;
    }
  },

  // ── Database Creation / Deletion ──────────────────────────────────────────

  /**
   * Create the target database if it does not exist.
   * Connects to the default 'postgres' database to run CREATE DATABASE.
   * @returns {Promise<Object>} { created: boolean, database: string }
   */
  async createDatabase() {
    const adminPool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: 'postgres',
      user: config.db.user,
      password: config.db.password,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
    });
    const client = await adminPool.connect();
    try {
      const dbName = config.db.name;
      const check = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]
      );
      if (check.rows.length === 0) {
        await client.query(`CREATE DATABASE "${dbName}"`);
        logger.info(messages.success.dbCreated, { database: dbName });
        return { created: true, database: dbName };
      }
      return { created: false, database: dbName, message: 'Database already exists.' };
    } finally {
      client.release();
      await adminPool.end();
    }
  },

  /**
   * Drop (delete) the target database entirely.
   * Terminates all active connections first so the DROP succeeds.
   * @returns {Promise<Object>} { deleted: boolean, database: string }
   */
  async dropDatabase() {
    const adminPool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: 'postgres',
      user: config.db.user,
      password: config.db.password,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
    });
    const client = await adminPool.connect();
    try {
      const dbName = config.db.name;
      const check = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]
      );
      if (check.rows.length === 0) {
        return { deleted: false, database: dbName, message: 'Database does not exist.' };
      }
      // Terminate all active connections to the target DB before dropping
      await client.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName]
      );
      await client.query(`DROP DATABASE "${dbName}"`);
      // Reset the shared pool so it reconnects if DB is recreated
      if (pool) { await pool.end().catch(() => {}); pool = null; }
      logger.info(messages.success.dbDeleted, { database: dbName });
      return { deleted: true, database: dbName };
    } finally {
      client.release();
      await adminPool.end();
    }
  },

  // ── Connection Testing ────────────────────────────────────────────────────

  /**
   * Test connection to the database and return latency + version info.
   * @param {Object} [customConfig] - Optional override config { host, port, database, user, password }
   * @returns {Promise<Object>} { connected, latencyMs, dbVersion, message }
   */
  async testConnection(customConfig) {
    let testPool;
    if (customConfig) {
      testPool = new Pool({
        host: customConfig.host || config.db.host,
        port: parseInt(customConfig.port, 10) || config.db.port,
        database: customConfig.database || config.db.name,
        user: customConfig.username || customConfig.user || config.db.user,
        password: customConfig.password || config.db.password,
        ssl: false,
        connectionTimeoutMillis: 5000,
      });
    }

    const start = Date.now();
    const targetPool = testPool || getPool();
    const client = await targetPool.connect();
    try {
      const result = await client.query('SELECT version()');
      const latency = Date.now() - start;
      const versionString = result.rows[0]?.version || '';
      const dbType = versionString.split(' ')[0] || 'Unknown';
      return {
        connected: true,
        latencyMs: latency,
        dbVersion: versionString,
        dbType,
        message: messages.success.dbConnected,
      };
    } finally {
      client.release();
      if (testPool) await testPool.end();
    }
  },

  // ── Schema Management ─────────────────────────────────────────────────────

  /**
   * Check schema status: is the schema created? Are core tables present?
   * @returns {Promise<Object>} { connected, initialized, hasDefaultData, tables }
   */
  async getSchemaStatus() {
    const client = await getPool().connect();
    try {
      // Check if schema exists
      const schemaCheck = await client.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [schema]
      );
      if (schemaCheck.rows.length === 0) {
        return { connected: true, initialized: false, hasDefaultData: false, tables: [] };
      }

      // Check for core tables
      const tableCheck = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
        [schema]
      );
      const tables = tableCheck.rows.map(r => r.table_name);
      const coreTables = [
        'system_users', 'system_roles', 'system_permissions',
        'system_role_permissions', 'system_user_roles',
        'system_config', 'system_modules', 'system_logs', 'system_sessions',
      ];
      const initialized = coreTables.every(t => tables.includes(t));

      // Check for default data
      let hasDefaultData = false;
      if (initialized) {
        const userCheck = await client.query(`SELECT COUNT(*) FROM ${schema}.system_users`);
        hasDefaultData = parseInt(userCheck.rows[0].count, 10) > 0;
      }

      return { connected: true, initialized, hasDefaultData, tables };
    } finally {
      client.release();
    }
  },

  /**
   * Create the core database schema and all required tables.
   * DYNAMICALLY reads table definitions from DefaultDatabaseSchema.json —
   * the JSON is the single source of truth for all table columns and indexes.
   * Uses a single transaction for atomicity.
   * @returns {Promise<Object>} { success, message, tables }
   */
  async createSchema() {
    // Read schema definition from JSON — single source of truth
    const schemaDef = JSON.parse(fs.readFileSync(schemaJsonPath, 'utf8'));
    const tableDefs = schemaDef.tables || [];

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      // Create schema namespace
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      logger.info(`[databaseService:createSchema] Schema namespace created/verified: ${schema}`);

      // Create each table from the JSON definition
      for (const tableDef of tableDefs) {
        const tableName = tableDef.name;
        const columns = tableDef.columns || [];
        const compositePK = tableDef.primaryKey; // e.g. ["role_id", "permission_id"]

        // Build column definitions — replace schema references (e.g. pulseops.system_users)
        const colDefs = columns.map(col => {
          // Replace hardcoded schema references in REFERENCES clauses with the actual schema
          let colType = col.type;
          if (colType.includes('pulseops.')) {
            colType = colType.replace(/pulseops\./g, `${schema}.`);
          }
          return `${col.name} ${colType}`;
        });

        // Add composite primary key if defined (for junction tables)
        if (compositePK && compositePK.length > 0) {
          colDefs.push(`PRIMARY KEY (${compositePK.join(', ')})`);
        }

        const createSQL = `CREATE TABLE IF NOT EXISTS ${schema}.${tableName} (\n  ${colDefs.join(',\n  ')}\n)`;
        await client.query(createSQL);
        logger.info(`[databaseService:createSchema] Table created/verified: ${schema}.${tableName} (${columns.length} columns)`);

        // Create indexes from JSON definition
        const indexes = tableDef.indexes || [];
        for (const idx of indexes) {
          const idxCols = idx.columns.join(', ');
          const uniqueStr = idx.unique ? 'UNIQUE ' : '';
          await client.query(`CREATE ${uniqueStr}INDEX IF NOT EXISTS ${idx.name} ON ${schema}.${tableName}(${idxCols})`);
        }
      }

      await client.query('COMMIT');
      logger.info(messages.success.schemaCreated, { schema, tableCount: tableDefs.length });

      const tables = tableDefs.map(t => t.name);
      return { success: true, message: messages.success.schemaCreated, tables };
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(errors.errors.schemaInitFailed, { error: err.message, schema });
      throw err;
    } finally {
      client.release();
    }
  },

  // ── Default Data Seeding ──────────────────────────────────────────────────

  /**
   * Load default seed data: admin user, default roles, permissions, and core modules.
   * Admin password is hashed with bcrypt before storage.
   * @returns {Promise<Object>} { success, message }
   */
  async loadDefaultData() {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      // ── Seed default roles ─────────────────────────────────────────────────
      const defaultRoles = [
        { name: 'super_admin', description: 'Full system access — all operations on all resources', isSystem: true },
        { name: 'admin',       description: 'Platform administration — modules, users, settings',  isSystem: true },
        { name: 'operator',    description: 'Operational access — monitoring, logs, read-only config', isSystem: true },
        { name: 'user',        description: 'Standard application user — module-level access only', isSystem: true },
        { name: 'viewer',      description: 'Read-only access — dashboards and reports only',       isSystem: true },
      ];
      const roleIdMap = {};
      for (const role of defaultRoles) {
        const r = await client.query(
          `INSERT INTO ${schema}.system_roles (name, description, is_system)
           VALUES ($1, $2, $3)
           ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
           RETURNING id`,
          [role.name, role.description, role.isSystem]
        );
        roleIdMap[role.name] = r.rows[0].id;
      }
      logger.info(`[databaseService:loadDefaultData] Seeded ${defaultRoles.length} roles`);

      // ── Seed core permissions ──────────────────────────────────────────────
      const corePermissions = [
        { name: 'platform:admin',  resource: 'platform',  action: 'admin',  description: 'Full platform administration' },
        { name: 'settings:read',   resource: 'settings',  action: 'read',   description: 'Read platform settings' },
        { name: 'settings:write',  resource: 'settings',  action: 'write',  description: 'Modify platform settings' },
        { name: 'database:manage', resource: 'database',  action: 'manage', description: 'Database operations' },
        { name: 'modules:manage',  resource: 'modules',   action: 'manage', description: 'Install/enable/disable modules' },
        { name: 'users:manage',    resource: 'users',     action: 'manage', description: 'Create/update/delete users' },
        { name: 'logs:read',       resource: 'logs',      action: 'read',   description: 'View logs and monitoring' },
        { name: 'logs:delete',     resource: 'logs',      action: 'delete', description: 'Delete log entries' },
        { name: 'reports:read',    resource: 'reports',   action: 'read',   description: 'View reports and analytics' },
      ];
      const permIdMap = {};
      for (const perm of corePermissions) {
        const p = await client.query(
          `INSERT INTO ${schema}.system_permissions (name, resource, action, description)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
           RETURNING id`,
          [perm.name, perm.resource, perm.action, perm.description]
        );
        permIdMap[perm.name] = p.rows[0].id;
      }
      logger.info(`[databaseService:loadDefaultData] Seeded ${corePermissions.length} permissions`);

      // ── Assign all permissions to super_admin and admin ───────────────────
      const adminRoles = ['super_admin', 'admin'];
      for (const roleName of adminRoles) {
        const rId = roleIdMap[roleName];
        if (!rId) continue;
        for (const pId of Object.values(permIdMap)) {
          await client.query(
            `INSERT INTO ${schema}.system_role_permissions (role_id, permission_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [rId, pId]
          );
        }
      }
      // operator: logs:read, settings:read, reports:read
      const opPerms = ['logs:read', 'settings:read', 'reports:read'];
      const operatorId = roleIdMap['operator'];
      if (operatorId) {
        for (const p of opPerms) {
          const pId = permIdMap[p];
          if (pId) await client.query(
            `INSERT INTO ${schema}.system_role_permissions (role_id, permission_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [operatorId, pId]
          );
        }
      }

      // ── Seed default settings into system_config ────────────────────────────
      // GeneralSettings and LogsConfig are loaded from core/database/seedData/
      // and stored in system_config table. These files are ONLY used for seeding.
      const seedConfigs = [
        { key: 'general_settings', file: 'GeneralSettings.json', desc: 'Platform general settings (timezone, date/time formats)' },
        { key: 'logs_config',      file: 'LogsConfig.json',      desc: 'Logging configuration (storage, levels, capture options, management)' },
      ];
      for (const seed of seedConfigs) {
        try {
          const seedData = loadSeedJson(seed.file);
          await client.query(
            `INSERT INTO ${schema}.system_config (key, value, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (key) DO NOTHING`,
            [seed.key, JSON.stringify(seedData), seed.desc]
          );
          logger.info(`[databaseService:loadDefaultData] Seeded config: ${seed.key}`);
        } catch (seedErr) {
          logger.warn(`[databaseService:loadDefaultData] Failed to seed ${seed.key}`, { error: seedErr.message });
        }
      }

      // ── Register core modules ──────────────────────────────────────────────
      await client.query(`
        INSERT INTO ${schema}.system_modules (module_id, name, short_name, version, description, is_core, installed, enabled, has_manifest, has_api, schema_initialized, "order")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (module_id) DO NOTHING
      `, ['platform_admin', 'Admin', 'Admin', '3.0.0', 'Platform dashboard, module management, and global settings', true, true, true, true, true, true, 0]);

      await client.query(`
        INSERT INTO ${schema}.system_modules (module_id, name, short_name, version, description, is_core, installed, enabled, has_manifest, has_api, schema_initialized, "order")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (module_id) DO NOTHING
      `, ['auth', 'Authentication', 'Auth', '3.0.0', 'Authentication, authorization, RBAC, session control', true, true, true, true, true, true, 1]);

      await client.query('COMMIT');
      logger.info(messages.success.defaultDataLoaded, { schema });

      return { success: true, message: messages.success.defaultDataLoaded };
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(errors.errors.dbInitFailed, { error: err.message, schema });
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Clean default data (remove seeded records).
   * @returns {Promise<Object>} { success, message }
   */
  async cleanDefaultData() {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM ${schema}.system_users WHERE email = 'admin@test.com'`);
      await client.query(`DELETE FROM ${schema}.system_modules WHERE is_core = true`);
      await client.query('COMMIT');
      return { success: true, message: messages.success.defaultDataCleaned };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ── Destructive Operations ────────────────────────────────────────────────

  /**
   * Wipe all tables by dropping the entire schema (destructive!).
   * @returns {Promise<Object>} { success, message }
   */
  async wipeDatabase() {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.query('COMMIT');
      logger.info(messages.success.dbWiped);
      return { success: true, message: messages.success.dbWiped };
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(errors.errors.dbWipeFailed, { error: err.message });
      throw err;
    } finally {
      client.release();
    }
  },

  // ── Statistics ────────────────────────────────────────────────────────────

  /**
   * Get database stats (table counts and sizes).
   * @returns {Promise<Object>} { tables: [{ table_name, size }] }
   */
  async getStats() {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT table_name,
          pg_size_pretty(pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name))) as size
        FROM information_schema.tables
        WHERE table_schema = $1
        ORDER BY table_name
      `, [schema]);
      return { tables: result.rows };
    } finally {
      client.release();
    }
  },

  // ── Generic Query ─────────────────────────────────────────────────────────

  /**
   * Execute a parameterized query using the shared pool.
   * @param {string} text - SQL query text with $1, $2, ... placeholders
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} pg result { rows, rowCount, ... }
   */
  async query(text, params) {
    const client = await getPool().connect();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  },

  /**
   * Get the underlying connection pool for advanced use (transactions).
   * @returns {pg.Pool}
   */
  getPool,

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Shutdown the pool gracefully. Called during K8s SIGTERM handling.
   */
  async shutdown() {
    if (pool) {
      await pool.end();
      pool = null;
    }
  },
};

export default DatabaseService;
