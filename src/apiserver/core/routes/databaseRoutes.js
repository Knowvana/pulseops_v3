// ============================================================================
// Database Routes — PulseOps V2 API
//
// PURPOSE: REST endpoints for database configuration, connection testing,
// schema management, and data operations.
//
// REST RESOURCE MODEL:
//   /database/config         — Database connection configuration (resource)
//   /database/connection     — Live connection status (read-only, server config)
//   /database/schema         — Schema lifecycle (create / status / wipe)
//   /database/schema/seed    — Seed data sub-resource (load / clean)
//   /database/instance       — Physical database instance (create / delete)
//   /database/stats          — Observability (read-only)
//
// AUTH STRATEGY (Selective):
//   - Public (no auth): setup routes called before any user exists
//   - Protected (JWT required): destructive operations only
//
// ENDPOINTS:
//   GET    /database/config          — Read saved DB config (public)
//   PUT    /database/config          — Save DB config (public)
//   POST   /database/config/test     — Test connection with supplied config body (public)
//   GET    /database/connection      — Test connection with server-saved config (public)
//   GET    /database/schema          — Schema initialization status (public)
//   POST   /database/schema          — Initialize schema + tables (public)
//   DELETE /database/schema          — Wipe entire schema (protected)
//   POST   /database/schema/seed     — Load default seed data (public)
//   DELETE /database/schema/seed     — Clean seed data (public)
//   POST   /database/instance        — Create database (public)
//   DELETE /database/instance        — Drop database entirely (protected)
//   GET    /database/stats           — Table sizes and counts (protected)
//
// DEPENDENCIES:
//   - ../database/databaseService.js → all database operations
//   - ../middleware/auth.js → authenticate, requireRole
//   - ../../shared/loadJson.js → messages, errors, saveJson
//   - ../../shared/logger.js → structured logging
// ============================================================================
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseService from '#core/database/databaseService.js';
import { authenticate } from '#core/middleware/auth.js';
import { messages, errors, saveJson, loadJson } from '#shared/loadJson.js';
import { logger } from '#shared/logger.js';
import { reloadDbConfig } from '#config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '../database/DefaultDatabaseSchema.json');

const router = Router();

// ── GET /database/config (Public) ────────────────────────────────────────────
router.get('/config', async (_req, res) => {
  logger.info('API event: GET /database/config');
  try {
    const dbConfig = loadJson('DatabaseConfig.json');
    let tables = [];
    try {
      const schemaData = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      tables = schemaData.tables?.map(t => t.name) || [];
    } catch { /* schema file not found */ }
    const { password, ...safeConfig } = dbConfig;
    res.json({
      success: true,
      data: {
        ...safeConfig,
        tables,
      },
    });
  } catch (err) {
    logger.warn('DatabaseConfig.json not found, returning empty config', { error: err.message });
    res.json({
      success: true,
      data: {
        host: '',
        port: '',
        database: '',
        schema: '',
        user: '',
        tables: [],
        defaultAdmin: { email: '' },
      },
    });
  }
});

// ── POST /database/config/test (Public) ───────────────────────────────────
router.post('/config/test', async (req, res) => {
  logger.info('API event: POST /database/config/test', { host: req.body?.host, database: req.body?.database });
  try {
    const result = await DatabaseService.testConnection(req.body);
    logger.info('Database connection test successful', { host: req.body?.host, database: req.body?.database });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(errors.errors.dbConnectionFailed, { error: err.message });
    const isDbNotExist = err.message?.includes('does not exist');
    res.json({
      success: false,
      error: {
        message: err.message || errors.errors.dbConnectionFailed,
        code: isDbNotExist ? 'DB_NOT_EXIST' : 'CONNECTION_FAILED',
      },
    });
  }
});

// ── GET /database/connection (Public) ──────────────────────────────────────
router.get('/connection', async (_req, res) => {
  logger.info('API event: GET /database/connection (server config)');
  try {
    const result = await DatabaseService.testConnection();
    logger.info('Database connection test (server config) successful');
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(errors.errors.dbConnectionFailed, { error: err.message });
    const isDbNotExist = err.message?.includes('does not exist');
    res.json({
      success: false,
      error: {
        message: err.message || errors.errors.dbConnectionFailed,
        code: isDbNotExist ? 'DB_NOT_EXIST' : 'CONNECTION_FAILED',
      },
    });
  }
});

// ── GET /database/status (Public) ────────────────────────────────────────────
// Returns DB availability and schema status. Used by UI to determine whether
// to show ConfigurationAlertModal on Login, Logs, and ModuleManager views.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', async (_req, res) => {
  try {
    const schemaStatus = await DatabaseService.getSchemaStatus();
    res.json({
      success: true,
      data: {
        dbAvailable: true,
        schemaInitialized: schemaStatus.initialized || false,
        hasDefaultData: schemaStatus.hasDefaultData || false,
      },
    });
  } catch (err) {
    res.json({
      success: true,
      data: {
        dbAvailable: false,
        schemaInitialized: false,
        hasDefaultData: false,
      },
    });
  }
});

// ── PUT /database/config (Public) ─────────────────────────────────────────────
router.put('/config', async (req, res) => {
  logger.info('API event: POST /database/save-config', { host: req.body?.host, database: req.body?.database });
  try {
    const { host, port, database, schema, username, password } = req.body;
    const dbConfig = {
      host: host || 'localhost',
      port: parseInt(port, 10) || 5432,
      database: database || 'pulseops_v2',
      schema: schema || 'pulseops',
      user: username || 'postgres',
      password: password || '',
      ssl: false,
      poolSize: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
    saveJson('DatabaseConfig.json', dbConfig);
    reloadDbConfig();
    await DatabaseService.resetPool();
    logger.info(messages.success.dbConfigSaved, { host, database });
    const { password: _pw, ...safeConfig } = dbConfig;
    res.json({ success: true, data: { message: messages.success.dbConfigSaved, config: safeConfig } });
  } catch (err) {
    logger.error(errors.errors.dbConfigSaveFailed, { error: err.message });
    res.status(500).json({ success: false, error: { message: errors.errors.dbConfigSaveFailed } });
  }
});

// ── GET /database/schema (Public) ─────────────────────────────────────────────
router.get('/schema', async (_req, res) => {
  logger.info('API event: GET /database/schema');
  try {
    const result = await DatabaseService.getSchemaStatus();
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(errors.errors.schemaInitFailed, { error: err.message });
    res.json({ success: true, data: { connected: false, initialized: false, hasDefaultData: false } });
  }
});

// ── GET /database/schema/definition (Public) ──────────────────────────────────
router.get('/schema/definition', async (_req, res) => {
  logger.info('API event: GET /database/schema/definition');
  try {
    const schemaData = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const tables = schemaData.tables?.map(t => ({
      name: t.name,
      description: t.description,
      columnCount: t.columns?.length || 0,
    })) || [];
    res.json({
      success: true,
      data: {
        schema: schemaData._meta?.schema || 'pulseops',
        tables,
        totalTables: tables.length,
      },
    });
  } catch (err) {
    logger.error('Failed to load schema definition', { error: err.message });
    res.status(500).json({
      success: false,
      error: { message: 'Failed to load schema definition' },
    });
  }
});

// ── POST /database/schema (Public) ────────────────────────────────────────────
router.post('/schema', async (_req, res) => {
  logger.info('API event: POST /database/schema');
  try {
    const result = await DatabaseService.createSchema();
    logger.info('Schema initialized successfully');
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.error(errors.errors.schemaInitFailed, { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message || errors.errors.schemaInitFailed } });
  }
});

// ── DELETE /database/schema (Protected — wipe entire schema) ──────────────────
router.delete('/schema', authenticate, async (req, res) => {
  logger.info('API event: DELETE /database/schema', { user: req.user?.email });
  try {
    const result = await DatabaseService.wipeDatabase();
    logger.info('Schema wiped successfully', { user: req.user?.email });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(errors.errors.dbWipeFailed, { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message || errors.errors.dbWipeFailed } });
  }
});

// ── POST /database/schema/seed (Public) ───────────────────────────────────────
router.post('/schema/seed', async (_req, res) => {
  logger.info('API event: POST /database/schema/seed');
  try {
    const result = await DatabaseService.loadDefaultData();
    logger.info('Seed data loaded successfully');
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.error(errors.errors.dbInitFailed, { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message || errors.errors.dbInitFailed } });
  }
});

// ── DELETE /database/schema/seed (Public) ─────────────────────────────────────
router.delete('/schema/seed', async (_req, res) => {
  logger.info('API event: DELETE /database/schema/seed');
  try {
    const result = await DatabaseService.cleanDefaultData();
    logger.info('Seed data cleaned successfully');
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Failed to clean seed data', { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── POST /database/instance (Public) ──────────────────────────────────────────
router.post('/instance', async (_req, res) => {
  logger.info('API event: POST /database/instance');
  try {
    const result = await DatabaseService.createDatabase();
    logger.info('Database instance created successfully', result);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.error(errors.errors.dbCreateFailed, { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message || errors.errors.dbCreateFailed } });
  }
});

// ── DELETE /database/instance (Protected) ─────────────────────────────────────
router.delete('/instance', authenticate, async (req, res) => {
  logger.info('API event: DELETE /database/instance', { user: req.user?.email });
  try {
    const result = await DatabaseService.dropDatabase();
    logger.info('Database instance deleted successfully', { user: req.user?.email });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(errors.errors.dbDeleteFailed, { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message || errors.errors.dbDeleteFailed } });
  }
});

// ── GET /database/stats (Protected) ────────────────────────────────────────
router.get('/stats', authenticate, async (req, res) => {
  logger.info('API event: GET /database/stats', { user: req.user?.email });
  try {
    const result = await DatabaseService.getStats();
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Failed to get database stats', { error: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

export default router;
