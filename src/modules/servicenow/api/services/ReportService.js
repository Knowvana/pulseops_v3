// ============================================================================
// ReportService.js — ServiceNow Module Report & Statistics Operations
//
// All report generation and dashboard stats go through this service.
// - SLA calculations are done in UTC; timezone conversion applied last.
// - STATELESS — safe for Kubernetes multi-instance deployments.
//
// Import via: #modules/servicenow/api/services/ReportService.js
// ============================================================================
import {
  snowGet, snowVal,
  buildSnowFields, isSnowSuccess,
} from '#modules/servicenow/api/lib/SnowApiClient.js';
import { parseSnowDateUTC, convertToTimezone, applyTimezoneToRecords } from '#modules/servicenow/api/lib/dateUtils.js';
import { buildAssignmentGroupQuery } from '#modules/servicenow/api/routes/helpers.js';
import {
  buildBusinessHoursMap, normalizePriority,
  buildSlaThresholdMaps, resolveSlaThreshold,
  addBusinessMinutes, calcBusinessMinutesBetween,
} from '#modules/servicenow/api/services/SlaService.js';
import { DatabaseService, dbSchema } from '#modules/servicenow/api/routes/helpers.js';
import { snowUrls } from '#modules/servicenow/api/config/index.js';
import { logger } from '#shared/logger.js';

const SNOW_INCIDENT = snowUrls.snow.tables.incident;
const SNOW_SC_ITEM  = snowUrls.snow.tables.scReqItem;
const SNOW_JOURNAL  = snowUrls.snow.tables.sysJournalField;

// ── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Reduce a timezone-converted incident list into a per-priority summary.
 * @param {object[]} incidents - Each must have { priority, slaMet, targetMinutes }
 * @returns {object}
 */
function buildSummaryByPriority(incidents) {
  const summary = {};
  for (const inc of incidents) {
    if (!summary[inc.priority]) {
      summary[inc.priority] = { total: 0, met: 0, breached: 0, pending: 0, targetMinutes: inc.targetMinutes };
    }
    summary[inc.priority].total++;
    if (inc.slaMet === true)        summary[inc.priority].met++;
    else if (inc.slaMet === false)  summary[inc.priority].breached++;
    else                            summary[inc.priority].pending++;
  }
  return summary;
}

/**
 * Load SLA threshold maps from the database.
 * Returns empty maps when the table has no enabled rows.
 */
async function loadSlaThresholds() {
  try {
    const { rows } = await DatabaseService.query(
      `SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true ORDER BY sort_order`,
    );
    return buildSlaThresholdMaps(rows);
  } catch {
    return { slaByLabel: {}, slaByPriorityValue: {} };
  }
}

/**
 * Load business hours from the database and return the computed map.
 */
async function loadBusinessHoursMap() {
  try {
    const { rows } = await DatabaseService.query(
      `SELECT * FROM ${dbSchema}.sn_business_hours ORDER BY day_of_week`,
    );
    return { rows, map: buildBusinessHoursMap(rows) };
  } catch {
    return { rows: [], map: {} };
  }
}

/**
 * Build an ISO date range from a period string.
 * Returns { rangeStart: Date, rangeEnd: Date } in UTC.
 */
function buildDateRange(period, from, to) {
  const now = new Date();
  let rangeStart, rangeEnd;

  if (period === 'daily') {
    rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    rangeEnd   = new Date(rangeStart);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  } else if (period === 'weekly') {
    rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const diff = rangeStart.getUTCDay() === 0 ? 6 : rangeStart.getUTCDay() - 1;
    rangeStart.setUTCDate(rangeStart.getUTCDate() - diff);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);
  } else if (period === 'monthly') {
    rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    rangeEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  } else {
    if (from) rangeStart = new Date(`${from}T00:00:00Z`);
    if (to)   { rangeEnd = new Date(`${to}T00:00:00Z`); rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1); }
    if (!rangeStart || !rangeEnd) {
      rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      rangeEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    }
  }
  return { rangeStart, rangeEnd };
}

// ── Public Service Methods ───────────────────────────────────────────────────

/**
 * Get dashboard statistics: counts by priority and state, SLA compliance.
 *
 * @param {object} conn           - ServiceNow connection config.
 * @param {object} incidentConfig - Loaded incident config.
 * @param {object} defaults       - Loaded defaults config (sla thresholds fallback).
 * @returns {Promise<object>}
 */
export async function getStats(conn, incidentConfig, defaults) {
  const agQuery    = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
  const queryParts = [];
  if (agQuery) queryParts.push(agQuery);
  queryParts.push('ORDERBYDESCnumber');

  const fields = buildSnowFields(incidentConfig, ['short_description', 'category']);
  const result = await snowGet(
    conn,
    SNOW_INCIDENT,
    `sysparm_limit=1000&sysparm_fields=${fields}&sysparm_query=${queryParts.join('^')}`,
  );

  let incidents = [];
  if (isSnowSuccess(result.statusCode) && result.data?.result) {
    incidents = result.data.result;
  }

  const slaDefaults = defaults?.sla || {};
  const slaThresholds = {
    '1 - Critical': { resolutionMinutes: (slaDefaults.critical || 4) * 60 },
    '2 - High':     { resolutionMinutes: (slaDefaults.high     || 8) * 60 },
    '3 - Medium':   { resolutionMinutes: (slaDefaults.medium  || 24) * 60 },
    '4 - Low':      { resolutionMinutes: (slaDefaults.low     || 72) * 60 },
  };

  const priorityCounts    = {};
  const byState           = {};
  const resolutionByPriority = {};
  let totalResolved = 0;
  let slaBreaches   = 0;

  for (const inc of incidents) {
    const p = String(snowVal(inc[incidentConfig.priorityColumn || 'priority']) || '4');
    const s = String(snowVal(inc.state) || 'unknown');

    const pKey   = normalizePriority(p) || p;
    priorityCounts[pKey] = (priorityCounts[pKey] || 0) + 1;
    byState[s]           = (byState[s]           || 0) + 1;

    if (['6', '7'].includes(s)) totalResolved++;

    const openedAt   = snowVal(inc[incidentConfig.createdColumn || 'opened_at']);
    const resolvedAt = snowVal(inc[incidentConfig.closedColumn  || 'closed_at']) || snowVal(inc.resolved_at);

    const pLabel    = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
    const threshold = slaThresholds[pLabel]?.resolutionMinutes || (p === '1' ? 120 : p === '2' ? 360 : p === '3' ? 960 : 2400);

    const openedDate   = parseSnowDateUTC(openedAt);
    const resolvedDate = parseSnowDateUTC(resolvedAt);

    if (openedDate && resolvedDate) {
      const resHours = Math.round((resolvedDate - openedDate) / 3600000 * 10) / 10;
      if (!resolutionByPriority[pKey]) resolutionByPriority[pKey] = { total: 0, count: 0 };
      resolutionByPriority[pKey].total += resHours;
      resolutionByPriority[pKey].count++;
      if (resHours * 60 > threshold) slaBreaches++;
    } else if (openedDate && !['6', '7', '8'].includes(s)) {
      if ((Date.now() - openedDate.getTime()) / 60000 > threshold) slaBreaches++;
    }
  }

  const totalIncidents = incidents.length;
  const slaCompliance  = totalIncidents > 0
    ? Math.round(((totalIncidents - slaBreaches) / totalIncidents) * 100)
    : 100;

  const avgResolution = {};
  for (const [k, v] of Object.entries(resolutionByPriority)) {
    avgResolution[k] = v.count > 0 ? Math.round((v.total / v.count) * 10) / 10 : null;
  }

  return {
    totalIncidents, totalResolved, slaCompliance, slaBreaches,
    priorityCounts, byState,
    resolutionByPriority: avgResolution,
    lastSync: defaults?.sync?.lastSync || null,
  };
}

/**
 * Get the incident report (per-incident list with timezone conversion).
 *
 * @param {object} conn           - ServiceNow connection config.
 * @param {object} incidentConfig - Loaded incident config.
 * @param {string} tz             - Effective display timezone.
 * @param {object} filters        - { startDate, endDate }
 * @returns {Promise<object>}
 */
export async function getIncidentReport(conn, incidentConfig, tz, filters = {}) {
  const { startDate, endDate } = filters;
  const agQuery    = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
  const queryParts = [];
  if (agQuery)   queryParts.push(agQuery);
  if (startDate) queryParts.push(`opened_at>=${startDate}`);
  if (endDate)   queryParts.push(`opened_at<=${endDate}`);
  queryParts.push('ORDERBYDESCnumber');

  const result = await snowGet(
    conn,
    SNOW_INCIDENT,
    `sysparm_limit=200&sysparm_fields=number,short_description,priority,state,category,assignment_group,opened_at,resolved_at&sysparm_query=${queryParts.join('^')}`,
  );

  let incidents = [];
  if (isSnowSuccess(result.statusCode) && result.data?.result) {
    incidents = result.data.result;
  }

  const byPriority = {}, byState = {}, byCategory = {};
  const closed = incidents.filter(i => ['6', '7'].includes(String(snowVal(i.state))));

  for (const inc of incidents) {
    const p = String(snowVal(inc.priority) || '4');
    const s = String(snowVal(inc.state)    || 'unknown');
    const c = snowVal(inc.category)        || 'General';
    byPriority[p] = (byPriority[p] || 0) + 1;
    byState[s]    = (byState[s]    || 0) + 1;
    byCategory[c] = (byCategory[c] || 0) + 1;
  }

  return {
    totalCount: incidents.length, totalClosed: closed.length,
    reportingPeriod: { start: startDate || null, end: endDate || null },
    timezone: tz,
    byPriority, byState, byCategory,
    incidents: incidents.slice(0, 100).map(i => ({
      number:           snowVal(i.number),
      shortDescription: snowVal(i.short_description),
      priority:         snowVal(i.priority),
      state:            snowVal(i.state),
      category:         snowVal(i.category),
      assignmentGroup:  snowVal(i.assignment_group),
      openedAt:         convertToTimezone(snowVal(i.opened_at), tz),
    })),
  };
}

/**
 * Get the RITM report.
 *
 * @param {object} conn    - ServiceNow connection config.
 * @param {string} tz      - Effective display timezone.
 * @param {object} filters - { startDate, endDate }
 * @returns {Promise<object>}
 */
export async function getRitmReport(conn, tz, filters = {}) {
  const { startDate, endDate } = filters;
  let ritms = [];
  try {
    const result = await snowGet(conn, SNOW_SC_ITEM, 'sysparm_limit=200');
    if (isSnowSuccess(result.statusCode) && result.data?.result) ritms = result.data.result;
  } catch { /* return empty on RITM fetch failure */ }

  if (startDate) ritms = ritms.filter(r => snowVal(r.opened_at) >= startDate);
  if (endDate)   ritms = ritms.filter(r => snowVal(r.opened_at) <= endDate);

  const byPriority = {}, byState = {}, byCatalogItem = {};
  for (const r of ritms) {
    const p = String(r.priority || '4');
    const s = String(r.state    || 'unknown');
    const c = r.cat_item        || 'General';
    byPriority[p]    = (byPriority[p]    || 0) + 1;
    byState[s]       = (byState[s]       || 0) + 1;
    byCatalogItem[c] = (byCatalogItem[c] || 0) + 1;
  }

  return {
    totalCount: ritms.length,
    reportingPeriod: { start: startDate || null, end: endDate || null },
    timezone: tz,
    byPriority, byState, byCatalogItem,
    ritms: ritms.slice(0, 100).map(r => ({
      number:           r.number,
      shortDescription: r.short_description,
      priority:         r.priority,
      state:            r.state,
      catalogItem:      r.cat_item,
      assignmentGroup:  r.assignment_group,
      openedAt:         convertToTimezone(snowVal(r.opened_at), tz),
      fulfillmentTime:  null,
    })),
  };
}

/**
 * Get the top-level SLA compliance report (prioritised groupings).
 *
 * @param {object} conn           - ServiceNow connection config.
 * @param {object} incidentConfig - Loaded incident config.
 * @returns {Promise<object>}
 */
export async function getSlaReport(conn, incidentConfig) {
  const agQuery    = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
  const queryParts = [];
  if (agQuery) queryParts.push(agQuery);
  queryParts.push('ORDERBYDESCnumber');

  const result = await snowGet(
    conn,
    SNOW_INCIDENT,
    `sysparm_limit=500&sysparm_fields=number,priority,state,opened_at,resolved_at,closed_at&sysparm_query=${queryParts.join('^')}`,
  );

  let incidents = [];
  if (isSnowSuccess(result.statusCode) && result.data?.result) incidents = result.data.result;

  const { slaByLabel } = await loadSlaThresholds();
  const incidentSlaByPriority = {};

  for (const inc of incidents) {
    const p     = String(snowVal(inc.priority) || '4');
    const pLabel = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';

    if (!incidentSlaByPriority[pLabel]) {
      const threshold = slaByLabel[pLabel] || { responseMinutes: 60, resolutionMinutes: 480 };
      incidentSlaByPriority[pLabel] = {
        responseTarget: threshold.responseMinutes, resolutionTarget: threshold.resolutionMinutes,
        responseMet: 0, responseBreached: 0, resolutionMet: 0, resolutionBreached: 0,
      };
    }

    const openedDate   = parseSnowDateUTC(snowVal(inc.opened_at));
    const resolvedDate = parseSnowDateUTC(snowVal(inc.resolved_at) || snowVal(inc.closed_at));

    if (openedDate) {
      const threshold = slaByLabel[pLabel] || { resolutionMinutes: 480 };
      if (resolvedDate) {
        const mins = (resolvedDate - openedDate) / 60000;
        if (mins <= threshold.resolutionMinutes) incidentSlaByPriority[pLabel].resolutionMet++;
        else                                     incidentSlaByPriority[pLabel].resolutionBreached++;
      } else if (!['6', '7', '8'].includes(String(snowVal(inc.state)))) {
        const openMinutes = (Date.now() - openedDate.getTime()) / 60000;
        if (openMinutes > threshold.resolutionMinutes) incidentSlaByPriority[pLabel].resolutionBreached++;
        else                                           incidentSlaByPriority[pLabel].resolutionMet++;
      }
    }
  }

  for (const val of Object.values(incidentSlaByPriority)) {
    const total = val.resolutionMet + val.resolutionBreached;
    val.resolutionCompliance = total > 0 ? Math.round((val.resolutionMet / total) * 100) : null;
    val.responseCompliance   = val.resolutionCompliance;
    val.responseMet          = val.resolutionMet;
    val.responseBreached     = val.resolutionBreached;
  }

  return { incidentSla: { byPriority: incidentSlaByPriority }, ritmSla: { byPriority: {} } };
}

/**
 * Get the detailed resolution SLA report with business hours.
 *
 * @param {object} conn           - ServiceNow connection config.
 * @param {object} incidentConfig - Loaded incident config.
 * @param {string} tz             - Effective display timezone.
 * @param {object} filters        - { period, from, to }
 * @returns {Promise<object>}
 */
export async function getSlaResolutionReport(conn, incidentConfig, tz, filters = {}) {
  const { period = 'monthly', from, to } = filters;
  const { rangeStart, rangeEnd } = buildDateRange(period, from, to);
  const startDate         = rangeStart.toISOString().slice(0, 10);
  const endDateExclusive  = rangeEnd.toISOString().slice(0, 10);

  const queryParts = [
    `${incidentConfig.createdColumn}>=${startDate}`,
    `${incidentConfig.createdColumn}<${endDateExclusive}`,
    'ORDERBYDESCnumber',
  ];
  const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
  if (agQuery) queryParts.unshift(agQuery);

  const fields = [...new Set([
    'sys_id', 'number', 'short_description', 'priority', 'state', 'assigned_to',
    incidentConfig.createdColumn,
    incidentConfig.closedColumn,
    'resolved_at',
  ].filter(Boolean))];

  const result = await snowGet(
    conn,
    SNOW_INCIDENT,
    `sysparm_limit=500&sysparm_fields=${fields.join(',')}&sysparm_query=${queryParts.join('^')}`,
  );

  let incidents = [];
  if (isSnowSuccess(result.statusCode) && result.data?.result) incidents = result.data.result;

  const { slaByLabel, slaByPriorityValue } = await loadSlaThresholds();
  const { rows: bhRows, map: hoursMap }    = await loadBusinessHoursMap();

  logger.debug('[ReportService] SLA resolution report', {
    period, totalIncidents: incidents.length,
    slaConfigCount: Object.keys(slaByLabel).length,
  });

  const incidentSlaData = incidents.map(inc => {
    const priorityRaw    = snowVal(inc[incidentConfig.priorityColumn || 'priority']);
    const normalised     = normalizePriority(priorityRaw);
    const threshold      = resolveSlaThreshold(priorityRaw, slaByLabel, slaByPriorityValue);

    const createdAtRaw   = snowVal(inc[incidentConfig.createdColumn]);
    const closedAtRaw    = snowVal(inc[incidentConfig.closedColumn]) || snowVal(inc.resolved_at);
    const createdDate    = parseSnowDateUTC(createdAtRaw);
    const closedDate     = parseSnowDateUTC(closedAtRaw);

    let resolutionMinutes = null, slaMet = null, expectedClosure = null;

    if (createdDate && !isNaN(createdDate.getTime())) {
      const exp = addBusinessMinutes(createdDate, threshold.resolutionMinutes, hoursMap, tz);
      if (exp) expectedClosure = exp.toISOString();
    }
    if (createdDate && closedDate && !isNaN(createdDate.getTime()) && !isNaN(closedDate.getTime())) {
      resolutionMinutes = calcBusinessMinutesBetween(createdDate, closedDate, hoursMap, tz);
      slaMet            = resolutionMinutes <= threshold.resolutionMinutes;
    }

    return {
      number:           snowVal(inc.number),
      shortDescription: snowVal(inc.short_description),
      priority:         normalised || priorityRaw,
      state:            snowVal(inc.state),
      assignedTo:       snowVal(inc.assigned_to),
      createdAt:        createdDate ? createdDate.toISOString() : createdAtRaw,
      closedAt:         closedDate  ? closedDate.toISOString()  : closedAtRaw,
      resolutionMinutes, targetMinutes: threshold.resolutionMinutes, slaMet, expectedClosure,
    };
  });

  const tzIncidents = incidentSlaData.map(inc => ({
    ...inc,
    createdAt:       convertToTimezone(inc.createdAt,       tz),
    closedAt:        convertToTimezone(inc.closedAt,        tz),
    expectedClosure: convertToTimezone(inc.expectedClosure, tz),
  }));

  const summaryByPriority = buildSummaryByPriority(tzIncidents);

  return {
    period, startDate, endDate: new Date().toISOString().slice(0, 10),
    generatedAt: convertToTimezone(new Date().toISOString(), tz),
    timezone: tz,
    totalIncidents: incidents.length, summaryByPriority,
    incidents: tzIncidents,
    incidentConfig: {
      createdColumn:  incidentConfig.createdColumn,
      closedColumn:   incidentConfig.closedColumn,
      priorityColumn: incidentConfig.priorityColumn,
    },
    businessHours: bhRows.map(d => ({
      dayOfWeek: d.day_of_week, isBusinessDay: d.is_business_day,
      startTime: d.start_time,  endTime: d.end_time,
    })),
    slaThresholds: Object.entries(slaByLabel).map(([k, v]) => ({
      priority: k, priorityValue: v.priorityValue,
      responseMinutes: v.responseMinutes, resolutionMinutes: v.resolutionMinutes, enabled: true,
    })),
  };
}

/**
 * Get the detailed response SLA report (uses sys_journal_field for first response time).
 *
 * @param {object} conn           - ServiceNow connection config.
 * @param {object} incidentConfig - Loaded incident config.
 * @param {string} tz             - Effective display timezone.
 * @param {object} filters        - { period, from, to }
 * @returns {Promise<object>}
 */
export async function getSlaResponseReport(conn, incidentConfig, tz, filters = {}) {
  const responseCol = incidentConfig.responseColumn;
  if (!responseCol) throw new Error('RESPONSE_COLUMN_NOT_CONFIGURED');

  const { period = 'monthly', from, to } = filters;
  const { rangeStart, rangeEnd } = buildDateRange(period, from, to);
  const startDate        = rangeStart.toISOString().slice(0, 10);
  const endDateExclusive = rangeEnd.toISOString().slice(0, 10);

  const queryParts = [
    `${incidentConfig.createdColumn}>=${startDate}`,
    `${incidentConfig.createdColumn}<${endDateExclusive}`,
    'ORDERBYDESCnumber',
  ];
  const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
  if (agQuery) queryParts.unshift(agQuery);

  const fields = [...new Set([
    'sys_id', 'number', 'short_description', 'priority', 'state', 'assigned_to',
    incidentConfig.createdColumn, responseCol, 'resolved_at',
  ].filter(Boolean))];

  const result = await snowGet(
    conn,
    SNOW_INCIDENT,
    `sysparm_limit=500&sysparm_fields=${fields.join(',')}&sysparm_query=${queryParts.join('^')}`,
  );

  let incidents = [];
  if (isSnowSuccess(result.statusCode) && result.data?.result) incidents = result.data.result;

  const { slaByLabel, slaByPriorityValue } = await loadSlaThresholds();
  const { rows: bhRows, map: hoursMap }    = await loadBusinessHoursMap();

  logger.debug('[ReportService] Response SLA report', {
    period, totalIncidents: incidents.length, responseCol,
  });

  // Fetch first journal entry (comment or work note) for each incident
  const firstResponseMap = {};
  for (const inc of incidents) {
    const sysId = snowVal(inc.sys_id);
    try {
      const auditResult = await snowGet(
        conn,
        SNOW_JOURNAL,
        `sysparm_query=element_id=${sysId}^elementINcomments,work_notes&sysparm_fields=sys_created_on,element&sysparm_limit=1&sysparm_orderby=sys_created_on`,
      );
      if (isSnowSuccess(auditResult.statusCode) && auditResult.data?.result?.[0]) {
        firstResponseMap[sysId] = snowVal(auditResult.data.result[0].sys_created_on);
      }
    } catch (err) {
      logger.debug('[ReportService] Journal fetch failed', { sysId, error: err.message });
    }
  }

  const incidentSlaData = incidents.map(inc => {
    const priorityRaw = snowVal(inc[incidentConfig.priorityColumn || 'priority']);
    const normalised  = normalizePriority(priorityRaw);
    const threshold   = resolveSlaThreshold(priorityRaw, slaByLabel, slaByPriorityValue);

    const sysId         = snowVal(inc.sys_id);
    const createdAtRaw  = snowVal(inc[incidentConfig.createdColumn]);
    const respondedRaw  = firstResponseMap[sysId];
    const createdDate   = parseSnowDateUTC(createdAtRaw);
    const respondedDate = parseSnowDateUTC(respondedRaw);

    let responseMinutes = null, slaMet = null, expectedResponse = null;

    if (createdDate && !isNaN(createdDate.getTime())) {
      const exp = addBusinessMinutes(createdDate, threshold.responseMinutes, hoursMap, tz);
      if (exp) expectedResponse = exp.toISOString();
    }
    if (createdDate && respondedDate && !isNaN(createdDate.getTime()) && !isNaN(respondedDate.getTime())) {
      responseMinutes = calcBusinessMinutesBetween(createdDate, respondedDate, hoursMap, tz);
      slaMet          = responseMinutes <= threshold.responseMinutes;
    }

    return {
      number:           snowVal(inc.number),
      shortDescription: snowVal(inc.short_description),
      priority:         normalised || priorityRaw,
      state:            snowVal(inc.state),
      assignedTo:       snowVal(inc.assigned_to),
      createdAt:        createdDate    ? createdDate.toISOString()    : createdAtRaw,
      respondedAt:      respondedDate  ? respondedDate.toISOString()  : respondedRaw,
      responseMinutes, targetMinutes: threshold.responseMinutes, slaMet, expectedResponse,
    };
  });

  const tzIncidents = incidentSlaData.map(inc => ({
    ...inc,
    createdAt:        convertToTimezone(inc.createdAt,        tz),
    respondedAt:      convertToTimezone(inc.respondedAt,      tz),
    expectedResponse: convertToTimezone(inc.expectedResponse, tz),
  }));

  const summaryByPriority = buildSummaryByPriority(tzIncidents);

  return {
    period, startDate, endDate: new Date().toISOString().slice(0, 10),
    generatedAt: convertToTimezone(new Date().toISOString(), tz),
    timezone: tz,
    totalIncidents: incidents.length, summaryByPriority,
    incidents: tzIncidents,
    incidentConfig: {
      createdColumn:  incidentConfig.createdColumn,
      responseColumn: responseCol,
      priorityColumn: incidentConfig.priorityColumn,
    },
    businessHours: bhRows.map(d => ({
      dayOfWeek: d.day_of_week, isBusinessDay: d.is_business_day,
      startTime: d.start_time,  endTime: d.end_time,
    })),
    slaThresholds: Object.entries(slaByLabel).map(([k, v]) => ({
      priority: k, priorityValue: v.priorityValue,
      responseMinutes: v.responseMinutes, resolutionMinutes: v.resolutionMinutes, enabled: true,
    })),
  };
}
