// ============================================================================
// AutoAcknowledgePoller.js — ServiceNow Module Background Scheduler
//
// PURPOSE: Singleton background service that polls ServiceNow at the configured
// frequency and auto-acknowledges incidents in the "New" state.
//
// DESIGN:
//   - Stateless — no in-memory dedup; safe for K8s pod restarts
//   - Single setInterval timer — safe across hot-reloads (stop() clears it)
//   - Re-reads config from DB on every tick — honors live config changes
//   - Dedup via DB log (sn_auto_acknowledge_log) — sole source of truth
//   - Exported lifecycle: start(config) / stop() / restart(config) / runOnce()
//   - Exported status:    getStatus() → { running, lastPollAt, nextPollAt, lastPollResult }
//
// LIFECYCLE:
//   - onEnable()  in index.js calls startIfEnabled()
//   - onDisable() in index.js calls stop()
//   - PUT /config/auto-acknowledge calls restart(newConfig)
//   - POST /auto-acknowledge/poll calls runOnce()
// ============================================================================
import {
  loadConnectionConfig, loadModuleConfig, loadIncidentConfig,
  buildAssignmentGroupQuery, DatabaseService, dbSchema,
} from '#modules/servicenow/api/routes/helpers.js';
import { snowGet, snowWrite, snowVal, isSnowSuccess } from '#modules/servicenow/api/lib/SnowApiClient.js';
import { snowUrls } from '#modules/servicenow/api/config/index.js';
import { createSnowLogger } from '#modules/servicenow/api/lib/moduleLogger.js';

const logger = createSnowLogger('AutoAcknowledge');

const CONFIG_KEY = 'auto_acknowledge';
const DEFAULT_MESSAGE = 'This incident has been received and acknowledged by PulseOps. Our team will review and respond shortly.';
const DEFAULT_CONFIG = { enabled: false, message: DEFAULT_MESSAGE, pollFrequencyMinutes: 5 };
const MIN_POLL_INTERVAL_MS = 60_000; // 1 minute floor

// ── Module-level singleton state ─────────────────────────────────────────────

let _timer  = null;
let _status = {
  running:         false,
  lastPollAt:      null,
  nextPollAt:      null,
  pollFreqMinutes: null,
  lastPollResult:  null,
};

// ── Private helpers ───────────────────────────────────────────────────────────

async function fetchNewIncidents(conn, incidentConfig) {
  const queryParts = ['state=1'];
  const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
  if (agQuery) queryParts.unshift(agQuery);
  queryParts.push('ORDERBYDESCnumber');

  // Note: journal fields (comments, work_notes) are NOT returned in list queries by SNOW Table API
  const fields = ['sys_id', 'number', 'short_description', 'priority', 'state'];
  const result = await snowGet(
    conn,
    snowUrls.snow.tables.incident,
    `sysparm_limit=200&sysparm_fields=${fields.join(',')}&sysparm_query=${queryParts.join('^')}`,
  );
  if (isSnowSuccess(result.statusCode) && result.data?.result) {
    return result.data.result;
  }
  return [];
}

async function isAlreadyLoggedInDb(sysId) {
  try {
    const result = await DatabaseService.query(
      `SELECT id FROM ${dbSchema}.sn_auto_acknowledge_log WHERE incident_sys_id = $1 AND status = 'success' LIMIT 1`,
      [sysId],
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

async function postAcknowledge(conn, sysId, message) {
  const payload = {
    comments:   message,
    state:      '2',      // In Progress
  };
  const result = await snowWrite(
    conn,
    `${snowUrls.snow.tables.incident}/${sysId}`,
    'PATCH',
    JSON.stringify(payload),
  );
  if (isSnowSuccess(result.statusCode)) return { success: true };
  throw new Error(`SNOW API returned ${result.statusCode}: ${JSON.stringify(result.data)}`);
}

async function logToDb(incident, message, status, errorMsg = null) {
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
      ],
    );
  } catch (err) {
    logger.error(`Failed to log to DB: ${err.message}`);
  }
}

// ── Core poll cycle ───────────────────────────────────────────────────────────

async function executePollCycle() {
  const config = { ...DEFAULT_CONFIG, ...(await loadModuleConfig(CONFIG_KEY) || {}) };

  if (!config.enabled) {
    logger.debug('Poll tick — feature disabled, stopping poller');
    stop();
    return { stopped: true };
  }

  const conn = loadConnectionConfig();
  if (!conn.isConfigured) {
    logger.debug('Poll tick — ServiceNow not configured, skipping');
    return { skipped: 'not_configured' };
  }

  logger.debug(`Poll cycle starting — freq: ${config.pollFrequencyMinutes}m`);
  const pollAt = new Date().toISOString();
  _status.lastPollAt = pollAt;

  const incidentConfig = await loadIncidentConfig();
  const newIncidents   = await fetchNewIncidents(conn, incidentConfig);
  logger.debug(`Found ${newIncidents.length} incidents in New state`);

  let acknowledged = 0;
  let skipped      = 0;
  let failed       = 0;
  const results    = [];

  for (const inc of newIncidents) {
    const sysId  = snowVal(inc.sys_id);
    const number = snowVal(inc.number);

    // Stateless guard: check DB log — safe across K8s pod restarts
    if (await isAlreadyLoggedInDb(sysId)) {
      logger.debug(`${number} — already acknowledged in DB, skipping`);
      skipped++;
      continue;
    }

    try {
      await postAcknowledge(conn, sysId, config.message);
      await logToDb(inc, config.message, 'success');
      acknowledged++;
      results.push({ number, status: 'success' });
      logger.info(`Acknowledged ${number} → state set to In Progress`);
    } catch (err) {
      await logToDb(inc, config.message, 'failed', err.message);
      failed++;
      results.push({ number, status: 'failed', error: err.message });
      logger.error(`Failed to acknowledge ${number}: ${err.message}`);
    }
  }

  const result = { totalNew: newIncidents.length, acknowledged, skipped, failed, results, at: pollAt };
  _status.lastPollResult = result;
  logger.info(`Poll complete — new:${newIncidents.length} acked:${acknowledged} skipped:${skipped} failed:${failed}`);
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the background poller at the given poll frequency.
 * Safe to call multiple times — stops any running timer first.
 * @param {object} config - Auto-acknowledge config ({ pollFrequencyMinutes })
 */
export function start(config) {
  stop(); // clear any existing timer first

  const freqMin = Math.max((config?.pollFrequencyMinutes || 5), 1);
  const freqMs  = Math.max(freqMin * 60_000, MIN_POLL_INTERVAL_MS);

  _status.running         = true;
  _status.pollFreqMinutes = freqMin;
  _status.nextPollAt      = new Date(Date.now() + freqMs).toISOString();

  _timer = setInterval(async () => {
    try {
      const result = await executePollCycle();
      // If disabled inside the cycle, timer already stopped
      if (!result?.stopped && _timer) {
        const cfg = { ...DEFAULT_CONFIG, ...(await loadModuleConfig(CONFIG_KEY) || {}) };
        const nextFreqMs = Math.max((cfg.pollFrequencyMinutes || 5) * 60_000, MIN_POLL_INTERVAL_MS);
        _status.nextPollAt = new Date(Date.now() + nextFreqMs).toISOString();
      }
    } catch (err) {
      logger.error(`Unhandled poller error: ${err.message}`);
    }
  }, freqMs);

  logger.info(`Poller started — interval: ${freqMin}m`);
}

/**
 * Stop the background poller.
 */
export function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info('Poller stopped');
  }
  _status.running    = false;
  _status.nextPollAt = null;
}

/**
 * Restart poller with new config. Starts only if config.enabled is true.
 * @param {object} config
 */
export function restart(config) {
  stop();
  if (config?.enabled) {
    start(config);
  }
}

/**
 * Start the poller only if the persisted config has enabled = true.
 * Called from onEnable() lifecycle hook.
 */
export async function startIfEnabled() {
  try {
    const config = { ...DEFAULT_CONFIG, ...(await loadModuleConfig(CONFIG_KEY) || {}) };
    if (config.enabled && config.message?.trim()) {
      start(config);
    } else {
      logger.debug('startIfEnabled — not enabled or no message, poller not started');
    }
  } catch (err) {
    logger.warn(`startIfEnabled failed: ${err.message}`);
  }
}

/**
 * Run a single poll cycle immediately (used by manual poll route).
 * Does NOT affect the scheduled timer.
 * @returns {Promise<object>} Poll result
 */
export async function runOnce() {
  return executePollCycle();
}

/**
 * Get the current poller status.
 * @returns {{ running, lastPollAt, nextPollAt, pollFreqMinutes, lastPollResult }}
 */
export function getStatus() {
  return { ..._status };
}
