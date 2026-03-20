// ============================================================================
// UptimeReportService.js — HealthCheck Module Uptime & SLA Report Engine
//
// PURPOSE: Server-side calculation engine for all uptime/SLA reports.
//   All calculations are done here — frontend receives ready-to-display JSON.
//
// ARCHITECTURE:
//   - Global SLA % (single value, measured monthly) from hc_module_config
//   - Only apps in categories with used_for_sla=true are included in reports
//   - Planned downtime entries are pre-fetched by the route handler (which has
//     auth cookies) and passed into getMonthlyUptimeReport() as a parameter
//   - Expected polls: Days in Month × 24 × 60 (1 poll per minute)
//   - Elapsed polls: from pollerStartTime (or month start) until now
//   - Coverage % capped at 100%
//   - All times converted to configured display timezone (IST)
//   - Unplanned downtime = Total downtime - Planned downtime
//
// FUNCTIONS:
//   - getMonthlyUptimeReport(month)    → Full SLA report per app with verdicts
//   - getPollVerification(month)       → Expected vs actual polls per app
//   - getUnplannedDowntime(month, appId) → Downtime windows (unplanned only)
//   - getDashboardSummary()            → Live dashboard stats
//
// MONTH FORMAT: 'YYYY-MM' (e.g. '2026-03')
// ============================================================================
import { dbSchema, DatabaseService, loadPollerConfig, loadGlobalSlaConfig } from '#modules/healthcheck/api/routes/helpers.js';
import { createHcLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';
import { getStatus as getPollerStatus, getLatestStatus } from '#modules/healthcheck/api/services/PollerService.js';

const log = createHcLogger('UptimeReportService.js');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseMonth(monthStr) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthStr);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0)); // first ms of next month
  return { year, month, start, end, monthName: MONTH_NAMES[month - 1] };
}

function minutesBetween(a, b) {
  return Math.max(0, (b.getTime() - a.getTime()) / 60000);
}

/**
 * Format a Date to a display string in the given IANA timezone.
 */
function formatInTz(date, tz) {
  if (!date || !tz) return date ? date.toISOString() : null;
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    }).format(date);
  } catch { return date.toISOString(); }
}

/**
 * Load the global display timezone from the admin /api/timezone endpoint (unprotected).
 * Falls back to 'Asia/Kolkata' (IST) if not configured or API unavailable.
 * Returns { timezone, timezoneLabel }.
 */
async function loadDisplayTimezone() {
  try {
    const PORT = process.env.PORT || 1001;
    const response = await fetch(`http://localhost:${PORT}/api/timezone`);
    if (response.ok) {
      const json = await response.json();
      if (json.success && json.data?.timezone) {
        return { timezone: json.data.timezone, timezoneLabel: json.data.timezoneLabel || 'IST' };
      }
    }
  } catch (err) {
    log.debug('Could not load global timezone config', { message: err.message });
  }
  return { timezone: 'Asia/Kolkata', timezoneLabel: 'IST' };
}

/**
 * Calculate total planned downtime minutes from SNOW downtime entries.
 * Overlapping windows are merged before summing.
 */
function calcPlannedDowntimeMinutes(downtimeEntries, monthStart, monthEnd) {
  if (!downtimeEntries || downtimeEntries.length === 0) return 0;

  // Clip windows to month boundaries and sort
  const windows = downtimeEntries
    .map(r => {
      const sRaw = r._start_time || r.start_time || r.startTime || r.work_start;
      const eRaw = r._end_time || r.end_time || r.endTime || r.work_end;
      if (!sRaw || !eRaw) return null;
      // Parse: the times may be in display TZ format "YYYY-MM-DDTHH:MM:SS" or ISO
      const sDate = new Date(sRaw);
      const eDate = new Date(eRaw);
      if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) return null;
      return {
        start: new Date(Math.max(sDate.getTime(), monthStart.getTime())),
        end:   new Date(Math.min(eDate.getTime(), monthEnd.getTime())),
      };
    })
    .filter(w => w && w.end > w.start)
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

/**
 * Fetch missed poll minutes for a specific application.
 * Returns array of { minute: ISO string, display: formatted time } for each missed minute.
 */
async function getMissedPollMinutes(appId, effectivePollerStart, effectiveEnd, dbSchema) {
  if (!effectivePollerStart) return [];

  // Query all distinct minutes when polls were recorded for this app
  const recordedMinutesResult = await DatabaseService.query(
    `SELECT DISTINCT DATE_TRUNC('minute', polled_at) AS poll_minute
     FROM ${dbSchema}.hc_poll_results
     WHERE application_id = $1
       AND polled_at >= $2
       AND polled_at < $3
     ORDER BY poll_minute ASC`,
    [appId, effectivePollerStart.toISOString(), effectiveEnd.toISOString()]
  );

  const recordedMinutes = new Set(
    recordedMinutesResult.rows.map(r => new Date(r.poll_minute).getTime())
  );

  // Generate all expected minute boundaries
  const missedMinutes = [];
  let currentMinute = new Date(effectivePollerStart);
  currentMinute.setSeconds(0);
  currentMinute.setMilliseconds(0);

  while (currentMinute < effectiveEnd) {
    const minuteTime = currentMinute.getTime();
    if (!recordedMinutes.has(minuteTime)) {
      missedMinutes.push({
        minute: currentMinute.toISOString(),
        display: formatInTz(currentMinute, 'Asia/Kolkata'), // Format as HH:MM
      });
    }
    currentMinute = new Date(currentMinute.getTime() + 60000); // Add 1 minute
  }

  return missedMinutes;
}

// ── Monthly Uptime Report ────────────────────────────────────────────────────

/**
 * Generate the monthly uptime SLA report.
 * @param {string} monthStr - Month in 'YYYY-MM' format
 * @param {Array} [plannedDowntimeEntries=[]] - Pre-fetched planned downtime entries from SNOW.
 *   The route handler fetches these (with auth cookies) and passes them in.
 *   Falls back to empty array if not provided.
 */
export async function getMonthlyUptimeReport(monthStr, plannedDowntimeEntries = []) {
  const parsed = parseMonth(monthStr);
  if (!parsed) throw new Error(`Invalid month format: ${monthStr}`);
  const { year, month, start: monthStart, end: monthEnd, monthName } = parsed;

  log.info('Generating monthly uptime report', { month: monthStr });

  // Load timezone from global admin API
  const { timezone: displayTimezone, timezoneLabel } = await loadDisplayTimezone();

  // Load global SLA config
  const globalSla = await loadGlobalSlaConfig();
  const slaTarget = globalSla.slaTargetPercent || 99;

  // Calculate how far into the month we are (for current month partial calc)
  const now = new Date();
  const isCurrentMonth = now >= monthStart && now < monthEnd;
  const effectiveEnd = now < monthEnd ? now : monthEnd;
  const totalMinutesInMonth = minutesBetween(monthStart, monthEnd);
  const elapsedMinutes = minutesBetween(monthStart, effectiveEnd);
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalHoursInMonth = daysInMonth * 24;

  // Load poller config for interval
  const pollerConfig = await loadPollerConfig();
  const intervalSeconds = pollerConfig.intervalSeconds || 60;
  const pollerStartTime = pollerConfig.pollerStartTime ? new Date(pollerConfig.pollerStartTime) : null;

  // Query actual first poll time from DB for this month (stable, not affected by poller restarts)
  const firstPollResult = await DatabaseService.query(
    `SELECT MIN(polled_at) AS first_poll FROM ${dbSchema}.hc_poll_results
     WHERE polled_at >= $1 AND polled_at < $2`,
    [monthStart.toISOString(), monthEnd.toISOString()]
  );
  const actualFirstPoll = firstPollResult.rows[0]?.first_poll
    ? new Date(firstPollResult.rows[0].first_poll)
    : null;

  // Expected Polls (Month) = Days in Month × 24 hours × 60 minutes (1 poll per minute)
  const expectedPollsTotal = daysInMonth * 24 * 60;

  // Expected Polls (Elapsed) = minutes from pollerStartTime (from config) until end of month
  // If pollerStartTime is null, poller never started, so expected = 0
  let effectivePollerStart = null;
  let expectedPollsElapsed = 0;
  let actualPollsElapsed = 0;

  if (pollerStartTime && pollerStartTime >= monthStart && pollerStartTime <= effectiveEnd) {
    effectivePollerStart = pollerStartTime;
    const pollingMinutes = minutesBetween(effectivePollerStart, effectiveEnd);
    expectedPollsElapsed = Math.floor(pollingMinutes) + 1;

    // Query distinct poll minutes from pollerStartTime onwards
    const distinctPollMinutesResult = await DatabaseService.query(
      `SELECT COUNT(DISTINCT DATE_TRUNC('minute', polled_at)) AS distinct_minutes
       FROM ${dbSchema}.hc_poll_results
       WHERE polled_at >= $1 AND polled_at < $2`,
      [effectivePollerStart.toISOString(), effectiveEnd.toISOString()]
    );
    actualPollsElapsed = distinctPollMinutesResult.rows[0]?.distinct_minutes || 0;
  } else if (!pollerStartTime) {
    // Poller never started
    effectivePollerStart = null;
    expectedPollsElapsed = 0;
    actualPollsElapsed = 0;
  } else {
    // pollerStartTime is outside the month range
    effectivePollerStart = null;
    expectedPollsElapsed = 0;
    actualPollsElapsed = 0;
  }

  // Build calculation breakdowns for auditing
  const expectedPollsMonthFormula = `${daysInMonth} Days × 24 Hours × 60 Minutes = ${expectedPollsTotal} Polls`;
  // Format times without seconds (only HH:MM)
  const formatTimeNoSeconds = (date) => {
    if (!date) return '—';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = date.getHours() >= 12 ? 'pm' : 'am';
    const displayHours = date.getHours() % 12 || 12;
    return `${String(displayHours).padStart(2, '0')}:${minutes} ${ampm}`;
  };
  const elapsedStartDisplay = formatTimeNoSeconds(effectivePollerStart);
  const elapsedEndDisplay = formatTimeNoSeconds(effectiveEnd);
  const elapsedMinutesRounded = effectivePollerStart ? Math.floor(minutesBetween(effectivePollerStart, effectiveEnd)) : 0;
  const expectedPollsElapsedFormula = effectivePollerStart
    ? `${elapsedStartDisplay} → ${elapsedEndDisplay} = ${elapsedMinutesRounded} Minutes = ${expectedPollsElapsed} Polls [System performs 1 Poll Each Minute]`
    : 'Poller not started — no expected polls';

  // Elapsed hours for SLA display
  const elapsedHours = parseFloat((elapsedMinutes / 60).toFixed(2));

  // Load only active apps in categories with used_for_sla = true
  const appsResult = await DatabaseService.query(
    `SELECT a.*, c.name as category_name, c.color as category_color, c.used_for_sla
     FROM ${dbSchema}.hc_applications a
     LEFT JOIN ${dbSchema}.hc_categories c ON a.category_id = c.id
     WHERE a.is_active = true AND c.used_for_sla = true
     ORDER BY c.sort_order, a.sort_order, a.name`
  );
  const apps = appsResult.rows || [];

  // plannedDowntimeEntries are passed in by the route handler (which has auth cookies)
  log.info('Using planned downtime entries for report', { count: plannedDowntimeEntries.length });

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

    // Filter planned downtime entries relevant to this app (or global entries with no app)
    const appDowntimeEntries = plannedDowntimeEntries.filter(e =>
      !e.application_id || e.application_id === app.id
    );
    // Only calculate planned downtime for the period between pollerStartTime and current time
    const plannedDowntimeMinutes = calcPlannedDowntimeMinutes(appDowntimeEntries, effectivePollerStart, effectiveEnd);

    // Calculate actual uptime % = (Up Polls / Expected Polls) * 100
    const actualUptimePercent = expectedPollsElapsed > 0
      ? Math.min(100, parseFloat(((up_polls / expectedPollsElapsed) * 100).toFixed(2)))
      : null;

    // Calculate downtime minutes from DOWN polls
    const downMinutes = down_polls * (intervalSeconds / 60);
    
    // Calculate unplanned downtime: downtime that is NOT covered by planned downtime
    // Unplanned Downtime Minutes = DOWN Poll Minutes - Planned Downtime Minutes (cannot be negative)
    const unplannedDownMinutes = Math.max(0, downMinutes - plannedDowntimeMinutes);
    
    // Calculate SLA: (Actual Uptime Minutes + Planned Downtime Minutes) / Total Minutes * 100
    // Actual Uptime Minutes = (Up Polls * interval) 
    // Total Minutes = Elapsed Minutes (from when poller started, not from month start)
    const upMinutes = up_polls * (intervalSeconds / 60);
    const slaElapsedMinutes = effectivePollerStart ? minutesBetween(effectivePollerStart, effectiveEnd) : 0;
    const slaCompliance = slaElapsedMinutes > 0
      ? Math.min(100, parseFloat((((upMinutes + plannedDowntimeMinutes) / slaElapsedMinutes) * 100).toFixed(2)))
      : null;

    const slaVerdict = slaCompliance !== null
      ? (slaCompliance >= slaTarget ? 'MET' : 'NOT_MET')
      : 'NO_DATA';

    // Poll coverage: capped at 100%, shows actual polls / expected polls
    // 100% only if Actual Polls >= Expected Polls for this app
    const pollCoveragePercent = expectedPollsElapsed > 0
      ? Math.min(100, parseFloat(((total_polls / expectedPollsElapsed) * 100).toFixed(2)))
      : 0;
    const pollsMatch = total_polls >= expectedPollsElapsed;
    const pollVerificationStatus = isCurrentMonth
      ? (pollsMatch ? 'ACCURATE' : 'IN_PROGRESS')
      : (pollsMatch ? 'ACCURATE' : 'INCOMPLETE');

    // Fetch missed poll minutes for this app (only if there are missed polls)
    const missedPollMinutes = total_polls < expectedPollsElapsed
      ? await getMissedPollMinutes(app.id, effectivePollerStart, effectiveEnd, dbSchema)
      : [];

    report.push({
      applicationId: app.id,
      name: app.name,
      url: app.url,
      categoryName: app.category_name || 'Uncategorized',
      categoryColor: app.category_color || '#6366f1',
      // SLA (global)
      slaTargetPercent: slaTarget,
      // Poll counts
      totalPolls: total_polls,
      upPolls: up_polls,
      downPolls: down_polls,
      expectedPollsTotal,
      expectedPollsElapsed,
      pollCoveragePercent,
      pollsMatch,
      pollVerificationStatus,
      missedPollMinutes,
      // Uptime & SLA
      actualUptimePercent,
      slaCompliance,
      slaVerdict,
      // Downtime
      actualDowntimeMinutes: parseFloat(downMinutes.toFixed(2)),
      plannedDowntimeMinutes: parseFloat(plannedDowntimeMinutes.toFixed(2)),
      unplannedDowntimeMinutes: parseFloat(unplannedDownMinutes.toFixed(2)),
      plannedDowntimeEntries: appDowntimeEntries.length,
      // Meta
      month: monthStr,
      totalMinutesInMonth: parseFloat(totalMinutesInMonth.toFixed(2)),
      elapsedMinutes: parseFloat(elapsedMinutes.toFixed(2)),
      intervalSeconds,
    });
  }

  // Calculate combined/actual SLA compliance across all apps
  const slaContributingApps = report.filter(app => app.slaCompliance !== null);
  const actualSlaCompliance = slaContributingApps.length > 0
    ? parseFloat((slaContributingApps.reduce((sum, app) => sum + (app.slaCompliance || 0), 0) / slaContributingApps.length).toFixed(2))
    : null;

  log.info('Monthly uptime report generated', { month: monthStr, apps: report.length, plannedDowntime: plannedDowntimeEntries.length, actualSla: actualSlaCompliance });
  return {
    month: monthStr,
    monthDisplay: `${monthStr} (${monthName})`,
    generatedAt: now.toISOString(),
    generatedAtDisplay: formatInTz(now, displayTimezone),
    isCurrentMonth,
    displayTimezone,
    timezoneLabel,
    slaTargetPercent: slaTarget,
    actualSlaCompliance,
    // Time dimensions
    daysInMonth,
    totalHoursInMonth,
    totalMinutesInMonth: parseFloat(totalMinutesInMonth.toFixed(0)),
    elapsedMinutes: parseFloat(elapsedMinutes.toFixed(0)),
    elapsedHours,
    intervalSeconds,
    // Poller
    pollerStartTime: pollerStartTime ? pollerStartTime.toISOString() : null,
    pollerStartTimeDisplay: pollerStartTime ? formatInTz(pollerStartTime, displayTimezone) : null,
    // Expected polls with formulas
    expectedPollsTotal,
    expectedPollsElapsed,
    actualPollsElapsed,
    expectedPollsMonthFormula,
    expectedPollsElapsedFormula,
    // SLA summary (hours-based for reference graphs)
    expectedUptimeHours: parseFloat((totalHoursInMonth * (slaTarget / 100)).toFixed(2)),
    expectedDowntimeHours: parseFloat((totalHoursInMonth * ((100 - slaTarget) / 100)).toFixed(2)),
    // Planned downtime
    plannedDowntimeEntries,
    totalPlannedDowntimeMinutes: parseFloat(calcPlannedDowntimeMinutes(plannedDowntimeEntries, monthStart, monthEnd).toFixed(2)),
    applications: report,
  };
}

// ── Poll Verification ────────────────────────────────────────────────────────

export async function getPollVerification(monthStr) {
  const parsed = parseMonth(monthStr);
  if (!parsed) throw new Error(`Invalid month format: ${monthStr}`);
  const { year, month, start: monthStart, end: monthEnd, monthName } = parsed;

  const now = new Date();
  const isCurrentMonth = now >= monthStart && now < monthEnd;
  const effectiveEnd = now < monthEnd ? now : monthEnd;
  const daysInMonth = new Date(year, month, 0).getDate();

  const { timezone: displayTimezone, timezoneLabel } = await loadDisplayTimezone();
  const pollerConfig = await loadPollerConfig();
  const intervalSeconds = pollerConfig.intervalSeconds || 60;
  const pollerStartTime = pollerConfig.pollerStartTime ? new Date(pollerConfig.pollerStartTime) : null;

  // Query actual first poll time from DB for this month (stable, not affected by poller restarts)
  const firstPollResult = await DatabaseService.query(
    `SELECT MIN(polled_at) AS first_poll FROM ${dbSchema}.hc_poll_results
     WHERE polled_at >= $1 AND polled_at < $2`,
    [monthStart.toISOString(), monthEnd.toISOString()]
  );
  const actualFirstPoll = firstPollResult.rows[0]?.first_poll
    ? new Date(firstPollResult.rows[0].first_poll)
    : null;

  // Use actual first poll from DB as stable reference (not volatile pollerStartTime
  // which resets on every poller restart/hot-reload)
  const effectivePollerStart = actualFirstPoll && actualFirstPoll > monthStart
    ? actualFirstPoll
    : monthStart;
  const pollingMinutes = minutesBetween(effectivePollerStart, effectiveEnd);
  const expectedPollsElapsed = Math.floor(pollingMinutes) + 1;
  const expectedPollsTotal = daysInMonth * 24 * 60;

  // Only apps in SLA-enabled categories
  const result = await DatabaseService.query(
    `SELECT a.id, a.name, a.url, c.name as category_name, c.color as category_color,
            COUNT(pr.id)::int AS actual_polls,
            COUNT(pr.id) FILTER (WHERE pr.status = 'UP')::int AS up_polls,
            COUNT(pr.id) FILTER (WHERE pr.status = 'DOWN')::int AS down_polls,
            MIN(pr.polled_at) AS first_poll,
            MAX(pr.polled_at) AS last_poll
     FROM ${dbSchema}.hc_applications a
     LEFT JOIN ${dbSchema}.hc_categories c ON a.category_id = c.id
     LEFT JOIN ${dbSchema}.hc_poll_results pr
       ON pr.application_id = a.id
       AND pr.polled_at >= $1
       AND pr.polled_at < $2
     WHERE a.is_active = true AND c.used_for_sla = true
     GROUP BY a.id, a.name, a.url, c.name, c.color
     ORDER BY a.sort_order, a.name`,
    [monthStart.toISOString(), monthEnd.toISOString()]
  );

  const apps = (result.rows || []).map(row => {
    const pollsMatch = row.actual_polls >= expectedPollsElapsed;
    return {
      applicationId: row.id,
      name: row.name,
      url: row.url,
      categoryName: row.category_name,
      categoryColor: row.category_color,
      actualPolls: row.actual_polls,
      expectedPollsElapsed,
      expectedPollsTotal,
      upPolls: row.up_polls,
      downPolls: row.down_polls,
      firstPoll: row.first_poll,
      lastPoll: row.last_poll,
      coveragePercent: expectedPollsElapsed > 0
        ? Math.min(100, parseFloat(((row.actual_polls / expectedPollsElapsed) * 100).toFixed(2)))
        : 0,
      pollsMatch,
      status: pollsMatch ? 'ACCURATE' : (isCurrentMonth ? 'IN_PROGRESS' : 'INCOMPLETE'),
    };
  });

  return {
    month: monthStr,
    monthDisplay: `${monthStr} (${monthName})`,
    generatedAt: new Date().toISOString(),
    isCurrentMonth,
    displayTimezone,
    timezoneLabel,
    intervalSeconds,
    pollerStartTime: pollerStartTime ? pollerStartTime.toISOString() : null,
    pollerStartTimeDisplay: pollerStartTime ? formatInTz(pollerStartTime, displayTimezone) : null,
    expectedPollsElapsed,
    expectedPollsTotal,
    elapsedMinutes: parseFloat(minutesBetween(monthStart, effectiveEnd).toFixed(0)),
    applications: apps,
  };
}

// ── Unplanned Downtime ───────────────────────────────────────────────────────

/**
 * Get unplanned downtime windows for a month.
 * @param {string} monthStr - Month in 'YYYY-MM' format
 * @param {string} [appId] - Optional app ID to filter by
 * @param {Array} [plannedDowntimeEntries=[]] - Pre-fetched planned downtime entries from SNOW.
 *   The route handler fetches these (with auth cookies) and passes them in.
 *   Falls back to empty array if not provided.
 */
export async function getUnplannedDowntime(monthStr, appId, plannedDowntimeEntries = []) {
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

  // Tag each downtime window as planned/unplanned
  // plannedDowntimeEntries are passed in by the route handler (which has auth cookies)
  const taggedWindows = windows.map(w => {
    const wStart = new Date(w.startTime).getTime();
    const wEnd = new Date(w.endTime).getTime();
    const isPlanned = plannedDowntimeEntries.some(pw => {
      const pwStart = new Date(pw.start_time || pw.startTime).getTime();
      const pwEnd = new Date(pw.end_time || pw.endTime).getTime();
      return (!pw.application_id || pw.application_id === w.applicationId) &&
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

  // Poller status (async — fetches timezone from global API)
  const pollerStatus = await getPollerStatus();

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
