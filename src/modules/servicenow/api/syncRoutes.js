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
import {
  loadConnectionConfig, loadDefaultsConfig, loadIncidentConfig,
  buildAssignmentGroupQuery, snowRequest, writeJsonFile, DEFAULTS_CONFIG,
} from './helpers.js';

const router = Router();

// ── POST /sync — Trigger manual sync with detailed summary ──────────────
router.post('/sync', async (req, res) => {
  const startTime = Date.now();
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.status(400).json({
        success: false,
        error: { message: 'ServiceNow connection is not configured.' },
      });
    }

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);

    // Fetch incidents from SNOW
    const queryParts = ['ORDERBYDESCnumber'];
    if (agQuery) queryParts.unshift(agQuery);
    const incidentResult = await snowRequest(conn, 'table/incident',
      `sysparm_limit=${defaults.sync?.maxIncidents || 500}&sysparm_query=${queryParts.join('^')}`
    );

    const summary = { tables: [], totalFetched: 0, errors: [] };

    if (incidentResult.statusCode >= 200 && incidentResult.statusCode < 300 && incidentResult.data?.result) {
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

    return res.json({
      success: summary.errors.length === 0,
      data: {
        summary,
        syncedAt: defaults.sync.lastSync,
        durationMs,
      },
      message: summary.errors.length === 0
        ? `Sync completed successfully. Fetched ${summary.totalFetched} record(s) from ${summary.tables.length} table(s) in ${durationMs}ms.`
        : `Sync completed with ${summary.errors.length} error(s).`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Sync failed: ${err.message}` } });
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
    return res.status(500).json({ success: false, error: { message: `Sync status failed: ${err.message}` } });
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
    return res.status(500).json({ success: false, error: { message: `Sync schedule fetch failed: ${err.message}` } });
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
    return res.json({ success: true, message: 'Sync schedule saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Sync schedule save failed: ${err.message}` } });
  }
});

export default router;
