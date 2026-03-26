// ============================================================================
// Google GKE Module — API Entry Point (Dynamic Route Loader Compatible)
//
// PURPOSE: This is the API entry point for the Google GKE module. It is loaded
// dynamically by dynamicRouteLoader.js when the module is enabled via the
// Module Manager UI. Exports the Express router and optional lifecycle hooks.
//
// ═══════════════════════════════════════════════════════════════════════════════
// HOW THIS FILE IS LOADED (Understanding the Module Loading Pipeline):
// ═══════════════════════════════════════════════════════════════════════════════
//
//   1. Admin enables the module via Module Manager UI
//      → POST /api/modules/google_gke/enable
//
//   2. Core platform's moduleManager.js updates module status in DB
//      → Sets google_gke.enabled = true
//
//   3. Core platform's dynamicRouteLoader.js detects the change
//      → Dynamically imports this file: import('#modules/google_gke/api/index.js')
//
//   4. This file's default export (Express Router) is mounted at:
//      → /api/google_gke/*
//      → All routes defined in sub-routers are now accessible
//
//   5. dynamicRouteLoader.js also calls onEnable() lifecycle hook
//      → This starts the background poller if config has it enabled
//
//   6. When module is disabled:
//      → onDisable() is called → stops the poller
//      → Router is unmounted → API endpoints return 404
//
// ═══════════════════════════════════════════════════════════════════════════════
// ARCHITECTURE:
// ═══════════════════════════════════════════════════════════════════════════════
//
//   - Thin orchestrator — imports and mounts domain-specific sub-routers
//   - Router is mounted at /api/google_gke by the dynamic route loader
//   - All routes require JWT authentication (applied by dynamicRouteLoader)
//   - Each sub-router owns a specific domain of endpoints
//
// SUB-ROUTERS:
//   - configRoutes.js      → Cluster config, poller config, general, alerts
//   - workloadRoutes.js    → GKE workloads (deployments, statefulsets, pods)
//   - dataflowRoutes.js    → Dataflow job monitoring
//   - cronjobRoutes.js     → Kubernetes CronJob monitoring
//   - pubsubRoutes.js      → Google Pub/Sub monitoring
//   - emailRoutes.js       → Email delivery monitoring
//   - logsRoutes.js        → Log-based monitoring (search, stream, alerts)
//   - reportRoutes.js      → Dashboard, reports, alerts
//   - dataRoutes.js        → Schema info, default data, reset
//
// LIFECYCLE HOOKS:
//   - onEnable()  → Start cluster poller if config has it enabled
//   - onDisable() → Stop cluster poller, cleanup resources
//
// EXPORTS:
//   - default: Express Router
//   - router:  Express Router (alias)
//   - onEnable:  async () => void
//   - onDisable: async () => void
//
// PATTERN SOURCE: Identical to HealthCheck module's api/index.js
// ============================================================================
import { Router } from 'express';
import { MODULE_ID } from './routes/helpers.js';
// TODO: Uncomment when ClusterPollerService is implemented:
// import { startIfEnabled, stop as stopPoller } from '#modules/google_gke/api/services/ClusterPollerService.js';
import configRoutes    from './routes/configRoutes.js';
import workloadRoutes  from './routes/workloadRoutes.js';
import dataflowRoutes  from './routes/dataflowRoutes.js';
import cronjobRoutes   from './routes/cronjobRoutes.js';
import pubsubRoutes    from './routes/pubsubRoutes.js';
import emailRoutes     from './routes/emailRoutes.js';
import logsRoutes      from './routes/logsRoutes.js';
import reportRoutes    from './routes/reportRoutes.js';
import dataRoutes      from './routes/dataRoutes.js';

const router = Router();

// ── GET /status — Module health check ─────────────────────────────────────────
// Every module must expose a /status endpoint. The Module Manager UI calls this
// to verify the module's API is running and responsive.
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', module: MODULE_ID, message: 'Google GKE module API is running.' },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOUNT SUB-ROUTERS — each file owns a domain of endpoints
// ═══════════════════════════════════════════════════════════════════════════════
//
// When a request comes in at /api/google_gke/workloads, Express matches:
//   1. /api/google_gke → module mount point (by dynamicRouteLoader)
//   2. /workloads      → matched by workloadRoutes sub-router
//
// All sub-routers are mounted at '/' because their internal route paths
// already include the full path (e.g., '/workloads', '/config/cluster').
router.use('/', configRoutes);    // /config/cluster, /config/poller, /config/general, /config/alerts
router.use('/', workloadRoutes);  // /workloads, /workloads/:id, /namespaces
router.use('/', dataflowRoutes);  // /dataflow/jobs, /dataflow/jobs/:id
router.use('/', cronjobRoutes);   // /cronjobs, /cronjobs/:id
router.use('/', pubsubRoutes);    // /pubsub/topics, /pubsub/subscriptions
router.use('/', emailRoutes);     // /email/status, /email/history, /email/config
router.use('/', logsRoutes);      // /logs/search, /logs/stream, /logs/alerts
router.use('/', reportRoutes);    // /dashboard, /reports/*
router.use('/', dataRoutes);      // /schema/info, /data/defaults, /data/reset

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Called when the module is enabled via Module Manager.
 * Starts the background cluster poller if config has it enabled.
 *
 * LIFECYCLE:
 *   1. Module Manager UI → POST /api/modules/google_gke/enable
 *   2. Core platform updates DB → google_gke.enabled = true
 *   3. dynamicRouteLoader mounts this router
 *   4. dynamicRouteLoader calls this onEnable() function
 *   5. We start the background poller (if configured)
 */
export async function onEnable() {
  console.log(`[${MODULE_ID}] Module enabled`);
  // TODO: Uncomment when ClusterPollerService is implemented:
  // await startIfEnabled();
}

/**
 * Called when the module is disabled via Module Manager.
 * Stops the background cluster poller and cleans up resources.
 *
 * LIFECYCLE:
 *   1. Module Manager UI → POST /api/modules/google_gke/disable
 *   2. Core platform updates DB → google_gke.enabled = false
 *   3. dynamicRouteLoader calls this onDisable() function
 *   4. We stop the background poller
 *   5. dynamicRouteLoader unmounts this router
 */
export async function onDisable() {
  console.log(`[${MODULE_ID}] Module disabled`);
  // TODO: Uncomment when ClusterPollerService is implemented:
  // stopPoller();
}

export { router };
export default router;
