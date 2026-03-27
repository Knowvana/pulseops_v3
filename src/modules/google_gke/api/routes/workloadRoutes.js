// ============================================================================
// Google GKE Module — Workload Routes
//
// PURPOSE: Express routes for workload monitoring endpoints. Provides live
// cluster data from the Kubernetes API for the Dashboard and Workloads views.
//
// ENDPOINTS:
//   GET  /dashboard/summary                   → Full cluster dashboard summary
//   GET  /workloads                           → All workloads across namespaces
//   GET  /workloads/pods                      → All pods across namespaces
//   GET  /workloads/pods/:ns/:name/logs       → Pod logs with filter options
//   GET  /namespaces                          → All namespaces
//   GET  /config/refresh-interval             → Get current refresh interval
//   PUT  /config/refresh-interval             → Update refresh interval
//
// PATTERN SOURCE: Follows configRoutes.js pattern (ESM, relative imports)
// ============================================================================
import { Router } from 'express';
import { createGkeLogger } from '../lib/moduleLogger.js';
import { apiErrors, apiMessages } from '../config/index.js';
import { loadClusterConfigFile, DatabaseService, dbSchema } from './helpers.js';
import { getK8sCoreApi, getK8sAppsApi, getK8sBatchApi, getK8sClient } from '../lib/KubernetesClient.js';
import { isEncrypted, decryptToken } from '../lib/credentialEncryption.js';
import {
  getDashboardSummary, getAllPods, getAllWorkloads,
  getPodLogs, getNamespaces,
} from '../services/WorkloadService.js';
import { getCronjobDashboard } from '../services/CronjobService.js';

const log = createGkeLogger('workloadRoutes');
const router = Router();

// ─── Helper: ensure K8s client is initialized with decrypted token ─────────
function ensureK8sClient() {
  const cfg = loadClusterConfigFile();
  const conn = { ...cfg.connection };
  if (conn.serviceAccountToken && isEncrypted(conn.serviceAccountToken)) {
    conn.serviceAccountToken = decryptToken(conn.serviceAccountToken);
  }
  // Initialize cached client if not yet done (getK8sClient caches internally)
  getK8sClient(conn);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /dashboard/summary — Full cluster dashboard summary + alerts
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/dashboard/summary', async (req, res) => {
  try {
    log.debug('GET /dashboard/summary');
    ensureK8sClient();
    const coreApi = getK8sCoreApi();
    const appsApi = getK8sAppsApi();
    const batchApi = getK8sBatchApi();
    
    const [summary, cronjobData] = await Promise.all([
      getDashboardSummary(coreApi, appsApi),
      getCronjobDashboard(batchApi, coreApi).catch(err => {
        log.warn('Failed to fetch cronjob alerts', { error: err.message });
        return { alerts: [], cronjobs: [] };
      }),
    ]);
    
    // Combine pod/workload alerts from summary with cronjob alerts
    const podWorkloadAlerts = summary.alerts || [];
    const cronjobAlerts = cronjobData.alerts || [];
    const allAlerts = [...podWorkloadAlerts, ...cronjobAlerts];

    log.info('Dashboard summary assembled', {
      pods: summary.pods?.total,
      workloads: summary.workloads?.total,
      podWorkloadAlerts: podWorkloadAlerts.length,
      cronjobAlerts: cronjobAlerts.length,
      totalAlerts: allAlerts.length,
    });
    
    return res.json({ 
      success: true, 
      data: {
        ...summary,
        alerts: allAlerts,
        cronjobs: cronjobData,
      },
    });
  } catch (err) {
    log.error('Dashboard summary failed', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      error: { message: apiErrors.dashboard.summaryFailed.replace('{message}', err.message) },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /workloads — All workloads (Deployments, StatefulSets, DaemonSets)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/workloads', async (req, res) => {
  try {
    log.debug('GET /workloads');
    ensureK8sClient();
    const coreApi = getK8sCoreApi();
    const appsApi = getK8sAppsApi();
    const workloads = await getAllWorkloads(coreApi, appsApi);
    return res.json({ success: true, data: workloads });
  } catch (err) {
    log.error('Workloads fetch failed', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      error: { message: apiErrors.workloads.fetchFailed.replace('{message}', err.message) },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /workloads/pods — All pods across all namespaces with full detail
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/workloads/pods', async (req, res) => {
  try {
    log.debug('GET /workloads/pods');
    ensureK8sClient();
    const coreApi = getK8sCoreApi();
    const pods = await getAllPods(coreApi);
    return res.json({ success: true, data: pods });
  } catch (err) {
    log.error('Pods fetch failed', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      error: { message: apiErrors.workloads.podsFetchFailed.replace('{message}', err.message) },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /workloads/pods/:ns/:name/logs — Pod logs
// Query params: tailLines, sinceSeconds, container, previous
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/workloads/pods/:ns/:name/logs', async (req, res) => {
  try {
    const { ns, name } = req.params;
    const { tailLines, sinceSeconds, container, previous } = req.query;
    log.debug('GET pod logs', { ns, name, tailLines, container });
    ensureK8sClient();
    const coreApi = getK8sCoreApi();
    const logText = await getPodLogs(coreApi, ns, name, {
      tailLines: tailLines ? parseInt(tailLines, 10) : 500,
      sinceSeconds: sinceSeconds ? parseInt(sinceSeconds, 10) : undefined,
      container: container || undefined,
      previous: previous === 'true',
    });
    return res.json({ success: true, data: { logs: logText, podName: name, namespace: ns } });
  } catch (err) {
    log.error('Pod logs fetch failed', { error: err.message, ns: req.params.ns, name: req.params.name });
    return res.status(500).json({
      success: false,
      error: { message: apiErrors.workloads.logsFetchFailed.replace('{message}', err.message) },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /namespaces — List all namespaces in the cluster
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/namespaces', async (req, res) => {
  try {
    log.debug('GET /namespaces');
    ensureK8sClient();
    const coreApi = getK8sCoreApi();
    const namespaces = await getNamespaces(coreApi);
    return res.json({ success: true, data: namespaces });
  } catch (err) {
    log.error('Namespaces fetch failed', { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: apiErrors.workloads.namespacesFetchFailed.replace('{message}', err.message) },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /config/refresh-interval — Get current auto-refresh interval (seconds)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/config/refresh-interval', async (req, res) => {
  try {
    log.debug('GET /config/refresh-interval');
    const result = await DatabaseService.query(
      `SELECT config_value FROM ${dbSchema}.gke_module_config WHERE config_key = $1`,
      ['refresh_interval']
    );
    const interval = result.rows.length > 0
      ? parseInt(result.rows[0].config_value, 10)
      : 30;
    return res.json({ success: true, data: { refreshInterval: interval } });
  } catch (err) {
    log.warn('Could not load refresh interval from DB, using default', { error: err.message });
    return res.json({ success: true, data: { refreshInterval: 30 } });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /config/refresh-interval — Update auto-refresh interval (seconds)
// Body: { refreshInterval: number }
// ═══════════════════════════════════════════════════════════════════════════════
router.put('/config/refresh-interval', async (req, res) => {
  try {
    const { refreshInterval } = req.body;
    const interval = Math.max(5, Math.min(300, parseInt(refreshInterval, 10) || 30));
    log.info('Updating refresh interval', { interval });

    await DatabaseService.query(
      `INSERT INTO ${dbSchema}.gke_module_config (config_key, config_value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`,
      ['refresh_interval', String(interval), 'Dashboard & Workloads auto-refresh interval in seconds']
    );

    return res.json({ success: true, data: { refreshInterval: interval } });
  } catch (err) {
    log.error('Failed to save refresh interval', { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to save refresh interval' },
    });
  }
});

export default router;
