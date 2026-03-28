// ============================================================================
// Accessio Operations Module — Data Management Routes
//
// PURPOSE: Schema info, load default data, and hard reset (drop all tables).
// Follows the same pattern as HealthCheck module's dataRoutes.js.
//
// ENDPOINTS:
//   GET    /schema/info     → Schema status with table info and row counts
//   GET    /schema/status   → Check if schema is initialized and data loaded
//   POST   /data/defaults   → Load default data from DefaultData.json
//   DELETE /data/reset      → Drop all module tables (destructive)
// ============================================================================
import { Router } from 'express';
import fs from 'fs';
import {
  dbSchema, DatabaseService,
  resolveModuleDbFile, SCHEMA_JSON_FILE, DEFAULT_DATA_FILE,
} from './helpers.js';
import { createAoLogger } from '../lib/moduleLogger.js';

const log = createAoLogger('dataRoutes.js');
const router = Router();

// ── GET /schema/info ─────────────────────────────────────────────────────────
router.get('/schema/info', async (req, res) => {
  try {
    const schemaPath = resolveModuleDbFile(SCHEMA_JSON_FILE);
    if (!schemaPath) {
      return res.json({
        success: true,
        data: { initialized: false, tables: [], message: 'Schema.json not found.' },
      });
    }
    const schemaDef = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tables = schemaDef.tables || [];

    const tableInfo = [];
    for (const tbl of tables) {
      try {
        const countResult = await DatabaseService.query(
          `SELECT COUNT(*)::int AS row_count FROM ${dbSchema}.${tbl.name}`
        );
        const colResult = await DatabaseService.query(
          `SELECT column_name, data_type
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          [dbSchema, tbl.name]
        );
        tableInfo.push({
          name: tbl.name,
          description: tbl.description,
          exists: true,
          rowCount: countResult.rows[0]?.row_count || 0,
          columns: colResult.rows,
          definedColumns: tbl.columns?.length || 0,
          indexes: tbl.indexes?.length || 0,
        });
      } catch {
        tableInfo.push({
          name: tbl.name,
          description: tbl.description,
          exists: false,
          rowCount: 0,
          columns: [],
          definedColumns: tbl.columns?.length || 0,
          indexes: tbl.indexes?.length || 0,
        });
      }
    }

    const allExist = tableInfo.every(t => t.exists);
    res.json({
      success: true,
      data: {
        moduleId: 'accessio_ops',
        initialized: allExist,
        tables: tableInfo,
        totalTables: tables.length,
        existingTables: tableInfo.filter(t => t.exists).length,
      },
    });
  } catch (err) {
    log.error('GET schema info failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.data.schemaInfoFailed.replace('{message}', err.message) } });
  }
});

// ── GET /schema/status ───────────────────────────────────────────────────────
router.get('/schema/status', async (req, res) => {
  const startTime = Date.now();
  log.debug('GET /schema/status — checking schema and data status');

  try {
    const schemaPath = resolveModuleDbFile(SCHEMA_JSON_FILE);
    if (!schemaPath) {
      return res.json({
        success: true,
        data: {
          schemaInitialized: false,
          defaultDataLoaded: false,
          message: 'Schema file not found',
        },
      });
    }

    const schemaDef = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tables = schemaDef.tables || [];

    let schemaInitialized = true;
    for (const tbl of tables) {
      try {
        await DatabaseService.query(`SELECT 1 FROM ${dbSchema}.${tbl.name} LIMIT 1`);
      } catch {
        schemaInitialized = false;
        break;
      }
    }

    let defaultDataLoaded = false;
    if (schemaInitialized) {
      try {
        const configResult = await DatabaseService.query(
          `SELECT COUNT(*)::int AS cnt FROM ${dbSchema}.ao_module_config`
        );
        defaultDataLoaded = (configResult.rows[0]?.cnt || 0) > 0;
      } catch {
        defaultDataLoaded = false;
      }
    }

    const duration = Date.now() - startTime;
    const statusMessage = defaultDataLoaded
      ? 'Schema initialized and default data loaded'
      : schemaInitialized
        ? 'Schema initialized but default data not loaded'
        : 'Schema not initialized';

    log.info('Schema status check complete', { schemaInitialized, defaultDataLoaded, durationMs: duration });

    res.json({
      success: true,
      data: {
        schemaInitialized,
        defaultDataLoaded,
        message: statusMessage,
        details: {
          tableCount: tables.length,
          durationMs: duration,
        },
      },
    });
  } catch (err) {
    log.error('GET /schema/status failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.data.schemaInfoFailed.replace('{message}', err.message) } });
  }
});

// ── POST /data/defaults ──────────────────────────────────────────────────────
router.post('/data/defaults', async (req, res) => {
  try {
    const defaultsPath = resolveModuleDbFile(DEFAULT_DATA_FILE);
    if (!defaultsPath) {
      return res.status(404).json({ success: false, error: { message: 'DefaultData.json not found.' } });
    }
    const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));

    let tablesSeeded = 0;
    let totalRows = 0;

    for (const [tableName, rows] of Object.entries(defaults)) {
      if (tableName === '_meta' || !Array.isArray(rows) || rows.length === 0) continue;

      for (const row of rows) {
        const keys = Object.keys(row);
        const values = Object.values(row).map(v =>
          typeof v === 'object' && v !== null ? JSON.stringify(v) : v
        );
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const colNames = keys.join(', ');

        try {
          await DatabaseService.query(
            `INSERT INTO ${dbSchema}.${tableName} (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
          totalRows++;
        } catch (insertErr) {
          log.warn(`Seed insert skipped for ${tableName}`, { error: insertErr.message });
        }
      }
      tablesSeeded++;
    }

    log.info('Default data loaded', { tables: tablesSeeded, rows: totalRows });
    res.json({
      success: true,
      data: { tables: tablesSeeded, rows: totalRows },
      message: `Default data loaded: ${tablesSeeded} tables, ${totalRows} rows`,
    });
  } catch (err) {
    log.error('POST load defaults failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── DELETE /data/reset ───────────────────────────────────────────────────────
router.delete('/data/reset', async (req, res) => {
  try {
    const schemaPath = resolveModuleDbFile(SCHEMA_JSON_FILE);
    if (!schemaPath) {
      return res.status(404).json({ success: false, error: { message: 'Schema.json not found.' } });
    }
    const schemaDef = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tables = (schemaDef.tables || []).map(t => t.name).reverse(); // Reverse for FK order

    let dropped = 0, skipped = 0, errors = 0, totalRows = 0;

    for (const tableName of tables) {
      try {
        const countResult = await DatabaseService.query(
          `SELECT COUNT(*)::int AS cnt FROM ${dbSchema}.${tableName}`
        );
        totalRows += countResult.rows[0]?.cnt || 0;

        await DatabaseService.query(`DROP TABLE IF EXISTS ${dbSchema}.${tableName} CASCADE`);
        dropped++;
        log.info(`Dropped table: ${tableName}`);
      } catch (dropErr) {
        if (dropErr.code === '42P01') {
          skipped++;
        } else {
          errors++;
          log.warn(`Failed to drop ${tableName}`, { error: dropErr.message });
        }
      }
    }

    log.info('Module data reset complete', { dropped, skipped, errors, totalRows });
    res.json({
      success: true,
      data: { dropped, skipped, errors, totalRows },
      message: `Data reset: ${dropped} dropped, ${totalRows} rows deleted, ${skipped} skipped, ${errors} errors`,
    });
  } catch (err) {
    log.error('DELETE data reset failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

export default router;
