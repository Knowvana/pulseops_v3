// ============================================================================
// Settings Service — PulseOps V3 API
//
// PURPOSE: Database-backed CRUD for platform settings stored in
// the system_config table (JSONB values). Replaces file-based JSON config
// to ensure GCP pod restarts don't lose data.
//
// KEYS:
//   - general_settings   → timezone, dateFormat, timeFormat
//   - logs_config        → logging storage, levels, capture options, management
//   - auth_provider      → active authentication provider
//
// FALLBACK: If DB is unavailable, falls back to core/database/seedData/ JSON
// files (read-only). Writes always require DB.
//
// USAGE:
//   import SettingsService from '#core/services/settingsService.js';
//   const settings = await SettingsService.get('general_settings');
//   await SettingsService.set('general_settings', { timezone: 'UTC' });
// ============================================================================
import DatabaseService from '#core/database/databaseService.js';
import { config } from '#config';
import { logger } from '#shared/logger.js';
import { loadSeedJson } from '#shared/loadJson.js';

const schema = config.db.schema || 'pulseops';

// Map config keys to their fallback seed files (in core/database/seedData/)
const FALLBACK_FILES = {
  general_settings: 'GeneralSettings.json',
  logs_config:      'LogsConfig.json',
};

const SettingsService = {
  /**
   * Get a config value by key from the database.
   * Falls back to seed JSON files if DB is unavailable.
   * @param {string} key - Config key (e.g. 'general_settings', 'logs_config')
   * @returns {Promise<Object|null>} Parsed JSONB value or null
   */
  async get(key) {
    try {
      const result = await DatabaseService.query(
        `SELECT value FROM ${schema}.system_config WHERE key = $1 LIMIT 1`,
        [key]
      );
      if (result.rows.length > 0) {
        return result.rows[0].value;
      }
      return null;
    } catch (err) {
      logger.warn(`[SettingsService] DB read failed for key '${key}', trying fallback`, { error: err.message });
      // Fall back to seed file (read-only)
      const fallbackFile = FALLBACK_FILES[key];
      if (fallbackFile) {
        try {
          return loadSeedJson(fallbackFile);
        } catch {
          logger.warn(`[SettingsService] Fallback file not found for key '${key}'`);
        }
      }
      return null;
    }
  },

  /**
   * Set (upsert) a config value by key in the database.
   * @param {string} key - Config key
   * @param {Object} value - Value to store (will be serialized as JSONB)
   * @param {string} [description] - Optional description
   * @returns {Promise<Object>} The stored value
   */
  async set(key, value, description) {
    const descClause = description
      ? `, description = $3`
      : '';
    const params = description
      ? [key, JSON.stringify(value), description]
      : [key, JSON.stringify(value)];

    await DatabaseService.query(
      `INSERT INTO ${schema}.system_config (key, value${description ? ', description' : ''})
       VALUES ($1, $2${description ? ', $3' : ''})
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()${descClause}`,
      params
    );
    logger.info(`[SettingsService] Config saved: ${key}`);
    return value;
  },

  /**
   * Partial-update a config value (merge into existing JSONB).
   * @param {string} key - Config key
   * @param {Object} updates - Partial object to merge
   * @returns {Promise<Object>} Updated value
   */
  async merge(key, updates) {
    const existing = await this.get(key);
    const merged = existing ? { ...existing, ...updates } : updates;
    // Deep-merge one level for nested objects
    if (existing) {
      for (const [k, v] of Object.entries(updates)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && existing[k] && typeof existing[k] === 'object') {
          merged[k] = { ...existing[k], ...v };
        }
      }
    }
    return this.set(key, merged);
  },

  /**
   * Delete a config key from the database.
   * @param {string} key - Config key
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(key) {
    const result = await DatabaseService.query(
      `DELETE FROM ${schema}.system_config WHERE key = $1`,
      [key]
    );
    return result.rowCount > 0;
  },

  /**
   * Check if the database is available and the system_config table exists.
   * @returns {Promise<boolean>}
   */
  async isDbAvailable() {
    try {
      await DatabaseService.query(
        `SELECT 1 FROM ${schema}.system_config LIMIT 1`
      );
      return true;
    } catch {
      return false;
    }
  },
};

export default SettingsService;
