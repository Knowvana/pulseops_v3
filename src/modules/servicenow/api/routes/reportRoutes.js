// ============================================================================
// ServiceNow Module — Report Routes
//
// ENDPOINTS:
//   GET /stats                → Dashboard statistics (live from SNOW)
//   GET /reports              → SLA compliance + volume analytics
//   GET /reports/incidents    → Incident report (live from SNOW)
//   GET /reports/ritms        → RITM report
//   GET /reports/sla          → SLA compliance report
//   GET /reports/sla/incidents → Incident SLA report with time filter
//   GET /config/settings      → Get general settings (DB-backed via sn_module_config)
//   PUT /config/settings      → Save general settings (DB-backed via sn_module_config)
//
// MOUNT: router.use('/', reportRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import {
  loadConnectionConfig, loadDefaultsConfig, loadIncidentConfig, loadBusinessHours,
  loadModuleConfig, saveModuleConfig,
  buildAssignmentGroupQuery, snowRequest, snowVal,
  DatabaseService, dbSchema,
} from './helpers.js';

// Import logger for DEBUG level logging
import { logger } from '#shared/logger.js';

const router = Router();

// ═════════════════════════════════════════════════════════════════════════════
// BUSINESS HOURS CALCULATION UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build a lookup map { dayOfWeek: { start, startMin, end, endMin } } from DB rows.
 * Returns empty object if no business hours configured → fallback to calendar time.
 */
function buildBusinessHoursMap(rows) {
  const map = {};
  if (!rows || !Array.isArray(rows) || rows.length === 0) return map;
  for (const row of rows) {
    if (row.is_business_day) {
      const st = String(row.start_time || '09:00').slice(0, 5);
      const et = String(row.end_time || '17:00').slice(0, 5);
      const [sh, sm] = st.split(':').map(Number);
      const [eh, em] = et.split(':').map(Number);
      map[row.day_of_week] = { start: sh, startMin: sm, end: eh, endMin: em };
    }
  }
  return map;
}

/**
 * Normalize priority field values coming back from ServiceNow so they match
 * the configured `priority_value` stored in sn_sla_config ("1"-"4").
 * Handles representations like "1", "1 - Critical", "P1", "Priority 1".
 */
function normalizePriorityValue(raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) return str; // already numeric
  const digitMatch = str.match(/(\d)/);
  if (digitMatch) return digitMatch[1];
  const lower = str.toLowerCase();
  if (lower.includes('critical')) return '1';
  if (lower.includes('high')) return '2';
  if (lower.includes('medium') || lower.includes('moderate')) return '3';
  if (lower.includes('low')) return '4';
  if (lower.includes('planning')) return '5';
  return null;
}

/**
 * Add N business minutes to a start date using the hoursMap.
 * Returns a Date object. Falls back to calendar time if hoursMap is empty.
 * Ensures result is always within business hours (if hoursMap is configured).
 */
function addBusinessMinutes(startDate, targetMinutes, hoursMap) {
  if (!startDate || targetMinutes == null) return null;
  if (!hoursMap || Object.keys(hoursMap).length === 0) {
    return new Date(startDate.getTime() + targetMinutes * 60000);
  }
  let current = new Date(startDate);
  let remaining = targetMinutes;
  let guard = 0;
  const debugLog = process.env.DEBUG_SLA === 'true';
  if (debugLog) console.log(`[addBusinessMinutes] Start: ${current.toISOString()}, Target: ${targetMinutes} min, hoursMap keys: ${Object.keys(hoursMap)}`);
  
  while (remaining > 0 && guard++ < 10000) {
    const dow = current.getDay();
    const hours = hoursMap[dow];
    if (!hours) { 
      current.setDate(current.getDate() + 1); 
      current.setHours(0, 0, 0, 0); 
      if (debugLog) console.log(`[addBusinessMinutes] Day ${dow} not business day, moving to next day`);
      continue; 
    }
    const workStart = new Date(current); workStart.setHours(hours.start, hours.startMin, 0, 0);
    const workEnd = new Date(current); workEnd.setHours(hours.end, hours.endMin, 0, 0);
    if (current < workStart) { 
      current = new Date(workStart);
      if (debugLog) console.log(`[addBusinessMinutes] Before work start, adjusted to ${current.toISOString()}`);
      continue;
    }
    if (current >= workEnd) { 
      current.setDate(current.getDate() + 1); 
      current.setHours(0, 0, 0, 0); 
      if (debugLog) console.log(`[addBusinessMinutes] Past work end, moving to next day`);
      continue; 
    }
    const minutesUntilEnd = (workEnd - current) / 60000;
    const chunk = Math.min(remaining, minutesUntilEnd);
    current = new Date(current.getTime() + chunk * 60000);
    remaining -= chunk;
    if (debugLog) console.log(`[addBusinessMinutes] Added ${chunk} min, current: ${current.toISOString()}, remaining: ${remaining}`);
    if (remaining > 0) { current.setDate(current.getDate() + 1); current.setHours(0, 0, 0, 0); }
  }
  if (debugLog) console.log(`[addBusinessMinutes] Final result: ${current.toISOString()}`);
  return current;
}

/**
 * Calculate business minutes between two dates using the hoursMap.
 * Returns integer minutes. Falls back to calendar time if hoursMap is empty.
 */
function calcBusinessMinutesBetween(start, end, hoursMap) {
  if (!start || !end) return null;
  if (!hoursMap || Object.keys(hoursMap).length === 0) {
    return Math.round((end - start) / 60000);
  }
  let bizMinutes = 0;
  const cursor = new Date(start);
  let guard = 0;
  while (cursor < end && guard++ < 10000) {
    const dow = cursor.getDay();
    const hours = hoursMap[dow];
    if (!hours) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(0, 0, 0, 0); continue; }
    const dayStart = new Date(cursor); dayStart.setHours(hours.start, hours.startMin, 0, 0);
    const dayEnd = new Date(cursor); dayEnd.setHours(hours.end, hours.endMin, 0, 0);
    const effectiveStart = cursor > dayStart ? cursor : dayStart;
    const effectiveEnd = end < dayEnd ? end : dayEnd;
    if (effectiveStart < effectiveEnd) {
      bizMinutes += (effectiveEnd - effectiveStart) / 60000;
    }
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }
  return Math.round(bizMinutes);
}

// ── GET /stats — Dashboard statistics (always fetches live from SNOW) ────
router.get('/stats', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.json({
        success: true,
        data: {
          notConfigured: true, connectionStatus: 'not_configured',
          total: 0, open: 0, inProgress: 0, critical: 0, slaBreached: 0, resolvedToday: 0,
          lastSync: defaults.sync?.lastSync || null,
        },
      });
    }

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const queryParts = [`sysparm_limit=${defaults.sync?.maxIncidents || 500}`, 'sysparm_fields=number,short_description,priority,state,opened_at,resolved_at,closed_at,assigned_to'];
    if (agQuery) queryParts.push(`sysparm_query=${agQuery}`);

    let incidents = [];
    try {
      const result = await snowRequest(conn, 'table/incident', queryParts.join('&'));
      if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
        incidents = result.data.result;
      }
    } catch { /* SNOW unreachable — return zeros */ }

    // Load SLA thresholds from DB
    let slaThresholds = {};
    try {
      const slaResult = await DatabaseService.query(`SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true`);
      for (const row of slaResult.rows) {
        slaThresholds[row.priority] = { responseMinutes: Number(row.response_minutes || 0), resolutionMinutes: Number(row.resolution_minutes || 0) };
      }
    } catch { /* use empty */ }

    const total = incidents.length;
    const open = incidents.filter(i => String(snowVal(i.state)) === '1').length;
    const inProgress = incidents.filter(i => ['2', '3'].includes(String(snowVal(i.state)))).length;
    const critical = incidents.filter(i => String(snowVal(i.priority)) === '1' && !['6', '7', '8'].includes(String(snowVal(i.state)))).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const resolvedToday = incidents.filter(i => {
      if (!['6', '7'].includes(String(snowVal(i.state)))) return false;
      const resolvedDate = snowVal(i.resolved_at) || snowVal(i.closed_at);
      return resolvedDate && String(resolvedDate).slice(0, 10) === todayStr;
    }).length;

    let slaBreached = 0;
    for (const inc of incidents) {
      const openedAt = snowVal(inc.opened_at);
      const resolvedAt = snowVal(inc.resolved_at);
      const st = String(snowVal(inc.state));
      if (openedAt && !resolvedAt && !['6', '7', '8'].includes(st)) {
        const openedMinutesAgo = (Date.now() - new Date(openedAt).getTime()) / 60000;
        const p = String(snowVal(inc.priority));
        const pKey = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
        const threshold = slaThresholds[pKey]?.resolutionMinutes || (p === '1' ? 120 : p === '2' ? 360 : p === '3' ? 960 : 2400);
        if (openedMinutesAgo > threshold) slaBreached++;
      }
    }

    return res.json({
      success: true,
      data: {
        connectionStatus: 'connected',
        total, open, inProgress, critical, slaBreached, resolvedToday,
        lastSync: defaults.sync?.lastSync || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Stats failed: ${err.message}` } });
  }
});

// ── GET /reports — SLA compliance + volume analytics (live from SNOW) ────
router.get('/reports', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.json({ success: true, data: { notConfigured: true, totalIncidents: 0, slaCompliance: 100, lastSync: defaults.sync?.lastSync || null } });
    }

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const queryParts = [];
    if (agQuery) queryParts.push(agQuery);
    queryParts.push('ORDERBYDESCnumber');

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=500&sysparm_fields=number,priority,state,opened_at,resolved_at,closed_at&sysparm_query=${queryParts.join('^')}`
    );

    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    // Load SLA thresholds from DB
    let slaThresholds = {};
    try {
      const slaResult = await DatabaseService.query(`SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true`);
      for (const row of slaResult.rows) {
        slaThresholds[row.priority] = { resolutionMinutes: Number(row.resolution_minutes) };
      }
    } catch { /* empty */ }

    const totalIncidents = incidents.length;
    let slaBreaches = 0;
    const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    const byState = {};
    let totalResolved = 0;
    const resolutionByPriority = {};

    for (const inc of incidents) {
      const p = String(snowVal(inc.priority) || '4');
      const pKey = p === '1' ? 'critical' : p === '2' ? 'high' : p === '3' ? 'medium' : 'low';
      priorityCounts[pKey] = (priorityCounts[pKey] || 0) + 1;

      const s = String(snowVal(inc.state) || 'unknown');
      byState[s] = (byState[s] || 0) + 1;

      if (['6', '7'].includes(s)) totalResolved++;

      const openedAt = snowVal(inc.opened_at);
      const resolvedAt = snowVal(inc.resolved_at) || snowVal(inc.closed_at);
      const pLabel = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
      const threshold = slaThresholds[pLabel]?.resolutionMinutes || (p === '1' ? 120 : p === '2' ? 360 : p === '3' ? 960 : 2400);

      if (openedAt && resolvedAt) {
        const resHours = Math.round((new Date(resolvedAt) - new Date(openedAt)) / 3600000 * 10) / 10;
        if (!resolutionByPriority[pKey]) resolutionByPriority[pKey] = { total: 0, count: 0 };
        resolutionByPriority[pKey].total += resHours;
        resolutionByPriority[pKey].count++;
        if ((resHours * 60) > threshold) slaBreaches++;
      } else if (openedAt && !['6', '7', '8'].includes(s)) {
        const openMinutes = (Date.now() - new Date(openedAt).getTime()) / 60000;
        if (openMinutes > threshold) slaBreaches++;
      }
    }

    const slaCompliance = totalIncidents > 0
      ? Math.round(((totalIncidents - slaBreaches) / totalIncidents) * 100)
      : 100;

    const avgResolution = {};
    for (const [k, v] of Object.entries(resolutionByPriority)) {
      avgResolution[k] = v.count > 0 ? Math.round((v.total / v.count) * 10) / 10 : null;
    }

    const slaThresholdHours = {};
    for (const [label, cfg] of Object.entries(slaThresholds)) {
      const key = label.startsWith('1') ? 'critical' : label.startsWith('2') ? 'high' : label.startsWith('3') ? 'medium' : 'low';
      slaThresholdHours[key] = Math.round(cfg.resolutionMinutes / 60 * 10) / 10;
    }

    return res.json({
      success: true,
      data: {
        totalIncidents, totalResolved, slaCompliance, slaBreaches,
        priorityCounts, byState,
        resolutionByPriority: avgResolution,
        slaThresholds: slaThresholdHours,
        lastSync: defaults.sync?.lastSync || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Reports failed: ${err.message}` } });
  }
});

// ── GET /reports/incidents — Incident report (live from SNOW) ────────────
router.get('/reports/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.json({ success: true, data: { totalCount: 0, incidents: [] } });

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const { startDate, endDate } = req.query;

    const queryParts = [];
    if (agQuery) queryParts.push(agQuery);
    if (startDate) queryParts.push(`opened_at>=${startDate}`);
    if (endDate) queryParts.push(`opened_at<=${endDate}`);
    queryParts.push('ORDERBYDESCnumber');

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=200&sysparm_fields=number,short_description,priority,state,category,assignment_group,opened_at,resolved_at&sysparm_query=${queryParts.join('^')}`
    );

    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    const byPriority = {}, byState = {}, byCategory = {};
    const closed = incidents.filter(i => ['6', '7'].includes(String(snowVal(i.state))));
    for (const inc of incidents) {
      byPriority[String(snowVal(inc.priority) || '4')] = (byPriority[String(snowVal(inc.priority) || '4')] || 0) + 1;
      byState[String(snowVal(inc.state) || 'unknown')] = (byState[String(snowVal(inc.state) || 'unknown')] || 0) + 1;
      byCategory[snowVal(inc.category) || 'General'] = (byCategory[snowVal(inc.category) || 'General'] || 0) + 1;
    }
    return res.json({
      success: true,
      data: {
        totalCount: incidents.length, totalClosed: closed.length,
        reportingPeriod: { start: startDate || null, end: endDate || null },
        byPriority, byState, byCategory,
        incidents: incidents.slice(0, 100).map(i => ({
          number: snowVal(i.number), shortDescription: snowVal(i.short_description), priority: snowVal(i.priority),
          state: snowVal(i.state), category: snowVal(i.category), assignmentGroup: snowVal(i.assignment_group),
          openedAt: snowVal(i.opened_at),
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Incident report failed: ${err.message}` } });
  }
});

// ── GET /reports/ritms — RITM report ─────────────────────────────────────
router.get('/reports/ritms', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const { startDate, endDate } = req.query;
    let ritms = [];
    if (conn.isConfigured) {
      try {
        const result = await snowRequest(conn, 'table/sc_req_item', 'sysparm_limit=200');
        if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) ritms = result.data.result;
      } catch { /* use empty */ }
    }
    if (startDate) ritms = ritms.filter(r => r.opened_at >= startDate);
    if (endDate) ritms = ritms.filter(r => r.opened_at <= endDate);
    const byPriority = {}, byState = {}, byCatalogItem = {};
    for (const r of ritms) {
      byPriority[String(r.priority || '4')] = (byPriority[String(r.priority || '4')] || 0) + 1;
      byState[String(r.state || 'unknown')] = (byState[String(r.state || 'unknown')] || 0) + 1;
      byCatalogItem[r.cat_item || 'General'] = (byCatalogItem[r.cat_item || 'General'] || 0) + 1;
    }
    return res.json({
      success: true,
      data: {
        totalCount: ritms.length,
        reportingPeriod: { start: startDate || null, end: endDate || null },
        byPriority, byState, byCatalogItem,
        ritms: ritms.slice(0, 100).map(r => ({
          number: r.number, shortDescription: r.short_description, priority: r.priority,
          state: r.state, catalogItem: r.cat_item, assignmentGroup: r.assignment_group,
          openedAt: r.opened_at, fulfillmentTime: null,
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `RITM report failed: ${err.message}` } });
  }
});

// ── GET /reports/sla — SLA compliance report ─────────────────────────────
router.get('/reports/sla', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.json({ success: true, data: { incidentSla: { byPriority: {} }, ritmSla: { byPriority: {} } } });

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const queryParts = [];
    if (agQuery) queryParts.push(agQuery);
    queryParts.push('ORDERBYDESCnumber');

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=500&sysparm_fields=number,priority,state,opened_at,resolved_at,closed_at&sysparm_query=${queryParts.join('^')}`
    );
    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    let slaThresholds = {};
    try {
      const slaResult = await DatabaseService.query(`SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true`);
      for (const row of slaResult.rows) {
        slaThresholds[row.priority] = { responseMinutes: Number(row.response_minutes), resolutionMinutes: Number(row.resolution_minutes) };
      }
    } catch { /* empty */ }

    const incidentSlaByPriority = {};
    for (const inc of incidents) {
      const p = String(snowVal(inc.priority) || '4');
      const pLabel = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
      if (!incidentSlaByPriority[pLabel]) {
        const threshold = slaThresholds[pLabel] || { responseMinutes: 60, resolutionMinutes: 480 };
        incidentSlaByPriority[pLabel] = {
          responseTarget: threshold.responseMinutes, resolutionTarget: threshold.resolutionMinutes,
          responseMet: 0, responseBreached: 0, resolutionMet: 0, resolutionBreached: 0,
        };
      }
      const openedAt = snowVal(inc.opened_at);
      const resolvedAt = snowVal(inc.resolved_at) || snowVal(inc.closed_at);
      if (openedAt) {
        const threshold = slaThresholds[pLabel] || { resolutionMinutes: 480 };
        if (resolvedAt) {
          const resolutionMinutes = (new Date(resolvedAt) - new Date(openedAt)) / 60000;
          if (resolutionMinutes <= threshold.resolutionMinutes) incidentSlaByPriority[pLabel].resolutionMet++;
          else incidentSlaByPriority[pLabel].resolutionBreached++;
        } else if (!['6', '7', '8'].includes(String(snowVal(inc.state)))) {
          const openMinutes = (Date.now() - new Date(openedAt).getTime()) / 60000;
          if (openMinutes > threshold.resolutionMinutes) incidentSlaByPriority[pLabel].resolutionBreached++;
          else incidentSlaByPriority[pLabel].resolutionMet++;
        }
      }
    }
    for (const val of Object.values(incidentSlaByPriority)) {
      const total = val.resolutionMet + val.resolutionBreached;
      val.resolutionCompliance = total > 0 ? Math.round((val.resolutionMet / total) * 100) : null;
      val.responseCompliance = val.resolutionCompliance;
      val.responseMet = val.resolutionMet;
      val.responseBreached = val.resolutionBreached;
    }
    return res.json({
      success: true,
      data: { incidentSla: { byPriority: incidentSlaByPriority }, ritmSla: { byPriority: {} } },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `SLA report failed: ${err.message}` } });
  }
});

// ── GET /reports/sla/incidents — Incident SLA report with time filter ────
router.get('/reports/sla/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }

    const { period = 'monthly' } = req.query;
    const incidentConfig = await loadIncidentConfig();

    const now = new Date();
    let rangeStart;
    let rangeEnd;

    if (period === 'daily') {
      rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      rangeEnd = new Date(rangeStart);
      rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
      logger.debug('[SLA] Daily filter range', { rangeStart, rangeEnd });
    } else if (period === 'weekly') {
      rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const day = rangeStart.getUTCDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      rangeStart.setUTCDate(rangeStart.getUTCDate() - diff);
      rangeEnd = new Date(rangeStart);
      rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);
      logger.debug('[SLA] Weekly filter range', { rangeStart, rangeEnd });
    } else if (period === 'monthly') {
      rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      rangeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      logger.debug('[SLA] Monthly filter range', { rangeStart, rangeEnd });
    } else {
      const from = req.query.from;
      const to = req.query.to;
      if (from) {
        rangeStart = new Date(`${from}T00:00:00Z`);
      }
      if (to) {
        rangeEnd = new Date(`${to}T00:00:00Z`);
        rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1); // inclusive of "to"
      }
      if (!rangeStart || !rangeEnd) {
        // fallback to monthly if custom inputs missing
        rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        rangeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      }
      logger.debug('[SLA] Custom filter range', { rangeStart, rangeEnd, from, to });
    }

    const startDate = rangeStart.toISOString().slice(0, 10);
    const endDateExclusive = rangeEnd.toISOString().slice(0, 10);

    const queryParts = [`${incidentConfig.createdColumn}>=${startDate}`, `${incidentConfig.createdColumn}<${endDateExclusive}`, 'ORDERBYDESCnumber'];
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    if (agQuery) queryParts.unshift(agQuery);

    const fields = ['sys_id','number','short_description','priority','state','assigned_to',
      incidentConfig.createdColumn, incidentConfig.closedColumn, 'resolved_at'].filter(Boolean);

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=500&sysparm_fields=${[...new Set(fields)].join(',')}&sysparm_query=${queryParts.join('^')}`
    );

    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    // ── Load SLA thresholds (keyed by priority_value for lookup) ──────────
    let slaThresholds = {};
    let slaByPriorityValue = {};
    try {
      const slaResult = await DatabaseService.query(
        `SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true ORDER BY sort_order`
      );
      for (const row of slaResult.rows) {
        const entry = { priority: row.priority, priorityValue: row.priority_value, responseMinutes: Number(row.response_minutes), resolutionMinutes: Number(row.resolution_minutes) };
        slaThresholds[row.priority] = entry;
        slaByPriorityValue[row.priority_value] = entry;
      }
    } catch { /* use empty */ }

    // ── Load business hours from DB ─────────────────────────────────────
    const businessHours = await loadBusinessHours();
    const hoursMap = buildBusinessHoursMap(businessHours);

    // DEBUG: Log overall SLA configuration
    logger.debug(`[SLA] Report configuration loaded`, {
      period,
      totalIncidents: incidents.length,
      slaConfigCount: Object.keys(slaThresholds).length,
      slaThresholds: Object.entries(slaThresholds).map(([key, val]) => ({
        priority: key,
        resolutionMinutes: val.resolutionMinutes
      })),
      businessHoursConfigured: Object.keys(hoursMap).length > 0,
      businessDays: Object.keys(hoursMap),
      businessHoursMap: hoursMap
    });

    const incidentSlaData = incidents.map(inc => {
      // Get priority and normalize it
      const priorityRaw = snowVal(inc[incidentConfig.priorityColumn || 'priority']);
      const normalizedPriority = normalizePriorityValue(priorityRaw);
      
      // DEBUG: Log priority processing
      logger.debug(`[SLA] Processing incident ${inc.number}`, {
        incident: inc.number,
        priorityRaw,
        priorityType: typeof priorityRaw,
        normalizedPriority
      });
      
      // Find matching SLA threshold
      const threshold = (normalizedPriority && slaByPriorityValue[normalizedPriority]) || 
                       slaByPriorityValue[priorityRaw] || 
                       slaThresholds[priorityRaw] || 
                       { priority: priorityRaw, responseMinutes: 60, resolutionMinutes: 480 };
      
      // DEBUG: Log SLA threshold selection
      logger.debug(`[SLA] Threshold selected for ${inc.number}`, {
        incident: inc.number,
        threshold,
        resolutionMinutes: threshold.resolutionMinutes
      });
      
      const createdAt = snowVal(inc[incidentConfig.createdColumn]);
      const closedAt = snowVal(inc[incidentConfig.closedColumn]) || snowVal(inc.resolved_at);

      let resolutionMinutes = null;
      let slaMet = null;
      let expectedClosure = null;

      // Calculate expected closure using business hours
      if (createdAt) {
        // DEBUG: Log calculation inputs
        logger.debug(`[SLA] Calculating expected closure for ${inc.number}`, {
          incident: inc.number,
          createdAt,
          targetMinutes: threshold.resolutionMinutes,
          businessHoursConfigured: Object.keys(hoursMap).length > 0,
          businessDays: Object.keys(hoursMap)
        });
        
        expectedClosure = addBusinessMinutes(new Date(createdAt), threshold.resolutionMinutes, hoursMap);
        if (expectedClosure) {
          expectedClosure = expectedClosure.toISOString();
          
          // DEBUG: Log calculation result
          logger.debug(`[SLA] Expected closure calculated for ${inc.number}`, {
            incident: inc.number,
            expectedClosure,
            totalBusinessDaysAdded: Math.ceil(threshold.resolutionMinutes / 480) // Approximate business days
          });
        }
      }

      // Calculate actual resolution time in business minutes
      if (createdAt && closedAt) {
        resolutionMinutes = calcBusinessMinutesBetween(new Date(createdAt), new Date(closedAt), hoursMap);
        slaMet = resolutionMinutes <= threshold.resolutionMinutes;
      }

      return {
        number: snowVal(inc.number), shortDescription: snowVal(inc.short_description),
        priority: normalizedPriority || priorityRaw, state: snowVal(inc.state), assignedTo: snowVal(inc.assigned_to),
        createdAt, closedAt, resolutionMinutes, targetMinutes: threshold.resolutionMinutes, slaMet, expectedClosure,
      };
    });

    const summaryByPriority = {};
    for (const inc of incidentSlaData) {
      if (!summaryByPriority[inc.priority]) {
        summaryByPriority[inc.priority] = { total: 0, met: 0, breached: 0, pending: 0, targetMinutes: inc.targetMinutes };
      }
      summaryByPriority[inc.priority].total++;
      if (inc.slaMet === true) summaryByPriority[inc.priority].met++;
      else if (inc.slaMet === false) summaryByPriority[inc.priority].breached++;
      else summaryByPriority[inc.priority].pending++;
    }

    return res.json({
      success: true,
      data: {
        period, startDate, endDate: now.toISOString().slice(0, 10),
        generatedAt: new Date().toISOString(),
        totalIncidents: incidents.length, summaryByPriority,
        incidents: incidentSlaData,
        incidentConfig: { createdColumn: incidentConfig.createdColumn, closedColumn: incidentConfig.closedColumn, priorityColumn: incidentConfig.priorityColumn },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `SLA report failed: ${err.message}` } });
  }
});

// ── GET/PUT /config/settings (DB-backed via sn_module_config) ────────────
router.get('/config/settings', async (req, res) => {
  try {
    const settings = await loadModuleConfig('general_settings') || {};
    return res.json({ success: true, data: settings });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load settings: ${err.message}` } });
  }
});

router.put('/config/settings', async (req, res) => {
  try {
    await saveModuleConfig('general_settings', req.body, 'General module settings');
    return res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save settings: ${err.message}` } });
  }
});
export default router;
