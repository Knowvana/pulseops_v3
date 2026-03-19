// ============================================================================
// HealthCheck Module — Report & Dashboard Routes
//
// PURPOSE: All reporting endpoints — dashboard summary, monthly uptime report,
// poll verification, downtime analysis, and planned downtime CRUD + sync.
//
// ENDPOINTS:
//   GET  /dashboard              → Dashboard summary (stats, apps, poller)
//   GET  /dashboard/live         → Latest poll status per app (in-memory)
//   GET  /reports/uptime         → Monthly uptime SLA report (?month=YYYY-MM)
//   GET  /reports/downtime       → Unplanned downtime windows (?month=YYYY-MM&appId=)
//   GET  /reports/poll-verification → Expected vs actual polls (?month=YYYY-MM)
//
//   GET    /sla                  → List SLA targets per app per month
//   PUT    /sla/:id              → Update SLA target for an app-month
//
//   GET    /planned-downtime     → Fetch live planned downtime from SNOW API (?month=YYYY-MM)
//   POST   /planned-downtime/sync→ Sync (same as GET, explicit semantics; accepts month in body)
// ============================================================================
import { Router } from 'express';
import { hcUrls, apiErrors, apiMessages } from '#modules/healthcheck/api/config/index.js';
import { dbSchema, DatabaseService, loadDowntimeSourceConfig } from '#modules/healthcheck/api/routes/helpers.js';
import { getLatestStatus } from '#modules/healthcheck/api/services/PollerService.js';
import { getMonthlyUptimeReport, getPollVerification, getUnplannedDowntime, getDashboardSummary } from '#modules/healthcheck/api/services/UptimeReportService.js';
import { subscribeToEvents } from '#modules/healthcheck/api/services/PollerService.js';
import { createHcLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';

const log = createHcLogger('reportRoutes.js');
const router = Router();
const routes = hcUrls.routes;

// ── Helper: current month string ─────────────────────────────────────────────
function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /dashboard ───────────────────────────────────────────────────────────
router.get(routes.dashboard, async (req, res) => {
  try {
    const summary = await getDashboardSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    log.error('GET dashboard failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.reports.dashboardFailed.replace('{message}', err.message) } });
  }
});

// ── GET /dashboard/live ──────────────────────────────────────────────────────
router.get(routes.dashboardLive, async (req, res) => {
  try {
    const latestStatus = getLatestStatus();
    res.json({ success: true, data: latestStatus });
  } catch (err) {
    log.error('GET dashboard live failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.reports.dashboardFailed.replace('{message}', err.message) } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// REPORTS
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /reports/uptime ──────────────────────────────────────────────────────
router.get(routes.reportUptime, async (req, res) => {
  try {
    const month = req.query.month || currentMonth();
    const report = await getMonthlyUptimeReport(month);
    res.json({ success: true, data: report });
  } catch (err) {
    log.error('GET uptime report failed', { message: err.message });
    const status = err.message.includes('Invalid month') ? 400 : 500;
    const errKey = status === 400 ? apiErrors.reports.invalidMonth : apiErrors.reports.uptimeFailed.replace('{message}', err.message);
    res.status(status).json({ success: false, error: { message: errKey } });
  }
});

// ── GET /reports/downtime ────────────────────────────────────────────────────
router.get(routes.reportDowntime, async (req, res) => {
  try {
    const month = req.query.month || currentMonth();
    const appId = req.query.appId || null;
    const report = await getUnplannedDowntime(month, appId);
    res.json({ success: true, data: report });
  } catch (err) {
    log.error('GET downtime report failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.reports.downtimeFailed.replace('{message}', err.message) } });
  }
});

// ── GET /reports/poll-verification ───────────────────────────────────────────
router.get(routes.reportPollVerification, async (req, res) => {
  try {
    const month = req.query.month || currentMonth();
    const report = await getPollVerification(month);
    res.json({ success: true, data: report });
  } catch (err) {
    log.error('GET poll verification failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.reports.pollHistoryFailed.replace('{message}', err.message) } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SLA TARGETS
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /sla ─────────────────────────────────────────────────────────────────
router.get(routes.slaTargets, async (req, res) => {
  try {
    const month = req.query.month || currentMonth();
    const result = await DatabaseService.query(
      `SELECT s.*, a.name AS app_name, a.url AS app_url
       FROM ${dbSchema}.hc_uptime_sla s
       JOIN ${dbSchema}.hc_applications a ON a.id = s.application_id
       WHERE s.month = $1
       ORDER BY a.sort_order, a.name`,
      [month]
    );
    // Also return apps that don't have an override (use their default)
    const appsResult = await DatabaseService.query(
      `SELECT id, name, url, sla_target_percent
       FROM ${dbSchema}.hc_applications
       WHERE is_active = true
       ORDER BY sort_order, name`
    );
    const overrides = {};
    for (const row of result.rows) overrides[row.application_id] = row;
    const combined = (appsResult.rows || []).map(app => ({
      applicationId: app.id,
      appName: app.name,
      appUrl: app.url,
      month,
      slaTargetPercent: overrides[app.id]
        ? parseFloat(overrides[app.id].sla_target_percent)
        : parseFloat(app.sla_target_percent),
      isOverride: !!overrides[app.id],
      overrideId: overrides[app.id]?.id || null,
    }));
    res.json({ success: true, data: combined });
  } catch (err) {
    log.error('GET SLA targets failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.sla.fetchFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /sla/:id ─────────────────────────────────────────────────────────────
router.put(routes.slaTargetById, async (req, res) => {
  try {
    const appId = req.params.id;
    const { month, sla_target_percent } = req.body;
    const target = parseFloat(sla_target_percent);
    if (isNaN(target) || target < 0 || target > 100) {
      return res.status(400).json({ success: false, error: { message: apiErrors.sla.targetInvalid } });
    }
    const monthVal = month || currentMonth();

    await DatabaseService.query(
      `INSERT INTO ${dbSchema}.hc_uptime_sla (application_id, month, sla_target_percent, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (application_id, month)
       DO UPDATE SET sla_target_percent = $3, updated_at = NOW()`,
      [appId, monthVal, target]
    );
    log.info('SLA target saved', { appId, month: monthVal, target });
    res.json({ success: true, data: { applicationId: appId, month: monthVal, slaTargetPercent: target }, message: apiMessages.sla.saved });
  } catch (err) {
    log.error('PUT SLA target failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.sla.saveFailed.replace('{message}', err.message) } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PLANNED DOWNTIME — Live proxy to ServiceNow module API
// No local table — data is fetched dynamically from the SNOW planned-downtime
// API using the configured URL with startDate/endDate query params.
// ═════════════════════════════════════════════════════════════════════════════

// ── Helper: compute startDate/endDate from month string ─────────────────────
function monthToDateRange(monthStr) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthStr);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const mon = parseInt(match[2], 10);
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

// ── Helper: fetch planned downtime from configured SNOW API ─────────────────
async function fetchPlannedDowntimeFromSnow(config, startDate, endDate, cookieHeader) {
  if (!config.enabled || !config.apiUrl) {
    throw new Error('Planned downtime source is not configured or not enabled.');
  }

  const separator = config.apiUrl.includes('?') ? '&' : '?';
  const url = `${config.apiUrl}${separator}startDate=${startDate}&endDate=${endDate}`;

  log.info('Fetching planned downtime from SNOW API', { url });

  const headers = { 'Content-Type': 'application/json' };
  if (cookieHeader) headers.cookie = cookieHeader;

  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    throw new Error(`ServiceNow API returned HTTP ${response.status}`);
  }

  const json = await response.json();
  return json?.data || json || [];
}

// ── GET /planned-downtime ────────────────────────────────────────────────────
router.get(routes.plannedDowntime, async (req, res) => {
  try {
    const month = req.query.month || currentMonth();
    const range = monthToDateRange(month);
    if (!range) return res.status(400).json({ success: false, error: { message: apiErrors.reports.invalidMonth } });

    const config = await loadDowntimeSourceConfig();
    const entries = await fetchPlannedDowntimeFromSnow(config, range.startDate, range.endDate, req.headers.cookie);

    res.json({
      success: true,
      data: Array.isArray(entries) ? entries : [],
      count: Array.isArray(entries) ? entries.length : 0,
    });
  } catch (err) {
    log.error('GET planned downtime failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.plannedDowntime.fetchFailed.replace('{message}', err.message) } });
  }
});

// ── POST /planned-downtime/sync ──────────────────────────────────────────────
// Same as GET but explicit sync semantics; accepts month in body or defaults to current month
router.post(routes.plannedDowntimeSync, async (req, res) => {
  try {
    const month = req.body.month || currentMonth();
    const range = monthToDateRange(month);
    if (!range) return res.status(400).json({ success: false, error: { message: apiErrors.reports.invalidMonth } });

    const config = await loadDowntimeSourceConfig();
    const entries = await fetchPlannedDowntimeFromSnow(config, range.startDate, range.endDate, req.headers.cookie);

    const count = Array.isArray(entries) ? entries.length : 0;
    log.info('Planned downtime sync complete', { month, count });
    res.json({
      success: true,
      data: Array.isArray(entries) ? entries : [],
      count,
      message: apiMessages.plannedDowntime.synced.replace('{count}', String(count)),
    });
  } catch (err) {
    log.error('POST planned downtime sync failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.plannedDowntime.syncFailed.replace('{message}', err.message) } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SERVER-SENT EVENTS (SSE) — Real-time Poll Completion Events
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /events/poll ─────────────────────────────────────────────────────────
// SSE endpoint for real-time poll completion events
router.get(routes.pollEvents, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  log.info('SSE client connected for poll events');

  // Subscribe to poll events
  const unsubscribe = subscribeToEvents(res);

  // Handle client disconnect
  req.on('close', () => {
    unsubscribe();
    res.end();
  });

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
});

export default router;
