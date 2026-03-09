// ============================================================================
// Config Routes — PulseOps V2 API
//
// PURPOSE: CRUD endpoints for system configuration stored in the
// system_config table (JSONB key-value store). Used for platform-wide
// settings like auth provider, feature flags, and module configs.
//
// ENDPOINTS:
//   GET    /config         — List all config entries
//   GET    /config/:key    — Get a specific config by key
//   POST   /config         — Create or update a config entry
//   DELETE /config/:key    — Delete a config entry
//
// AUTH: All routes require authentication. Write operations require
// super_admin role.
//
// DEPENDENCIES:
//   - ../database/databaseService.js → query execution
//   - ../middleware/auth.js → authenticate, requireRole
//   - ../../config/index.js → schema name
//   - ../../shared/loadJson.js → messages, errors
//   - ../../shared/logger.js → structured logging
// ============================================================================
import { Router } from 'express';
import DatabaseService from '#core/database/databaseService.js';
import { authenticate, requireRole } from '#core/middleware/auth.js';
import { config } from '#config';
import { messages, errors } from '#shared/loadJson.js';
import { logger } from '#shared/logger.js';

const router = Router();
const schema = config.db.schema || 'pulseops';

// ── GET /config — List all config entries ───────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await DatabaseService.query(
      `SELECT key, value, description, updated_at FROM ${schema}.system_config ORDER BY key`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error(errors.errors.configLoadFailed, { error: err.message, requestId: req.requestId });
    res.status(500).json({ success: false, error: { message: errors.errors.configLoadFailed } });
  }
});

// ── GET /config/:key — Get specific config ──────────────────────────────────
router.get('/:key', authenticate, async (req, res) => {
  try {
    const result = await DatabaseService.query(
      `SELECT key, value, description, updated_at FROM ${schema}.system_config WHERE key = $1`,
      [req.params.key]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: errors.errors.configLoadFailed } });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── POST /config — Create or update config ──────────────────────────────────
router.post('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const { key, value, description } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({
      success: false,
      error: { message: errors.errors.validationFailed },
    });
  }

  try {
    await DatabaseService.query(
      `INSERT INTO ${schema}.system_config (key, value, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, description = $3, updated_at = NOW()`,
      [key, JSON.stringify(value), description || '']
    );
    logger.info(messages.success.configSaved, { key, requestId: req.requestId });
    res.json({ success: true, data: { message: messages.success.configSaved, key } });
  } catch (err) {
    logger.error(errors.errors.configSaveFailed, { error: err.message, requestId: req.requestId });
    res.status(500).json({ success: false, error: { message: errors.errors.configSaveFailed } });
  }
});

// ── DELETE /config/:key — Delete config ─────────────────────────────────────
router.delete('/:key', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const result = await DatabaseService.query(
      `DELETE FROM ${schema}.system_config WHERE key = $1 RETURNING key`,
      [req.params.key]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: { message: errors.errors.configLoadFailed } });
    }
    res.json({ success: true, data: { message: messages.success.configSaved, key: req.params.key } });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

export default router;
