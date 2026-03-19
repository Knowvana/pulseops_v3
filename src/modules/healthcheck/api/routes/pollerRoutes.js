// ============================================================================
// HealthCheck Module — Poller Routes
//
// PURPOSE: Control the background health poller — start, stop, poll now, status.
//
// ENDPOINTS:
//   GET  /poller/status    → Get current poller state + stats
//   POST /poller/start     → Start the poller
//   POST /poller/stop      → Stop the poller
//   POST /poller/poll-now  → Trigger one immediate poll cycle
// ============================================================================
import { Router } from 'express';
import { hcUrls, apiErrors, apiMessages } from '#modules/healthcheck/api/config/index.js';
import { loadPollerConfig, saveModuleConfig } from '#modules/healthcheck/api/routes/helpers.js';
import { start, stop, pollNow, getStatus, getLatestStatus } from '#modules/healthcheck/api/services/PollerService.js';
import { createHcLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';

const log = createHcLogger('pollerRoutes.js');
const router = Router();
const routes = hcUrls.routes;

// ── GET /poller/status ───────────────────────────────────────────────────────
router.get(routes.pollerStatus, async (req, res) => {
  try {
    const status = getStatus();
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
    const status = getStatus();
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
    res.json({ success: true, data: getStatus(), message: apiMessages.poller.stopped });
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

export default router;
