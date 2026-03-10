// ============================================================================
// Module API Template — PulseOps V3
//
// PURPOSE: Thin orchestrator for module API routes. This is the entry point
// loaded by dynamicRouteLoader.js when the module is enabled.
//
// ARCHITECTURE:
//   - This file imports and mounts domain-specific sub-routers from ./routes/
//   - Router is mounted on /api/<moduleId>/* via moduleGateway
//   - Lifecycle hooks (onEnable / onDisable) live here
//   - All business logic lives in ./routes/ sub-files
//
// SUB-ROUTERS (in api/routes/):
//   - dataRoutes.js   → Schema info, default data, reset (/schema/*, /data/*)
//   - helpers.js      → Shared utilities (DB resolver, constants)
//   - Add more route files as your module grows
//
// HOW TO CUSTOMISE:
//   1. Replace '_template' with your module ID in routes/helpers.js
//   2. Add new route files in routes/ and import+mount them below
//   3. Modify onEnable / onDisable for any startup / teardown logic
// ============================================================================

import { Router } from 'express';
import { MODULE_ID } from './routes/helpers.js';
import dataRoutes from './routes/dataRoutes.js';

const router = Router();

// ═════════════════════════════════════════════════════════════════════════════
// STANDARD ROUTES  (status, config)
// These are simple starter routes. Customise or remove as needed.
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /status — Health check ──────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', module: MODULE_ID, message: 'Module API is running.' },
  });
});

// ── GET /config — Return current module config ──────────────────────────────
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: { configured: false, message: 'Module configuration endpoint — customise this.' },
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MOUNT SUB-ROUTERS — each file owns a domain of endpoints
// ═════════════════════════════════════════════════════════════════════════════
router.use('/', dataRoutes);   // /schema/info, /data/defaults, /data/demo, /data/reset

// Add your own route files here:
// import customRoutes from './routes/customRoutes.js';
// router.use('/', customRoutes);


// ═════════════════════════════════════════════════════════════════════════════
// LIFECYCLE HOOKS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Called when the module is enabled via Module Manager.
 * Use this to initialise connections, start timers, pre-load caches, etc.
 */
export async function onEnable() {
  console.log(`[${MODULE_ID}] Module enabled`);
}

/**
 * Called when the module is disabled via Module Manager.
 * Use this to clean up connections, stop timers, release resources, etc.
 */
export async function onDisable() {
  console.log(`[${MODULE_ID}] Module disabled`);
}

export default router;
