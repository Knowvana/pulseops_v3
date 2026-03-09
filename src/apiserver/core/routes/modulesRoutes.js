// ============================================================================
// Modules Routes — PulseOps V3 API
//
// PURPOSE: REST endpoints for the complete module lifecycle — listing installed
// modules, scanning the hot-drop folder for available modules, installing,
// enabling (with dynamic API route loading), disabling, removing, and serving
// compiled UI bundles.
//
// MOUNT PATH: /api/modules (registered in api/src/app.js)
//
// ENDPOINTS:
//   GET    /api/modules                      → List installed modules (PUBLIC)
//   GET    /api/modules/available            → Scan dist-modules/ for available (JWT)
//   GET    /api/modules/scan                 → Force re-scan of hot-drop folder (JWT)
//   POST   /api/modules/:id/install          → Register module in DB (JWT)
//   POST   /api/modules/:id/enable           → Enable + load API routes (JWT)
//   POST   /api/modules/:id/disable          → Disable + unload API routes (JWT)
//   DELETE /api/modules/:id                  → Remove module entirely (JWT)
//   GET    /api/modules/:id/status           → Module status detail (JWT)
//   GET    /api/modules/bundle/:id/manifest.js → Serve UI bundle (PUBLIC)
//   GET    /api/modules/bundle/:id/:file     → Serve module assets (PUBLIC)
//
// ARCHITECTURE:
//   - Module state persisted in PostgreSQL system_modules table (DB is source of truth)
//   - Hot-drop bundles live in dist-modules/<id>/
//   - Dynamic API route loading via dynamicRouteLoader.js (zero restart)
//   - Pod restarts re-discover modules from DB — no PV required for state
//
// KUBERNETES COMPATIBILITY:
//   - Database is the source of truth for module install/enable state
//   - rehydrateEnabledModules() re-loads routes on pod restart from DB
//   - No in-memory-only state survives between requests
//
// DEPENDENCIES:
//   - #shared/logger.js                   → Winston logger
//   - #core/middleware/auth.js            → authenticate
//   - #core/database/databaseService.js   → DB queries for module state
//   - #core/modules/moduleScanner.js      → Module discovery (hot-drop)
//   - #core/modules/dynamicRouteLoader.js → Dynamic route loading
// ============================================================================

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticate } from '#core/middleware/auth.js';
import { logger } from '#shared/logger.js';
import { errors, messages } from '#shared/loadJson.js';
import { config } from '#config';
import DatabaseService from '#core/database/databaseService.js';
import ModuleScanner from '#core/modules/moduleScanner.js';
import { loadModuleRoutes, unloadModuleRoutes, isModuleLoaded } from '#core/modules/dynamicRouteLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const router = Router();
const schema = config.db.schema || 'pulseops';

// ── Helper: get the Express app from request ─────────────────────────────────
// The app instance is needed for dynamic route mounting. Express attaches it
// to every request object automatically via req.app.
function getApp(req) { return req.app; }

// ═════════════════════════════════════════════════════════════════════════════
// BUNDLE SERVING ROUTES — MUST BE FIRST (before /:id/ parameter routes)
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// GET /modules/bundle/:id/manifest.js — Serve compiled UI bundle (PUBLIC)
// No auth required because frontend uses dynamic import() which can't send cookies.
// Cache-Control: no-cache to support hot-drop updates.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bundle/:id/manifest.js', (req, res) => {
  const requestId = req.requestId;
  const { id } = req.params;
  const modulesDir = ModuleScanner.getModulesDir();
  const bundlePath = path.join(modulesDir, id, 'manifest.js');

  logger.debug(`[${requestId}] Modules:GET /bundle/${id}/manifest.js — serving`);

  // Path traversal guard
  if (!bundlePath.startsWith(modulesDir)) {
    return res.status(403).json({ success: false, error: { message: 'Access denied', requestId } });
  }

  if (!fs.existsSync(bundlePath)) {
    logger.warn(`[${requestId}] Modules:GET /bundle/${id}/manifest.js — not found`);
    return res.status(404).json({
      success: false,
      error: { message: errors.errors.moduleNotFound, requestId },
    });
  }

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  fs.createReadStream(bundlePath).pipe(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /modules/bundle/:id/:fileName — Serve module assets (json, css, js)
// PUBLIC: serves constants.json, uiText.json, and other bundled assets.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bundle/:id/:fileName', (req, res) => {
  const requestId = req.requestId;
  const { id, fileName } = req.params;
  const allowedExtensions = ['.json', '.js', '.css'];
  const ext = path.extname(fileName);

  if (!allowedExtensions.includes(ext)) {
    return res.status(403).json({
      success: false,
      error: { message: 'File type not allowed', requestId },
    });
  }

  const modulesDir = ModuleScanner.getModulesDir();
  const filePath = path.join(modulesDir, id, fileName);

  // Path traversal guard
  if (!filePath.startsWith(modulesDir)) {
    return res.status(403).json({ success: false, error: { message: 'Access denied', requestId } });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: { message: 'File not found', requestId },
    });
  }

  const mimeTypes = {
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.css':  'text/css',
  };
  res.setHeader('Content-Type', (mimeTypes[ext] || 'application/octet-stream') + '; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  fs.createReadStream(filePath).pipe(res);
});

// ═════════════════════════════════════════════════════════════════════════════
// LIFECYCLE ROUTES — After bundle routes
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// GET /modules — List all installed modules + enabled status
// PUBLIC: PlatformDashboard calls this on load to discover modules to render.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] Modules:GET / — listing installed modules`);
  try {
    const result = await DatabaseService.query(
      `SELECT module_id, name, short_name, version, description, enabled, installed,
              has_api, has_manifest, is_core, "order", roles, config, installed_at
       FROM ${schema}.system_modules ORDER BY "order" ASC, name ASC`
    );
    const modules = result.rows.map(m => ({
      id:               m.module_id,
      name:             m.name,
      shortName:        m.short_name || '',
      version:          m.version,
      description:      m.description || '',
      enabled:          m.enabled === true,
      installed:        m.installed === true,
      hasApi:           m.has_api || false,
      hasManifest:      m.has_manifest || false,
      isCore:           m.is_core || false,
      order:            m.order ?? 99,
      roles:            m.roles || [],
      config:           m.config || {},
      installedAt:      m.installed_at,
      apiRoutesLoaded:  isModuleLoaded(m.module_id),
    }));
    logger.debug(`[${requestId}] Modules:GET / — ${modules.length} installed module(s)`);
    return res.json({ success: true, data: modules });
  } catch (err) {
    logger.error(`[${requestId}] Modules:GET / — failed`, { error: err.message });
    return res.json({ success: true, data: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /modules/available — Scan dist-modules/ for available (not yet installed)
// PROTECTED: Only admins need to see what's available for installation.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/available', authenticate, async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] Modules:GET /available — scanning hot-drop folder`);
  try {
    const hotDropModules = ModuleScanner.scan();

    // Merge with installed state from DB
    let installedMap = new Map();
    try {
      const dbResult = await DatabaseService.query(
        `SELECT module_id, installed, enabled, installed_at FROM ${schema}.system_modules`
      );
      installedMap = new Map(dbResult.rows.map(r => [r.module_id, r]));
    } catch {
      logger.warn(`[${requestId}] Modules:GET /available — DB query failed, showing scan-only results`);
    }

    const result = hotDropModules.map(m => ({
      ...m,
      installed:   installedMap.has(m.id) && installedMap.get(m.id).installed === true,
      enabled:     installedMap.has(m.id) && installedMap.get(m.id).enabled === true,
      installedAt: installedMap.get(m.id)?.installed_at || null,
      apiRoutesLoaded: isModuleLoaded(m.id),
    }));

    logger.info(`[${requestId}] Modules:GET /available — ${result.length} module(s) discovered`);
    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[${requestId}] Modules:GET /available — scan failed`, { error: err.message });
    return res.json({ success: true, data: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /modules/scan — Force re-scan (same as /available, explicit trigger)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/scan', authenticate, (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] Modules:GET /scan — force re-scan`);
  try {
    const modules = ModuleScanner.scan();
    return res.json({ success: true, data: modules, count: modules.length });
  } catch (err) {
    logger.error(`[${requestId}] Modules:GET /scan — failed`, { error: err.message });
    return res.status(500).json({ success: false, error: { message: err.message, requestId } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /modules/:id/install — Register a module from dist-modules/ into DB
// Reads metadata from dist-modules/<id>/constants.json and creates a record
// in system_modules. Module is installed but NOT enabled (user must enable).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/install', authenticate, async (req, res) => {
  const requestId = req.requestId;
  const { id } = req.params;
  logger.info(`[${requestId}] Modules:POST /${id}/install — user ${req.user?.userId}`);

  try {
    // Check the module exists in dist-modules/
    const available = ModuleScanner.scan();
    const moduleMeta = available.find(m => m.id === id);
    if (!moduleMeta) {
      logger.warn(`[${requestId}] Modules:POST /${id}/install — not found in dist-modules/`);
      return res.status(404).json({
        success: false,
        error: { message: errors.errors.moduleNotFound, requestId },
      });
    }

    // Check if already installed in DB
    const existing = await DatabaseService.query(
      `SELECT module_id, installed FROM ${schema}.system_modules WHERE module_id = $1`,
      [id]
    );
    if (existing.rows.length > 0 && existing.rows[0].installed === true) {
      logger.warn(`[${requestId}] Modules:POST /${id}/install — already installed`);
      return res.status(409).json({
        success: false,
        error: { message: errors.errors.moduleAlreadyInstalled, requestId },
      });
    }

    // Upsert into DB
    await DatabaseService.query(`
      INSERT INTO ${schema}.system_modules
        (module_id, name, short_name, version, description, roles, is_core, "order",
         has_manifest, has_api, installed, enabled, installed_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, false, NOW(), NOW())
      ON CONFLICT (module_id) DO UPDATE SET
        name = EXCLUDED.name, short_name = EXCLUDED.short_name, version = EXCLUDED.version,
        description = EXCLUDED.description, roles = EXCLUDED.roles, "order" = EXCLUDED."order",
        has_manifest = EXCLUDED.has_manifest, has_api = EXCLUDED.has_api,
        installed = true, installed_at = NOW(), updated_at = NOW()
    `, [
      id, moduleMeta.name, moduleMeta.shortName || '', moduleMeta.version,
      moduleMeta.description || '', JSON.stringify(moduleMeta.roles || []),
      moduleMeta.isCore || false, moduleMeta.order ?? 99,
      moduleMeta.hasManifest || false, moduleMeta.hasApi || false,
    ]);

    logger.info(`[${requestId}] Modules:POST /${id}/install — ${messages.success.moduleInstalled}`);
    return res.json({
      success: true,
      data: { id, name: moduleMeta.name, version: moduleMeta.version },
      message: messages.success.moduleInstalled,
    });
  } catch (err) {
    logger.error(`[${requestId}] Modules:POST /${id}/install — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.moduleInstallFailed, requestId },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /modules/:id/enable — Enable a module + dynamically load API routes
// ZERO DOWNTIME: API routes are mounted at runtime via dynamicRouteLoader.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/enable', authenticate, async (req, res) => {
  const requestId = req.requestId;
  const { id } = req.params;
  logger.info(`[${requestId}] Modules:POST /${id}/enable — user ${req.user?.userId}`);

  try {
    const existing = await DatabaseService.query(
      `SELECT module_id, installed, is_core, enabled FROM ${schema}.system_modules WHERE module_id = $1`,
      [id]
    );

    if (existing.rows.length === 0 || !existing.rows[0].installed) {
      return res.status(400).json({
        success: false,
        error: { message: 'Module must be installed before enabling.', requestId },
      });
    }

    if (existing.rows[0].is_core) {
      return res.status(400).json({
        success: false,
        error: { message: errors.errors.coreModuleCannotDisable, requestId },
      });
    }

    // Dynamically load API routes (zero restart)
    const app = getApp(req);
    const loadResult = await loadModuleRoutes(app, id);
    logger.info(`[${requestId}] Modules:POST /${id}/enable — route load: ${loadResult.message}`);

    // Update DB
    await DatabaseService.query(
      `UPDATE ${schema}.system_modules SET enabled = true, enabled_at = NOW(), updated_at = NOW() WHERE module_id = $1`,
      [id]
    );

    logger.info(`[${requestId}] Modules:POST /${id}/enable — ${messages.success.moduleEnabled}`);
    return res.json({
      success: true,
      data: { id, enabled: true, apiRoutesLoaded: loadResult.success },
      message: messages.success.moduleEnabled,
    });
  } catch (err) {
    logger.error(`[${requestId}] Modules:POST /${id}/enable — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.snModuleEnableFailed, requestId },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /modules/:id/disable — Disable a module + unload API routes
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/disable', authenticate, async (req, res) => {
  const requestId = req.requestId;
  const { id } = req.params;
  logger.info(`[${requestId}] Modules:POST /${id}/disable — user ${req.user?.userId}`);

  try {
    const existing = await DatabaseService.query(
      `SELECT module_id, is_core FROM ${schema}.system_modules WHERE module_id = $1`,
      [id]
    );

    if (existing.rows.length > 0 && existing.rows[0].is_core) {
      return res.status(400).json({
        success: false,
        error: { message: errors.errors.coreModuleCannotDisable, requestId },
      });
    }

    // Unload API routes
    const unloadResult = await unloadModuleRoutes(id);
    logger.info(`[${requestId}] Modules:POST /${id}/disable — unload: ${unloadResult.message}`);

    // Update DB
    await DatabaseService.query(
      `UPDATE ${schema}.system_modules SET enabled = false, disabled_at = NOW(), updated_at = NOW() WHERE module_id = $1`,
      [id]
    );

    logger.info(`[${requestId}] Modules:POST /${id}/disable — ${messages.success.moduleDisabled}`);
    return res.json({
      success: true,
      data: { id, enabled: false },
      message: messages.success.moduleDisabled,
    });
  } catch (err) {
    logger.error(`[${requestId}] Modules:POST /${id}/disable — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.snModuleDisableFailed, requestId },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /modules/:id — Remove a module from DB entirely
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  const requestId = req.requestId;
  const { id } = req.params;
  logger.info(`[${requestId}] Modules:DELETE /${id} — user ${req.user?.userId}`);

  try {
    const existing = await DatabaseService.query(
      `SELECT module_id, is_core FROM ${schema}.system_modules WHERE module_id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: errors.errors.moduleNotFound, requestId },
      });
    }

    if (existing.rows[0].is_core) {
      return res.status(400).json({
        success: false,
        error: { message: errors.errors.coreModuleCannotRemove, requestId },
      });
    }

    // Unload routes if loaded
    await unloadModuleRoutes(id);

    // Remove from DB
    await DatabaseService.query(
      `DELETE FROM ${schema}.system_modules WHERE module_id = $1`,
      [id]
    );

    logger.info(`[${requestId}] Modules:DELETE /${id} — ${messages.success.moduleRemoved}`);
    return res.json({
      success: true,
      data: { id },
      message: messages.success.moduleRemoved,
    });
  } catch (err) {
    logger.error(`[${requestId}] Modules:DELETE /${id} — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: err.message, requestId },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /modules/:id/status — Detailed module status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/status', authenticate, async (req, res) => {
  const requestId = req.requestId;
  const { id } = req.params;
  logger.debug(`[${requestId}] Modules:GET /${id}/status`);

  try {
    const result = await DatabaseService.query(
      `SELECT module_id, name, short_name, version, description, enabled, installed,
              has_api, has_manifest, is_core, "order", roles, config, installed_at, enabled_at, disabled_at
       FROM ${schema}.system_modules WHERE module_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: errors.errors.moduleNotFound, requestId },
      });
    }

    const m = result.rows[0];
    return res.json({
      success: true,
      data: {
        id:              m.module_id,
        name:            m.name,
        shortName:       m.short_name || '',
        version:         m.version,
        description:     m.description || '',
        enabled:         m.enabled === true,
        installed:       m.installed === true,
        hasApi:          m.has_api || false,
        hasManifest:     m.has_manifest || false,
        isCore:          m.is_core || false,
        order:           m.order ?? 99,
        roles:           m.roles || [],
        config:          m.config || {},
        installedAt:     m.installed_at,
        enabledAt:       m.enabled_at,
        disabledAt:      m.disabled_at,
        apiRoutesLoaded: isModuleLoaded(id),
        existsInHotDrop: ModuleScanner.exists(id),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { message: err.message, requestId },
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// MODULE SCHEMA PROVISIONING — Create module-specific DB tables
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the path to a module's database/Schema.json.
 * Checks dist-modules/<id>/database/Schema.json first (prod),
 * then falls back to src/modules/<id>/database/Schema.json (dev).
 * @param {string} moduleId
 * @returns {string|null} Absolute path or null if not found
 */
function resolveModuleSchemaPath(moduleId) {
  // 1. dist-modules/ (production — after build:module)
  const distPath = path.join(ModuleScanner.getModulesDir(), moduleId, 'database', 'Schema.json');
  if (fs.existsSync(distPath)) return distPath;

  // 2. src/modules/ (development — before build)
  const srcPath = path.join(PROJECT_ROOT, 'src', 'modules', moduleId, 'database', 'Schema.json');
  if (fs.existsSync(srcPath)) return srcPath;

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /modules/:id/schema — Preview module schema (tables, columns, indexes)
// Returns the parsed Schema.json without executing any DDL.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/schema', authenticate, async (req, res) => {
  const requestId = req.requestId;
  const { id } = req.params;
  logger.debug(`[${requestId}] Modules:GET /${id}/schema — preview`);

  try {
    const schemaPath = resolveModuleSchemaPath(id);
    if (!schemaPath) {
      return res.json({
        success: true,
        data: { hasSchema: false, tables: [] },
        message: 'Module has no database schema definition.',
      });
    }

    const schemaDef = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tables = (schemaDef.tables || []).map(t => ({
      name: t.name,
      description: t.description || '',
      columnCount: (t.columns || []).length,
      columns: (t.columns || []).map(c => ({ name: c.name, type: c.type })),
      indexCount: (t.indexes || []).length,
      indexes: (t.indexes || []).map(idx => ({
        name: idx.name,
        columns: idx.columns,
        unique: idx.unique || false,
      })),
    }));

    const hasSeedData = !!(schemaDef.seedData && Object.keys(schemaDef.seedData).length > 0);
    const seedTables = hasSeedData ? Object.keys(schemaDef.seedData) : [];

    // Check if schema is already initialized for this module
    let schemaInitialized = false;
    try {
      const dbResult = await DatabaseService.query(
        `SELECT schema_initialized FROM ${schema}.system_modules WHERE module_id = $1`,
        [id]
      );
      if (dbResult.rows.length > 0) {
        schemaInitialized = dbResult.rows[0].schema_initialized === true;
      }
    } catch { /* DB may not be available */ }

    return res.json({
      success: true,
      data: {
        hasSchema: true,
        schemaInitialized,
        moduleId: schemaDef._meta?.moduleId || id,
        version: schemaDef._meta?.version || '1.0.0',
        description: schemaDef._meta?.description || '',
        tableCount: tables.length,
        tables,
        hasSeedData,
        seedTables,
      },
    });
  } catch (err) {
    logger.error(`[${requestId}] Modules:GET /${id}/schema — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: `Failed to read module schema: ${err.message}`, requestId },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /modules/:id/schema — Create module database tables from Schema.json
// Reads the module's Schema.json, creates tables + indexes in a transaction,
// seeds default data if defined, and sets schema_initialized = true.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/schema', authenticate, async (req, res) => {
  const requestId = req.requestId;
  const { id } = req.params;
  logger.info(`[${requestId}] Modules:POST /${id}/schema — provisioning module DB tables`);

  try {
    // Ensure module has a row in system_modules (may not exist yet during install flow).
    // If the module isn't registered yet, read metadata from constants.json and pre-register.
    const existing = await DatabaseService.query(
      `SELECT module_id, schema_initialized FROM ${schema}.system_modules WHERE module_id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      // Read module metadata from dist-modules/<id>/constants.json
      const available = ModuleScanner.scan();
      const moduleMeta = available.find(m => m.id === id);
      if (!moduleMeta) {
        return res.status(404).json({
          success: false,
          error: { message: 'Module not found in dist-modules/.', requestId },
        });
      }
      // Pre-register with full metadata so schema_initialized can be tracked
      await DatabaseService.query(`
        INSERT INTO ${schema}.system_modules
          (module_id, name, short_name, version, description, roles, is_core, "order",
           has_manifest, has_api, installed, enabled, schema_initialized, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, false, false, NOW())
        ON CONFLICT (module_id) DO NOTHING
      `, [
        id, moduleMeta.name, moduleMeta.shortName || '', moduleMeta.version,
        moduleMeta.description || '', JSON.stringify(moduleMeta.roles || []),
        moduleMeta.isCore || false, moduleMeta.order ?? 99,
        moduleMeta.hasManifest || false, moduleMeta.hasApi || false,
      ]);
      logger.info(`[${requestId}] Modules:POST /${id}/schema — pre-registered module in system_modules`);
    }

    // Find Schema.json
    const schemaPath = resolveModuleSchemaPath(id);
    if (!schemaPath) {
      return res.status(404).json({
        success: false,
        error: { message: 'Module has no database/Schema.json — no tables to create.', requestId },
      });
    }

    const schemaDef = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tableDefs = schemaDef.tables || [];

    if (tableDefs.length === 0) {
      return res.json({
        success: true,
        data: { tablesCreated: 0, indexesCreated: 0, seedRowsInserted: 0 },
        message: 'Schema.json has no table definitions.',
      });
    }

    // Create tables in a transaction (same DDL builder as databaseService.createSchema)
    const client = await DatabaseService.getPool().connect();
    let tablesCreated = 0;
    let indexesCreated = 0;
    let seedRowsInserted = 0;

    try {
      await client.query('BEGIN');

      for (const tableDef of tableDefs) {
        const tableName = tableDef.name;
        const columns = tableDef.columns || [];
        const compositePK = tableDef.primaryKey;

        // Build column definitions
        const colDefs = columns.map(col => {
          let colType = col.type;
          if (colType.includes('pulseops.')) {
            colType = colType.replace(/pulseops\./g, `${schema}.`);
          }
          return `${col.name} ${colType}`;
        });

        if (compositePK && compositePK.length > 0) {
          colDefs.push(`PRIMARY KEY (${compositePK.join(', ')})`);
        }

        const createSQL = `CREATE TABLE IF NOT EXISTS ${schema}.${tableName} (\n  ${colDefs.join(',\n  ')}\n)`;
        await client.query(createSQL);
        tablesCreated++;
        logger.info(`[${requestId}] Modules:POST /${id}/schema — table created: ${schema}.${tableName} (${columns.length} cols)`);

        // Create indexes
        const indexes = tableDef.indexes || [];
        for (const idx of indexes) {
          const idxCols = idx.columns.join(', ');
          const uniqueStr = idx.unique ? 'UNIQUE ' : '';
          await client.query(`CREATE ${uniqueStr}INDEX IF NOT EXISTS ${idx.name} ON ${schema}.${tableName}(${idxCols})`);
          indexesCreated++;
        }
      }

      // Seed default data if defined
      const seedData = schemaDef.seedData || {};
      for (const [tableName, rows] of Object.entries(seedData)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        for (const row of rows) {
          const cols = Object.keys(row);
          const vals = Object.values(row);
          const placeholders = cols.map((_, i) => `$${i + 1}`);
          const insertSQL = `INSERT INTO ${schema}.${tableName} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`;
          const result = await client.query(insertSQL, vals);
          seedRowsInserted += result.rowCount || 0;
        }
        logger.info(`[${requestId}] Modules:POST /${id}/schema — seeded ${rows.length} row(s) into ${schema}.${tableName}`);
      }

      // Mark module as schema_initialized
      await client.query(
        `UPDATE ${schema}.system_modules SET schema_initialized = true, updated_at = NOW() WHERE module_id = $1`,
        [id]
      );

      await client.query('COMMIT');

      logger.info(`[${requestId}] Modules:POST /${id}/schema — complete: ${tablesCreated} tables, ${indexesCreated} indexes, ${seedRowsInserted} seed rows`);
      return res.json({
        success: true,
        data: { tablesCreated, indexesCreated, seedRowsInserted },
        message: `Module schema created: ${tablesCreated} table(s), ${indexesCreated} index(es), ${seedRowsInserted} seed row(s).`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`[${requestId}] Modules:POST /${id}/schema — DDL failed`, { error: err.message });
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(`[${requestId}] Modules:POST /${id}/schema — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: `Schema provisioning failed: ${err.message}`, requestId },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /modules/:id/schema — Drop module database tables
// Removes all tables defined in the module's Schema.json and resets schema_initialized.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id/schema', authenticate, async (req, res) => {
  const requestId = req.requestId;
  const { id } = req.params;
  logger.info(`[${requestId}] Modules:DELETE /${id}/schema — dropping module DB tables`);

  try {
    // Validate module exists in DB
    const existing = await DatabaseService.query(
      `SELECT module_id, installed, schema_initialized FROM ${schema}.system_modules WHERE module_id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Module not found in system_modules.', requestId },
      });
    }

    // Find Schema.json
    const schemaPath = resolveModuleSchemaPath(id);
    if (!schemaPath) {
      // No schema to delete — just reset the flag
      await DatabaseService.query(
        `UPDATE ${schema}.system_modules SET schema_initialized = false, updated_at = NOW() WHERE module_id = $1`,
        [id]
      );
      return res.json({
        success: true,
        data: { tablesDropped: 0 },
        message: 'Module has no schema — schema_initialized flag reset.',
      });
    }

    const schemaDef = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tableDefs = schemaDef.tables || [];

    if (tableDefs.length === 0) {
      return res.json({
        success: true,
        data: { tablesDropped: 0 },
        message: 'Schema.json has no table definitions.',
      });
    }

    // Drop tables in a transaction
    const client = await DatabaseService.getPool().connect();
    let tablesDropped = 0;

    try {
      await client.query('BEGIN');

      // Drop tables in reverse order (to handle foreign keys)
      for (let i = tableDefs.length - 1; i >= 0; i--) {
        const tableName = tableDefs[i].name;
        await client.query(`DROP TABLE IF EXISTS ${schema}.${tableName} CASCADE`);
        tablesDropped++;
        logger.info(`[${requestId}] Modules:DELETE /${id}/schema — table dropped: ${schema}.${tableName}`);
      }

      // Reset schema_initialized flag
      await client.query(
        `UPDATE ${schema}.system_modules SET schema_initialized = false, updated_at = NOW() WHERE module_id = $1`,
        [id]
      );

      await client.query('COMMIT');

      logger.info(`[${requestId}] Modules:DELETE /${id}/schema — complete: ${tablesDropped} table(s) dropped`);
      return res.json({
        success: true,
        data: { tablesDropped },
        message: `Module schema deleted: ${tablesDropped} table(s) dropped.`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`[${requestId}] Modules:DELETE /${id}/schema — DDL failed`, { error: err.message });
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(`[${requestId}] Modules:DELETE /${id}/schema — failed`, { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: `Schema deletion failed: ${err.message}`, requestId },
    });
  }
});

export default router;
