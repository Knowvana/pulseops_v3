// ============================================================================
// Log Routes — PulseOps V2 API
//
// PURPOSE: REST endpoints for log management. Database-only storage.
// All log writes are gated by the global 'enabled' flag in LogsConfig.json.
//
// ENDPOINTS:
//   GET    /logs/config          → Get current logging configuration
//   PUT    /logs/config          → Update logging configuration (level, capture, management)
//   GET    /logs/config/status   → Check DB logging availability + connection
//   GET    /logs/stats           → Get stats for both log types
//   GET    /logs/:type           → Get logs (type = ui | api)
//   POST   /logs/:type           → Write log entries (push from UI) — gated by enabled flag
//   DELETE /logs                 → Delete ALL logs (UI + API)
//   DELETE /logs/:type           → Delete all logs for a type
//   GET    /logs/:type/stats     → Get stats for a specific log type
//
// ARCHITECTURE: Storage is always 'database'. The 'enabled' flag in
// LogsConfig.json acts as a global on/off switch for all log captures.
// ============================================================================
import { Router } from 'express';
import LogService from '#core/services/logService.js';
import { messages, errors } from '#shared/loadJson.js';
import { logger } from '#shared/logger.js';

const router = Router();

// ── GET /logs/config — Get current logging configuration ─────────────────────
router.get('/config', (_req, res) => {
  try {
    const cfg = LogService.getConfig();
    res.json({ success: true, data: cfg });
  } catch (err) {
    logger.error('GET /logs/config failed', { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── PUT /logs/config — Update logging configuration ─────────────────────────
router.put('/config', async (req, res) => {
  try {
    const updates = req.body;
    const result = await LogService.updateConfig(updates);
    logger.info('Log configuration updated', { updates });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('PUT /logs/config failed', { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── GET /logs/config/status — Check DB logging availability ────────────────
router.get('/config/status', async (_req, res) => {
  try {
    const available = await LogService.isDatabaseLoggingAvailable();
    const cfg = LogService.getConfig();
    res.json({
      success: true,
      data: {
        enabled: cfg.enabled,
        storage: 'database',
        databaseAvailable: available,
      },
    });
  } catch (err) {
    res.json({
      success: true,
      data: { enabled: false, storage: 'database', databaseAvailable: false },
    });
  }
});

// ── GET /logs/stats — Get stats for both log types ───────────────────────────
router.get('/stats', async (_req, res) => {
  try {
    const stats = await LogService.getAllStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Failed to get log stats', { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── GET /logs/:type — Read logs ──────────────────────────────────────────────
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    if (!['ui', 'api'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid log type. Must be "ui" or "api".' },
      });
    }
    const { level, search, module: logModule, limit, offset } = req.query;
    const logs = await LogService.getLogs(type, {
      level,
      search,
      module: logModule,
      limit: limit ? parseInt(limit, 10) : 500,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ success: true, data: { logs, count: logs.length } });
  } catch (err) {
    logger.error('Failed to read logs', { error: err.message, type: req.params.type });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── POST /logs/:type — Write log entries (push from UI or batch) ─────────────
router.post('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    if (!['ui', 'api'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid log type. Must be "ui" or "api".' },
      });
    }
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Request body must contain a non-empty "entries" array.' },
      });
    }
    const result = await LogService.writeLogs(type, entries);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Failed to write logs', { error: err.message, type: req.params.type });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── DELETE /logs — Delete ALL logs (both UI and API) ─────────────────────────
router.delete('/', async (_req, res) => {
  try {
    const [ui, api] = await Promise.all([
      LogService.deleteLogs('ui'),
      LogService.deleteLogs('api'),
    ]);
    res.json({ success: true, data: { ui, api } });
  } catch (err) {
    logger.error('Failed to delete all logs', { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── DELETE /logs/:type — Delete all logs for a type ──────────────────────────
router.delete('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    if (!['ui', 'api'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid log type. Must be "ui" or "api".' },
      });
    }
    const result = await LogService.deleteLogs(type);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Failed to delete logs', { error: err.message, type: req.params.type });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── GET /logs/:type/stats — Get stats for a specific log type ────────────────
router.get('/:type/stats', async (req, res) => {
  try {
    const { type } = req.params;
    if (!['ui', 'api'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid log type. Must be "ui" or "api".' },
      });
    }
    const stats = await LogService.getStats(type);
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Failed to get log stats', { error: err.message, type: req.params.type });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

export default router;
