// ============================================================================
// TimezoneService.js — ServiceNow Module Timezone Management
//
// All timezone state is stored in the database (sn_module_config table).
// NO in-memory caching — every call reads fresh state from the DB.
// STATELESS — safe for Kubernetes multi-instance deployments.
//
// Import via: #modules/servicenow/api/services/TimezoneService.js
// ============================================================================
import { loadModuleConfig, saveModuleConfig } from '#modules/servicenow/api/routes/helpers.js';
import { snowGet } from '#modules/servicenow/api/lib/SnowApiClient.js';
import { snowVal } from '#modules/servicenow/api/lib/SnowApiClient.js';
import { snowUrls } from '#modules/servicenow/api/config/index.js';
import { createSnowLogger } from '#modules/servicenow/api/lib/moduleLogger.js';
const log = createSnowLogger('TimezoneService');

const CONFIG_KEY = 'timezone_config';

// ── Config I/O ───────────────────────────────────────────────────────────────

/**
 * Load the current timezone configuration from the database.
 * Returns defaults when no config has been persisted yet.
 *
 * @returns {Promise<{ serviceNowTimezone: string|null, displayTimezone: string|null }>}
 */
export async function loadTimezoneConfig() {
  const stored = await loadModuleConfig(CONFIG_KEY);
  return {
    serviceNowTimezone: stored?.serviceNowTimezone ?? null,
    displayTimezone:    stored?.displayTimezone    ?? null,
  };
}

/**
 * Get the effective display timezone.
 * Precedence: displayTimezone → serviceNowTimezone → 'UTC'
 *
 * @returns {Promise<string>} IANA timezone string.
 */
export async function getEffectiveTimezone() {
  const config = await loadTimezoneConfig();
  return config.displayTimezone || config.serviceNowTimezone || 'UTC';
}

/**
 * Persist timezone configuration to the database.
 *
 * @param {{ serviceNowTimezone?: string, displayTimezone?: string }} updates
 * @returns {Promise<{ serviceNowTimezone: string|null, displayTimezone: string|null }>}
 */
export async function saveTimezoneConfig(updates) {
  const current = await loadTimezoneConfig();
  const merged  = { ...current, ...updates };
  await saveModuleConfig(CONFIG_KEY, merged, 'Timezone configuration');
  return merged;
}

// ── ServiceNow Timezone Detection ────────────────────────────────────────────

/**
 * Detect the timezone used by the ServiceNow instance.
 *
 * Strategy (tried in order):
 *  1. Inspect date format of a sample incident — ServiceNow always returns UTC
 *     without a timezone designator, confirming the API timezone is UTC.
 *  2. Query sys_user.time_zone for the API user.
 *  3. Fall back to 'UTC'.
 *
 * @param {object} conn - Connection config { instanceUrl, username, password, apiVersion }.
 * @returns {Promise<{ snTimezone: string, source: string, attempts: object[] }>}
 */
export async function detectSnowTimezone(conn) {
  let snTimezone = null;
  let source     = 'not_found';
  const attempts = [];

  // Strategy 1 — date format inspection (most reliable)
  try {
    const result = await snowGet(
      conn,
      snowUrls.snow.tables.incident,
      'sysparm_limit=1&sysparm_fields=sys_id,opened_at,sys_created_on',
    );
    attempts.push({ method: 'incident_date_format', status: result.statusCode });
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result?.[0]) {
      const sample = snowVal(result.data.result[0].opened_at)
        || snowVal(result.data.result[0].sys_created_on);
      if (sample && /^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}$/.test(String(sample).trim())) {
        snTimezone = 'UTC';
        source     = 'date_format_detection';
      }
    }
  } catch (err) {
    attempts.push({ method: 'incident_date_format', status: 'error', error: err.message });
  }

  // Strategy 2 — sys_user.time_zone lookup
  if (!snTimezone) {
    try {
      const result = await snowGet(
        conn,
        snowUrls.snow.tables.sysUser,
        `sysparm_query=user_name=${encodeURIComponent(conn.username)}&sysparm_fields=user_name,time_zone&sysparm_limit=1`,
      );
      const tz = snowVal(result.data?.result?.[0]?.time_zone);
      attempts.push({ method: 'sys_user.time_zone', status: result.statusCode, value: tz ?? null });
      if (result.statusCode >= 200 && result.statusCode < 300 && tz) {
        snTimezone = tz;
        source     = 'sys_user';
      }
    } catch (err) {
      attempts.push({ method: 'sys_user.time_zone', status: 'error', error: err.message });
    }
  }

  // Strategy 3 — default
  if (!snTimezone) {
    snTimezone = 'UTC';
    source     = 'default_utc';
  }

  log.info('Detected ServiceNow timezone', { snTimezone, source });
  return { snTimezone, source, attempts };
}

// ── Timezone List ────────────────────────────────────────────────────────────

/**
 * Return a curated list of IANA timezone strings for the UI selector.
 * Covers major timezones worldwide ordered by UTC offset.
 *
 * @returns {string[]}
 */
export function getTimezoneList() {
  return [
    'UTC',
    'Pacific/Midway',
    'Pacific/Honolulu',
    'America/Anchorage',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Sao_Paulo',
    'Atlantic/Azores',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Helsinki',
    'Asia/Dubai',
    'Asia/Karachi',
    'Asia/Kolkata',
    'Asia/Dhaka',
    'Asia/Bangkok',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];
}
