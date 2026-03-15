// ============================================================================
// RitmService.js — ServiceNow Module RITM (Request Item) Operations
//
// All ServiceNow sc_req_item CRUD operations go through this service.
// STATELESS — safe for Kubernetes multi-instance deployments.
//
// Import via: #modules/servicenow/api/services/RitmService.js
// ============================================================================
import {
  snowGet, snowWrite, snowVal,
  isSnowSuccess,
} from '#modules/servicenow/api/lib/SnowApiClient.js';
import { applyTimezoneToRecords } from '#modules/servicenow/api/lib/dateUtils.js';
import { snowUrls } from '#modules/servicenow/api/config/index.js';

const SNOW_TABLE  = snowUrls.snow.tables.scReqItem;
const RITM_FIELDS = [
  'sys_id', 'number', 'short_description', 'priority', 'state',
  'cat_item', 'assignment_group', 'assigned_to',
  'opened_at', 'closed_at', 'sys_created_on', 'sys_updated_on',
].join(',');

// ── Public Service Methods ───────────────────────────────────────────────────

/**
 * Fetch a paginated, filtered, and timezone-normalised RITM list.
 *
 * @param {object} conn         - ServiceNow connection config.
 * @param {string} tz           - Effective display timezone (IANA string).
 * @param {object} [filters={}] - { state, priority, search, limit, offset }
 * @returns {Promise<{ ritms: object[], total: number }>}
 */
export async function listRitms(conn, tz, filters = {}) {
  const {
    state, priority, search,
    limit  = 50,
    offset = 0,
  } = filters;

  const pageLimit  = Math.max(1, parseInt(limit, 10)  || 50);
  const pageOffset = Math.max(0, parseInt(offset, 10) || 0);

  const params = [
    `sysparm_limit=${pageLimit}`,
    `sysparm_offset=${pageOffset}`,
    `sysparm_fields=${RITM_FIELDS}`,
    'sysparm_query=ORDERBYDESCnumber',
  ].join('&');

  const result = await snowGet(conn, SNOW_TABLE, params);
  if (!isSnowSuccess(result.statusCode) || !result.data?.result) {
    return { ritms: [], total: 0 };
  }

  let ritms = result.data.result;

  if (state) {
    const s = String(state);
    ritms = ritms.filter(r => String(snowVal(r.state)) === s);
  }
  if (priority) {
    const p = String(priority);
    ritms = ritms.filter(r => String(snowVal(r.priority)) === p);
  }
  if (search) {
    const q = search.toLowerCase();
    ritms = ritms.filter(r =>
      (snowVal(r.number) || '').toLowerCase().includes(q) ||
      (snowVal(r.short_description) || '').toLowerCase().includes(q),
    );
  }

  return {
    ritms: applyTimezoneToRecords(ritms, tz, 'sc_req_item'),
    total: ritms.length,
  };
}

/**
 * Create a new RITM in ServiceNow.
 *
 * @param {object} conn    - ServiceNow connection config.
 * @param {object} payload - { shortDescription, priority, catalogItem }
 * @returns {Promise<{ statusCode: number, data: any }>}
 */
export async function createRitm(conn, payload) {
  const { shortDescription, priority, catalogItem } = payload;
  return snowWrite(conn, SNOW_TABLE, 'POST', JSON.stringify({
    short_description: shortDescription,
    priority:          priority || '3 - Medium',
    cat_item:          catalogItem || '',
  }));
}

/**
 * Update an existing RITM.
 *
 * @param {object} conn    - ServiceNow connection config.
 * @param {string} id      - sys_id of the RITM.
 * @param {object} payload - Fields to update.
 * @returns {Promise<{ statusCode: number, data: any }>}
 */
export async function updateRitm(conn, id, payload) {
  const { shortDescription, priority, state, comment } = payload;
  const body = {};
  if (shortDescription !== undefined) body.short_description = shortDescription;
  if (priority         !== undefined) body.priority          = priority;
  if (state            !== undefined) body.state             = state;
  if (comment          !== undefined) body.comments          = comment;
  return snowWrite(conn, `${SNOW_TABLE}/${id}`, 'PATCH', JSON.stringify(body));
}

/**
 * Close a RITM (state = 3 — Closed Complete).
 *
 * @param {object} conn    - ServiceNow connection config.
 * @param {string} id      - sys_id of the RITM.
 * @param {object} payload - { closeNotes }
 * @returns {Promise<{ statusCode: number, data: any }>}
 */
export async function closeRitm(conn, id, payload) {
  return snowWrite(conn, `${SNOW_TABLE}/${id}`, 'PATCH', JSON.stringify({
    state:       '3',
    close_notes: payload.closeNotes || 'Closed via PulseOps',
  }));
}
