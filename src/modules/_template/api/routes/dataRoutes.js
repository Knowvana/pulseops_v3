// ============================================================================
// Module Template — Data Management Routes
//
// ENDPOINTS:
//   GET    /schema/info    → Dynamic schema status (tables, row counts)
//   POST   /data/defaults  → Load default data into database tables
//   DELETE /data/reset     → Delete all module database tables
//
// MOUNT: router.use('/', dataRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import fs from 'fs';
import {
  resolveModuleDbFile, SCHEMA_JSON_FILE, DEFAULT_DATA_FILE,
  DatabaseService, dbSchema, MODULE_ID,
} from './helpers.js';

const router = Router();

// ── GET /schema/info ────────────────────────────────────────────────────────
router.get('/schema/info', async (req, res) => {
  try {
    const schemaPath = resolveModuleDbFile(SCHEMA_JSON_FILE);
    if (!schemaPath) {
      return res.json({
        success: true,
        data: {
          initialized: false, hasSchema: false, tables: [],
          message: 'No Schema.json found for this module.',
          checkedAt: new Date().toISOString(),
        },
      });
    }

    const schemaDef = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tableDefs = schemaDef.tables || [];
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
        exists, rowCount,
        columnCount: (tableDef.columns || []).length,
        indexCount: (tableDef.indexes || []).length,
      });
    }

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
        schemaInitialized, schemaInitializedAt,
        hasSchema: true,
        moduleId: schemaDef._meta?.moduleId || MODULE_ID,
        schemaVersion: schemaDef._meta?.version || '1.0.0',
        tables, hasDefaultData, defaultDataLoaded,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Schema info failed: ${err.message}` } });
  }
});

// ── POST /data/defaults ─────────────────────────────────────────────────────
router.post('/data/defaults', async (req, res) => {
  try {
    const defaultDataPath = resolveModuleDbFile(DEFAULT_DATA_FILE);
    if (!defaultDataPath) {
      return res.status(404).json({ success: false, error: { message: 'DefaultData.json not found for this module.' } });
    }

    const defaultDataDef = JSON.parse(fs.readFileSync(defaultDataPath, 'utf8'));
    const seedEntries = Object.entries(defaultDataDef).filter(([k]) => k !== '_meta');

    if (seedEntries.length === 0) {
      return res.json({ success: true, data: { message: 'DefaultData.json has no seed data entries.', tablesSeeded: 0, rowsInserted: 0 } });
    }

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
        tablesSeeded, totalRowsInserted, completedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Default data load failed: ${err.message}` } });
  }
});

// ── POST /data/demo (backward-compatible alias) ─────────────────────────────
router.post('/data/demo', (req, res, next) => {
  req.url = '/data/defaults';
  next();
});

// ── DELETE /data/reset ──────────────────────────────────────────────────────
router.delete('/data/reset', async (req, res) => {
  try {
    const schemaPath = resolveModuleDbFile(SCHEMA_JSON_FILE);
    if (!schemaPath) {
      return res.status(404).json({ success: false, error: { message: 'Schema.json not found — nothing to delete.' } });
    }

    const schemaDef = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tableDefs = schemaDef.tables || [];

    if (tableDefs.length === 0) {
      return res.json({ success: true, data: { message: 'Schema.json has no table definitions.', tablesDropped: 0 } });
    }

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
        droppedTables, skippedTables, totalRowsDeleted, completedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Delete module data failed: ${err.message}` } });
  }
});

export default router;
