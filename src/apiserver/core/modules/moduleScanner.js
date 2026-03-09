// ============================================================================
// Module Scanner — PulseOps V2 API
//
// PURPOSE: Scans the hot-drop modules directory (dist-modules/) for available
// add-on modules. Each module folder must contain a constants.json with
// module metadata. Enables zero-redeployment module discovery.
//
// HOT-DROP FLOW:
//   1. Developer builds module: npm run build:module servicenow
//   2. Output goes to dist-modules/servicenow/ (constants.json + manifest.js + api/)
//   3. This scanner reads dist-modules/ and returns available modules
//   4. Module Manager UI shows them as "Available" for installation
//
// KUBERNETES COMPATIBILITY:
//   - Reads from filesystem on every scan (no in-memory cache between restarts)
//   - dist-modules/ should be mounted as a persistent volume or ConfigMap
//   - Pod restarts re-discover all deployed modules automatically
//
// DEPENDENCIES:
//   - fs, path                      → Filesystem scanning
//   - #shared/logger.js             → Winston logger
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '#shared/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// dist-modules/ lives at PROJECT ROOT (4 levels up from src/apiserver/core/modules/)
// With unified node_modules at root, Node resolves all packages from there.
// K8s: Override via MODULES_DIR env var for persistent volume mounts.
const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const DEFAULT_MODULES_DIR = path.resolve(PROJECT_ROOT, 'dist-modules');

/**
 * Get the resolved path to the dist-modules directory.
 * Supports override via MODULES_DIR environment variable for K8s volume mounts.
 * @returns {string} Absolute path to dist-modules/
 */
function getModulesDir() {
  return process.env.MODULES_DIR
    ? path.resolve(process.env.MODULES_DIR)
    : DEFAULT_MODULES_DIR;
}

const ModuleScanner = {
  /**
   * Scan the hot-drop directory for available modules.
   * Each subdirectory must contain a constants.json with module metadata.
   * @returns {Array<Object>} List of module metadata objects
   */
  scan() {
    const modulesDir = getModulesDir();
    const results = [];

    if (!fs.existsSync(modulesDir)) {
      logger.warn(`[ModuleScanner] Modules directory not found: ${modulesDir}`);
      return results;
    }

    const entries = fs.readdirSync(modulesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const constantsPath = path.join(modulesDir, entry.name, 'constants.json');
      const manifestPath = path.join(modulesDir, entry.name, 'manifest.js');
      const apiIndexPath = path.join(modulesDir, entry.name, 'api', 'index.js');
      const schemaPath   = path.join(modulesDir, entry.name, 'database', 'Schema.json');
      // Also check src/modules/ for dev mode (Schema.json may not be built yet)
      const srcSchemaPath = path.join(PROJECT_ROOT, 'src', 'modules', entry.name, 'database', 'Schema.json');

      // constants.json is required for discovery
      if (!fs.existsSync(constantsPath)) continue;

      try {
        const raw = fs.readFileSync(constantsPath, 'utf8');
        const constants = JSON.parse(raw);
        const hasSchema = fs.existsSync(schemaPath) || fs.existsSync(srcSchemaPath);

        results.push({
          id:          constants.id || entry.name,
          name:        constants.name || entry.name,
          shortName:   constants.shortName || '',
          version:     constants.version || '1.0.0',
          description: constants.description || '',
          roles:       constants.roles || [],
          isCore:      constants.isCore || false,
          order:       constants.order ?? 99,
          hasManifest: fs.existsSync(manifestPath),
          hasApi:      fs.existsSync(apiIndexPath),
          hasSchema,
          source:      'hot-drop',
        });

        logger.debug(`[ModuleScanner] Discovered module: ${entry.name}`, {
          version: constants.version,
          hasManifest: fs.existsSync(manifestPath),
          hasApi: fs.existsSync(apiIndexPath),
          hasSchema,
        });
      } catch (err) {
        logger.warn(`[ModuleScanner] Failed to read module constants: ${entry.name}`, {
          error: err.message,
        });
      }
    }

    return results.sort((a, b) => (a.order || 99) - (b.order || 99));
  },

  /**
   * Check if a specific module exists in the hot-drop directory.
   * @param {string} moduleId - Module identifier
   * @returns {boolean} True if module folder + constants.json exist
   */
  exists(moduleId) {
    const modulesDir = getModulesDir();
    const constantsPath = path.join(modulesDir, moduleId, 'constants.json');
    return fs.existsSync(constantsPath);
  },

  /**
   * Get the absolute path to a module's directory in dist-modules/.
   * @param {string} moduleId - Module identifier
   * @returns {string} Absolute path to dist-modules/<moduleId>/
   */
  getModulePath(moduleId) {
    return path.join(getModulesDir(), moduleId);
  },

  /**
   * Get the absolute path to the dist-modules directory.
   * @returns {string}
   */
  getModulesDir,
};

export default ModuleScanner;
