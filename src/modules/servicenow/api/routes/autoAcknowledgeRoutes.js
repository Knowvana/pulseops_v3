// ============================================================================
// ServiceNow Module — Auto Acknowledge Routes
//
// ENDPOINTS:
//   GET    /config/auto-acknowledge         → Get auto acknowledge configuration
//   PUT    /config/auto-acknowledge         → Save config + restart background poller
//   GET    /auto-acknowledge/status         → Get background poller live status
//   POST   /auto-acknowledge/poll           → Manually trigger one poll cycle
//   POST   /auto-acknowledge/test           → Test acknowledge on a specific incident
//   GET    /auto-acknowledge/log            → Get today's auto acknowledged incidents
//   GET    /auto-acknowledge/log/history    → Get auto acknowledge log with date filter
//
// MOUNT: router.use('/', autoAcknowledgeRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import {
  loadConnectionConfig, loadModuleConfig, saveModuleConfig,
  DatabaseService, dbSchema,
} from '#modules/servicenow/api/routes/helpers.js';
import { snowWrite, snowVal, isSnowSuccess } from '#modules/servicenow/api/lib/SnowApiClient.js';
import { snowUrls, apiErrors, apiMessages } from '#modules/servicenow/api/config/index.js';
import { createSnowLogger } from '#modules/servicenow/api/lib/moduleLogger.js';
const log = createSnowLogger('AutoAcknowledge');
import { restart as restartPoller, runOnce, getStatus as getPollerStatus } from '#modules/servicenow/api/services/AutoAcknowledgePoller.js';

const router = Router();

const CONFIG_KEY    = 'auto_acknowledge';
const DEFAULT_MESSAGE = 'This incident has been received and acknowledged by PulseOps. Our team will review and respond shortly.';
const DEFAULT_CONFIG = { enabled: false, message: DEFAULT_MESSAGE, pollFrequencyMinutes: 5 };

// ── GET /config/auto-acknowledge — Get configuration ─────────────────────────
router.get('/config/auto-acknowledge', async (req, res) => {
  try {
    const stored = await loadModuleConfig(CONFIG_KEY);
    const merged = { ...DEFAULT_CONFIG, ...(stored || {}) };
    // Ensure message is never empty — fall back to default if stored value is blank
    if (!merged.message?.trim()) merged.message = DEFAULT_MESSAGE;
    return res.json({ success: true, data: merged });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.autoAcknowledge.loadFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config/auto-acknowledge — Save config + restart poller ───────────────
router.put('/config/auto-acknowledge', async (req, res) => {
  try {
    const { enabled, message, pollFrequencyMinutes } = req.body;
    if (enabled && (!message || !message.trim())) {
      return res.status(400).json({ success: false, error: { message: apiErrors.autoAcknowledge.messageRequired } });
    }
    const freq = parseInt(pollFrequencyMinutes, 10);
    if (enabled && (!freq || freq < 1 || freq > 1440)) {
      return res.status(400).json({ success: false, error: { message: apiErrors.autoAcknowledge.pollFreqInvalid } });
    }
    const config = {
      enabled: !!enabled,
      message: (message || '').trim(),
      pollFrequencyMinutes: freq || 5,
    };
    await saveModuleConfig(CONFIG_KEY, config, 'Auto acknowledge configuration — message template, enabled state, and poll frequency.');
    log.info(`Config saved — enabled=${config.enabled}, freq=${config.pollFrequencyMinutes}m`);

    // Restart background poller with new config
    restartPoller(config);

    return res.json({ success: true, message: apiMessages.autoAcknowledge.configSaved, data: config });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.autoAcknowledge.saveFailed.replace('{message}', err.message) } });
  }
});

// ── GET /auto-acknowledge/status — Background poller live status ──────────────
router.get('/auto-acknowledge/status', (req, res) => {
  try {
    return res.json({ success: true, data: getPollerStatus() });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.autoAcknowledge.statusFailed.replace('{message}', err.message) } });
  }
});

// ── POST /auto-acknowledge/poll — Manually trigger one poll cycle ─────────────
router.post('/auto-acknowledge/poll', async (req, res) => {
  try {
    const config = { ...DEFAULT_CONFIG, ...(await loadModuleConfig(CONFIG_KEY) || {}) };
    if (!config.enabled) return res.status(400).json({ success: false, error: { message: apiErrors.autoAcknowledge.notEnabled } });
    if (!config.message?.trim()) return res.status(400).json({ success: false, error: { message: apiErrors.autoAcknowledge.noMessage } });

    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });

    log.debug('Manual poll triggered via API');
    const result = await runOnce();
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.autoAcknowledge.pollFailed.replace('{message}', err.message) } });
  }
});

// ── POST /auto-acknowledge/test — Test on a specific incident ────────────────
router.post('/auto-acknowledge/test', async (req, res) => {
  try {
    const { incidentSysId, message } = req.body;
    if (!incidentSysId) return res.status(400).json({ success: false, error: { message: apiErrors.autoAcknowledge.incidentSysIdRequired } });

    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });

    const config     = { ...DEFAULT_CONFIG, ...(await loadModuleConfig(CONFIG_KEY) || {}) };
    const ackMessage = (message || config.message || '').trim();
    if (!ackMessage) return res.status(400).json({ success: false, error: { message: apiErrors.autoAcknowledge.noTestMessage } });

    const payload = { comments: ackMessage, state: '2', work_notes: ackMessage };
    const result  = await snowWrite(conn, `${snowUrls.snow.tables.incident}/${incidentSysId}`, 'PATCH', JSON.stringify(payload));
    if (!isSnowSuccess(result.statusCode)) {
      throw new Error(`SNOW API returned ${result.statusCode}: ${JSON.stringify(result.data)}`);
    }
    log.info(`Test acknowledge sent to ${incidentSysId} — state set to In Progress`);
    return res.json({ success: true, message: apiMessages.autoAcknowledge.testSent });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.autoAcknowledge.testFailed.replace('{message}', err.message) } });
  }
});

// ── GET /auto-acknowledge/log — Today's auto acknowledged incidents ──────────
router.get('/auto-acknowledge/log', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await DatabaseService.query(
      `SELECT * FROM ${dbSchema}.sn_auto_acknowledge_log
       WHERE acknowledged_at >= $1::date AND acknowledged_at < ($1::date + interval '1 day')
       ORDER BY acknowledged_at DESC`,
      [today],
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.autoAcknowledge.logFailed.replace('{message}', err.message) } });
  }
});

// ── GET /auto-acknowledge/log/history — Log with date filter ─────────────────
router.get('/auto-acknowledge/log/history', async (req, res) => {
  try {
    const { from, to, limit = '100' } = req.query;
    let query = `SELECT * FROM ${dbSchema}.sn_auto_acknowledge_log`;
    const params     = [];
    const conditions = [];
    if (from) { params.push(from); conditions.push(`acknowledged_at >= $${params.length}::date`); }
    if (to)   { params.push(to);   conditions.push(`acknowledged_at < ($${params.length}::date + interval '1 day')`); }
    if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
    query += ` ORDER BY acknowledged_at DESC LIMIT ${parseInt(limit, 10) || 100}`;

    const result = await DatabaseService.query(query, params);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.autoAcknowledge.historyFailed.replace('{message}', err.message) } });
  }
});

export default router;
