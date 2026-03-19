// ============================================================================
// HealthCheck Module — Config Routes
//
// PURPOSE: CRUD for module configuration — poller settings, general settings,
// and planned downtime source configuration.
//
// ENDPOINTS:
//   GET  /config/poller           → Load poller config
//   PUT  /config/poller           → Save poller config
//   GET  /config/general          → Load general settings
//   PUT  /config/general          → Save general settings
//   GET  /config/downtime-source  → Load planned downtime source config
//   PUT  /config/downtime-source  → Save planned downtime source config
//   GET  /config/global-sla       → Load global SLA config
//   PUT  /config/global-sla       → Save global SLA config
// ============================================================================
import { Router } from 'express';
import { hcUrls, apiErrors, apiMessages } from '#modules/healthcheck/api/config/index.js';
import {
  loadPollerConfig, loadGeneralSettings, loadDowntimeSourceConfig, loadGlobalSlaConfig,
  saveModuleConfig,
} from '#modules/healthcheck/api/routes/helpers.js';
import { createHcLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';

const log = createHcLogger('configRoutes.js');
const router = Router();
const routes = hcUrls.routes;

// ── GET /config/poller ───────────────────────────────────────────────────────
router.get(routes.configPoller, async (req, res) => {
  try {
    const config = await loadPollerConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    log.error('GET poller config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.config.pollerConfigLoadFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config/poller ───────────────────────────────────────────────────────
router.put(routes.configPoller, async (req, res) => {
  try {
    const config = req.body;
    log.info('Saving poller config', config);
    await saveModuleConfig('poller_config', config, 'Health poller configuration');
    res.json({ success: true, data: config, message: apiMessages.config.pollerConfigSaved });
  } catch (err) {
    log.error('PUT poller config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.config.pollerConfigSaveFailed.replace('{message}', err.message) } });
  }
});

// ── GET /config/general ──────────────────────────────────────────────────────
router.get(routes.configGeneral, async (req, res) => {
  try {
    const config = await loadGeneralSettings();
    res.json({ success: true, data: config });
  } catch (err) {
    log.error('GET general settings failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.config.generalSettingsLoadFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config/general ──────────────────────────────────────────────────────
router.put(routes.configGeneral, async (req, res) => {
  try {
    const config = req.body;
    log.info('Saving general settings', config);
    await saveModuleConfig('general_settings', config, 'General module settings');
    res.json({ success: true, data: config, message: apiMessages.config.generalSettingsSaved });
  } catch (err) {
    log.error('PUT general settings failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.config.generalSettingsSaveFailed.replace('{message}', err.message) } });
  }
});

// ── GET /config/downtime-source ──────────────────────────────────────────────
router.get(routes.configDowntimeSource, async (req, res) => {
  try {
    const config = await loadDowntimeSourceConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    log.error('GET downtime source config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.config.downtimeSourceLoadFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config/downtime-source ──────────────────────────────────────────────
router.put(routes.configDowntimeSource, async (req, res) => {
  try {
    const config = req.body;
    log.info('Saving downtime source config', config);
    await saveModuleConfig('planned_downtime_source', config, 'Planned downtime source configuration');
    res.json({ success: true, data: config, message: apiMessages.config.downtimeSourceSaved });
  } catch (err) {
    log.error('PUT downtime source config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.config.downtimeSourceSaveFailed.replace('{message}', err.message) } });
  }
});

// ── GET /config/global-sla ────────────────────────────────────────────────────
router.get(routes.configGlobalSla, async (req, res) => {
  try {
    const config = await loadGlobalSlaConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    log.error('GET global SLA config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.config.globalSlaLoadFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config/global-sla ────────────────────────────────────────────────────
router.put(routes.configGlobalSla, async (req, res) => {
  try {
    const config = req.body;
    const sla = parseFloat(config.slaTargetPercent);
    if (isNaN(sla) || sla < 0 || sla > 100) {
      return res.status(400).json({ success: false, error: { message: apiErrors.sla.targetInvalid } });
    }
    config.slaTargetPercent = sla;
    config.measurementPeriod = 'monthly';
    log.info('Saving global SLA config', config);
    await saveModuleConfig('global_sla_config', config, 'Global SLA configuration');
    res.json({ success: true, data: config, message: apiMessages.config.globalSlaSaved });
  } catch (err) {
    log.error('PUT global SLA config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.config.globalSlaSaveFailed.replace('{message}', err.message) } });
  }
});

export default router;
