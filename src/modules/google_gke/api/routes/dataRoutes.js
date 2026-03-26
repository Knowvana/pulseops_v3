// ============================================================================
// Google GKE Module — Data Management Routes
//
// PURPOSE: Handles schema information, default data loading, and module data
// reset endpoints. These routes power the "Data Management" tab in the
// module's Settings UI.
//
// WHAT THESE ROUTES DO:
//
//   1. GET /schema/info — Returns schema status for all module tables.
//      Shows which tables exist, their row counts, columns, and indexes.
//      Used by the admin to verify the module's database state.
//
//   2. POST /data/defaults — Loads seed data from DefaultData.json.
//      Inserts default configuration, sample monitored workloads, etc.
//      Uses ON CONFLICT DO NOTHING so it's safe to run multiple times.
//
//   3. DELETE /data/reset — Drops ALL module tables and their data.
//      This is a destructive operation that cannot be undone.
//      Used during development or when the admin wants to start fresh.
//
// DATABASE TABLE NAMING CONVENTION:
//   All Google GKE module tables are prefixed with 'gke_':
//   - gke_module_config     → Key-value configuration store
//   - gke_workloads         → Monitored workloads registry
//   - gke_poll_results      → Health poll results (like hc_poll_results)
//   - gke_cronjob_history   → CronJob execution history
//   - gke_dataflow_jobs     → Dataflow job tracking
//   - gke_pubsub_metrics    → Pub/Sub metrics snapshots
//   - gke_email_history     → Email delivery tracking
//   - gke_alerts            → Active and resolved alerts
//   - gke_log_alerts        → Log-based alert rules
//
// HOW SCHEMA PROVISIONING WORKS:
//   When the module is enabled via Module Manager:
//   1. Core platform calls onEnable() in api/index.js
//   2. The platform's module provisioner reads database/Schema.json
//   3. Creates all tables defined in Schema.json (IF NOT EXISTS)
//   4. Admin can then load seed data via POST /data/defaults
//
// ROUTES (all relative to /api/google_gke):
//   GET    /schema/info     → Get schema status for all module tables
//   GET    /schema/status   → Alias for schema/info (compatibility)
//   POST   /data/defaults   → Load default/seed data
//   DELETE /data/reset      → Drop all module tables and data
//
// PATTERN SOURCE: Identical to HealthCheck module's routes/dataRoutes.js
// ============================================================================
import { Router } from 'express';
import { createGkeLogger } from '../lib/moduleLogger.js';
import { gkeUrls, apiErrors, apiMessages } from '../config/index.js';
import {
  MODULE_ID,
  dbSchema,
  DatabaseService,
  resolveModuleDbFile,
  readJsonFile,
  SCHEMA_JSON_FILE,
  DEFAULT_DATA_FILE,
} from './helpers.js';

const log = createGkeLogger('dataRoutes.js');
const router = Router();
const R = gkeUrls.routes;

// ═══════════════════════════════════════════════════════════════════════════════
// GET /schema/info — Schema status for all module tables
// ═══════════════════════════════════════════════════════════════════════════════
//
// TODO: Implement
//   1. Read Schema.json to get the list of tables
//   2. For each table, query PostgreSQL information_schema to check if it exists
//   3. If exists, get row count, column names, index names
//   4. Return array of { name, exists, rowCount, columns, indexes }
//
// IMPLEMENTATION HINT (same as HealthCheck):
//   const schemaPath = resolveModuleDbFile(SCHEMA_JSON_FILE);
//   const schema = readJsonFile(schemaPath);
//   for (const table of schema.tables) {
//     const exists = await DatabaseService.query(
//       `SELECT EXISTS (SELECT 1 FROM information_schema.tables
//        WHERE table_schema = $1 AND table_name = $2)`,
//       [dbSchema, table.name]
//     );
//     // ... get row count, columns, etc.
//   }

// ═══════════════════════════════════════════════════════════════════════════════
// POST /data/defaults — Load default/seed data
// ═══════════════════════════════════════════════════════════════════════════════
//
// TODO: Implement
//   1. Read DefaultData.json
//   2. For each table key in the JSON, insert rows using ON CONFLICT DO NOTHING
//   3. Track rows inserted per table
//   4. Return { success: true, message: apiMessages.data.loaded, tables, rows }
//
// IMPORTANT: DefaultData.json config_value fields must be JSON.stringify'd
// before inserting because the column type is JSONB.

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /data/reset — Drop all module tables
// ═══════════════════════════════════════════════════════════════════════════════
//
// TODO: Implement
//   1. Read Schema.json to get list of tables
//   2. For each table (in reverse order to respect FK constraints):
//      DROP TABLE IF EXISTS ${dbSchema}.${table.name} CASCADE
//   3. Track dropped/skipped/errors
//   4. Return { success: true, message: apiMessages.data.reset, dropped, skipped, errors }
//
// WARNING: This is destructive and cannot be undone!

export default router;
