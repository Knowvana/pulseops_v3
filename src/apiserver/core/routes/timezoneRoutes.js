// ============================================================================
// Timezone Routes — PulseOps V3 API (Core)
//
// PURPOSE: Global timezone configuration endpoints. The GET endpoint is
// UNPROTECTED so any module (including their backend services) can fetch
// the display timezone without authentication. The POST endpoint requires
// authentication to change the timezone.
//
// ENDPOINTS:
//   GET  /timezone          → Get current timezone config (PUBLIC — no auth)
//   POST /timezone          → Save timezone config (PROTECTED — requires auth)
//
// STORAGE: Uses SettingsService with key 'timezone_config' in system_config.
//
// ARCHITECTURE: All modules call GET /api/timezone to discover the global
// display timezone. All dates are stored in UTC (GMT) in the database.
// UI components convert UTC to the display timezone for rendering.
// ============================================================================
import { Router } from 'express';
import SettingsService from '#core/services/settingsService.js';
import { authenticate } from '#core/middleware/auth.js';
import { logger } from '#shared/logger.js';

const router = Router();

const DEFAULT_TIMEZONE_CONFIG = {
  timezone: 'Asia/Kolkata',
  timezoneLabel: 'IST',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: 'hh:mm:ss A',
};

// Common IANA timezone list with labels
const TIMEZONE_LIST = [
  // Popular timezones (starred)
  { value: 'UTC', label: 'UTC / GMT (GMT+00:00)', offset: 0, star: true },
  { value: 'Europe/London', label: 'London — GMT (GMT+00:00)', offset: 0, star: true },
  { value: 'Europe/Berlin', label: 'Berlin, Frankfurt — CET (GMT+01:00)', offset: 1, star: true },
  { value: 'Asia/Kolkata', label: 'India Standard Time — IST (GMT+05:30)', offset: 5.5, star: true },
  
  // Other timezones
  { value: 'Pacific/Midway', label: 'Midway Island (GMT-11:00)', offset: -11 },
  { value: 'Pacific/Honolulu', label: 'Hawaii (GMT-10:00)', offset: -10 },
  { value: 'America/Anchorage', label: 'Alaska (GMT-09:00)', offset: -9 },
  { value: 'America/Los_Angeles', label: 'Pacific Time - US & Canada (GMT-08:00)', offset: -8 },
  { value: 'America/Denver', label: 'Mountain Time - US & Canada (GMT-07:00)', offset: -7 },
  { value: 'America/Chicago', label: 'Central Time - US & Canada (GMT-06:00)', offset: -6 },
  { value: 'America/New_York', label: 'Eastern Time - US & Canada (GMT-05:00)', offset: -5 },
  { value: 'America/Caracas', label: 'Caracas (GMT-04:30)', offset: -4.5 },
  { value: 'America/Halifax', label: 'Atlantic Time - Canada (GMT-04:00)', offset: -4 },
  { value: 'America/Sao_Paulo', label: 'Brasilia (GMT-03:00)', offset: -3 },
  { value: 'Atlantic/South_Georgia', label: 'Mid-Atlantic (GMT-02:00)', offset: -2 },
  { value: 'Atlantic/Azores', label: 'Azores (GMT-01:00)', offset: -1 },
  { value: 'Europe/Paris', label: 'Paris (GMT+01:00)', offset: 1 },
  { value: 'Europe/Athens', label: 'Athens (GMT+02:00)', offset: 2 },
  { value: 'Africa/Cairo', label: 'Cairo (GMT+02:00)', offset: 2 },
  { value: 'Europe/Istanbul', label: 'Istanbul (GMT+03:00)', offset: 3 },
  { value: 'Europe/Moscow', label: 'Moscow (GMT+03:00)', offset: 3 },
  { value: 'Asia/Dubai', label: 'Dubai (GMT+04:00)', offset: 4 },
  { value: 'Asia/Kathmandu', label: 'Kathmandu (GMT+05:45)', offset: 5.75 },
  { value: 'Asia/Dhaka', label: 'Dhaka (GMT+06:00)', offset: 6 },
  { value: 'Asia/Bangkok', label: 'Bangkok (GMT+07:00)', offset: 7 },
  { value: 'Asia/Singapore', label: 'Singapore (GMT+08:00)', offset: 8 },
  { value: 'Asia/Shanghai', label: 'Beijing, Shanghai (GMT+08:00)', offset: 8 },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (GMT+08:00)', offset: 8 },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+09:00)', offset: 9 },
  { value: 'Asia/Seoul', label: 'Seoul (GMT+09:00)', offset: 9 },
  { value: 'Australia/Sydney', label: 'Sydney (GMT+10:00)', offset: 10 },
  { value: 'Pacific/Auckland', label: 'Auckland (GMT+12:00)', offset: 12 },
];

// Map IANA timezone to short label
function getTimezoneLabel(tz) {
  const labelMap = {
    'Asia/Kolkata': 'IST',
    'UTC': 'UTC',
    'Europe/London': 'GMT',
    'America/New_York': 'EST',
    'America/Chicago': 'CST',
    'America/Denver': 'MST',
    'America/Los_Angeles': 'PST',
    'Europe/Berlin': 'CET',
    'Europe/Paris': 'CET',
    'Europe/Athens': 'EET',
    'Europe/Moscow': 'MSK',
    'Asia/Dubai': 'GST',
    'Asia/Tokyo': 'JST',
    'Asia/Shanghai': 'CST',
    'Asia/Singapore': 'SGT',
    'Australia/Sydney': 'AEST',
    'Pacific/Auckland': 'NZST',
  };
  return labelMap[tz] || tz;
}

// ── GET /timezone — Public (no auth required) ──────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const config = await SettingsService.get('timezone_config');
    const data = config || DEFAULT_TIMEZONE_CONFIG;
    // Always include the label
    if (!data.timezoneLabel) {
      data.timezoneLabel = getTimezoneLabel(data.timezone);
    }
    res.json({ success: true, data });
  } catch (err) {
    logger.error('GET /timezone failed', { error: err.message });
    // Return default on error so modules always get a timezone
    res.json({ success: true, data: DEFAULT_TIMEZONE_CONFIG });
  }
});

// ── GET /timezone/list — Public list of available timezones ──────────────────
router.get('/list', (_req, res) => {
  res.json({ success: true, data: TIMEZONE_LIST });
});

// ── POST /timezone — Protected (requires auth) ────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { timezone, dateFormat, timeFormat } = req.body;
    if (!timezone) {
      return res.status(400).json({ success: false, error: { message: 'Timezone is required.' } });
    }
    // Validate that the timezone is a valid IANA timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      return res.status(400).json({ success: false, error: { message: `Invalid timezone: ${timezone}` } });
    }
    const timezoneLabel = getTimezoneLabel(timezone);
    const config = {
      timezone,
      timezoneLabel,
      dateFormat: dateFormat || 'DD/MM/YYYY',
      timeFormat: timeFormat || 'hh:mm:ss A',
    };
    await SettingsService.set('timezone_config', config, 'Global timezone configuration — display timezone for all modules.');
    logger.info('Timezone config saved', { timezone, timezoneLabel });
    res.json({ success: true, data: config, message: 'Timezone configuration saved successfully.' });
  } catch (err) {
    logger.error('POST /timezone failed', { error: err.message });
    res.status(500).json({ success: false, error: { message: `Failed to save timezone: ${err.message}` } });
  }
});

export default router;
