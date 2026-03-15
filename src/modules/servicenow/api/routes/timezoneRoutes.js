// ============================================================================
// ServiceNow Module — Timezone Routes
//
// ENDPOINTS:
//   GET  /config/timezone           → Get saved timezone config from DB
//   PUT  /config/timezone           → Save timezone config to DB
//   GET  /config/timezone/servicenow → Fetch timezone from ServiceNow instance
//   GET  /config/timezone/list      → Return list of IANA timezones
//
// MOUNT: router.use('/', timezoneRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import {
  loadConnectionConfig, loadModuleConfig, saveModuleConfig,
  snowRequest, snowVal,
} from './helpers.js';
import { logger } from '#shared/logger.js';

const router = Router();

// ── Common IANA timezone list ────────────────────────────────────────────────
const IANA_TIMEZONES = [
  'Pacific/Midway', 'Pacific/Honolulu', 'America/Anchorage',
  'America/Los_Angeles', 'America/Phoenix', 'America/Denver',
  'America/Chicago', 'America/New_York', 'America/Halifax',
  'America/St_Johns', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Atlantic/Azores', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Helsinki', 'Europe/Istanbul', 'Africa/Cairo', 'Africa/Nairobi',
  'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Colombo',
  'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Rangoon', 'Asia/Bangkok',
  'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Seoul',
  'Asia/Tokyo', 'Australia/Adelaide', 'Australia/Sydney',
  'Pacific/Auckland', 'Pacific/Fiji',
  'UTC',
];

/**
 * Parse a ServiceNow date string as UTC.
 * ServiceNow returns timestamps like "2026-03-14 07:31:00" which are UTC
 * but lack the "Z" suffix. JavaScript's new Date() without Z interprets as
 * local time, causing wrong calculations on servers in non-UTC timezones.
 * This is the canonical utility — import from timezoneRoutes.js everywhere.
 */
export function parseSnowDateUTC(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  // Already has timezone indicator — parse directly
  if (s.includes('Z') || s.includes('+') || /T.*[-+]\d/.test(s)) {
    return new Date(s);
  }
  // ServiceNow format: "YYYY-MM-DD HH:MM:SS" — treat as UTC
  const normalized = s.replace(' ', 'T');
  return new Date(normalized + 'Z');
}

/**
 * Convert an ISO date string from one IANA timezone to another.
 * All timezone conversions happen server-side — UI just displays what API returns.
 *
 * @param {string} isoDateStr - ISO date string (from ServiceNow, typically UTC)
 * @param {string} targetTz   - Target IANA timezone (e.g. 'America/New_York')
 * @returns {string} ISO string adjusted to target timezone display
 */
export function convertToTimezone(isoDateStr, targetTz) {
  if (!isoDateStr || !targetTz) return isoDateStr;
  try {
    // Use parseSnowDateUTC to handle raw SNOW strings (no Z suffix) as UTC
    const date = parseSnowDateUTC(isoDateStr);
    if (!date || isNaN(date.getTime())) return isoDateStr;
    // Format in the target timezone
    const formatted = date.toLocaleString('en-US', {
      timeZone: targetTz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    // Parse back to ISO-like T-format: MM/DD/YYYY, HH:MM:SS → YYYY-MM-DDTHH:MM:SS
    const [datePart, timePart] = formatted.split(', ');
    if (!datePart || !timePart) return isoDateStr;
    const [month, day, year] = datePart.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}`;
  } catch {
    return isoDateStr;
  }
}

/**
 * Load the saved timezone configuration from the database.
 * Returns { serviceNowTimezone, displayTimezone } or defaults.
 */
export async function loadTimezoneConfig() {
  const stored = await loadModuleConfig('timezone_config');
  return {
    serviceNowTimezone: stored?.serviceNowTimezone || null,
    displayTimezone: stored?.displayTimezone || null,
  };
}

/**
 * Get the effective display timezone.
 * Priority: displayTimezone (user-selected) > serviceNowTimezone (auto-fetched) > 'UTC'
 */
export async function getEffectiveTimezone() {
  const config = await loadTimezoneConfig();
  return config.displayTimezone || config.serviceNowTimezone || 'UTC';
}

// ── GET /config/timezone — Get saved timezone config ─────────────────────────
router.get('/config/timezone', async (req, res) => {
  try {
    const config = await loadTimezoneConfig();
    const effectiveTz = config.displayTimezone || config.serviceNowTimezone || 'UTC';
    return res.json({
      success: true,
      data: {
        serviceNowTimezone: config.serviceNowTimezone,
        displayTimezone: config.displayTimezone,
        effectiveTimezone: effectiveTz,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load timezone config: ${err.message}` } });
  }
});

// ── PUT /config/timezone — Save timezone config ──────────────────────────────
router.put('/config/timezone', async (req, res) => {
  try {
    const { displayTimezone } = req.body;
    if (displayTimezone && !IANA_TIMEZONES.includes(displayTimezone) && displayTimezone !== 'UTC') {
      // Allow any valid IANA timezone, not just our curated list
      try {
        Intl.DateTimeFormat(undefined, { timeZone: displayTimezone });
      } catch {
        return res.status(400).json({ success: false, error: { message: `Invalid timezone: ${displayTimezone}` } });
      }
    }
    const current = await loadTimezoneConfig();
    const updated = {
      serviceNowTimezone: current.serviceNowTimezone,
      displayTimezone: displayTimezone || null,
    };
    await saveModuleConfig('timezone_config', updated, 'Timezone configuration');
    const effectiveTz = updated.displayTimezone || updated.serviceNowTimezone || 'UTC';
    logger.debug('[Timezone] Config saved', { displayTimezone, effectiveTz });
    return res.json({
      success: true,
      message: 'Timezone configuration saved successfully.',
      data: { ...updated, effectiveTimezone: effectiveTz },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save timezone config: ${err.message}` } });
  }
});

// ── GET /config/timezone/servicenow — Fetch timezone from ServiceNow ─────────
router.get('/config/timezone/servicenow', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }

    let snTimezone = null;
    let source = 'not_found';
    const attempts = [];

    // Method 0: Check actual incident date format to detect if ServiceNow returns UTC
    // This is the most reliable method - check what format the API actually returns
    try {
      const sampleResult = await snowRequest(conn, 'table/incident',
        'sysparm_limit=1&sysparm_fields=sys_id,opened_at,sys_created_on,created'
      );
      attempts.push({ 
        method: 'incident_date_format_detection', 
        status: sampleResult.statusCode, 
        resultCount: sampleResult.data?.result?.length || 0 
      });
      
      if (sampleResult.statusCode >= 200 && sampleResult.statusCode < 300 && sampleResult.data?.result?.[0]) {
        const incident = sampleResult.data.result[0];
        const sampleDate = snowVal(incident.opened_at) || snowVal(incident.sys_created_on) || snowVal(incident.created);
        
        logger.debug('[Timezone] Sample incident date retrieved', { 
          sampleDate, 
          incident: {
            opened_at: incident.opened_at,
            sys_created_on: incident.sys_created_on,
            created: incident.created
          }
        });
        
        attempts[attempts.length - 1].sampleDate = sampleDate;
        
        // Check if date is in ISO/ServiceNow format
        // Patterns: 2026-03-14T12:34:56Z or 2026-03-14T12:34:56 or 2026-03-14 12:34:56
        if (sampleDate && typeof sampleDate === 'string') {
          // Match YYYY-MM-DD followed by time (with T, space, or nothing)
          const datePattern = /^\d{4}-\d{2}-\d{2}[\sT]?\d{2}:\d{2}:\d{2}/;
          if (datePattern.test(sampleDate.trim())) {
            snTimezone = 'UTC';
            source = 'date_format_detection';
            logger.info('[Timezone] Detected UTC format from incident dates', { sampleDate, pattern: 'ServiceNow_ISO' });
          }
        }
      } else {
        logger.debug('[Timezone] No incidents found for date format detection', { 
          statusCode: sampleResult.statusCode,
          hasResult: !!sampleResult.data?.result
        });
      }
    } catch (err) {
      attempts.push({ method: 'incident_date_format_detection', status: 'error', error: err.message });
      logger.debug('[Timezone] Date format detection failed', { error: err.message });
    }

    // Method 1: Query sys_user for the authenticated user's time_zone field
    // This uses gs.getSession().getTimeZoneName() equivalent — the user's session timezone
    if (!snTimezone) {
      try {
        const result = await snowRequest(conn, 'table/sys_user',
          `sysparm_query=user_name=${encodeURIComponent(conn.username)}&sysparm_fields=user_name,time_zone&sysparm_limit=1`
        );
        const tz = snowVal(result.data?.result?.[0]?.time_zone);
        attempts.push({ method: 'sys_user.time_zone', status: result.statusCode, value: tz || null });
        if (result.statusCode >= 200 && result.statusCode < 300 && tz) {
          snTimezone = tz;
          source = 'sys_user';
          logger.debug('[Timezone] Got timezone from sys_user.time_zone', { snTimezone });
        }
      } catch (err) {
        attempts.push({ method: 'sys_user.time_zone', status: 'error', error: err.message });
        logger.debug('[Timezone] sys_user query failed', { error: err.message });
      }
    }

    // Method 2: Query sys_properties for the system default timezone
    if (!snTimezone) {
      try {
        const result = await snowRequest(conn, 'table/sys_properties',
          'sysparm_query=name=glide.sys.default.tz&sysparm_fields=name,value&sysparm_limit=1'
        );
        const tz = snowVal(result.data?.result?.[0]?.value);
        attempts.push({ method: 'sys_properties.glide.sys.default.tz', status: result.statusCode, value: tz || null });
        if (result.statusCode >= 200 && result.statusCode < 300 && tz) {
          snTimezone = tz;
          source = 'sys_properties';
          logger.debug('[Timezone] Got timezone from sys_properties', { snTimezone });
        }
      } catch (err) {
        attempts.push({ method: 'sys_properties.glide.sys.default.tz', status: 'error', error: err.message });
        logger.debug('[Timezone] sys_properties query failed', { error: err.message });
      }
    }

    // Method 3: Query sys_user_preference for user timezone preference
    if (!snTimezone) {
      try {
        const result = await snowRequest(conn, 'table/sys_user_preference',
          `sysparm_query=name=timezone^user.user_name=${encodeURIComponent(conn.username)}&sysparm_fields=name,value&sysparm_limit=1`
        );
        const tz = snowVal(result.data?.result?.[0]?.value);
        attempts.push({ method: 'sys_user_preference.timezone', status: result.statusCode, value: tz || null });
        if (result.statusCode >= 200 && result.statusCode < 300 && tz) {
          snTimezone = tz;
          source = 'sys_user_preference';
          logger.debug('[Timezone] Got timezone from sys_user_preference', { snTimezone });
        }
      } catch (err) {
        attempts.push({ method: 'sys_user_preference.timezone', status: 'error', error: err.message });
        logger.debug('[Timezone] sys_user_preference query failed', { error: err.message });
      }
    }

    // Default to UTC if no timezone detected (ServiceNow REST API returns dates in UTC by default)
    if (!snTimezone) {
      snTimezone = 'UTC';
      source = 'default_utc';
      logger.info('[Timezone] No timezone detected from ServiceNow, defaulting to UTC (ServiceNow REST API standard)', { attempts });
    }

    logger.info(`[Timezone] Fetch complete: timezone=${snTimezone}, source=${source}`, { attempts });

    // Save the detected/default timezone to config
    const current = await loadTimezoneConfig();
    await saveModuleConfig('timezone_config', {
      serviceNowTimezone: snTimezone,
      displayTimezone: current.displayTimezone,
    }, 'Timezone configuration');

    const effectiveTz = current.displayTimezone || snTimezone || 'UTC';

    return res.json({
      success: true,
      data: {
        serviceNowTimezone: snTimezone,
        displayTimezone: current.displayTimezone,
        effectiveTimezone: effectiveTz,
        source,
        attempts,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to fetch ServiceNow timezone: ${err.message}` } });
  }
});

// ── GET /config/timezone/list — Return list of IANA timezones ────────────────
router.get('/config/timezone/list', (req, res) => {
  // Build timezone list with UTC offset for display
  const timezoneList = IANA_TIMEZONES.map(tz => {
    try {
      const now = new Date();
      const formatted = now.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
      const offsetMatch = formatted.match(/GMT([+-]\d{1,2}(?::\d{2})?)/);
      const offset = offsetMatch ? offsetMatch[1] : '+0';
      const shortName = now.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(', ').pop()?.trim() || tz;
      return { value: tz, label: `${tz} (UTC${offset})`, offset, shortName };
    } catch {
      return { value: tz, label: tz, offset: '+0', shortName: tz };
    }
  });
  return res.json({ success: true, data: { timezones: timezoneList } });
});

export default router;
