// ============================================================================
// SlaService.js — ServiceNow Module SLA & Business Hours Utilities
//
// Pure calculation functions — NO HTTP calls, NO database calls, NO side effects.
// Safe for Kubernetes multi-instance deployments.
//
// Business hours (e.g. 09:00–17:00) are ALWAYS applied in the configured
// display timezone, never in UTC. All internal Date arithmetic stays in UTC ms.
//
// Import via: #modules/servicenow/api/services/SlaService.js
// ============================================================================

// ── Private timezone helpers ─────────────────────────────────────────────────

const _DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Return local date/time components of a UTC Date in the given IANA timezone.
 * @param {Date}   date
 * @param {string} tz   - IANA timezone string (e.g. "Asia/Kolkata").
 * @returns {{ year, month, day, hour, minute, dow }}
 */
function _getParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value ?? '0';
  const h = get('hour') === '24' ? 0 : parseInt(get('hour'), 10);
  return {
    year:   parseInt(get('year'),   10),
    month:  parseInt(get('month'),  10),
    day:    parseInt(get('day'),    10),
    hour:   h,
    minute: parseInt(get('minute'), 10),
    dow:    _DOW_SHORT.indexOf(get('weekday')),
  };
}

/**
 * Convert a local date/time (in the given timezone) to a UTC Date.
 * Handles half-hour offsets (e.g. IST +05:30) and DST transitions.
 *
 * @param {number} year  @param {number} month  (1-based)
 * @param {number} day   @param {number} hour   @param {number} minute
 * @param {string} tz
 * @returns {Date}
 */
function _toUTC(year, month, day, hour, minute, tz) {
  const approx = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const p = _getParts(approx, tz);
  const diffMin = (hour * 60 + minute) - (p.hour * 60 + p.minute);
  return new Date(approx.getTime() + diffMin * 60000);
}

// ── Public Exports ────────────────────────────────────────────────────────────

/**
 * Build a day-of-week → business hours lookup map from sn_business_hours DB rows.
 * Keys are day-of-week numbers (0 = Sunday … 6 = Saturday).
 * Hours are stored as configured (local timezone); they are applied in that
 * timezone by addBusinessMinutes / calcBusinessMinutesBetween.
 *
 * @param {object[]} rows - Rows from sn_business_hours table.
 * @returns {object} Map of { [dayOfWeek]: { start, startMin, end, endMin } }
 */
export function buildBusinessHoursMap(rows) {
  const map = {};
  if (!rows?.length) return map;
  for (const row of rows) {
    if (!row.is_business_day) continue;
    const st = String(row.start_time || '09:00').slice(0, 5);
    const et = String(row.end_time   || '17:00').slice(0, 5);
    const [sh, sm] = st.split(':').map(Number);
    const [eh, em] = et.split(':').map(Number);
    map[row.day_of_week] = { start: sh, startMin: sm, end: eh, endMin: em };
  }
  return map;
}

/**
 * Normalise a ServiceNow priority field value to a numeric string ("1"–"4").
 *
 * ServiceNow may return priority as:
 *   "1", "1 - Critical", "P1", "Priority 1", "Critical", or raw display values.
 *
 * @param {string|number|null} raw - Raw priority value from ServiceNow.
 * @returns {string|null} Normalised numeric string or null.
 */
export function normalizePriority(raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) return str;
  const digit = str.match(/(\d)/);
  if (digit) return digit[1];
  const lower = str.toLowerCase();
  if (lower.includes('critical'))                      return '1';
  if (lower.includes('high'))                          return '2';
  if (lower.includes('medium') || lower.includes('moderate')) return '3';
  if (lower.includes('low'))                           return '4';
  return null;
}

/**
 * Add N business minutes to a start date using the business hours map.
 * Falls back to calendar time when hoursMap is empty (no business hours configured).
 *
 * Business hours (e.g. 09:00–17:00) are applied in `timezone` so that
 * "Monday 09:00" means 09:00 in the user's configured timezone, not in UTC.
 * All internal Date arithmetic remains in UTC milliseconds.
 *
 * @param {Date}   startDate     - Start date (UTC).
 * @param {number} targetMinutes - Number of business minutes to add.
 * @param {object} hoursMap      - Output of buildBusinessHoursMap().
 * @param {string} [timezone]    - IANA timezone (default 'UTC').
 * @returns {Date|null}
 */
export function addBusinessMinutes(startDate, targetMinutes, hoursMap, timezone = 'UTC') {
  if (!startDate || targetMinutes == null) return null;
  if (!hoursMap || !Object.keys(hoursMap).length) {
    return new Date(startDate.getTime() + targetMinutes * 60000);
  }

  let current   = new Date(startDate);
  let remaining = targetMinutes;
  let guard     = 0;

  while (remaining > 0 && guard++ < 20000) {
    const lp    = _getParts(current, timezone);
    const hours = hoursMap[lp.dow];

    if (!hours) {
      current = _toUTC(lp.year, lp.month, lp.day + 1, 0, 0, timezone);
      continue;
    }

    const workStart = _toUTC(lp.year, lp.month, lp.day, hours.start, hours.startMin, timezone);
    const workEnd   = _toUTC(lp.year, lp.month, lp.day, hours.end,   hours.endMin,   timezone);

    if (current < workStart) { current = workStart; continue; }
    if (current >= workEnd)  {
      current = _toUTC(lp.year, lp.month, lp.day + 1, 0, 0, timezone);
      continue;
    }

    const minutesUntilEnd = (workEnd - current) / 60000;
    const chunk = Math.min(remaining, minutesUntilEnd);
    current   = new Date(current.getTime() + chunk * 60000);
    remaining -= chunk;

    if (remaining > 0) {
      current = _toUTC(lp.year, lp.month, lp.day + 1, 0, 0, timezone);
    }
  }
  return current;
}

/**
 * Calculate the number of business minutes between two dates.
 * Falls back to calendar minutes when hoursMap is empty.
 *
 * Business hours are applied in `timezone` for correct results in non-UTC zones.
 *
 * @param {Date}   start      - Start date (UTC).
 * @param {Date}   end        - End date (UTC).
 * @param {object} hoursMap   - Output of buildBusinessHoursMap().
 * @param {string} [timezone] - IANA timezone (default 'UTC').
 * @returns {number|null} Business minutes, or null if inputs are invalid.
 */
export function calcBusinessMinutesBetween(start, end, hoursMap, timezone = 'UTC') {
  if (!start || !end) return null;
  if (!hoursMap || !Object.keys(hoursMap).length) {
    return Math.round((end - start) / 60000);
  }

  let bizMinutes = 0;
  let cursor     = new Date(start);
  let guard      = 0;

  while (cursor < end && guard++ < 20000) {
    const lp    = _getParts(cursor, timezone);
    const hours = hoursMap[lp.dow];

    if (!hours) {
      cursor = _toUTC(lp.year, lp.month, lp.day + 1, 0, 0, timezone);
      continue;
    }

    const dayStart = _toUTC(lp.year, lp.month, lp.day, hours.start, hours.startMin, timezone);
    const dayEnd   = _toUTC(lp.year, lp.month, lp.day, hours.end,   hours.endMin,   timezone);

    const effectiveStart = cursor > dayStart ? cursor : dayStart;
    const effectiveEnd   = end    < dayEnd   ? end    : dayEnd;

    if (effectiveStart < effectiveEnd) {
      bizMinutes += (effectiveEnd - effectiveStart) / 60000;
    }
    cursor = _toUTC(lp.year, lp.month, lp.day + 1, 0, 0, timezone);
  }
  return Math.round(bizMinutes);
}

/**
 * Load SLA threshold rows from the DB result set into two lookup maps.
 * Returns { slaByLabel, slaByPriorityValue } for flexible priority matching.
 *
 * @param {object[]} rows - Rows from sn_sla_config.
 * @returns {{ slaByLabel: object, slaByPriorityValue: object }}
 */
export function buildSlaThresholdMaps(rows) {
  const slaByLabel         = {};
  const slaByPriorityValue = {};
  for (const row of rows) {
    const entry = {
      priority:          row.priority,
      priorityValue:     row.priority_value,
      responseMinutes:   Number(row.response_minutes),
      resolutionMinutes: Number(row.resolution_minutes),
    };
    slaByLabel[row.priority]             = entry;
    slaByPriorityValue[row.priority_value] = entry;
  }
  return { slaByLabel, slaByPriorityValue };
}

/**
 * Resolve the SLA threshold entry for a given raw priority value.
 * Tries normalised numeric value first, then direct lookup, then label lookup.
 *
 * @param {string}  priorityRaw         - Raw priority value from ServiceNow.
 * @param {object}  slaByLabel          - Map keyed by priority label string.
 * @param {object}  slaByPriorityValue  - Map keyed by numeric priority value.
 * @returns {object} Resolved SLA threshold entry.
 */
export function resolveSlaThreshold(priorityRaw, slaByLabel, slaByPriorityValue) {
  const normalised = normalizePriority(priorityRaw);
  return (
    (normalised && slaByPriorityValue[normalised]) ||
    slaByPriorityValue[priorityRaw] ||
    slaByLabel[priorityRaw] ||
    { priority: priorityRaw, responseMinutes: 60, resolutionMinutes: 480 }
  );
}
