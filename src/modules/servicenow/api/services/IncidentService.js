// ============================================================================
// IncidentService.js — ServiceNow Module Incident Operations
//
// All ServiceNow incident CRUD operations go through this service.
// - Enforces column selection via buildSnowFields().
// - Applies timezone conversion before returning results.
// - STATELESS — safe for Kubernetes multi-instance deployments.
//
// Import via: #modules/servicenow/api/services/IncidentService.js
// ============================================================================
import {
  snowGet, snowWrite, snowVal,
  buildSnowFields, isSnowSuccess,
} from '#modules/servicenow/api/lib/SnowApiClient.js';
import { applyTimezoneToRecords } from '#modules/servicenow/api/lib/dateUtils.js';
import { buildAssignmentGroupQuery } from '#modules/servicenow/api/routes/helpers.js';
import { snowUrls } from '#modules/servicenow/api/config/index.js';

const SNOW_TABLE = snowUrls.snow.tables.incident;

// ── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Extract numeric priority string from ServiceNow label values.
 * "3 - Medium" → "3", "P2" → "2", "High" → "2", "3" → "3"
 */
function toNumericPriority(val) {
  if (val == null || val === '') return val;
  const s     = String(val).trim();
  const digit = s.match(/^(\d+)/);
  if (digit) return digit[1];
  const lower = s.toLowerCase();
  if (lower.includes('critical')) return '1';
  if (lower.includes('high'))     return '2';
  if (lower.includes('medium'))   return '3';
  if (lower.includes('low'))      return '4';
  return s;
}

// ── Public Service Methods ───────────────────────────────────────────────────

/**
 * Fetch a paginated, filtered, and timezone-normalised incident list.
 *
 * Column selection is enforced via incidentConfig.selectedColumns plus the
 * mandatory system fields defined in SnowApiClient.buildSnowFields().
 *
 * @param {object} conn            - ServiceNow connection config.
 * @param {object} incidentConfig  - Loaded incident config from loadIncidentConfig().
 * @param {string} tz              - Effective display timezone (IANA string).
 * @param {object} [filters={}]    - { state, priority, search, limit, offset, sort, order }
 * @returns {Promise<{ incidents: object[], total: number }>}
 */
export async function listIncidents(conn, incidentConfig, tz, filters = {}) {
  const {
    state, priority, search,
    limit  = 50,
    offset = 0,
    sort   = 'number',
    order  = 'desc',
  } = filters;

  const queryParts = [];
  const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
  if (agQuery)  queryParts.push(agQuery);
  if (state)    queryParts.push(`state=${state}`);
  if (priority) queryParts.push(`priority=${priority}`);
  if (search)   queryParts.push(`numberLIKE${search}^ORshort_descriptionLIKE${search}`);
  queryParts.push(order === 'asc' ? `ORDERBY${sort}` : `ORDERBYDESC${sort}`);

  const fields  = buildSnowFields(incidentConfig, ['short_description', 'category', 'assignment_group', 'assigned_to']);
  const pageLimit  = Math.max(1, parseInt(limit, 10)  || 50);
  const pageOffset = Math.max(0, parseInt(offset, 10) || 0);

  const params = [
    `sysparm_limit=${pageLimit}`,
    `sysparm_offset=${pageOffset}`,
    `sysparm_fields=${fields}`,
    `sysparm_query=${queryParts.join('^')}`,
  ].join('&');

  const result = await snowGet(conn, SNOW_TABLE, params);
  if (!isSnowSuccess(result.statusCode) || !result.data?.result) {
    return { incidents: [], total: 0 };
  }

  const raw       = result.data.result;
  const incidents = applyTimezoneToRecords(raw, tz);
  const total     = raw.length < pageLimit
    ? pageOffset + raw.length
    : pageOffset + raw.length + 1;

  return { incidents, total };
}

/**
 * Create a new incident in ServiceNow.
 *
 * @param {object} conn    - ServiceNow connection config.
 * @param {object} payload - { shortDescription, priority, state, category, impact, urgency, assignmentGroup }
 * @returns {Promise<{ statusCode: number, data: any }>}
 */
export async function createIncident(conn, payload) {
  const { shortDescription, priority, state, category, impact, urgency, assignmentGroup } = payload;

  const body = {
    short_description: shortDescription,
    impact:            toNumericPriority(impact   || '3'),
    urgency:           toNumericPriority(urgency  || '3'),
    category:          category || 'General',
  };
  if (priority)        body.priority         = toNumericPriority(priority);
  if (state)           body.state            = state === 'New' ? '1' : toNumericPriority(state);
  if (assignmentGroup) body.assignment_group = assignmentGroup;

  return snowWrite(conn, SNOW_TABLE, 'POST', JSON.stringify(body));
}

/**
 * Update an existing incident.
 *
 * @param {object} conn    - ServiceNow connection config.
 * @param {string} id      - sys_id of the incident.
 * @param {object} payload - Fields to update.
 * @returns {Promise<{ statusCode: number, data: any }>}
 */
export async function updateIncident(conn, id, payload) {
  const { shortDescription, priority, state, comment, impact, urgency } = payload;
  const body = {};
  if (shortDescription !== undefined) body.short_description = shortDescription;
  if (priority         !== undefined) body.priority          = toNumericPriority(priority);
  if (impact           !== undefined) body.impact            = toNumericPriority(impact);
  if (urgency          !== undefined) body.urgency           = toNumericPriority(urgency);
  if (state            !== undefined) body.state             = toNumericPriority(state);
  if (comment          !== undefined) body.comments          = comment;
  return snowWrite(conn, `${SNOW_TABLE}/${id}`, 'PATCH', JSON.stringify(body));
}

/**
 * Close an incident via two-step state transition:
 *   1. Resolve (state=6) — sets close_code and close_notes
 *   2. Close  (state=7)
 *
 * ServiceNow data policies typically require close_code when resolving.
 * Some instances allow direct state=7, but going through state=6 first
 * ensures compatibility with all SNOW configurations.
 *
 * @param {object} conn    - ServiceNow connection config.
 * @param {string} id      - sys_id of the incident.
 * @param {object} payload - { closeNotes, closeCode }
 * @returns {Promise<{ statusCode: number, data: any }>}
 */
export async function closeIncident(conn, id, payload) {
  const code  = payload.closeCode  || 'Solved (Permanently)';
  const notes = payload.closeNotes || 'Closed via PulseOps';

  // Step 1: Resolve (state = 6) with mandatory close fields
  const resolveResult = await snowWrite(conn, `${SNOW_TABLE}/${id}`, 'PATCH', JSON.stringify({
    state:       '6',
    close_code:  code,
    close_notes: notes,
  }));
  if (!isSnowSuccess(resolveResult.statusCode)) return resolveResult;

  // Step 2: Close (state = 7)
  return snowWrite(conn, `${SNOW_TABLE}/${id}`, 'PATCH', JSON.stringify({
    state: '7',
  }));
}

/**
 * Resolve a sys_id from an incident number string (e.g. "INC0001234").
 * Returns null when the incident is not found.
 *
 * @param {object} conn             - ServiceNow connection config.
 * @param {string} incidentNumber   - Human-readable incident number.
 * @returns {Promise<string|null>}
 */
export async function resolveIncidentSysId(conn, incidentNumber) {
  const result = await snowGet(
    conn,
    SNOW_TABLE,
    `sysparm_query=number=${incidentNumber}&sysparm_fields=sys_id&sysparm_limit=1`,
  );
  if (!isSnowSuccess(result.statusCode) || !result.data?.result?.length) return null;
  return snowVal(result.data.result[0].sys_id);
}

/**
 * Fetch open (non-resolved) incidents for auto-acknowledge polling.
 * Returns a minimal projection for efficiency.
 *
 * @param {object} conn            - ServiceNow connection config.
 * @param {object} incidentConfig  - Loaded incident config.
 * @returns {Promise<object[]>}
 */
export async function listOpenIncidents(conn, incidentConfig) {
  const agQuery    = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
  const queryParts = ['stateNOT IN6,7,8'];
  if (agQuery) queryParts.push(agQuery);
  queryParts.push('ORDERBYDESCnumber');

  const result = await snowGet(
    conn,
    SNOW_TABLE,
    `sysparm_query=${queryParts.join('^')}&sysparm_fields=sys_id,number,short_description,priority,state,assigned_to,opened_at&sysparm_limit=200`,
  );

  if (!isSnowSuccess(result.statusCode) || !result.data?.result) return [];

  return result.data.result.map(inc => ({
    sysId:            snowVal(inc.sys_id),
    number:           snowVal(inc.number),
    shortDescription: snowVal(inc.short_description),
    priority:         snowVal(inc.priority),
    state:            snowVal(inc.state),
    assignedTo:       snowVal(inc.assigned_to),
    openedAt:         snowVal(inc.opened_at),
  }));
}
