// ============================================================================
// ServiceNow Module — Sync Routes
//
// ENDPOINTS:
//   POST /sync           → Trigger manual sync with detailed summary
//   GET  /sync/status    → Get sync status
//   GET  /sync/schedule  → Get sync schedule config
//   PUT  /sync/schedule  → Update sync schedule config
//
// MOUNT: router.use('/', syncRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import { createSnowLogger } from '#modules/servicenow/api/lib/moduleLogger.js';
import {
  loadConnectionConfig, loadDefaultsConfig, loadIncidentConfig,
  buildAssignmentGroupQuery, writeJsonFile, DEFAULTS_CONFIG,
} from '#modules/servicenow/api/routes/helpers.js';
import { snowGet, buildSnowFields, isSnowSuccess } from '#modules/servicenow/api/lib/SnowApiClient.js';
import { snowUrls, apiErrors, apiMessages } from '#modules/servicenow/api/config/index.js';

const log = createSnowLogger('Sync');
const router = Router();

// ── POST /sync — Trigger manual sync with detailed summary ──────────────
router.post('/sync', async (req, res) => {
  const startTime = Date.now();
  try {
    log.debug('POST /sync — manual sync triggered');
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const fields  = buildSnowFields(incidentConfig.columns);

    // Fetch incidents from SNOW with configured column set
    const queryParts = ['ORDERBYDESCnumber'];
    if (agQuery) queryParts.unshift(agQuery);
    const qs = `sysparm_limit=${defaults.sync?.maxIncidents || 500}&sysparm_query=${queryParts.join('^')}${fields ? `&sysparm_fields=${fields}` : ''}`;
    const incidentResult = await snowGet(conn, snowUrls.snow.tables.incident, qs);

    const summary = { tables: [], totalFetched: 0, errors: [] };

    if (isSnowSuccess(incidentResult.statusCode) && incidentResult.data?.result) {
      summary.tables.push({ name: 'incident', recordsFetched: incidentResult.data.result.length });
      summary.totalFetched += incidentResult.data.result.length;
    } else {
      summary.errors.push({ table: 'incident', status: incidentResult.statusCode, message: `HTTP ${incidentResult.statusCode}` });
    }

    // Update last sync time
    defaults.sync = defaults.sync || {};
    defaults.sync.lastSync = new Date().toISOString();
    writeJsonFile(DEFAULTS_CONFIG, defaults);

    const durationMs = Date.now() - startTime;
    log.info(`Sync completed — fetched:${summary.totalFetched} errors:${summary.errors.length} duration:${durationMs}ms`);

    return res.json({
      success: summary.errors.length === 0,
      data: {
        summary,
        syncedAt: defaults.sync.lastSync,
        durationMs,
      },
      message: summary.errors.length === 0
        ? apiMessages.sync.completed.replace('{total}', summary.totalFetched).replace('{duration}', durationMs)
        : apiMessages.sync.completedWithErrors.replace('{errors}', summary.errors.length),
    });
  } catch (err) {
    log.error(`POST /sync failed: ${err.message}`);
    return res.status(500).json({ success: false, error: { message: apiErrors.sync.failed.replace('{message}', err.message) } });
  }
});

// ── GET /sync/status ─────────────────────────────────────────────────────
router.get('/sync/status', (req, res) => {
  try {
    const defaults = loadDefaultsConfig();
    return res.json({
      success: true,
      data: {
        running: !!defaults.sync?.enabled,
        lastSyncTime: defaults.sync?.lastSync || null,
        syncIntervalMinutes: defaults.sync?.intervalMinutes || 30,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.sync.statusFailed.replace('{message}', err.message) } });
  }
});

// ── GET /sync/schedule ───────────────────────────────────────────────────
router.get('/sync/schedule', (req, res) => {
  try {
    const defaults = loadDefaultsConfig();
    return res.json({
      success: true,
      data: {
        syncEnabled: !!defaults.sync?.enabled,
        syncIntervalMinutes: defaults.sync?.intervalMinutes || 60,
        syncIncidents: defaults.sync?.syncIncidents !== false,
        syncRitms: defaults.sync?.syncRitms !== false,
        syncChanges: defaults.sync?.syncChanges !== false,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.sync.scheduleFetchFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /sync/schedule ───────────────────────────────────────────────────
router.put('/sync/schedule', (req, res) => {
  try {
    const { syncEnabled, syncIntervalMinutes, syncIncidents, syncRitms, syncChanges } = req.body;
    const defaults = loadDefaultsConfig();
    defaults.sync = {
      ...defaults.sync,
      enabled: Boolean(syncEnabled),
      intervalMinutes: Number(syncIntervalMinutes) || 60,
      syncIncidents: syncIncidents !== false,
      syncRitms: syncRitms !== false,
      syncChanges: syncChanges !== false,
    };
    writeJsonFile(DEFAULTS_CONFIG, defaults);
    log.info(`Sync schedule updated — enabled:${defaults.sync.enabled} interval:${defaults.sync.intervalMinutes}m`);
    return res.json({ success: true, message: apiMessages.sync.scheduleSaved });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.sync.scheduleSaveFailed.replace('{message}', err.message) } });
  }
});

export default router;
