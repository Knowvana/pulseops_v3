// ============================================================================
// HealthCheck Module — API Entry Point (Dynamic Route Loader Compatible)
//
// PURPOSE: This is the API entry point for the HealthCheck module. It is loaded
// dynamically by dynamicRouteLoader.js when the module is enabled via the
// Module Manager UI. Exports the Express router and optional lifecycle hooks.
//
// ARCHITECTURE:
//   - Thin orchestrator — imports and mounts domain-specific sub-routers
//   - Router is mounted at /api/healthcheck by the dynamic route loader
//   - All routes require JWT authentication (applied by dynamicRouteLoader)
//
// SUB-ROUTERS:
//   - configRoutes.js  → Poller config, general settings, downtime source config
//   - appRoutes.js     → Application CRUD, category CRUD
//   - pollerRoutes.js  → Start/stop/poll-now/status
//   - reportRoutes.js  → Dashboard, uptime report, downtime, poll verification, SLA, planned downtime
//   - dataRoutes.js    → Schema info, default data, reset
//
// LIFECYCLE HOOKS:
//   - onEnable()  → Start poller if enabled in config
//   - onDisable() → Stop poller
//
// EXPORTS:
//   - default: Express Router
//   - router:  Express Router (alias)
//   - onEnable:  async () => void
//   - onDisable: async () => void
// ============================================================================
import { Router } from 'express';
import { MODULE_ID } from '#modules/healthcheck/api/routes/helpers.js';
import { startIfEnabled, stop as stopPoller } from '#modules/healthcheck/api/services/PollerService.js';
import configRoutes  from '#modules/healthcheck/api/routes/configRoutes.js';
import appRoutes     from '#modules/healthcheck/api/routes/appRoutes.js';
import pollerRoutes  from '#modules/healthcheck/api/routes/pollerRoutes.js';
import reportRoutes  from '#modules/healthcheck/api/routes/reportRoutes.js';
import dataRoutes    from '#modules/healthcheck/api/routes/dataRoutes.js';

const router = Router();

// ── GET /status — Health check ───────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', module: MODULE_ID, message: 'HealthCheck module API is running.' },
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MOUNT SUB-ROUTERS — each file owns a domain of endpoints
// ═════════════════════════════════════════════════════════════════════════════
router.use('/', configRoutes);   // /config/poller, /config/general, /config/downtime-source
router.use('/', appRoutes);      // /applications, /categories
router.use('/', pollerRoutes);   // /poller/*
router.use('/', reportRoutes);   // /dashboard, /reports/*, /sla, /planned-downtime
router.use('/', dataRoutes);     // /schema/info, /data/defaults, /data/reset

// ═════════════════════════════════════════════════════════════════════════════
// LIFECYCLE HOOKS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Called when the module is enabled via Module Manager.
 * Starts the background health poller if config has it enabled.
 */
export async function onEnable() {
  console.log(`[${MODULE_ID}] Module enabled`);
  await startIfEnabled();
}

/**
 * Called when the module is disabled via Module Manager.
 * Stops the background health poller.
 */
export async function onDisable() {
  console.log(`[${MODULE_ID}] Module disabled`);
  stopPoller();
}

export { router };
export default router;
