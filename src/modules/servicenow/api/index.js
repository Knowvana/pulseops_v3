// ============================================================================
// ServiceNow Module — API Entry Point (Dynamic Route Loader Compatible)
//
// PURPOSE: This is the API entry point for the ServiceNow module. It is loaded
// dynamically by dynamicRouteLoader.js when the module is enabled via the
// Module Manager UI. Exports the Express router and optional lifecycle hooks.
//
// ARCHITECTURE:
//   - Thin orchestrator — imports and mounts domain-specific sub-routers
//   - Deployed to dist-modules/servicenow/api/index.js (via build-module.js)
//   - Loaded at runtime via dynamic import() — zero server restart
//   - Router is mounted at /api/servicenow by the dynamic route loader
//   - All routes require JWT authentication (applied by dynamicRouteLoader)
//
// SUB-ROUTERS:
//   - configRoutes.js         → Connection config (GET/PUT /config, POST /config/test)
//   - incidentRoutes.js       → Incident CRUD (GET/POST/PUT /incidents, close)
//   - ritmRoutes.js           → RITM CRUD
//   - incidentConfigRoutes.js → Incident config + schema columns + SLA CRUD
//   - syncRoutes.js           → Sync trigger, status, schedule
//   - reportRoutes.js         → All report endpoints + stats
//   - dataRoutes.js           → Schema info, default data, reset
//
// LIFECYCLE HOOKS:
//   - onEnable()  → Called when module is enabled (initialize config dir)
//   - onDisable() → Called when module is disabled (cleanup resources)
//
// EXPORTS:
//   - default: Express Router
//   - router:  Express Router (alias)
//   - onEnable:  async () => void
//   - onDisable: async () => void
// ============================================================================
import { Router } from 'express';
import fs from 'fs';

import { CONFIG_DIR, CONNECTION_CONFIG, DEFAULTS_CONFIG, writeJsonFile } from './routes/helpers.js';
import configRoutes from './routes/configRoutes.js';
import incidentRoutes from './routes/incidentRoutes.js';
import ritmRoutes from './routes/ritmRoutes.js';
import incidentConfigRoutes from './routes/incidentConfigRoutes.js';
import syncRoutes from './routes/syncRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import dataRoutes from './routes/dataRoutes.js';
import autoAcknowledgeRoutes from './routes/autoAcknowledgeRoutes.js';
import timezoneRoutes from './routes/timezoneRoutes.js';

const router = Router();

// ═════════════════════════════════════════════════════════════════════════════
// MOUNT SUB-ROUTERS — each file owns a domain of endpoints
// ═════════════════════════════════════════════════════════════════════════════
router.use('/', configRoutes);          // GET/PUT /config, POST /config/test
router.use('/', incidentRoutes);        // GET/POST/PUT /incidents, close
router.use('/', ritmRoutes);            // GET/POST/PUT /ritms, close
router.use('/', incidentConfigRoutes);  // /config/incidents/*, /schema/columns, /config/sla/*
router.use('/', syncRoutes);            // POST /sync, GET /sync/status, GET/PUT /sync/schedule
router.use('/', reportRoutes);          // /stats, /reports/*, /business-hours, /config/settings
router.use('/', dataRoutes);            // /schema/info, /data/defaults, /data/demo, /data/reset
router.use('/', autoAcknowledgeRoutes); // /config/auto-acknowledge, /auto-acknowledge/*
router.use('/', timezoneRoutes);        // /config/timezone, /config/timezone/servicenow, /config/timezone/list

// ═════════════════════════════════════════════════════════════════════════════
// LIFECYCLE HOOKS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Called when the module is enabled. Initialize config directory and seed
 * default config files if they do not yet exist.
 */
export async function onEnable() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONNECTION_CONFIG)) {
    writeJsonFile(CONNECTION_CONFIG, {
      instanceUrl: '',
      username: '',
      password: '',
      authMethod: 'basic',
      apiVersion: 'v2',
      isConfigured: false,
      lastTested: null,
      testStatus: null,
    });
  }

  if (!fs.existsSync(DEFAULTS_CONFIG)) {
    writeJsonFile(DEFAULTS_CONFIG, {
      sla: { critical: 4, high: 8, medium: 24, low: 72 },
      sync: { enabled: false, intervalMinutes: 30, maxIncidents: 500, lastSync: null },
    });
  }
}

/**
 * Called when the module is disabled. Cleanup resources.
 */
export async function onDisable() {
  // No caching to clear — all data fetched live from SNOW API
}

export { router };
export default router;
