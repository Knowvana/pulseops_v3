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
import { loadConnectionConfig } from '#modules/servicenow/api/routes/helpers.js';
import { snowGet, snowVal } from '#modules/servicenow/api/lib/SnowApiClient.js';
import {
  loadTimezoneConfig, saveTimezoneConfig, getEffectiveTimezone, getTimezoneList,
} from '#modules/servicenow/api/services/TimezoneService.js';
import { snowUrls, apiErrors, apiMessages } from '#modules/servicenow/api/config/index.js';
import { createSnowLogger } from '#modules/servicenow/api/lib/moduleLogger.js';
const log = createSnowLogger('Timezone');

const router = Router();


// ── GET /config/timezone — Get saved timezone config ─────────────────────────
router.get('/config/timezone', async (req, res) => {
  try {
    const config     = await loadTimezoneConfig();
    const effectiveTz = await getEffectiveTimezone();
    return res.json({ success: true, data: { serviceNowTimezone: config.serviceNowTimezone, displayTimezone: config.displayTimezone, effectiveTimezone: effectiveTz } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.timezone.loadFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /config/timezone — Save timezone config ──────────────────────────────
router.put('/config/timezone', async (req, res) => {
  try {
    const { displayTimezone } = req.body;
    if (displayTimezone) {
      try { Intl.DateTimeFormat(undefined, { timeZone: displayTimezone }); }
      catch { return res.status(400).json({ success: false, error: { message: apiErrors.timezone.invalidTimezone.replace('{timezone}', displayTimezone) } }); }
    }
    const updated    = await saveTimezoneConfig({ displayTimezone: displayTimezone || null });
    const effectiveTz = updated.displayTimezone || updated.serviceNowTimezone || 'UTC';
    log.debug('Config saved', { displayTimezone, effectiveTz });
    return res.json({ success: true, message: apiMessages.timezone.saved, data: { ...updated, effectiveTimezone: effectiveTz } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: apiErrors.timezone.saveFailed.replace('{message}', err.message) } });
  }
});

// ── GET /config/timezone/servicenow — Fetch timezone from ServiceNow ─────────
router.get('/config/timezone/servicenow', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.status(400).json({ success: false, error: { message: apiErrors.connection.notConfigured } });

    let snTimezone = null;
    let source = 'not_found';
    const attempts = [];

    // Method 0: Check actual incident date format to detect if ServiceNow returns UTC
    // This is the most reliable method - check what format the API actually returns
    try {
      const sampleResult = await snowGet(conn, snowUrls.snow.tables.incident,
        'sysparm_limit=1&sysparm_fields=sys_id,opened_at,sys_created_on'
      );
      attempts.push({ 
        method: 'incident_date_format_detection', 
        status: sampleResult.statusCode, 
        resultCount: sampleResult.data?.result?.length || 0 
      });
      
      if (sampleResult.statusCode >= 200 && sampleResult.statusCode < 300 && sampleResult.data?.result?.[0]) {
        const incident = sampleResult.data.result[0];
        const sampleDate = snowVal(incident.opened_at) || snowVal(incident.sys_created_on);
        
        log.debug('Sample incident date retrieved', { 
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
            log.info('Detected UTC format from incident dates', { sampleDate, pattern: 'ServiceNow_ISO' });
          }
        }
      } else {
        log.debug('No incidents found for date format detection', { 
          statusCode: sampleResult.statusCode,
          hasResult: !!sampleResult.data?.result
        });
      }
    } catch (err) {
      attempts.push({ method: 'incident_date_format_detection', status: 'error', error: err.message });
      log.debug('Date format detection failed', { error: err.message });
    }

    // Method 1: Query sys_user for the authenticated user's time_zone field
    if (!snTimezone) {
      try {
        const result = await snowGet(conn, snowUrls.snow.tables.sysUser,
          `sysparm_query=user_name=${encodeURIComponent(conn.username)}&sysparm_fields=user_name,time_zone&sysparm_limit=1`
        );
        const tz = snowVal(result.data?.result?.[0]?.time_zone);
        attempts.push({ method: 'sys_user.time_zone', status: result.statusCode, value: tz || null });
        if (result.statusCode >= 200 && result.statusCode < 300 && tz) {
          snTimezone = tz;
          source = 'sys_user';
          log.debug('Got timezone from sys_user.time_zone', { snTimezone });
        }
      } catch (err) {
        attempts.push({ method: 'sys_user.time_zone', status: 'error', error: err.message });
        log.debug('sys_user query failed', { error: err.message });
      }
    }

    // Method 2: Query sys_properties for the system default timezone
    if (!snTimezone) {
      try {
        const result = await snowGet(conn, snowUrls.snow.tables.sysProperties,
          'sysparm_query=name=glide.sys.default.tz&sysparm_fields=name,value&sysparm_limit=1'
        );
        const tz = snowVal(result.data?.result?.[0]?.value);
        attempts.push({ method: 'sys_properties.glide.sys.default.tz', status: result.statusCode, value: tz || null });
        if (result.statusCode >= 200 && result.statusCode < 300 && tz) {
          snTimezone = tz;
          source = 'sys_properties';
          log.debug('Got timezone from sys_properties', { snTimezone });
        }
      } catch (err) {
        attempts.push({ method: 'sys_properties.glide.sys.default.tz', status: 'error', error: err.message });
        log.debug('sys_properties query failed', { error: err.message });
      }
    }

    // Method 3: Query sys_user_preference for user timezone preference
    if (!snTimezone) {
      try {
        const result = await snowGet(conn, 'table/sys_user_preference',
          `sysparm_query=name=timezone^user.user_name=${encodeURIComponent(conn.username)}&sysparm_fields=name,value&sysparm_limit=1`
        );
        const tz = snowVal(result.data?.result?.[0]?.value);
        attempts.push({ method: 'sys_user_preference.timezone', status: result.statusCode, value: tz || null });
        if (result.statusCode >= 200 && result.statusCode < 300 && tz) {
          snTimezone = tz;
          source = 'sys_user_preference';
          log.debug('Got timezone from sys_user_preference', { snTimezone });
        }
      } catch (err) {
        attempts.push({ method: 'sys_user_preference.timezone', status: 'error', error: err.message });
        log.debug('sys_user_preference query failed', { error: err.message });
      }
    }

    // Default to UTC if no timezone detected (ServiceNow REST API returns dates in UTC by default)
    if (!snTimezone) {
      snTimezone = 'UTC';
      source = 'default_utc';
      log.info('No timezone detected from ServiceNow, defaulting to UTC (ServiceNow REST API standard)', { attempts });
    }

    log.info(`Fetch complete: timezone=${snTimezone}, source=${source}`, { attempts });

    // Save the detected/default timezone to config
    const current = await loadTimezoneConfig();
    await saveTimezoneConfig({ serviceNowTimezone: snTimezone, displayTimezone: current.displayTimezone });

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
    return res.status(500).json({ success: false, error: { message: apiErrors.timezone.fetchSnowFailed.replace('{message}', err.message) } });
  }
});

// ── GET /config/timezone/list — Return list of IANA timezones ────────────────
router.get('/config/timezone/list', (req, res) => {
  const timezoneList = getTimezoneList().map(tz => {
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
