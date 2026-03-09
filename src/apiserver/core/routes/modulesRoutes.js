// ============================================================================
// Modules Routes — PulseOps V2 API
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
//   POST   /api/modules/:id/install          → Register module in config (JWT)
//   POST   /api/modules/:id/enable           → Enable + load API routes (JWT)
//   POST   /api/modules/:id/disable          → Disable + unload API routes (JWT)
//   DELETE /api/modules/:id                  → Remove module entirely (JWT)
//   GET    /api/modules/:id/status           → Module status detail (JWT)
//   GET    /api/modules/bundle/:id/manifest.js → Serve UI bundle (PUBLIC)
//   GET    /api/modules/bundle/:id/:file     → Serve module assets (PUBLIC)
//
// ARCHITECTURE:
//   - Module state persisted in api/src/config/ModulesConfig.json (K8s safe)
//   - Hot-drop bundles live in dist-modules/<id>/
//   - Dynamic API route loading via dynamicRouteLoader.js (zero restart)
//   - No database dependency — works in full-offline / DB-not-configured mode
//
// KUBERNETES COMPATIBILITY:
//   - ModulesConfig.json is the source of truth (mount as PV/ConfigMap)
//   - rehydrateEnabledModules() re-loads routes on pod restart
//   - No in-memory-only state survives between requests
//
// DEPENDENCIES:
//   - #shared/loadJson.js                 → loadJson, saveJson
//   - #shared/logger.js                   → Winston logger
//   - #core/middleware/auth.js            → authenticate
//   - #core/modules/moduleScanner.js      → Module discovery
//   - #core/modules/dynamicRouteLoader.js → Dynamic route loading
// ============================================================================

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticate } from '#core/middleware/auth.js';
import { logger } from '#shared/logger.js';
import { loadJson, saveJson, errors, messages } from '#shared/loadJson.js';
import ModuleScanner from '#core/modules/moduleScanner.js';
import { loadModuleRoutes, unloadModuleRoutes, isModuleLoaded } from '#core/modules/dynamicRouteLoader.js';

const router = Router();
const MODULES_CONFIG = 'ModulesConfig.json';

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
router.get('/', (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] Modules:GET / — listing installed modules`);
  try {
    const config = loadJson(MODULES_CONFIG);
    const modules = (config.modules || []).map(m => ({
      id:               m.id,
      name:             m.name,
      shortName:        m.shortName || '',
      version:          m.version,
      description:      m.description || '',
      enabled:          m.enabled === true,
      installed:        m.installed === true,
      hasApi:           m.hasApi || false,
      hasManifest:      m.hasManifest || false,
      isCore:           m.isCore || false,
      order:            m.order ?? 99,
      installedAt:      m.installedAt,
      apiRoutesLoaded:  isModuleLoaded(m.id),
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
router.get('/available', authenticate, (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] Modules:GET /available — scanning hot-drop folder`);
  try {
    const hotDropModules = ModuleScanner.scan();

    // Merge with installed state from ModulesConfig
    const config = loadJson(MODULES_CONFIG);
    const installedMap = new Map((config.modules || []).map(m => [m.id, m]));

    const result = hotDropModules.map(m => ({
      ...m,
      installed:   installedMap.has(m.id) && installedMap.get(m.id).installed === true,
      enabled:     installedMap.has(m.id) && installedMap.get(m.id).enabled === true,
      installedAt: installedMap.get(m.id)?.installedAt || null,
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
// POST /modules/:id/install — Register a module from dist-modules/ into config
// Reads metadata from dist-modules/<id>/constants.json and creates a record
// in ModulesConfig.json. Module is installed but NOT enabled (user must enable).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/install', authenticate, (req, res) => {
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

    // Check if already installed
    const config = loadJson(MODULES_CONFIG);
    const existing = (config.modules || []).find(m => m.id === id);
    if (existing && existing.installed) {
      logger.warn(`[${requestId}] Modules:POST /${id}/install — already installed`);
      return res.status(409).json({
        success: false,
        error: { message: errors.errors.moduleAlreadyInstalled, requestId },
      });
    }

    // Register in config
    if (!config.modules) config.modules = [];
    if (existing) {
      // Update existing entry (was previously removed/partial)
      Object.assign(existing, {
        name:        moduleMeta.name,
        shortName:   moduleMeta.shortName,
        version:     moduleMeta.version,
        description: moduleMeta.description,
        roles:       moduleMeta.roles,
        isCore:      moduleMeta.isCore,
        order:       moduleMeta.order,
        hasManifest: moduleMeta.hasManifest,
        hasApi:      moduleMeta.hasApi,
        installed:   true,
        enabled:     false,
        installedAt: new Date().toISOString(),
      });
    } else {
      config.modules.push({
        id,
        name:        moduleMeta.name,
        shortName:   moduleMeta.shortName,
        version:     moduleMeta.version,
        description: moduleMeta.description,
        roles:       moduleMeta.roles,
        isCore:      moduleMeta.isCore,
        order:       moduleMeta.order,
        hasManifest: moduleMeta.hasManifest,
        hasApi:      moduleMeta.hasApi,
        installed:   true,
        enabled:     false,
        installedAt: new Date().toISOString(),
      });
    }

    saveJson(MODULES_CONFIG, config);
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
    const config = loadJson(MODULES_CONFIG);
    const existing = (config.modules || []).find(m => m.id === id);

    if (!existing || !existing.installed) {
      return res.status(400).json({
        success: false,
        error: { message: 'Module must be installed before enabling.', requestId },
      });
    }

    if (existing.isCore) {
      return res.status(400).json({
        success: false,
        error: { message: errors.errors.coreModuleCannotDisable, requestId },
      });
    }

    // Dynamically load API routes (zero restart)
    const app = getApp(req);
    const loadResult = await loadModuleRoutes(app, id);
    logger.info(`[${requestId}] Modules:POST /${id}/enable — route load: ${loadResult.message}`);

    // Update config
    existing.enabled = true;
    existing.enabledAt = new Date().toISOString();
    saveJson(MODULES_CONFIG, config);

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
    const config = loadJson(MODULES_CONFIG);
    const existing = (config.modules || []).find(m => m.id === id);

    if (existing?.isCore) {
      return res.status(400).json({
        success: false,
        error: { message: errors.errors.coreModuleCannotDisable, requestId },
      });
    }

    // Unload API routes
    const unloadResult = await unloadModuleRoutes(id);
    logger.info(`[${requestId}] Modules:POST /${id}/disable — unload: ${unloadResult.message}`);

    // Update config
    if (existing) {
      existing.enabled = false;
      existing.disabledAt = new Date().toISOString();
      saveJson(MODULES_CONFIG, config);
    }

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
// DELETE /modules/:id — Remove a module from config entirely
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  const requestId = req.requestId;
  const { id } = req.params;
  logger.info(`[${requestId}] Modules:DELETE /${id} — user ${req.user?.userId}`);

  try {
    const config = loadJson(MODULES_CONFIG);
    const existing = (config.modules || []).find(m => m.id === id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { message: errors.errors.moduleNotFound, requestId },
      });
    }

    if (existing.isCore) {
      return res.status(400).json({
        success: false,
        error: { message: errors.errors.coreModuleCannotRemove, requestId },
      });
    }

    // Unload routes if loaded
    await unloadModuleRoutes(id);

    // Remove from config
    config.modules = config.modules.filter(m => m.id !== id);
    saveJson(MODULES_CONFIG, config);

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
router.get('/:id/status', authenticate, (req, res) => {
  const requestId = req.requestId;
  const { id } = req.params;
  logger.debug(`[${requestId}] Modules:GET /${id}/status`);

  try {
    const config = loadJson(MODULES_CONFIG);
    const mod = (config.modules || []).find(m => m.id === id);

    if (!mod) {
      return res.status(404).json({
        success: false,
        error: { message: errors.errors.moduleNotFound, requestId },
      });
    }

    return res.json({
      success: true,
      data: {
        ...mod,
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

export default router;
