// ============================================================================
// UptimeReportService.js — HealthCheck Module Uptime & SLA Report Engine
//
// PURPOSE: Server-side calculation engine for all uptime/SLA reports.
//   All calculations are done here — frontend receives ready-to-display JSON.
//
// FUNCTIONS:
//   - getMonthlyUptimeReport(month)    → Full SLA report per app with verdicts
//   - getPollVerification(month)       → Expected vs actual polls per app
//   - getUnplannedDowntime(month, appId) → Downtime windows (unplanned only)
//   - getDashboardSummary()            → Live dashboard stats
//
// MONTH FORMAT: 'YYYY-MM' (e.g. '2026-03')
// ============================================================================
import { dbSchema, DatabaseService, loadPollerConfig, loadDowntimeSourceConfig } from '#modules/healthcheck/api/routes/helpers.js';
import { createHcLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';
import { getStatus as getPollerStatus, getLatestStatus } from '#modules/healthcheck/api/services/PollerService.js';

const log = createHcLogger('UptimeReportService.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseMonth(monthStr) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthStr);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0)); // first ms of next month
  return { year, month, start, end };
}

function minutesBetween(a, b) {
  return Math.max(0, (b.getTime() - a.getTime()) / 60000);
}

/**
 * Calculate total planned downtime minutes for an app in a month.
 * Overlapping windows are merged before summing.
 */
function calcPlannedDowntimeMinutes(downtimeRows, monthStart, monthEnd) {
  if (!downtimeRows || downtimeRows.length === 0) return 0;

  // Clip windows to month boundaries and sort
  const windows = downtimeRows
    .map(r => ({
      start: new Date(Math.max(new Date(r.start_time).getTime(), monthStart.getTime())),
      end:   new Date(Math.min(new Date(r.end_time).getTime(),   monthEnd.getTime())),
    }))
    .filter(w => w.end > w.start)
    .sort((a, b) => a.start - b.start);

  if (windows.length === 0) return 0;

  // Merge overlapping windows
  const merged = [windows[0]];
  for (let i = 1; i < windows.length; i++) {
    const last = merged[merged.length - 1];
    if (windows[i].start <= last.end) {
      last.end = new Date(Math.max(last.end.getTime(), windows[i].end.getTime()));
    } else {
      merged.push(windows[i]);
    }
  }

  return merged.reduce((sum, w) => sum + minutesBetween(w.start, w.end), 0);
}

// ── Monthly Uptime Report ────────────────────────────────────────────────────

export async function getMonthlyUptimeReport(monthStr) {
  const parsed = parseMonth(monthStr);
  if (!parsed) throw new Error(`Invalid month format: ${monthStr}`);
  const { start: monthStart, end: monthEnd } = parsed;

  log.info('Generating monthly uptime report', { month: monthStr });

  // Calculate how far into the month we are (for current month partial calc)
  const now = new Date();
  const effectiveEnd = now < monthEnd ? now : monthEnd;
  const totalMinutesInMonth = minutesBetween(monthStart, monthEnd);
  const elapsedMinutes = minutesBetween(monthStart, effectiveEnd);

  // Load all active apps
  const appsResult = await DatabaseService.query(
    `SELECT a.*, c.name as category_name, c.color as category_color
     FROM ${dbSchema}.hc_applications a
     LEFT JOIN ${dbSchema}.hc_categories c ON a.category_id = c.id
     WHERE a.is_active = true
     ORDER BY a.sort_order, a.name`
  );
  const apps = appsResult.rows || [];

  // Load poller config for expected poll count calculation
  const pollerConfig = await loadPollerConfig();
  const intervalSeconds = pollerConfig.intervalSeconds || 60;
  const expectedPollsTotal = Math.floor(totalMinutesInMonth / (intervalSeconds / 60));
  const expectedPollsElapsed = Math.floor(elapsedMinutes / (intervalSeconds / 60));

  const report = [];

  for (const app of apps) {
    // Count polls for this app in the month
    const pollCountResult = await DatabaseService.query(
      `SELECT
         COUNT(*)::int AS total_polls,
         COUNT(*) FILTER (WHERE status = 'UP')::int AS up_polls,
         COUNT(*) FILTER (WHERE status = 'DOWN')::int AS down_polls
       FROM ${dbSchema}.hc_poll_results
       WHERE application_id = $1
         AND polled_at >= $2
         AND polled_at < $3`,
      [app.id, monthStart.toISOString(), monthEnd.toISOString()]
    );
    const { total_polls, up_polls, down_polls } = pollCountResult.rows[0] || { total_polls: 0, up_polls: 0, down_polls: 0 };

    // Load planned downtime for this app
    const downtimeResult = await DatabaseService.query(
      `SELECT start_time, end_time, change_number, change_type, short_description, source
       FROM ${dbSchema}.hc_planned_downtime
       WHERE (application_id = $1 OR application_id IS NULL)
         AND start_time < $3
         AND end_time > $2
       ORDER BY start_time`,
      [app.id, monthStart.toISOString(), monthEnd.toISOString()]
    );
    const plannedDowntimeMinutes = calcPlannedDowntimeMinutes(downtimeResult.rows, monthStart, monthEnd);

    // Load SLA target (app-level override or global default)
    let slaTarget = parseFloat(app.sla_target_percent) || 99.00;
    const slaOverride = await DatabaseService.query(
      `SELECT sla_target_percent FROM ${dbSchema}.hc_uptime_sla
       WHERE application_id = $1 AND month = $2`,
      [app.id, monthStr]
    );
    if (slaOverride.rows.length > 0) {
      slaTarget = parseFloat(slaOverride.rows[0].sla_target_percent);
    }

    // Calculate uptime
    // Actual downtime minutes from poll results (DOWN polls × interval)
    const actualDownMinutes = down_polls * (intervalSeconds / 60);
    // Effective downtime = actual downtime - planned downtime (cannot go below 0)
    const unplannedDownMinutes = Math.max(0, actualDownMinutes - plannedDowntimeMinutes);
    // Effective operating minutes = elapsed - planned downtime
    const effectiveOperatingMinutes = Math.max(1, elapsedMinutes - plannedDowntimeMinutes);
    // Uptime % = (effectiveOperating - unplannedDown) / effectiveOperating × 100
    const uptimePercent = total_polls > 0
      ? Math.min(100, ((effectiveOperatingMinutes - unplannedDownMinutes) / effectiveOperatingMinutes) * 100)
      : null;

    const slaVerdict = uptimePercent !== null
      ? (uptimePercent >= slaTarget ? 'MET' : 'NOT_MET')
      : 'NO_DATA';

    // Poll verification
    const pollVerificationStatus = total_polls >= expectedPollsElapsed ? 'ACCURATE' : 'INCOMPLETE';

    report.push({
      applicationId: app.id,
      name: app.name,
      url: app.url,
      categoryName: app.category_name || 'Uncategorized',
      categoryColor: app.category_color || '#6366f1',
      // SLA
      slaTargetPercent: slaTarget,
      actualUptimePercent: uptimePercent !== null ? parseFloat(uptimePercent.toFixed(4)) : null,
      slaVerdict,
      // Poll counts
      totalPolls: total_polls,
      upPolls: up_polls,
      downPolls: down_polls,
      expectedPollsTotal,
      expectedPollsElapsed,
      pollVerificationStatus,
      // Downtime
      actualDowntimeMinutes: parseFloat(actualDownMinutes.toFixed(2)),
      plannedDowntimeMinutes: parseFloat(plannedDowntimeMinutes.toFixed(2)),
      unplannedDowntimeMinutes: parseFloat(unplannedDownMinutes.toFixed(2)),
      plannedDowntimeEntries: downtimeResult.rows.length,
      // Meta
      month: monthStr,
      totalMinutesInMonth: parseFloat(totalMinutesInMonth.toFixed(2)),
      elapsedMinutes: parseFloat(elapsedMinutes.toFixed(2)),
      effectiveOperatingMinutes: parseFloat(effectiveOperatingMinutes.toFixed(2)),
      intervalSeconds,
    });
  }

  log.info('Monthly uptime report generated', { month: monthStr, apps: report.length });
  return {
    month: monthStr,
    generatedAt: new Date().toISOString(),
    totalMinutesInMonth,
    elapsedMinutes: parseFloat(elapsedMinutes.toFixed(2)),
    intervalSeconds,
    expectedPollsTotal,
    expectedPollsElapsed,
    applications: report,
  };
}

// ── Poll Verification ────────────────────────────────────────────────────────

export async function getPollVerification(monthStr) {
  const parsed = parseMonth(monthStr);
  if (!parsed) throw new Error(`Invalid month format: ${monthStr}`);
  const { start: monthStart, end: monthEnd } = parsed;

  const now = new Date();
  const effectiveEnd = now < monthEnd ? now : monthEnd;
  const elapsedMinutes = minutesBetween(monthStart, effectiveEnd);

  const pollerConfig = await loadPollerConfig();
  const intervalSeconds = pollerConfig.intervalSeconds || 60;
  const expectedPollsElapsed = Math.floor(elapsedMinutes / (intervalSeconds / 60));
  const expectedPollsTotal = Math.floor(minutesBetween(monthStart, monthEnd) / (intervalSeconds / 60));

  const result = await DatabaseService.query(
    `SELECT a.id, a.name, a.url,
            COUNT(pr.id)::int AS actual_polls,
            COUNT(pr.id) FILTER (WHERE pr.status = 'UP')::int AS up_polls,
            COUNT(pr.id) FILTER (WHERE pr.status = 'DOWN')::int AS down_polls,
            MIN(pr.polled_at) AS first_poll,
            MAX(pr.polled_at) AS last_poll
     FROM ${dbSchema}.hc_applications a
     LEFT JOIN ${dbSchema}.hc_poll_results pr
       ON pr.application_id = a.id
       AND pr.polled_at >= $1
       AND pr.polled_at < $2
     WHERE a.is_active = true
     GROUP BY a.id, a.name, a.url
     ORDER BY a.sort_order, a.name`,
    [monthStart.toISOString(), monthEnd.toISOString()]
  );

  const apps = (result.rows || []).map(row => ({
    applicationId: row.id,
    name: row.name,
    url: row.url,
    actualPolls: row.actual_polls,
    expectedPollsElapsed,
    expectedPollsTotal,
    upPolls: row.up_polls,
    downPolls: row.down_polls,
    firstPoll: row.first_poll,
    lastPoll: row.last_poll,
    coveragePercent: expectedPollsElapsed > 0
      ? parseFloat(((row.actual_polls / expectedPollsElapsed) * 100).toFixed(2))
      : 0,
    status: row.actual_polls >= expectedPollsElapsed ? 'ACCURATE' : 'INCOMPLETE',
  }));

  return {
    month: monthStr,
    generatedAt: new Date().toISOString(),
    intervalSeconds,
    expectedPollsElapsed,
    expectedPollsTotal,
    elapsedMinutes: parseFloat(elapsedMinutes.toFixed(2)),
    applications: apps,
  };
}

// ── Unplanned Downtime ───────────────────────────────────────────────────────

export async function getUnplannedDowntime(monthStr, appId) {
  const parsed = parseMonth(monthStr);
  if (!parsed) throw new Error(`Invalid month format: ${monthStr}`);
  const { start: monthStart, end: monthEnd } = parsed;

  log.info('Loading unplanned downtime', { month: monthStr, appId });

  // Get all DOWN poll results for this month, grouped into consecutive windows
  const params = [monthStart.toISOString(), monthEnd.toISOString()];
  let whereClause = 'pr.polled_at >= $1 AND pr.polled_at < $2 AND pr.status = \'DOWN\'';
  if (appId) {
    whereClause += ' AND pr.application_id = $3';
    params.push(appId);
  }

  const result = await DatabaseService.query(
    `SELECT pr.application_id, a.name AS app_name, a.url AS app_url,
            pr.polled_at, pr.http_status_code, pr.response_time_ms, pr.error_message
     FROM ${dbSchema}.hc_poll_results pr
     JOIN ${dbSchema}.hc_applications a ON a.id = pr.application_id
     WHERE ${whereClause}
     ORDER BY pr.application_id, pr.polled_at`,
    params
  );

  // Group consecutive DOWN polls into downtime windows
  const pollerConfig = await loadPollerConfig();
  const intervalMs = (pollerConfig.intervalSeconds || 60) * 1000;
  const gapThreshold = intervalMs * 2.5; // Allow 2.5× interval gap before splitting

  const downtimeWindows = [];
  let currentWindow = null;

  for (const row of (result.rows || [])) {
    const polledAt = new Date(row.polled_at);

    if (!currentWindow || row.application_id !== currentWindow.applicationId ||
        (polledAt.getTime() - currentWindow.lastPollTime > gapThreshold)) {
      // Start new window
      if (currentWindow) downtimeWindows.push(currentWindow);
      currentWindow = {
        applicationId: row.application_id,
        appName: row.app_name,
        appUrl: row.app_url,
        startTime: row.polled_at,
        endTime: row.polled_at,
        lastPollTime: polledAt.getTime(),
        pollCount: 1,
        errors: [row.error_message].filter(Boolean),
      };
    } else {
      // Extend current window
      currentWindow.endTime = row.polled_at;
      currentWindow.lastPollTime = polledAt.getTime();
      currentWindow.pollCount++;
      if (row.error_message && !currentWindow.errors.includes(row.error_message)) {
        currentWindow.errors.push(row.error_message);
      }
    }
  }
  if (currentWindow) downtimeWindows.push(currentWindow);

  // Calculate duration for each window
  const windows = downtimeWindows.map(w => {
    const durationMs = new Date(w.endTime).getTime() - new Date(w.startTime).getTime() + intervalMs;
    return {
      applicationId: w.applicationId,
      appName: w.appName,
      appUrl: w.appUrl,
      startTime: w.startTime,
      endTime: w.endTime,
      durationMinutes: parseFloat((durationMs / 60000).toFixed(2)),
      pollCount: w.pollCount,
      errors: w.errors,
    };
  });

  // Load planned downtime to mark which windows overlap planned maintenance
  const pdResult = await DatabaseService.query(
    `SELECT application_id, start_time, end_time, change_number, change_type, short_description
     FROM ${dbSchema}.hc_planned_downtime
     WHERE start_time < $2 AND end_time > $1
     ${appId ? 'AND (application_id = $3 OR application_id IS NULL)' : ''}
     ORDER BY start_time`,
    appId ? [monthStart.toISOString(), monthEnd.toISOString(), appId]
          : [monthStart.toISOString(), monthEnd.toISOString()]
  );
  const plannedWindows = pdResult.rows || [];

  // Tag each downtime window as planned/unplanned
  const taggedWindows = windows.map(w => {
    const wStart = new Date(w.startTime).getTime();
    const wEnd = new Date(w.endTime).getTime();
    const isPlanned = plannedWindows.some(pw => {
      const pwStart = new Date(pw.start_time).getTime();
      const pwEnd = new Date(pw.end_time).getTime();
      return (pw.application_id === w.applicationId || pw.application_id === null) &&
             pwStart <= wEnd && pwEnd >= wStart;
    });
    return { ...w, type: isPlanned ? 'planned' : 'unplanned' };
  });

  return {
    month: monthStr,
    generatedAt: new Date().toISOString(),
    totalWindows: taggedWindows.length,
    unplannedWindows: taggedWindows.filter(w => w.type === 'unplanned').length,
    plannedWindows: taggedWindows.filter(w => w.type === 'planned').length,
    windows: taggedWindows,
  };
}

// ── Dashboard Summary ────────────────────────────────────────────────────────

export async function getDashboardSummary() {
  log.info('Generating dashboard summary');

  // Get all active apps with categories
  const appsResult = await DatabaseService.query(
    `SELECT a.*, c.name as category_name, c.color as category_color
     FROM ${dbSchema}.hc_applications a
     LEFT JOIN ${dbSchema}.hc_categories c ON a.category_id = c.id
     WHERE a.is_active = true
     ORDER BY a.sort_order, a.name`
  );
  const apps = appsResult.rows || [];

  // Get latest poll result per app
  const latestResult = await DatabaseService.query(
    `SELECT DISTINCT ON (application_id)
       application_id, status, http_status_code, response_time_ms, text_match, error_message, polled_at
     FROM ${dbSchema}.hc_poll_results
     ORDER BY application_id, polled_at DESC`
  );
  const latestMap = {};
  for (const row of (latestResult.rows || [])) {
    latestMap[row.application_id] = row;
  }

  // Get today's poll stats
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStatsResult = await DatabaseService.query(
    `SELECT
       COUNT(*)::int AS total_polls_today,
       COUNT(*) FILTER (WHERE status = 'UP')::int AS up_today,
       COUNT(*) FILTER (WHERE status = 'DOWN')::int AS down_today
     FROM ${dbSchema}.hc_poll_results
     WHERE polled_at >= $1`,
    [todayStart.toISOString()]
  );
  const todayStats = todayStatsResult.rows[0] || { total_polls_today: 0, up_today: 0, down_today: 0 };

  // Get current month stats
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthStatsResult = await DatabaseService.query(
    `SELECT
       COUNT(*)::int AS total_polls_month,
       COUNT(*) FILTER (WHERE status = 'UP')::int AS up_month,
       COUNT(*) FILTER (WHERE status = 'DOWN')::int AS down_month
     FROM ${dbSchema}.hc_poll_results
     WHERE polled_at >= $1`,
    [monthStart.toISOString()]
  );
  const monthStats = monthStatsResult.rows[0] || { total_polls_month: 0, up_month: 0, down_month: 0 };

  // Poller status
  const pollerStatus = getPollerStatus();

  // Build per-app summary
  const appSummaries = apps.map(app => {
    const latest = latestMap[app.id] || null;
    return {
      id: app.id,
      name: app.name,
      url: app.url,
      categoryName: app.category_name || 'Uncategorized',
      categoryColor: app.category_color || '#6366f1',
      slaTargetPercent: parseFloat(app.sla_target_percent),
      latestStatus: latest?.status || 'UNKNOWN',
      latestHttpCode: latest?.http_status_code || null,
      latestResponseMs: latest?.response_time_ms || null,
      latestError: latest?.error_message || null,
      lastPolledAt: latest?.polled_at || null,
    };
  });

  // Aggregate
  const totalApps = appSummaries.length;
  const appsUp = appSummaries.filter(a => a.latestStatus === 'UP').length;
  const appsDown = appSummaries.filter(a => a.latestStatus === 'DOWN').length;
  const appsUnknown = appSummaries.filter(a => a.latestStatus === 'UNKNOWN').length;

  // Categories breakdown
  const categoryMap = {};
  for (const app of appSummaries) {
    const cat = app.categoryName;
    if (!categoryMap[cat]) categoryMap[cat] = { name: cat, color: app.categoryColor, total: 0, up: 0, down: 0 };
    categoryMap[cat].total++;
    if (app.latestStatus === 'UP') categoryMap[cat].up++;
    if (app.latestStatus === 'DOWN') categoryMap[cat].down++;
  }

  return {
    generatedAt: new Date().toISOString(),
    currentMonth: monthStr,
    totalApps,
    appsUp,
    appsDown,
    appsUnknown,
    poller: pollerStatus,
    today: todayStats,
    month: monthStats,
    categories: Object.values(categoryMap),
    applications: appSummaries,
  };
}
