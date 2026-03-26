// ============================================================================
// Google GKE Module — CronJob Monitoring Routes
//
// PURPOSE: Express routes for comprehensive CronJob monitoring. Provides
// dashboard summary, CronJob list with alerts, execution history, and job logs.
//
// ENDPOINTS:
//   GET  /cronjobs/dashboard          → Full CronJob dashboard (summary + alerts + timeline)
//   GET  /cronjobs                    → All CronJobs with stats and alerts
//   GET  /cronjobs/:ns/:name/history  → Execution history for a specific CronJob
//   GET  /cronjobs/:ns/:name/logs     → Logs from the latest Job execution
//
// PATTERN SOURCE: Follows workloadRoutes.js pattern
// ============================================================================
import { Router } from 'express';
import { createGkeLogger } from '../lib/moduleLogger.js';
import { apiErrors } from '../config/index.js';
import { loadClusterConfigFile } from './helpers.js';
import { getK8sCoreApi, getK8sBatchApi, getK8sClient } from '../lib/KubernetesClient.js';
import { isEncrypted, decryptToken } from '../lib/credentialEncryption.js';
import {
  getAllCronjobs, getCronjobDashboard,
  getExecutionHistory, getJobLogs,
} from '../services/CronjobService.js';

const log = createGkeLogger('cronjobRoutes');
const router = Router();

// ─── Helper: ensure K8s client is initialized ─────────────────────────────
function ensureK8sClient() {
  const cfg = loadClusterConfigFile();
  const conn = { ...cfg.connection };
  if (conn.serviceAccountToken && isEncrypted(conn.serviceAccountToken)) {
    conn.serviceAccountToken = decryptToken(conn.serviceAccountToken);
  }
  getK8sClient(conn);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /cronjobs/dashboard — Full CronJob dashboard summary
// Returns: summary stats, all alerts, all cronjobs, recent executions, team breakdown
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/cronjobs/dashboard', async (req, res) => {
  try {
    log.debug('GET /cronjobs/dashboard');
    ensureK8sClient();
    const batchApi = getK8sBatchApi();
    const coreApi = getK8sCoreApi();
    const dashboard = await getCronjobDashboard(batchApi, coreApi);
    return res.json({ success: true, data: dashboard });
  } catch (err) {
    log.error('CronJob dashboard failed', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      error: { message: apiErrors.cronjobs.fetchFailed.replace('{message}', err.message) },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /cronjobs — All CronJobs with stats and alerts
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/cronjobs', async (req, res) => {
  try {
    log.debug('GET /cronjobs');
    ensureK8sClient();
    const batchApi = getK8sBatchApi();
    const coreApi = getK8sCoreApi();
    const cronjobs = await getAllCronjobs(batchApi, coreApi);
    return res.json({ success: true, data: cronjobs });
  } catch (err) {
    log.error('CronJobs fetch failed', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      error: { message: apiErrors.cronjobs.fetchFailed.replace('{message}', err.message) },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /cronjobs/:ns/:name/history — Execution history for a CronJob
// Query params: limit (default 20)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/cronjobs/:ns/:name/history', async (req, res) => {
  try {
    const { ns, name } = req.params;
    const limit = parseInt(req.query.limit, 10) || 20;
    log.debug('GET cronjob history', { ns, name, limit });
    ensureK8sClient();
    const batchApi = getK8sBatchApi();
    const coreApi = getK8sCoreApi();
    const history = await getExecutionHistory(batchApi, coreApi, ns, name, limit);
    return res.json({ success: true, data: history });
  } catch (err) {
    log.error('CronJob history fetch failed', { error: err.message, ns: req.params.ns, name: req.params.name });
    return res.status(500).json({
      success: false,
      error: { message: apiErrors.cronjobs.historyFetchFailed.replace('{message}', err.message) },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /cronjobs/:ns/:name/logs — Logs from the latest Job execution
// Query params: tailLines (default 500), container, previous, jobName
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/cronjobs/:ns/:name/logs', async (req, res) => {
  try {
    const { ns, name } = req.params;
    const { tailLines, container, previous, jobName } = req.query;
    log.debug('GET cronjob logs', { ns, name, jobName });
    ensureK8sClient();
    const coreApi = getK8sCoreApi();
    const batchApi = getK8sBatchApi();

    // If jobName is provided, use it directly. Otherwise find the latest job.
    let targetJobName = jobName;
    if (!targetJobName) {
      const history = await getExecutionHistory(batchApi, coreApi, ns, name, 1);
      if (history.length === 0) {
        return res.json({ success: true, data: { logs: '', podName: null, message: 'No jobs found for this CronJob' } });
      }
      targetJobName = history[0].name;
    }

    const logData = await getJobLogs(coreApi, ns, targetJobName, {
      tailLines: tailLines ? parseInt(tailLines, 10) : 500,
      container: container || undefined,
      previous: previous === 'true',
    });
    return res.json({ success: true, data: logData });
  } catch (err) {
    log.error('CronJob logs fetch failed', { error: err.message, ns: req.params.ns, name: req.params.name });
    return res.status(500).json({
      success: false,
      error: { message: apiErrors.cronjobs.logsFetchFailed.replace('{message}', err.message) },
    });
  }
});

export default router;
