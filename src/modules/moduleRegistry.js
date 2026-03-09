// ============================================================================
// Module Registry — PulseOps V2 (Dynamic Plug-and-Play)
//
// PURPOSE: Central registry that discovers and exposes module manifests.
// Supports BOTH static (core) and dynamic (add-on) module loading.
//
// ZERO-DOWNTIME ARCHITECTURE:
//   1. NO core modules are statically imported — Admin is a core SYSTEM
//      feature, not a module. Only dynamic add-on modules live here.
//   2. ADD-ON modules are discovered from the database at runtime. Their
//      manifests are loaded via dynamic import() — NO rebuild needed.
//   3. PlatformDashboard calls getAllManifests() to get enabled add-on
//      modules for the top nav tabs (after the core Admin tab).
//
// ADDING A NEW MODULE (zero downtime, zero code changes):
//   1. Place module folder under modules/<name>/ with manifest.jsx
//   2. Register it in the database via Module Manager UI
//   3. Platform discovers and loads it via dynamic import()
//   4. No rebuild. No restart. No downtime.
//
// MODULE CONTRACT: Every module must export a manifest object with:
//   REQUIRED: id, name, version, description, icon, defaultView,
//             navItems, getViews
//   OPTIONAL: roles, order, isCore, getConfigTabs, getSettingsTabs,
//             ViewWrapper
//
// DEPENDENCIES:
//   - @config/urls.json → API endpoints for module bundles
// ============================================================================
import urls from '@config/urls.json';
import { createLogger } from '@shared/services/consoleLogger';

const log = createLogger('moduleRegistry.js');

// ─── Dynamic manifest store (populated at runtime from DB) ──────────────────
let _dynamicManifests = [];

// ─── Dynamic import map (runtime-extensible) ────────────────────────────────
const MODULE_IMPORT_MAP = {};

// ─── Environment detection ──────────────────────────────────────────────────
const IS_DEV = import.meta.env.DEV;

/**
 * Build the import URL for a module manifest.
 *
 * DEV MODE:  Returns a Vite-resolvable source path that Vite's dev server
 *            transforms on-the-fly (resolves React, lucide-react, aliases).
 *            e.g. /src/modules/servicenow/manifest.jsx
 *
 * PROD MODE: Returns the pre-built bundle URL served by the API.
 *            e.g. /api/modules/bundle/servicenow/manifest.js?v=1.0.0
 *
 * @param {string} moduleId
 * @param {string} [version] - Module version for cache key (prod only)
 * @returns {string}
 */
function getManifestUrl(moduleId, version) {
  if (IS_DEV) {
    // Vite dev server resolves source files with full alias + HMR support
    return `/src/modules/${moduleId}/ui/manifest.jsx`;
  }
  // Production: pre-built bundle served by API
  const bundleBase = urls.modules?.bundle || '/api/modules/bundle';
  const cacheBuster = version || Date.now();
  return `${bundleBase}/${moduleId}/manifest.js?v=${cacheBuster}`;
}

/**
 * Register a module import path at runtime (zero-downtime module addition).
 * @param {string} moduleId - Module identifier
 * @param {Function} importFn - Function returning import() promise
 */
export function registerModulePath(moduleId, importFn) {
  if (!moduleId || typeof importFn !== 'function') return;
  MODULE_IMPORT_MAP[moduleId] = importFn;
}

/**
 * Register a dynamic manifest at runtime (called by Module Manager).
 * @param {Object} manifest - Module manifest object following the contract
 */
export function registerDynamicManifest(manifest) {
  if (!manifest?.id) return;
  _dynamicManifests = _dynamicManifests.filter(m => m.id !== manifest.id);
  _dynamicManifests.push(manifest);
}

/**
 * Dynamically load a module's manifest by its ID.
 * LOADING ORDER:
 *   1. Check if already loaded (cached dynamic manifest)
 *   2. Check MODULE_IMPORT_MAP (registered hot-drop paths)
 *   3. Load via getManifestUrl (dev: Vite source, prod: API bundle)
 *
 * @param {string} moduleId - Module to load
 * @returns {Promise<Object|null>} Loaded manifest or null
 */
export async function loadModuleManifest(moduleId) {
  const existing = _dynamicManifests.find(m => m.id === moduleId);
  if (existing) return existing;

  const registeredFn = MODULE_IMPORT_MAP[moduleId];
  if (registeredFn) {
    try {
      const mod = await registeredFn();
      const manifest = mod.default || mod;
      if (manifest?.id) {
        registerDynamicManifest(manifest);
        return manifest;
      }
    } catch (err) {
      log.warn('loadManifest', `Failed to load registered manifest for '${moduleId}'`, { message: err.message });
    }
  }

  try {
    const manifestUrl = getManifestUrl(moduleId);
    log.info('loadManifest', `Loading '${moduleId}' from ${manifestUrl}`);
    const mod = await import(/* @vite-ignore */ manifestUrl);
    const manifest = mod.default || mod;
    if (manifest?.id) {
      // Cache a factory for future loads (with cache-busting in prod)
      MODULE_IMPORT_MAP[moduleId] = () => import(/* @vite-ignore */ getManifestUrl(moduleId, manifest.version));
      registerDynamicManifest(manifest);
      return manifest;
    }
  } catch (err) {
    log.error('loadManifest', `Failed to load manifest for '${moduleId}'`, { message: err.message });
  }

  return null;
}

/**
 * Load multiple module manifests by their IDs (parallel).
 * @param {string[]} moduleIds - Array of module IDs to load
 * @returns {Promise<Object[]>} Array of loaded manifests
 */
export async function loadModuleManifests(moduleIds) {
  const results = await Promise.allSettled(
    moduleIds.map(id => loadModuleManifest(id))
  );
  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}

/**
 * Remove a dynamic manifest (called when a module is uninstalled).
 * @param {string} moduleId - Module ID to remove
 */
export function unregisterDynamicManifest(moduleId) {
  _dynamicManifests = _dynamicManifests.filter(m => m.id !== moduleId);
}

/**
 * Get all dynamic manifests, sorted by order.
 * @returns {Array} All add-on module manifests
 */
export function getAllManifests() {
  return [..._dynamicManifests].sort((a, b) => (a.order || 99) - (b.order || 99));
}

/**
 * Get a specific dynamic module manifest by ID.
 * @param {string} moduleId - Module identifier
 * @returns {Object|null} Manifest or null
 */
export function getManifestById(moduleId) {
  return _dynamicManifests.find(m => m.id === moduleId) || null;
}

/**
 * Validate a manifest against the module contract.
 * @param {Object} manifest - Manifest to validate
 * @returns {Object} { valid, errors }
 */
export function validateManifest(manifest) {
  const required = ['id', 'name', 'version', 'description', 'icon', 'defaultView', 'navItems', 'getViews'];
  const errors = [];

  required.forEach(field => {
    if (!manifest?.[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  if (manifest?.navItems && !Array.isArray(manifest.navItems)) {
    errors.push('navItems must be an array');
  }

  if (manifest?.getViews && typeof manifest.getViews !== 'function') {
    errors.push('getViews must be a function');
  }

  if (Array.isArray(manifest?.navItems)) {
    const navIds = manifest.navItems.map(n => n.id);
    if (!navIds.includes('dashboard')) errors.push('navItems must include a "dashboard" item');
    if (!navIds.includes('config')) errors.push('navItems must include a "config" item');
  }

  return { valid: errors.length === 0, errors };
}

// ─── No hardcoded module registration ─────────────────────────────────────────
// Modules are discovered from dist-modules/ via the Module Manager UI.
// In both dev and production, the flow is identical:
//   1. Build: npm run build:module <name>
//   2. Deploy: dist-modules/<name>/ (constants.json + manifest.js + api/)
//   3. Discover: Module Manager UI → GET /api/modules/available
//   4. Install: POST /api/modules/<name>/install
//   5. Enable: POST /api/modules/<name>/enable
//   6. Load: PlatformDashboard fetches manifest from /api/modules/bundle/<name>/manifest.js
// Zero code changes. Zero restarts. Zero downtime.
