// ============================================================================
// TimezoneService — PulseOps V3 Shared Service
//
// PURPOSE: Centralized timezone management for the entire platform. Fetches
// the user-configured timezone from the UNPROTECTED /api/timezone endpoint
// and provides formatting utilities that respect the selected timezone.
//
// USAGE:
//   import TimezoneService from '@shared/services/timezoneService';
//   TimezoneService.init();  // Call once at app start
//   TimezoneService.formatTime(isoString); // Format with configured timezone
//   TimezoneService.getTimezone(); // Get current timezone string
//   TimezoneService.getTimezoneLabel(); // Get short label (e.g. 'IST')
//   TimezoneService.setTimezone('Asia/Kolkata'); // Update timezone immediately
//
// ARCHITECTURE: Singleton service. Fetches from /api/timezone (unprotected).
// All dates stored as UTC in database. UI converts to display timezone.
// Components subscribe to timezone changes via subscribe/unsubscribe pattern.
// ============================================================================
import urls from '@config/urls.json';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_LABEL = 'IST';

class TimezoneServiceClass {
  constructor() {
    this._timezone = DEFAULT_TIMEZONE;
    this._timezoneLabel = DEFAULT_LABEL;
    this._listeners = new Set();
    this._initialized = false;
  }

  /**
   * Initialize the service by fetching timezone from the global /api/timezone endpoint (unprotected)
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;
    try {
      const res = await fetch(urls.timezone.get);
      const json = await res.json();
      if (json.success && json.data?.timezone) {
        this._timezone = json.data.timezone;
        this._timezoneLabel = json.data.timezoneLabel || DEFAULT_LABEL;
        this._notify();
      }
    } catch {
      // Keep default timezone on error
    }
  }

  /**
   * Re-fetch timezone from API (call after saving new timezone)
   */
  async refresh() {
    this._initialized = false;
    await this.init();
  }

  /**
   * Get the current configured timezone (IANA string)
   */
  getTimezone() {
    return this._timezone;
  }

  /**
   * Get the short timezone label (e.g. 'IST', 'UTC', 'EST')
   */
  getTimezoneLabel() {
    return this._timezoneLabel;
  }

  /**
   * Set the timezone immediately (called after saving settings)
   */
  setTimezone(tz, label) {
    if (tz && tz !== this._timezone) {
      this._timezone = tz;
      this._timezoneLabel = label || tz;
      this._notify();
    }
  }

  /**
   * Subscribe to timezone changes
   * @param {Function} callback - Called with new timezone string
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Format an ISO timestamp string using the configured timezone.
   * Returns format: DD/MM/YYYY, hh:mm:ss AM/PM
   * @param {string} isoString - ISO date string to format
   * @returns {string} Formatted date/time string
   */
  formatTime(isoString) {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: this._timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
      }).format(date);
    } catch {
      return isoString;
    }
  }

  /**
   * Format with timezone label appended, e.g. "19/03/2026, 08:44:10 pm (IST)"
   * @param {string} isoString - ISO date string
   * @returns {string} Formatted date/time with timezone label
   */
  formatTimeWithLabel(isoString) {
    const formatted = this.formatTime(isoString);
    if (formatted === '—' || formatted === isoString) return formatted;
    return `${formatted} (${this._timezoneLabel})`;
  }

  /**
   * Get current time formatted in the configured timezone
   * @returns {string} Formatted current time
   */
  formatCurrentTime() {
    return this.formatTime(new Date().toISOString());
  }

  /**
   * Get current time as ISO string with timezone offset
   * @returns {string} ISO-like string with timezone offset
   */
  toTimezoneISO() {
    const now = new Date();
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: this._timezone,
        timeZoneName: 'shortOffset',
      });
      const parts = formatter.formatToParts(now);
      const offsetPart = parts.find(p => p.type === 'timeZoneName');
      const offset = offsetPart ? offsetPart.value.replace('GMT', '') : '+00:00';
      const localStr = now.toLocaleString('sv-SE', { timeZone: this._timezone });
      return localStr.replace(' ', 'T') + (offset || '+00:00');
    } catch {
      return now.toISOString();
    }
  }

  /**
   * Notify all listeners of timezone change
   */
  _notify() {
    this._listeners.forEach(cb => {
      try { cb(this._timezone); } catch { /* ignore listener errors */ }
    });
  }
}

const TimezoneService = new TimezoneServiceClass();
export default TimezoneService;
