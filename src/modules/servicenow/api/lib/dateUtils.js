// ============================================================================
// dateUtils.js — ServiceNow Module Date Utilities
//
// ServiceNow REST API returns all datetime fields as UTC strings in the format:
//   "YYYY-MM-DD HH:MM:SS"  — no 'Z' suffix, no 'T' separator
//
// These utilities correctly parse, convert, and apply timezone transformations
// to ServiceNow date strings. ZERO side effects — safe for multi-instance
// Kubernetes deployments.
//
// Import via: #modules/servicenow/api/lib/dateUtils.js
// ============================================================================

// Known datetime fields per ServiceNow table (used for automatic conversion)
export const SNOW_DATE_FIELDS = {
  incident:    ['opened_at', 'closed_at', 'resolved_at', 'sys_created_on', 'sys_updated_on', 'due_date', 'work_start', 'work_end'],
  sc_req_item: ['opened_at', 'closed_at', 'sys_created_on', 'sys_updated_on', 'due_date', 'delivery_date'],
};

/**
 * Parse a ServiceNow datetime string as UTC.
 *
 * ServiceNow returns "YYYY-MM-DD HH:MM:SS" without a timezone designator.
 * JavaScript's Date constructor would interpret this as LOCAL time, which is
 * wrong. This function normalises the string to UTC by appending 'Z'.
 *
 * Also handles already-normalised ISO strings (with Z, T, or offset).
 *
 * @param {string|null} dateStr - Raw ServiceNow date string or ISO string.
 * @returns {Date|null}
 */
export function parseSnowDateUTC(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  if (s.includes('Z') || s.includes('+') || /T.*[-+]\d/.test(s)) {
    return new Date(s);
  }
  return new Date(s.replace(' ', 'T') + 'Z');
}

/**
 * Convert a date string to a display string in the target IANA timezone.
 *
 * Accepts both ServiceNow UTC strings ("YYYY-MM-DD HH:MM:SS") and ISO strings.
 * Returns an ISO-like string "YYYY-MM-DDTHH:MM:SS" localised to targetTz.
 * Returns the original string unchanged on any parse/conversion error.
 *
 * @param {string|null} dateStr - Input date string.
 * @param {string|null} targetTz - IANA timezone (e.g. "America/New_York").
 * @returns {string|null}
 */
export function convertToTimezone(dateStr, targetTz) {
  if (!dateStr || !targetTz) return dateStr;
  try {
    const date = parseSnowDateUTC(dateStr);
    if (!date || isNaN(date.getTime())) return dateStr;

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: targetTz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const get = (type) => parts.find(p => p.type === type)?.value ?? '00';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
  } catch {
    return dateStr;
  }
}

/**
 * Apply timezone conversion to all known date fields in a single ServiceNow record.
 *
 * ServiceNow reference fields arrive as { display_value, link, value } objects.
 * For date fields, the raw string value is extracted before conversion.
 *
 * @param {object} record   - Single record from ServiceNow result array.
 * @param {string} targetTz - IANA timezone string.
 * @param {string} tableKey - Key into SNOW_DATE_FIELDS ('incident' | 'sc_req_item').
 * @returns {object} New record object with date fields converted.
 */
export function applyTimezoneToRecord(record, targetTz, tableKey = 'incident') {
  if (!record || !targetTz || targetTz === 'UTC') return record;
  const fields = SNOW_DATE_FIELDS[tableKey] ?? SNOW_DATE_FIELDS.incident;
  const out = { ...record };
  for (const field of fields) {
    const raw = out[field];
    if (!raw) continue;
    const val = (typeof raw === 'object' && raw?.value !== undefined) ? raw.value : raw;
    if (val) out[field] = convertToTimezone(val, targetTz);
  }
  return out;
}

/**
 * Apply timezone conversion to an array of ServiceNow records.
 *
 * @param {object[]} records - Array of ServiceNow records.
 * @param {string}   targetTz - IANA timezone string.
 * @param {string}   tableKey - Key into SNOW_DATE_FIELDS.
 * @returns {object[]}
 */
export function applyTimezoneToRecords(records, targetTz, tableKey = 'incident') {
  if (!records?.length || !targetTz || targetTz === 'UTC') return records ?? [];
  return records.map(r => applyTimezoneToRecord(r, targetTz, tableKey));
}
