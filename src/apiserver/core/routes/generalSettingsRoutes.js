// ============================================================================
// General Settings Routes — PulseOps V2 API
//
// PURPOSE: CRUD endpoints for general platform settings stored in
// GeneralSettings.json. File-based (no DB required). Currently supports
// timezone configuration; more settings will be added gradually.
//
// ENDPOINTS:
//   GET   /settings  → Get current general settings
//   PATCH /settings  → Partial-update general settings
//
// ARCHITECTURE: Uses loadJson/saveJson for file persistence.
// ============================================================================
import { Router } from 'express';
import { loadJson, saveJson } from '#shared/loadJson.js';
import { logger } from '#shared/logger.js';

const router = Router();
const CONFIG_FILE = 'GeneralSettings.json';

// ── GET /settings — Read current settings ──────────────────────────────────
router.get('/', (_req, res) => {
  try {
    const settings = loadJson(CONFIG_FILE);
    res.json({ success: true, data: settings });
  } catch (err) {
    logger.error('Failed to read general settings', { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── PATCH /settings — Partial-update settings ───────────────────────────────
router.patch('/', (req, res) => {
  try {
    const current = loadJson(CONFIG_FILE);
    const updated = { ...current, ...req.body };
    saveJson(CONFIG_FILE, updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error('Failed to save general settings', { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

export default router;
