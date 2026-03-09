// ============================================================================
// General Settings Routes — PulseOps V3 API
//
// PURPOSE: CRUD endpoints for general platform settings. Database is the
// source of truth (system_config table, key='general_settings').
// Falls back to core/database/seedData/GeneralSettings.json if DB unavailable.
//
// ENDPOINTS:
//   GET   /settings           → Get current general settings
//   PATCH /settings           → Partial-update general settings
//   GET   /settings/db-status → Check if DB is available for settings
//
// ARCHITECTURE: DB-backed via SettingsService. No file writes at runtime.
// ============================================================================
import { Router } from 'express';
import SettingsService from '#core/services/settingsService.js';
import { logger } from '#shared/logger.js';

const router = Router();
const CONFIG_KEY = 'general_settings';

// ── GET /settings — Read current settings from DB ──────────────────────────
router.get('/', async (_req, res) => {
  try {
    const settings = await SettingsService.get(CONFIG_KEY);
    res.json({ success: true, data: settings || {} });
  } catch (err) {
    logger.error('Failed to read general settings', { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── PATCH /settings — Partial-update settings in DB ─────────────────────────
router.patch('/', async (req, res) => {
  try {
    const updated = await SettingsService.merge(CONFIG_KEY, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error('Failed to save general settings', { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── GET /settings/db-status — Check DB availability ─────────────────────────
router.get('/db-status', async (_req, res) => {
  try {
    const available = await SettingsService.isDbAvailable();
    res.json({ success: true, data: { dbAvailable: available } });
  } catch (err) {
    res.json({ success: true, data: { dbAvailable: false } });
  }
});

export default router;
