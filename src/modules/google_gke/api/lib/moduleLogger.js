// ============================================================================
// Google GKE Module — Module-Scoped Logger
//
// PURPOSE: Lightweight wrapper around the central PulseOps Winston logger that
// scopes all log entries to the "Google GKE" module. This file provides:
//
//   1. Module-scoped logging — every log entry includes moduleName="Google GKE"
//      and the fileName of the caller (e.g., "WorkloadService.js").
//
//   2. Automatic function name extraction — parses the V8 stack trace to
//      determine which function called the logger.
//
//   3. Module logging gate — checks isModuleLoggingEnabled('Google GKE') before
//      emitting any log. If the admin disables this module's logging in
//      Settings → Log Configuration → Module Logs, ALL log calls are suppressed.
//
//   4. DB persistence — writes log entries to the database via LogService so
//      they appear in the core Logs Viewer, not just the terminal.
//
// HOW IT WORKS:
//   - Imports the shared createModuleLogger() from the HealthCheck module's
//     moduleLogger.js (which is the generic implementation).
//   - Creates a convenience wrapper createGkeLogger() that pre-fills the
//     module name as 'Google GKE'.
//
// USAGE:
//   import { createGkeLogger } from '#modules/google_gke/api/lib/moduleLogger.js';
//
//   // Create a logger scoped to a specific file
//   const log = createGkeLogger('WorkloadService.js');
//
//   // Use the logger — levels: debug, info, warn, error
//   log.debug('Fetching workloads', { namespace: 'default' });
//   log.info('Workloads fetched', { count: 42 });
//   log.warn('Pod restarting', { podName: 'my-pod', restarts: 5 });
//   log.error('Failed to connect to cluster', { error: err.message });
//
// LOG OUTPUT FORMAT (in terminal):
//   [API][25 Mar 2026, 17:00:00][info][Google GKE][WorkloadService.js][fetchAll] Workloads fetched {"count":42}
//
// LOG OUTPUT (in Logs Viewer):
//   The same entry is persisted to the database and visible in the core admin
//   Logs Viewer with full metadata (module, file, function, timestamp, etc.).
//
// ARCHITECTURE:
//   - Does NOT modify the central logger
//   - Only gates on module enabled/disabled
//   - Uses the same pattern as HealthCheck's createHcLogger()
//
// PATTERN SOURCE: Identical to HealthCheck module's api/lib/moduleLogger.js
// ============================================================================

import { createModuleLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';

// ── Module name constant ─────────────────────────────────────────────────────
// This MUST match the module's display name used in the admin Module Manager.
// The core logging system uses this to check if logging is enabled for this module.
const MODULE_DISPLAY_NAME = 'Google GKE';

/**
 * Create a scoped logger for the Google GKE module.
 *
 * @param {string} component - The file or component name creating the logger.
 *                              Examples: 'WorkloadService.js', 'ClusterPollerService.js',
 *                              'configRoutes.js', 'Helpers'
 * @returns {{ debug: Function, info: Function, warn: Function, error: Function }}
 *          An object with four log methods, each accepting (message, metadata).
 *
 * @example
 *   const log = createGkeLogger('DataflowService.js');
 *   log.info('Job completed', { jobId: '12345', duration: '2m30s' });
 */
export function createGkeLogger(component) {
  return createModuleLogger(MODULE_DISPLAY_NAME, component);
}
