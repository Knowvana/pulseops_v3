// ============================================================================
// HealthCheck Module — Poller Routes
//
// PURPOSE: Control the background health poller — start, stop, poll now, status, delete data.
//
// ENDPOINTS:
//   GET  /poller/status       → Get current poller state + stats
//   POST /poller/start        → Start the poller
//   POST /poller/stop         → Stop the poller
//   POST /poller/poll-now     → Trigger one immediate poll cycle
//   POST /poller/delete-data  → Delete all poll records and reset poller start time
// ============================================================================
import { Router } from 'express';
import { hcUrls, apiErrors, apiMessages } from '#modules/healthcheck/api/config/index.js';
import { dbSchema, DatabaseService, loadPollerConfig, saveModuleConfig } from '#modules/healthcheck/api/routes/helpers.js';
import { start, stop, pollNow, getStatus, getLatestStatus } from '#modules/healthcheck/api/services/PollerService.js';
import { createHcLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';

const log = createHcLogger('pollerRoutes.js');
const router = Router();
const routes = hcUrls.routes;

// ── GET /poller/status ───────────────────────────────────────────────────────
router.get(routes.pollerStatus, async (req, res) => {
  try {
    const status = await getStatus();
    const latestStatus = getLatestStatus();
    const config = await loadPollerConfig();
    res.json({
      success: true,
      data: {
        ...status,
        config,
        latestAppStatus: latestStatus,
      },
    });
  } catch (err) {
    log.error('GET poller status failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.poller.statusFailed.replace('{message}', err.message) } });
  }
});

// ── POST /poller/start ───────────────────────────────────────────────────────
router.post(routes.pollerStart, async (req, res) => {
  try {
    const config = await loadPollerConfig();
    // Mark config as enabled in DB
    config.enabled = true;
    await saveModuleConfig('poller_config', config, 'Health poller configuration');

    await start(config);
    const status = await getStatus();
    log.info('Poller started via API');
    res.json({
      success: true,
      data: status,
      message: apiMessages.poller.started
        .replace('{count}', String(status.lastPollResults?.total || 0))
        .replace('{interval}', String(config.intervalSeconds)),
    });
  } catch (err) {
    log.error('POST poller start failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.poller.startFailed.replace('{message}', err.message) } });
  }
});

// ── POST /poller/stop ────────────────────────────────────────────────────────
router.post(routes.pollerStop, async (req, res) => {
  try {
    stop();
    // Mark config as disabled in DB
    const config = await loadPollerConfig();
    config.enabled = false;
    await saveModuleConfig('poller_config', config, 'Health poller configuration');

    log.info('Poller stopped via API');
    const status = await getStatus();
    res.json({ success: true, data: status, message: apiMessages.poller.stopped });
  } catch (err) {
    log.error('POST poller stop failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.poller.stopFailed.replace('{message}', err.message) } });
  }
});

// ── POST /poller/poll-now ────────────────────────────────────────────────────
router.post(routes.pollerPollNow, async (req, res) => {
  try {
    const result = await pollNow();
    if (!result) {
      return res.status(409).json({ success: false, error: { message: apiErrors.poller.pollFailed.replace('{message}', 'Poll cycle in progress or failed') } });
    }
    res.json({
      success: true,
      data: { ...result, latestAppStatus: getLatestStatus() },
      message: apiMessages.poller.manualPollComplete
        .replace('{up}', String(result.up))
        .replace('{down}', String(result.down))
        .replace('{total}', String(result.total)),
    });
  } catch (err) {
    log.error('POST poll-now failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.poller.pollFailed.replace('{message}', err.message) } });
  }
});

// ── GET /poller/total-count ──────────────────────────────────────────────────
// Get total count of poll records in database
router.get(routes.pollerTotalCount, async (req, res) => {
  try {
    const result = await DatabaseService.query(
      `SELECT COUNT(*)::int AS total_count FROM ${dbSchema}.hc_poll_results`
    );
    const totalCount = result.rows[0]?.total_count || 0;
    res.json({
      success: true,
      data: { totalCount },
    });
  } catch (err) {
    log.error('GET poller total-count failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: `Failed to fetch poll count: ${err.message}` } });
  }
});

// ── POST /poller/delete-data ─────────────────────────────────────────────────
// Delete all poll records and reset pollerStartTime, then stop the poller
router.post(routes.pollerDeleteData, async (req, res) => {
  try {
    // Stop the poller first
    stop();
    log.info('Poller stopped for data deletion');

    // Delete all poll records from the database
    await DatabaseService.query(
      `DELETE FROM ${dbSchema}.hc_poll_results`
    );
    log.info('All poll records deleted');

    // Reset pollerStartTime in config
    const config = await loadPollerConfig();
    config.pollerStartTime = null;
    config.enabled = false;
    await saveModuleConfig('poller_config', config, 'Health poller configuration — reset after data deletion');
    log.info('Poller start time reset to empty');

    const status = await getStatus();
    res.json({
      success: true,
      data: status,
      message: 'Poll data deleted and poller reset successfully',
    });
  } catch (err) {
    log.error('POST poller delete-data failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: `Failed to delete poll data: ${err.message}` } });
  }
});

export default router;
