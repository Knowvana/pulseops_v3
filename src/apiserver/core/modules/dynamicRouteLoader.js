// ============================================================================
// Dynamic Route Loader — PulseOps V2 API
//
// PURPOSE: Loads and unloads module API routes at runtime without restarting
// the Express server. This is the backbone of zero-downtime API module
// deployment.
//
// ARCHITECTURE:
//   - Each module bundles an api/index.js that exports { router, onEnable, onDisable }
//   - When a module is enabled, its router is mounted on /api/<moduleId>
//   - When disabled, the router is unmounted
//   - Routes are loaded via dynamic import() from dist-modules/<id>/api/index.js
//   - On pod restart, all enabled modules are re-loaded from ModulesConfig.json
//
// KUBERNETES COMPATIBILITY:
//   - Module state is persisted in ModulesConfig.json (mounted as ConfigMap/PV)
//   - On startup, rehydrateEnabledModules() re-loads all previously enabled modules
//   - No in-memory-only state — everything survives pod restarts
//
// SECURITY:
//   - Only loads from dist-modules/ directory (path traversal safe)
//   - authenticate middleware is applied per-module router
//
// DEPENDENCIES:
//   - #shared/logger.js             → Winston logger
//   - #shared/loadJson.js           → loadJson, saveJson for ModulesConfig.json
//   - #core/middleware/auth.js       → authenticate middleware
//   - ./moduleScanner.js            → Module discovery
// ============================================================================
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { logger } from '#shared/logger.js';
import { loadJson, saveJson } from '#shared/loadJson.js';
import { authenticate } from '#core/middleware/auth.js';
import ModuleScanner from './moduleScanner.js';
import { addModuleRouter, removeModuleRouter } from './moduleGateway.js';

const MODULES_CONFIG = 'ModulesConfig.json';

// ── In-memory registry of loaded module routers ──────────────────────────────
// Maps moduleId → { router, mountPath, onDisable? }
// This is rebuilt on pod restart via rehydrateEnabledModules()
const _loadedModules = new Map();

/**
 * Load a module's API routes dynamically and mount them on the Express app.
 * Called when a module is enabled via POST /api/modules/:id/enable.
 *
 * @param {import('express').Express} app - Express application instance
 * @param {string} moduleId - Module identifier (e.g., 'servicenow')
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function loadModuleRoutes(app, moduleId) {
  // Already loaded? Skip.
  if (_loadedModules.has(moduleId)) {
    logger.info(`[DynamicRouteLoader] Module '${moduleId}' routes already loaded — skipping`);
    return { success: true, message: `Module '${moduleId}' routes already loaded.` };
  }

  const modulePath = ModuleScanner.getModulePath(moduleId);
  const apiIndexPath = path.join(modulePath, 'api', 'index.js');

  if (!fs.existsSync(apiIndexPath)) {
    // Module has no API component — UI-only module, that's fine
    logger.info(`[DynamicRouteLoader] Module '${moduleId}' has no API routes — UI-only module`);
    return { success: true, message: `Module '${moduleId}' is UI-only (no API routes).` };
  }

  try {
    // Convert to file:// URL for Windows compatibility + cache busting
    const fileUrl = pathToFileURL(apiIndexPath).href + `?t=${Date.now()}`;
    const moduleExports = await import(fileUrl);

    const router = moduleExports.default || moduleExports.router;
    if (!router) {
      logger.warn(`[DynamicRouteLoader] Module '${moduleId}' api/index.js has no default export or router`);
      return { success: false, message: `Module '${moduleId}' api/index.js has no router export.` };
    }

    // Register on the moduleGateway (middleware registered before 404 handler in app.js)
    // This ensures dynamically added routes are reachable.
    addModuleRouter(moduleId, authenticate, router);
    logger.info(`[DynamicRouteLoader] Registered '${moduleId}' on moduleGateway`);

    // Store reference for unloading
    _loadedModules.set(moduleId, {
      router,
      onDisable: moduleExports.onDisable || null,
      onEnable: moduleExports.onEnable || null,
    });

    // Call onEnable lifecycle hook if provided
    if (typeof moduleExports.onEnable === 'function') {
      try {
        await moduleExports.onEnable();
        logger.info(`[DynamicRouteLoader] Module '${moduleId}' onEnable hook executed`);
      } catch (hookErr) {
        logger.warn(`[DynamicRouteLoader] Module '${moduleId}' onEnable hook failed`, {
          error: hookErr.message,
        });
      }
    }

    logger.info(`[DynamicRouteLoader] Module '${moduleId}' API routes loaded on gateway`);
    return { success: true, message: `Module '${moduleId}' API routes loaded.` };
  } catch (err) {
    logger.error(`[DynamicRouteLoader] Failed to load module '${moduleId}' API routes`, {
      error: err.message,
      stack: err.stack,
    });
    return { success: false, message: `Failed to load '${moduleId}' API routes: ${err.message}` };
  }
}

/**
 * Unload a module's API routes. Calls onDisable lifecycle hook, then removes
 * the module router from the gateway so requests immediately 404.
 *
 * @param {string} moduleId - Module identifier
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function unloadModuleRoutes(moduleId) {
  const loaded = _loadedModules.get(moduleId);
  if (!loaded) {
    return { success: true, message: `Module '${moduleId}' was not loaded.` };
  }

  // Call onDisable lifecycle hook if provided
  if (typeof loaded.onDisable === 'function') {
    try {
      await loaded.onDisable();
      logger.info(`[DynamicRouteLoader] Module '${moduleId}' onDisable hook executed`);
    } catch (hookErr) {
      logger.warn(`[DynamicRouteLoader] Module '${moduleId}' onDisable hook failed`, {
        error: hookErr.message,
      });
    }
  }

  // Remove from gateway (requests will immediately 404)
  removeModuleRouter(moduleId);
  _loadedModules.delete(moduleId);
  logger.info(`[DynamicRouteLoader] Module '${moduleId}' routes unloaded from gateway`);
  return { success: true, message: `Module '${moduleId}' routes unloaded.` };
}

/**
 * Check if a module's routes are currently loaded.
 * @param {string} moduleId
 * @returns {boolean}
 */
export function isModuleLoaded(moduleId) {
  return _loadedModules.has(moduleId);
}

/**
 * Rehydrate all enabled modules on server startup.
 * Reads ModulesConfig.json and loads routes for each enabled module.
 * Called once from server.js or app.js after createApp().
 *
 * KUBERNETES: This ensures pod restarts re-load all enabled modules
 * without any manual intervention.
 *
 * @param {import('express').Express} app - Express application instance
 * @returns {Promise<void>}
 */
export async function rehydrateEnabledModules(app) {
  logger.info('[DynamicRouteLoader] Rehydrating enabled modules on startup...');

  try {
    const config = loadJson(MODULES_CONFIG);
    const enabledModules = (config.modules || []).filter(m => m.enabled && m.installed);

    if (enabledModules.length === 0) {
      logger.info('[DynamicRouteLoader] No enabled modules to rehydrate');
      return;
    }

    for (const mod of enabledModules) {
      // Only load if the module still exists in dist-modules/
      if (ModuleScanner.exists(mod.id)) {
        const result = await loadModuleRoutes(app, mod.id);
        logger.info(`[DynamicRouteLoader] Rehydrated '${mod.id}': ${result.message}`);
      } else {
        logger.warn(`[DynamicRouteLoader] Module '${mod.id}' is enabled but not found in dist-modules/`);
      }
    }

    logger.info(`[DynamicRouteLoader] Rehydration complete — ${enabledModules.length} module(s) processed`);
  } catch (err) {
    logger.error('[DynamicRouteLoader] Failed to rehydrate modules', { error: err.message });
  }
}

/**
 * Get list of all currently loaded module IDs.
 * @returns {string[]}
 */
export function getLoadedModuleIds() {
  return Array.from(_loadedModules.keys());
}
