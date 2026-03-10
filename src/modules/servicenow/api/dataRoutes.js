// ============================================================================
// ServiceNow Module — Data Management Routes
//
// ENDPOINTS:
//   GET    /schema/info    → Dynamic schema status (tables, row counts)
//   POST   /data/defaults  → Load default data into database tables
//   POST   /data/demo      → Backward-compatible alias for /data/defaults
//   DELETE /data/reset     → Delete all module database tables
//
// MOUNT: router.use('/', dataRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import fs from 'fs';
import {
  resolveModuleDbFile, SCHEMA_JSON_FILE, DEFAULT_DATA_FILE,
  DatabaseService, dbSchema,
} from './helpers.js';

const router = Router();

// ── GET /schema/info ─────────────────────────────────────────────────────
router.get('/schema/info', async (req, res) => {
  const startTime = Date.now();
  const logContext = { endpoint: 'GET /schema/info', requestId: req.headers['x-request-id'] };

  try {
    console.log('[ServiceNow API] Schema info request started', logContext);

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

    const defaultDataPath = resolveModuleDbFile(DEFAULT_DATA_FILE);
    const hasDefaultData = !!defaultDataPath;

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
      ...logContext, initialized, tableCount: tables.length, allTablesExist: allExist, duration,
    });

    return res.json({
      success: true,
      data: {
        initialized, schemaInitialized, schemaInitializedAt,
        hasSchema: true,
        moduleId: schemaDef._meta?.moduleId || 'servicenow',
        schemaVersion: schemaDef._meta?.version || '1.0.0',
        tables, hasDefaultData, defaultDataLoaded,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('[ServiceNow API] Schema info failed', { ...logContext, error: err.message, stack: err.stack, duration });
    return res.status(500).json({ success: false, error: { message: `Schema info failed: ${err.message}` } });
  }
});

// ── POST /data/defaults — Load default data into database tables ─────────
router.post('/data/defaults', async (req, res) => {
  const startTime = Date.now();
  const logContext = { endpoint: 'POST /data/defaults', requestId: req.headers['x-request-id'] };

  try {
    console.log('[ServiceNow API] Default data load started', logContext);

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
          const insertSQL = `INSERT INTO ${dbSchema}.${tableName} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`;
          const result = await client.query(insertSQL, vals);
          if (result.rowCount > 0) tableRowsInserted += result.rowCount;
          else tableRowsSkipped++;
        }

        totalRowsInserted += tableRowsInserted;
        tablesSeeded.push({ table: tableName, rowsInserted: tableRowsInserted, rowsSkipped: tableRowsSkipped, totalRows: rows.length });

        console.log('[ServiceNow API] Seeded table', { ...logContext, table: tableName, inserted: tableRowsInserted, skipped: tableRowsSkipped });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const duration = Date.now() - startTime;
    console.log('[ServiceNow API] Default data load completed', { ...logContext, tablesSeeded: tablesSeeded.length, totalRowsInserted, duration });

    return res.json({
      success: true,
      data: {
        message: `Default data loaded successfully. Seeded ${tablesSeeded.length} table(s), inserted ${totalRowsInserted} row(s).`,
        tablesSeeded, totalRowsInserted, completedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('[ServiceNow API] Default data load failed', { ...logContext, error: err.message, stack: err.stack, duration });
    return res.status(500).json({ success: false, error: { message: `Default data load failed: ${err.message}` } });
  }
});

// ── POST /data/demo — Backward-compatible alias for /data/defaults ───────
router.post('/data/demo', async (req, res) => {
  req.url = '/data/defaults';
  router.handle(req, res);
});

// ── DELETE /data/reset — Delete Module Data (Tables and Objects) ──────────
router.delete('/data/reset', async (req, res) => {
  const startTime = Date.now();
  const logContext = { endpoint: 'DELETE /data/reset', requestId: req.headers['x-request-id'] };

  try {
    console.log('[ServiceNow API] Delete module data started', logContext);
    console.warn('[ServiceNow API] ⚠️  DANGER ZONE: Dropping all module database objects', logContext);

    const schemaPath = resolveModuleDbFile(SCHEMA_JSON_FILE);
    if (!schemaPath) {
      return res.status(404).json({ success: false, error: { message: 'Schema.json not found — no database objects to delete.' } });
    }

    const schemaDef = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tableDefs = schemaDef.tables || [];

    if (tableDefs.length === 0) {
      return res.json({ success: true, data: { message: 'Schema.json has no table definitions.', tablesDropped: 0 } });
    }

    const client = await DatabaseService.getPool().connect();
    const droppedTables = [];
    const skippedTables = [];
    const errors = [];

    try {
      await client.query('BEGIN');

      for (let i = tableDefs.length - 1; i >= 0; i--) {
        const tableName = tableDefs[i].name;
        try {
          const existsResult = await client.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = $1 AND table_name = $2
            ) AS "exists"`,
            [dbSchema, tableName]
          );

          if (existsResult.rows[0]?.exists) {
            const countResult = await client.query(`SELECT COUNT(*) AS count FROM ${dbSchema}.${tableName}`);
            const rowCount = parseInt(countResult.rows[0]?.count || '0', 10);

            await client.query(`DROP TABLE IF EXISTS ${dbSchema}.${tableName} CASCADE`);
            droppedTables.push({ name: tableName, description: tableDefs[i].description || '', rowsDeleted: rowCount, status: 'dropped' });
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

    console.log('[ServiceNow API] Data reset complete', logContext);

    const duration = Date.now() - startTime;
    const totalRowsDeleted = droppedTables.reduce((sum, t) => sum + t.rowsDeleted, 0);

    console.log('[ServiceNow API] Delete module data completed', {
      ...logContext, tablesDropped: droppedTables.length, tablesSkipped: skippedTables.length, totalRowsDeleted, errors: errors.length, duration,
    });

    return res.json({
      success: true,
      data: {
        message: `Module data deleted. Dropped ${droppedTables.length} table(s) (${totalRowsDeleted} row(s)), ${skippedTables.length} not found, ${errors.length} error(s).`,
        droppedTables, skippedTables, errors, totalRowsDeleted,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('[ServiceNow API] Delete module data failed', { ...logContext, error: err.message, stack: err.stack, duration });
    return res.status(500).json({ success: false, error: { message: `Delete module data failed: ${err.message}` } });
  }
});

export default router;
