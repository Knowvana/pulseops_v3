// ============================================================================
// HealthCheck Module — Data Management Routes
//
// PURPOSE: Schema info, load default data, and hard reset (drop all tables).
// Follows the same pattern as ServiceNow module's dataRoutes.js.
//
// ENDPOINTS:
//   GET    /schema/info     → Schema status with table info and row counts
//   POST   /data/defaults   → Load default data from DefaultData.json
//   DELETE /data/reset      → Drop all module tables (destructive)
// ============================================================================
import { Router } from 'express';
import fs from 'fs';
import { hcUrls, apiErrors, apiMessages } from '#modules/healthcheck/api/config/index.js';
import {
  dbSchema, DatabaseService, MODULE_ID,
  resolveModuleDbFile, SCHEMA_JSON_FILE, DEFAULT_DATA_FILE,
} from '#modules/healthcheck/api/routes/helpers.js';
import { createHcLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';

const log = createHcLogger('dataRoutes.js');
const router = Router();
const routes = hcUrls.routes;

// ── GET /schema/info ─────────────────────────────────────────────────────────
router.get(routes.schemaInfo, async (req, res) => {
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
        moduleId: MODULE_ID,
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
// Check if schema is initialized and default data is loaded
router.get(routes.schemaStatus, async (req, res) => {
  const startTime = Date.now();
  log.debug('GET /schema/status — checking schema and data status');
  
  try {
    // Step 1: Resolve schema file path
    const schemaPath = resolveModuleDbFile(SCHEMA_JSON_FILE);
    if (!schemaPath) {
      log.warn('Schema file not found', { file: SCHEMA_JSON_FILE });
      return res.json({
        success: true,
        data: {
          schemaInitialized: false,
          defaultDataLoaded: false,
          message: 'Schema file not found',
        },
      });
    }
    log.debug('Schema file resolved', { path: schemaPath });

    // Step 2: Parse schema definition
    let schemaDef;
    try {
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      schemaDef = JSON.parse(schemaContent);
      log.debug('Schema definition parsed successfully', { tableCount: schemaDef.tables?.length || 0 });
    } catch (parseErr) {
      log.error('Failed to parse schema file', { 
        file: schemaPath, 
        message: parseErr.message,
        code: parseErr.code 
      });
      return res.status(500).json({ 
        success: false, 
        error: { message: `Invalid schema file: ${parseErr.message}` } 
      });
    }

    const tables = schemaDef.tables || [];
    if (tables.length === 0) {
      log.warn('Schema definition contains no tables');
    }

    // Step 3: Check if all tables exist in database
    log.debug('Checking table existence', { tableCount: tables.length });
    let schemaInitialized = true;
    const tableStatus = {};
    
    for (const tbl of tables) {
      try {
        await DatabaseService.query(
          `SELECT 1 FROM ${dbSchema}.${tbl.name} LIMIT 1`
        );
        tableStatus[tbl.name] = 'exists';
        log.debug(`Table exists: ${tbl.name}`);
      } catch (tableErr) {
        tableStatus[tbl.name] = 'missing';
        schemaInitialized = false;
        log.debug(`Table missing: ${tbl.name}`, { error: tableErr.message });
      }
    }

    if (!schemaInitialized) {
      log.warn('Schema not fully initialized', { 
        totalTables: tables.length,
        missingTables: Object.entries(tableStatus)
          .filter(([_, status]) => status === 'missing')
          .map(([name]) => name)
      });
    } else {
      log.info('Schema fully initialized', { totalTables: tables.length });
    }

    // Step 4: Check if default data is loaded
    log.debug('Checking default data status');
    let defaultDataLoaded = false;
    let coreSystemCategoryCount = 0;
    let applicationCount = 0;

    if (schemaInitialized) {
      try {
        // Check for Core System category
        const catResult = await DatabaseService.query(
          `SELECT COUNT(*)::int AS cnt FROM ${dbSchema}.hc_categories WHERE is_system_default = true`
        );
        coreSystemCategoryCount = catResult.rows[0]?.cnt || 0;
        log.debug('Core System category check', { count: coreSystemCategoryCount });

        // Check for applications
        const appResult = await DatabaseService.query(
          `SELECT COUNT(*)::int AS cnt FROM ${dbSchema}.hc_applications`
        );
        applicationCount = appResult.rows[0]?.cnt || 0;
        log.debug('Applications check', { count: applicationCount });

        // Default data is loaded if Core System category exists and apps are present
        defaultDataLoaded = coreSystemCategoryCount > 0 && applicationCount > 0;
        
        if (defaultDataLoaded) {
          log.info('Default data is loaded', { 
            coreSystemCategories: coreSystemCategoryCount,
            applications: applicationCount 
          });
        } else {
          log.warn('Default data not fully loaded', { 
            coreSystemCategories: coreSystemCategoryCount,
            applications: applicationCount 
          });
        }
      } catch (dataErr) {
        log.error('Failed to check default data status', { 
          message: dataErr.message,
          code: dataErr.code 
        });
        defaultDataLoaded = false;
      }
    } else {
      log.debug('Skipping default data check — schema not initialized');
    }

    // Step 5: Build response
    const duration = Date.now() - startTime;
    const statusMessage = defaultDataLoaded
      ? 'Schema initialized and default data loaded'
      : schemaInitialized
        ? 'Schema initialized but default data not loaded'
        : 'Schema not initialized';

    log.info('Schema status check complete', { 
      schemaInitialized,
      defaultDataLoaded,
      durationMs: duration,
      message: statusMessage
    });

    res.json({
      success: true,
      data: {
        schemaInitialized,
        defaultDataLoaded,
        message: statusMessage,
        details: {
          tableCount: tables.length,
          coreSystemCategories: coreSystemCategoryCount,
          applications: applicationCount,
          durationMs: duration,
        },
      },
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    log.error('GET /schema/status failed', { 
      message: err.message,
      code: err.code,
      stack: err.stack,
      durationMs: duration
    });
    res.status(500).json({ 
      success: false, 
      error: { 
        message: apiErrors.data.schemaInfoFailed.replace('{message}', err.message),
        code: err.code 
      } 
    });
  }
});

// ── POST /data/defaults ──────────────────────────────────────────────────────
router.post(routes.dataDefaults, async (req, res) => {
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
      message: apiMessages.data.loaded
        .replace('{tables}', String(tablesSeeded))
        .replace('{rows}', String(totalRows)),
    });
  } catch (err) {
    log.error('POST load defaults failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.data.loadDefaultsFailed.replace('{message}', err.message) } });
  }
});

// ── DELETE /data/reset ───────────────────────────────────────────────────────
router.delete(routes.dataReset, async (req, res) => {
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
        // Get row count before drop
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
      message: apiMessages.data.reset
        .replace('{dropped}', String(dropped))
        .replace('{rows}', String(totalRows))
        .replace('{skipped}', String(skipped))
        .replace('{errors}', String(errors)),
    });
  } catch (err) {
    log.error('DELETE data reset failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.data.resetFailed.replace('{message}', err.message) } });
  }
});

export default router;
