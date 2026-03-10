// ============================================================================
// Module API Template — PulseOps V3
//
// PURPOSE: Full-featured template for module API routes. Copy this directory
// and customise for your new module. Includes:
//   - Status & config endpoints
//   - Database schema info   (GET  /schema/info)
//   - Default data seeding   (POST /data/defaults)
//   - Module data deletion   (DELETE /data/reset)
//   - Lifecycle hooks        (onEnable / onDisable)
//
// ARCHITECTURE:
//   - Router is mounted on /api/<moduleId>/* via moduleGateway
//   - All routes here are RELATIVE (e.g., '/config' → /api/<moduleId>/config)
//   - onEnable() is called when the module is enabled
//   - onDisable() is called when the module is disabled
//
// DATABASE:
//   - Schema.json  → Defines tables, columns, indexes (lives in ../database/)
//   - DefaultData.json → Seed rows for those tables   (lives in ../database/)
//   - Both files are read dynamically at runtime — never hard-code table names.
//
// IMPORTS:
//   - express        → Router (from root node_modules)
//   - fs, path       → File I/O for reading Schema.json / DefaultData.json
//   - DatabaseService → Core DB service for running queries  (#core alias)
//   - appConfig       → Platform config (db.schema, etc.)   (#config alias)
//
// HOW TO CUSTOMISE:
//   1. Replace '_template' with your module ID everywhere in this file.
//   2. Add your own routes between the "CUSTOM ROUTES" markers below.
//   3. Modify onEnable / onDisable for any startup / teardown logic.
//   4. The three /schema/* and /data/* routes below work out-of-the-box
//      with any Schema.json + DefaultData.json — you usually don't need
//      to change them at all.
// ============================================================================

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Core platform imports ───────────────────────────────────────────────────
// #core and #config are Node.js subpath imports defined in the root package.json.
// They resolve to src/apiserver/core/* and src/apiserver/core/config/index.js.
import DatabaseService from '#core/database/databaseService.js';
import { config as appConfig } from '#config';

// ── Module constants ────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// The PostgreSQL schema all platform + module tables live in (default: 'pulseops').
const dbSchema = appConfig.db.schema || 'pulseops';

// ── CHANGE THIS to your module ID ───────────────────────────────────────────
const MODULE_ID = '_template';

// ── Database file resolver ──────────────────────────────────────────────────
// Locates Schema.json or DefaultData.json relative to this file.
// Works in both production (dist-modules/) and development (src/modules/).
//
// Resolution order:
//   1. <thisFile>/../../database/<filename>   (dist-modules/<id>/database/)
//   2. <projectRoot>/src/modules/<id>/database/<filename>  (dev fallback)
function resolveModuleDbFile(filename) {
  // Production path: dist-modules/<moduleId>/database/
  const distPath = path.resolve(__dirname, '..', 'database', filename);
  if (fs.existsSync(distPath)) return distPath;
  // Dev fallback: src/modules/<moduleId>/database/
  const srcPath = path.resolve(__dirname, '..', '..', '..', 'src', 'modules', MODULE_ID, 'database', filename);
  if (fs.existsSync(srcPath)) return srcPath;
  return null;
}

// File names — keep these consistent across all modules.
const SCHEMA_JSON_FILE = 'Schema.json';
const DEFAULT_DATA_FILE = 'DefaultData.json';


// ═════════════════════════════════════════════════════════════════════════════
// STANDARD ROUTES  (status, config)
// These are simple starter routes. Customise or remove as needed.
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /status — Health check ──────────────────────────────────────────────
// Returns a simple "ok" response. Useful for monitoring and connectivity tests.
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      module: MODULE_ID,
      message: 'Module API is running.',
    },
  });
});

// ── GET /config — Return current module config ──────────────────────────────
// Replace this with your module's actual configuration retrieval logic.
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      configured: false,
      message: 'Module configuration endpoint — customise this.',
    },
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// CUSTOM ROUTES — ADD YOUR MODULE'S BUSINESS LOGIC HERE
// ═════════════════════════════════════════════════════════════════════════════

// Example: GET /api/<moduleId>/items
// router.get('/items', async (req, res) => {
//   try {
//     const result = await DatabaseService.query(
//       `SELECT * FROM ${dbSchema}.template_items ORDER BY created_at DESC`
//     );
//     return res.json({ success: true, data: result.rows });
//   } catch (err) {
//     return res.status(500).json({ success: false, error: { message: err.message } });
//   }
// });


// ═════════════════════════════════════════════════════════════════════════════
// DATA MANAGEMENT ROUTES  (schema info, default data, delete module data)
//
// These three routes power the "Data Management" settings tab in the UI.
// They read Schema.json and DefaultData.json dynamically so they work
// out-of-the-box for ANY module — just make sure those JSON files exist
// in your module's database/ folder.
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /schema/info ────────────────────────────────────────────────────────
// Returns the live status of every table defined in Schema.json:
//   - Does the table exist in the database?
//   - How many rows does it have?
//   - How many columns and indexes are defined?
//   - Is the schema flagged as "initialized" in system_modules?
//   - Is default data loaded?
//
// The UI's Data Management tab calls this on mount to render the table grid.
router.get('/schema/info', async (req, res) => {
  try {
    // 1. Locate Schema.json
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

    // 2. Check each table: existence + row count
    const tables = [];
    let allExist = true;

    for (const tableDef of tableDefs) {
      const tableName = tableDef.name;
      let exists = false;
      let rowCount = 0;

      try {
        const existsResult = await DatabaseService.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = $1 AND table_name = $2
          ) AS "exists"`,
          [dbSchema, tableName]
        );
        exists = existsResult.rows[0]?.exists === true;

        if (exists) {
          const countResult = await DatabaseService.query(
            `SELECT COUNT(*) AS count FROM ${dbSchema}.${tableName}`
          );
          rowCount = parseInt(countResult.rows[0]?.count || '0', 10);
        }
      } catch {
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

    // 3. Get schema_initialized flag + date from system_modules
    let schemaInitializedAt = null;
    let schemaInitialized = false;
    try {
      const modResult = await DatabaseService.query(
        `SELECT schema_initialized, updated_at FROM ${dbSchema}.system_modules WHERE module_id = $1`,
        [MODULE_ID]
      );
      if (modResult.rows.length > 0) {
        schemaInitialized = modResult.rows[0].schema_initialized === true;
        if (schemaInitialized) schemaInitializedAt = modResult.rows[0].updated_at;
      }
    } catch { /* DB may not be available */ }

    // 4. Check whether DefaultData.json exists and if its data has been loaded
    const defaultDataPath = resolveModuleDbFile(DEFAULT_DATA_FILE);
    const hasDefaultData = !!defaultDataPath;
    let defaultDataLoaded = false;
    if (hasDefaultData && allExist) {
      try {
        const defaultDataDef = JSON.parse(fs.readFileSync(defaultDataPath, 'utf8'));
        const seedTables = Object.keys(defaultDataDef).filter(k => k !== '_meta');
        if (seedTables.length > 0) {
          const checkResult = await DatabaseService.query(
            `SELECT COUNT(*) AS count FROM ${dbSchema}.${seedTables[0]}`
          );
          defaultDataLoaded = parseInt(checkResult.rows[0]?.count || '0', 10) > 0;
        }
      } catch { /* ignore */ }
    }

    return res.json({
      success: true,
      data: {
        initialized: schemaInitialized && allExist,
        schemaInitialized,
        schemaInitializedAt,
        hasSchema: true,
        moduleId: schemaDef._meta?.moduleId || MODULE_ID,
        schemaVersion: schemaDef._meta?.version || '1.0.0',
        tables,
        hasDefaultData,
        defaultDataLoaded,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { message: `Schema info failed: ${err.message}` },
    });
  }
});

// ── POST /data/defaults ─────────────────────────────────────────────────────
// Reads database/DefaultData.json and inserts every row into the matching
// database table. Uses ON CONFLICT DO NOTHING so it is safe to call
// multiple times (idempotent). All inserts happen inside a single
// transaction — if any insert fails the entire batch is rolled back.
//
// DefaultData.json format:
// {
//   "_meta": { ... },             ← optional metadata (skipped)
//   "table_name": [ { row }, … ]  ← each key = table name, value = row array
// }
router.post('/data/defaults', async (req, res) => {
  try {
    // 1. Locate DefaultData.json
    const defaultDataPath = resolveModuleDbFile(DEFAULT_DATA_FILE);
    if (!defaultDataPath) {
      return res.status(404).json({
        success: false,
        error: { message: 'DefaultData.json not found for this module.' },
      });
    }

    const defaultDataDef = JSON.parse(fs.readFileSync(defaultDataPath, 'utf8'));
    // Filter out the _meta key — everything else is table → rows
    const seedEntries = Object.entries(defaultDataDef).filter(([k]) => k !== '_meta');

    if (seedEntries.length === 0) {
      return res.json({
        success: true,
        data: { message: 'DefaultData.json has no seed data entries.', tablesSeeded: 0, rowsInserted: 0 },
      });
    }

    // 2. Insert inside a transaction
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
          const sql = `INSERT INTO ${dbSchema}.${tableName} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`;
          const result = await client.query(sql, vals);
          if (result.rowCount > 0) tableRowsInserted += result.rowCount;
          else tableRowsSkipped++;
        }

        totalRowsInserted += tableRowsInserted;
        tablesSeeded.push({ table: tableName, rowsInserted: tableRowsInserted, rowsSkipped: tableRowsSkipped, totalRows: rows.length });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.json({
      success: true,
      data: {
        message: `Default data loaded. Seeded ${tablesSeeded.length} table(s), inserted ${totalRowsInserted} row(s).`,
        tablesSeeded,
        totalRowsInserted,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { message: `Default data load failed: ${err.message}` },
    });
  }
});

// ── DELETE /data/reset ──────────────────────────────────────────────────────
// Drops ALL database tables defined in Schema.json (reverse order for FK safety).
// Also resets schema_initialized in system_modules. This is irreversible.
//
// The UI's "Delete Module Data" button calls this endpoint.
router.delete('/data/reset', async (req, res) => {
  try {
    // 1. Read Schema.json
    const schemaPath = resolveModuleDbFile(SCHEMA_JSON_FILE);
    if (!schemaPath) {
      return res.status(404).json({
        success: false,
        error: { message: 'Schema.json not found — nothing to delete.' },
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

    // 2. Drop tables in reverse order inside a transaction
    const client = await DatabaseService.getPool().connect();
    const droppedTables = [];
    const skippedTables = [];

    try {
      await client.query('BEGIN');

      for (let i = tableDefs.length - 1; i >= 0; i--) {
        const tableName = tableDefs[i].name;
        const existsResult = await client.query(
          `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS "exists"`,
          [dbSchema, tableName]
        );

        if (existsResult.rows[0]?.exists) {
          const countResult = await client.query(`SELECT COUNT(*) AS count FROM ${dbSchema}.${tableName}`);
          const rowCount = parseInt(countResult.rows[0]?.count || '0', 10);
          await client.query(`DROP TABLE IF EXISTS ${dbSchema}.${tableName} CASCADE`);
          droppedTables.push({ name: tableName, rowsDeleted: rowCount, status: 'dropped' });
        } else {
          skippedTables.push({ name: tableName, status: 'not_found' });
        }
      }

      // 3. Reset schema_initialized flag
      try {
        await client.query(
          `UPDATE ${dbSchema}.system_modules SET schema_initialized = false, updated_at = NOW() WHERE module_id = $1`,
          [MODULE_ID]
        );
      } catch { /* best-effort */ }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const totalRowsDeleted = droppedTables.reduce((sum, t) => sum + t.rowsDeleted, 0);

    return res.json({
      success: true,
      data: {
        message: `Module data deleted. Dropped ${droppedTables.length} table(s) (${totalRowsDeleted} row(s)).`,
        droppedTables,
        skippedTables,
        totalRowsDeleted,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { message: `Delete module data failed: ${err.message}` },
    });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// LIFECYCLE HOOKS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Called when the module is enabled via Module Manager.
 * Use this to initialise connections, start timers, pre-load caches, etc.
 */
export async function onEnable() {
  console.log(`[${MODULE_ID}] Module enabled`);
}

/**
 * Called when the module is disabled via Module Manager.
 * Use this to clean up connections, stop timers, release resources, etc.
 */
export async function onDisable() {
  console.log(`[${MODULE_ID}] Module disabled`);
}

export default router;
