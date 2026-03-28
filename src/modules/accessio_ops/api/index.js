// ============================================================================
// Accessio Operations Module — API Entry Point (Dynamic Route Loader Compatible)
//
// PURPOSE: This is the API entry point for the Accessio Operations module. It is
// loaded dynamically by dynamicRouteLoader.js when the module is enabled via the
// Module Manager UI. Exports the Express router and optional lifecycle hooks.
//
// ARCHITECTURE:
//   - Thin orchestrator — imports and mounts domain-specific sub-routers
//   - Router is mounted at /api/accessio_ops by the dynamic route loader
//   - All routes require JWT authentication (applied by dynamicRouteLoader)
//
// SUB-ROUTERS:
//   - moduleconfigRoutes.js  → Module configuration management (REST endpoints)
//   - dataRoutes.js          → Schema info, default data, reset
//   - clusterRoutes.js       → Cluster configuration and testing
//
// LIFECYCLE HOOKS:
//   - onEnable()  → Module enabled — placeholder for future startup logic
//   - onDisable() → Module disabled — placeholder for future cleanup logic
//
// EXPORTS:
//   - default: Express Router
//   - router:  Express Router (alias)
//   - onEnable:  async () => void
//   - onDisable: async () => void
// ============================================================================
import express from 'express';
import { createAoLogger } from './lib/moduleLogger.js';
import moduleconfigRoutes from './routes/moduleconfigRoutes.js';
import dataRoutes from './routes/dataRoutes.js';
import clusterRoutes from './routes/clusterRoutes.js';

const log = createAoLogger('index.js');
const router = express.Router();

// ── GET /status — Health check ───────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', module: 'accessio_ops', message: 'Accessio Operations module API is running.' },
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MOUNT SUB-ROUTERS — each file owns a domain of endpoints
// ═════════════════════════════════════════════════════════════════════════════
router.use('/', moduleconfigRoutes);  // /config/files endpoints
router.use('/', dataRoutes);     // /schema/info, /data/defaults, /data/reset
router.use('/', clusterRoutes);  // /cluster/config, /cluster/test

// ═════════════════════════════════════════════════════════════════════════════
// LIFECYCLE HOOKS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Called when the module is enabled via Module Manager.
 * Placeholder — add startup logic as features are built.
 */
export async function onEnable() {
  console.log('[accessio_ops] Module enabled');
}

/**
 * Called when the module is disabled via Module Manager.
 * Placeholder — add cleanup logic as features are built.
 */
export async function onDisable() {
  console.log('[accessio_ops] Module disabled');
}

export { router };
export default router;
