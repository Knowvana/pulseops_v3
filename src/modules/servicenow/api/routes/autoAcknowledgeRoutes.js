// ============================================================================
// ServiceNow Module — Auto Acknowledge Routes
//
// ENDPOINTS:
//   GET    /config/auto-acknowledge         → Get auto acknowledge configuration
//   PUT    /config/auto-acknowledge         → Save auto acknowledge configuration
//   POST   /auto-acknowledge/poll           → Manually trigger a poll cycle
//   POST   /auto-acknowledge/test           → Test auto acknowledge on a specific incident
//   GET    /auto-acknowledge/log            → Get today's auto acknowledged incidents
//   GET    /auto-acknowledge/log/history    → Get auto acknowledge log with date filter
//
// MOUNT: router.use('/', autoAcknowledgeRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import {
  loadConnectionConfig, loadModuleConfig, saveModuleConfig,
  buildAssignmentGroupQuery, loadIncidentConfig,
  DatabaseService, dbSchema,
} from '#modules/servicenow/api/routes/helpers.js';
import { snowGet, snowWrite, snowVal, isSnowSuccess } from '#modules/servicenow/api/lib/SnowApiClient.js';
import { snowUrls, apiErrors, apiMessages } from '#modules/servicenow/api/config/index.js';
import { logger } from '#shared/logger.js';

const router = Router();

const CONFIG_KEY = 'auto_acknowledge';
const DEFAULT_CONFIG = { enabled: false, message: '', pollFrequencyMinutes: 5 };

// ── GET /config/auto-acknowledge — Get configuration ─────────────────────────
router.get('/config/auto-acknowledge', async (req, res) => {
  try {
    const stored = await loadModuleConfig(CONFIG_KEY);
    return res.json({ success: true, data: { ...DEFAULT_CONFIG, ...(stored || {}) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.autoAcknowledge.loadFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config/auto-acknowledge — Save configuration ────────────────────────
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
    logger.info(`[AutoAcknowledge] Configuration saved: enabled=${config.enabled}, freq=${config.pollFrequencyMinutes}m`);
    return res.json({ success: true, message: apiMessages.autoAcknowledge.configSaved, data: config });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.autoAcknowledge.saveFailed.replace('{message}', err.message) } });
  }
});

// ── Helper: Post a work note (comment) to a ServiceNow incident ──────────────
async function postWorkNote(conn, sysId, message) {
  const payload = {
    comments: message,
    state: '2', // Set state to In Progress when acknowledging
    work_notes: message
  };
  const result = await snowWrite(conn, `${snowUrls.snow.tables.incident}/${sysId}`, 'PATCH', JSON.stringify(payload));
  if (isSnowSuccess(result.statusCode)) return { success: true, data: result.data?.result };
  throw new Error(`SNOW API returned ${result.statusCode}: ${JSON.stringify(result.data)}`);
}

// ── Helper: Fetch new incidents (state=New) from ServiceNow ──────────────────
async function fetchNewIncidents(conn, incidentConfig) {
  const queryParts = ['state=1']; // state 1 = New
  const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
  if (agQuery) queryParts.unshift(agQuery);
  queryParts.push('ORDERBYDESCnumber');

  const fields = ['sys_id', 'number', 'short_description', 'priority', 'state', 'comments'];
  const result = await snowGet(conn, snowUrls.snow.tables.incident,
    `sysparm_limit=200&sysparm_fields=${fields.join(',')}&sysparm_query=${queryParts.join('^')}`
  );
  if (isSnowSuccess(result.statusCode) && result.data?.result) {
    return result.data.result;
  }
  return [];
}

// ── Helper: Check if incident was already acknowledged ───────────────────────
async function isAlreadyAcknowledged(sysId) {
  try {
    const result = await DatabaseService.query(
      `SELECT id FROM ${dbSchema}.sn_auto_acknowledge_log WHERE incident_sys_id = $1 AND status = 'success' LIMIT 1`,
      [sysId]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

// ── Helper: Log an auto acknowledge action ───────────────────────────────────
async function logAcknowledge(incident, message, status, errorMsg = null) {
  try {
    await DatabaseService.query(
      `INSERT INTO ${dbSchema}.sn_auto_acknowledge_log 
       (incident_number, incident_sys_id, short_description, priority, state, acknowledge_message, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        snowVal(incident.number),
        snowVal(incident.sys_id),
        snowVal(incident.short_description) || '',
        snowVal(incident.priority) || '',
        snowVal(incident.state) || '',
        message,
        status,
        errorMsg,
      ]
    );
  } catch (err) {
    logger.error(`[AutoAcknowledge] Failed to log acknowledge: ${err.message}`);
  }
}

// ── POST /auto-acknowledge/poll — Manually trigger a poll cycle ──────────────
router.post('/auto-acknowledge/poll', async (req, res) => {
  try {
    const config = { ...DEFAULT_CONFIG, ...(await loadModuleConfig(CONFIG_KEY) || {}) };
    if (!config.enabled) return res.status(400).json({ success: false, error: { message: apiErrors.autoAcknowledge.notEnabled } });
    if (!config.message || !config.message.trim()) return res.status(400).json({ success: false, error: { message: apiErrors.autoAcknowledge.noMessage } });

    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });
    }

    const incidentConfig = await loadIncidentConfig();
    const newIncidents = await fetchNewIncidents(conn, incidentConfig);
    logger.info(`[AutoAcknowledge] Poll found ${newIncidents.length} new incidents`);

    let acknowledged = 0;
    let skipped = 0;
    let failed = 0;
    const results = [];

    for (const inc of newIncidents) {
      const sysId = snowVal(inc.sys_id);
      const number = snowVal(inc.number);

      // Skip if already acknowledged
      if (await isAlreadyAcknowledged(sysId)) {
        skipped++;
        continue;
      }

      try {
        await postWorkNote(conn, sysId, config.message);
        await logAcknowledge(inc, config.message, 'success');
        acknowledged++;
        results.push({ number, status: 'success' });
        logger.info(`[AutoAcknowledge] Acknowledged ${number}`);
      } catch (err) {
        await logAcknowledge(inc, config.message, 'failed', err.message);
        failed++;
        results.push({ number, status: 'failed', error: err.message });
        logger.error(`[AutoAcknowledge] Failed to acknowledge ${number}: ${err.message}`);
      }
    }

    return res.json({
      success: true,
      data: {
        totalNew: newIncidents.length,
        acknowledged,
        skipped,
        failed,
        results,
      },
    });
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

    const config    = { ...DEFAULT_CONFIG, ...(await loadModuleConfig(CONFIG_KEY) || {}) };
    const ackMessage = (message || config.message || '').trim();
    if (!ackMessage) return res.status(400).json({ success: false, error: { message: apiErrors.autoAcknowledge.noTestMessage } });

    await postWorkNote(conn, incidentSysId, ackMessage);
    logger.info(`[AutoAcknowledge] Test acknowledge sent to ${incidentSysId}`);

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
      [today]
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
    const params = [];
    const conditions = [];

    if (from) {
      params.push(from);
      conditions.push(`acknowledged_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conditions.push(`acknowledged_at < ($${params.length}::date + interval '1 day')`);
    }
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ` ORDER BY acknowledged_at DESC LIMIT ${parseInt(limit, 10) || 100}`;

    const result = await DatabaseService.query(query, params);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.autoAcknowledge.historyFailed.replace('{message}', err.message) } });
  }
});

export default router;
