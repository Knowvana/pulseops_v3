// ============================================================================
// ServiceNow Service — PulseOps V2 API Module
//
// PURPOSE: Core business logic for the ServiceNow Integration module.
// Manages ServiceNow REST API connections, incident synchronization,
// stats aggregation, reports generation, and configuration persistence.
//
// ARCHITECTURE:
//   - Config stored in api/src/config/ServiceNowConfig.json (JSON file, no DB required)
//   - Incidents fetched from ServiceNow Table API over HTTPS
//   - In-memory LRU-style cache (5-minute TTL) to avoid redundant API hits
//   - All credentials stay server-side; API token never returned to frontend in plaintext
//
// DEPENDENCIES:
//   - #shared/loadJson.js  → loadJson / saveJson utilities
//   - #shared/logger.js    → Structured Winston logger
//
// USED BY:
//   - api/src/modules/servicenow/servicenowRoutes.js
//
// SECURITY NOTE:
//   - API token is read from ServiceNowConfig.json at runtime.
//   - The GET /config endpoint redacts the token before sending to frontend.
//   - Basic Auth header is built server-side only; token never sent to browser.
// ============================================================================

import { loadJson, saveJson } from '#shared/loadJson.js';
import { logger } from '#shared/logger.js';

// ── Config File Name ──────────────────────────────────────────────────────────
const CONFIG_FILE = 'ServiceNowConfig.json';

// ── In-Memory Incident Cache ──────────────────────────────────────────────────
/**
 * In-memory incident cache. TTL is read dynamically from sync.intervalMinutes
 * in ServiceNowConfig.json on each fetch — no static TTL defined here.
 * @type {{ data: Object[], lastFetched: number|null }}
 */
let _incidentCache = {
  data: [],
  lastFetched: null,
};

// ── ServiceNow Field Mapping Constants ───────────────────────────────────────
/** Map ServiceNow numeric priority codes to human-readable labels */
const PRIORITY_MAP = { '1': 'critical', '2': 'high', '3': 'medium', '4': 'low', '5': 'planning' };

/** Map ServiceNow numeric state codes to human-readable labels */
const STATE_MAP = {
  '1': 'open',
  '2': 'in_progress',
  '3': 'on_hold',
  '6': 'resolved',
  '7': 'closed',
  '8': 'cancelled',
};

// ── Fields to retrieve from ServiceNow (keeps payload small) ─────────────────
const SN_FIELDS = [
  'sys_id', 'number', 'short_description', 'priority', 'state',
  'assigned_to', 'sys_created_on', 'sys_updated_on', 'resolved_at', 'sla_due',
  'category', 'impact', 'urgency',
].join(',');

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC CONFIG FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the ServiceNow configuration from disk.
 * Returns the full config object including connection, SLA, and sync settings.
 * @returns {Object} ServiceNow configuration
 */
export function loadConfig() {
  logger.debug('ServiceNow:loadConfig', 'Loading ServiceNow configuration');
  return loadJson(CONFIG_FILE);
}

/**
 * Persist updated ServiceNow configuration to disk.
 * Caller is responsible for ensuring sensitive values (apiToken) are handled.
 * @param {Object} config - Full updated config object to serialize
 */
export function saveConfig(config) {
  logger.debug('ServiceNow:saveConfig', 'Saving ServiceNow configuration');
  saveJson(CONFIG_FILE, config);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION TEST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Test connectivity to a ServiceNow instance using the Table API.
 * Uses Basic Auth (username + API token/password).
 * Does NOT persist any state — callers must update config on success if needed.
 *
 * @param {Object} params
 * @param {string} params.instanceUrl - ServiceNow instance base URL (e.g., https://dev12345.service-now.com)
 * @param {string} params.username    - ServiceNow username
 * @param {string} params.apiToken    - ServiceNow password or OAuth token
 * @returns {Promise<{ success: boolean, latencyMs: number, error?: string }>}
 */
export async function testConnection({ instanceUrl, username, apiToken }) {
  const requestId = `sn-test-${Date.now()}`;
  logger.info(`[${requestId}] ServiceNow:testConnection — testing connectivity`, { instanceUrl });

  // ── Input validation ──────────────────────────────────────────────────────
  if (!instanceUrl || !username || !apiToken) {
    logger.warn(`[${requestId}] ServiceNow:testConnection — missing required params`);
    return { success: false, error: 'Instance URL, username, and API token are required.' };
  }

  const cleanUrl = instanceUrl.replace(/\/+$/, '');
  // Ping with a minimal query (limit=1) to verify auth + connectivity
  const testEndpoint = `${cleanUrl}/api/now/table/incident?sysparm_limit=1&sysparm_fields=sys_id`;
  const authHeader = `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`;

  const startMs = Date.now();
  try {
    const response = await fetch(testEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authHeader,
      },
      signal: AbortSignal.timeout(12000), // 12-second timeout
    });

    const latencyMs = Date.now() - startMs;

    if (response.status === 401) {
      logger.warn(`[${requestId}] ServiceNow:testConnection — 401 unauthorized`, { latencyMs });
      return { success: false, error: 'Authentication failed. Verify username and API token.', latencyMs };
    }
    if (response.status === 403) {
      logger.warn(`[${requestId}] ServiceNow:testConnection — 403 forbidden`, { latencyMs });
      return { success: false, error: 'Access denied. Ensure the user has the itil or admin role.', latencyMs };
    }
    if (!response.ok) {
      logger.warn(`[${requestId}] ServiceNow:testConnection — HTTP ${response.status}`, { latencyMs });
      return { success: false, error: `ServiceNow returned HTTP ${response.status} ${response.statusText}.`, latencyMs };
    }

    logger.info(`[${requestId}] ServiceNow:testConnection — SUCCESS`, { latencyMs });
    return { success: true, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      logger.warn(`[${requestId}] ServiceNow:testConnection — connection timeout`, { instanceUrl, latencyMs });
      return {
        success: false,
        error: 'Connection timed out after 12 seconds. Verify the instance URL and network access.',
        latencyMs,
      };
    }
    logger.error(`[${requestId}] ServiceNow:testConnection — unexpected error`, { error: err.message });
    return { success: false, error: `Connection failed: ${err.message}`, latencyMs };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INCIDENT FETCH & CACHE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch incidents from ServiceNow Table API.
 * Returns cached data if within TTL; fetches fresh data otherwise.
 * Client-side filters (state, priority, search) and pagination are applied
 * after data is loaded — avoids multiple API round-trips.
 *
 * @param {Object} [filters={}]
 * @param {string} [filters.state]    - Filter by state: 'open'|'in_progress'|'resolved'|'all'
 * @param {string} [filters.priority] - Filter by priority: 'critical'|'high'|'medium'|'low'|'all'
 * @param {string} [filters.search]   - Free-text search across number, title, assignedTo
 * @param {number} [filters.limit=50] - Page size
 * @param {number} [filters.offset=0] - Page offset
 * @returns {Promise<{ incidents: Object[], total: number, fromCache: boolean, notConfigured?: boolean }>}
 */
export async function fetchIncidents(filters = {}) {
  const config = loadConfig();
  const { connection, sync } = config;

  // Return early if not configured
  if (!connection.isConfigured || !connection.instanceUrl) {
    logger.debug('ServiceNow:fetchIncidents', 'Not configured — returning empty');
    return { incidents: [], total: 0, fromCache: false, notConfigured: true };
  }

  // ── Cache hit ─────────────────────────────────────────────────────────────
  const now = Date.now();
  const ttl = (sync.intervalMinutes || 5) * 60 * 1000;
  if (_incidentCache.data.length > 0 && _incidentCache.lastFetched && (now - _incidentCache.lastFetched) < ttl) {
    logger.debug('ServiceNow:fetchIncidents', 'Cache hit', { count: _incidentCache.data.length, ageMs: now - _incidentCache.lastFetched });
    return applyFilters(_incidentCache.data, filters, true);
  }

  // ── Fresh fetch from ServiceNow ───────────────────────────────────────────
  const cleanUrl = connection.instanceUrl.replace(/\/+$/, '');
  const limit = Math.min(sync.maxIncidents || 500, 1000); // Cap at 1000
  const apiUrl = `${cleanUrl}/api/now/table/incident?sysparm_limit=${limit}&sysparm_fields=${SN_FIELDS}&sysparm_order_by=sys_created_on&sysparm_order_by_direction=desc`;
  const authHeader = `Basic ${Buffer.from(`${connection.username}:${connection.apiToken}`).toString('base64')}`;

  logger.info('ServiceNow:fetchIncidents', 'Fetching from ServiceNow', { instanceUrl: connection.instanceUrl, limit });

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader,
      },
      signal: AbortSignal.timeout(30000), // 30s for bulk fetch
    });

    if (!response.ok) {
      throw new Error(`ServiceNow API returned HTTP ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const incidents = (result.result || []).map(normalizeIncident);

    // Update cache
    _incidentCache.data = incidents;
    _incidentCache.lastFetched = now;

    // Persist last sync timestamp to config
    const updatedConfig = loadConfig();
    updatedConfig.sync.lastSync = new Date().toISOString();
    saveConfig(updatedConfig);

    logger.info('ServiceNow:fetchIncidents', 'Incidents fetched and cached', { count: incidents.length });
    return applyFilters(incidents, filters, false);
  } catch (err) {
    logger.error('ServiceNow:fetchIncidents', `Fetch failed: ${err.message}`, { error: err.message });
    // Fall back to stale cache on error if available
    if (_incidentCache.data.length > 0) {
      logger.warn('ServiceNow:fetchIncidents', 'Returning stale cache on error', { count: _incidentCache.data.length });
      return applyFilters(_incidentCache.data, filters, true);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute dashboard statistics from the current incident cache/data.
 * Returns notConfigured flag when ServiceNow is not yet set up.
 *
 * @returns {Promise<Object>} Stats: total, open, inProgress, critical, slaBreached, resolvedToday
 */
export async function getDashboardStats() {
  const config = loadConfig();

  if (!config.connection.isConfigured) {
    logger.debug('ServiceNow:getDashboardStats', 'Not configured — returning empty stats');
    return {
      notConfigured: true,
      total: 0,
      open: 0,
      inProgress: 0,
      critical: 0,
      slaBreached: 0,
      resolvedToday: 0,
      connectionStatus: 'not_configured',
      lastSync: null,
    };
  }

  try {
    const { incidents } = await fetchIncidents({ limit: 9999 });
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const open         = incidents.filter(i => i.state === 'open').length;
    const inProgress   = incidents.filter(i => i.state === 'in_progress').length;
    const critical     = incidents.filter(i => i.priority === 'critical' && i.state !== 'resolved' && i.state !== 'closed').length;
    const resolvedToday = incidents.filter(i =>
      i.state === 'resolved' && i.resolvedAt && new Date(i.resolvedAt) >= todayStart
    ).length;
    const slaBreached  = incidents.filter(i => {
      if (['resolved', 'closed', 'cancelled'].includes(i.state) || !i.slaDue) return false;
      return new Date(i.slaDue) < now;
    }).length;

    const currentConfig = loadConfig();
    logger.debug('ServiceNow:getDashboardStats', 'Stats computed', { total: incidents.length, open, critical });
    return {
      total: incidents.length,
      open,
      inProgress,
      critical,
      slaBreached,
      resolvedToday,
      connectionStatus: 'connected',
      lastSync: currentConfig.sync.lastSync,
    };
  } catch (err) {
    logger.error('ServiceNow:getDashboardStats', `Failed: ${err.message}`);
    return {
      error: err.message,
      total: 0, open: 0, inProgress: 0, critical: 0, slaBreached: 0, resolvedToday: 0,
      connectionStatus: 'error',
      lastSync: null,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate reports data: SLA compliance, incident volume by priority,
 * and average resolution time per priority.
 *
 * @returns {Promise<Object>} Reports dataset
 */
export async function getReportsData() {
  const config = loadConfig();

  if (!config.connection.isConfigured) {
    return { notConfigured: true };
  }

  const { incidents } = await fetchIncidents({ limit: 9999 });
  const slaConfig = config.sla;
  const now = new Date();

  // SLA compliance: % of resolved incidents resolved within SLA threshold
  const resolved = incidents.filter(i => i.state === 'resolved' && i.resolvedAt && i.createdAt);
  let slaMet = 0;
  resolved.forEach(inc => {
    const resolutionHours = (new Date(inc.resolvedAt) - new Date(inc.createdAt)) / (1000 * 60 * 60);
    const threshold = slaConfig[inc.priority] || 72;
    if (resolutionHours <= threshold) slaMet++;
  });
  const slaCompliance = resolved.length > 0 ? Math.round((slaMet / resolved.length) * 100) : 0;

  // Incident volume by priority (active only)
  const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  incidents.forEach(i => {
    if (priorityCounts[i.priority] !== undefined) priorityCounts[i.priority]++;
  });

  // Average resolution time (hours) per priority
  const resolutionByPriority = {};
  ['critical', 'high', 'medium', 'low'].forEach(priority => {
    const byPriority = resolved.filter(i => i.priority === priority);
    resolutionByPriority[priority] = byPriority.length > 0
      ? Math.round(
          byPriority.reduce((sum, i) => {
            return sum + (new Date(i.resolvedAt) - new Date(i.createdAt)) / (1000 * 60 * 60);
          }, 0) / byPriority.length * 10
        ) / 10
      : null;
  });

  logger.debug('ServiceNow:getReportsData', 'Reports computed', { slaCompliance, totalResolved: resolved.length });
  return {
    slaCompliance,
    priorityCounts,
    resolutionByPriority,
    totalResolved: resolved.length,
    totalIncidents: incidents.length,
    lastSync: config.sync.lastSync,
    slaThresholds: slaConfig,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL SYNC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trigger a manual data synchronization from ServiceNow.
 * Clears the in-memory cache and re-fetches all incidents.
 *
 * @returns {Promise<{ success: boolean, count: number, lastSync: string }>}
 */
export async function triggerSync() {
  // Clear cache to force fresh fetch
  _incidentCache.data = [];
  _incidentCache.lastFetched = null;
  logger.info('ServiceNow:triggerSync', 'Manual sync triggered — cache cleared');

  const result = await fetchIncidents({});
  const lastSync = new Date().toISOString();
  logger.info('ServiceNow:triggerSync', 'Sync complete', { count: result.incidents.length });
  return { success: true, count: result.incidents.length, lastSync };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a raw ServiceNow Table API incident object to a flat, clean format.
 * Converts numeric codes to labels and handles display value references.
 *
 * @param {Object} raw - Raw incident from ServiceNow API
 * @returns {Object} Normalized incident object
 */
function normalizeIncident(raw) {
  return {
    id:         raw.sys_id,
    number:     raw.number,
    title:      raw.short_description,
    priority:   PRIORITY_MAP[raw.priority] || 'low',
    state:      STATE_MAP[raw.state] || 'open',
    assignedTo: typeof raw.assigned_to === 'object' ? raw.assigned_to?.display_value : raw.assigned_to || null,
    createdAt:  raw.sys_created_on   || null,
    updatedAt:  raw.sys_updated_on   || null,
    resolvedAt: raw.resolved_at      || null,
    slaDue:     raw.sla_due          || null,
    category:   raw.category         || null,
    impact:     raw.impact           || null,
    urgency:    raw.urgency          || null,
  };
}

/**
 * Apply client-side filters and pagination to a loaded incident array.
 * Supports state, priority, free-text search, limit, and offset.
 *
 * @param {Object[]} incidents - Full (cached) incident list
 * @param {Object}   filters   - Filter parameters
 * @param {boolean}  fromCache - Whether source was cache (for transparency)
 * @returns {{ incidents: Object[], total: number, fromCache: boolean }}
 */
function applyFilters(incidents, filters, fromCache) {
  let result = [...incidents];

  if (filters.state && filters.state !== 'all') {
    result = result.filter(i => i.state === filters.state);
  }
  if (filters.priority && filters.priority !== 'all') {
    result = result.filter(i => i.priority === filters.priority);
  }
  if (filters.search) {
    const term = filters.search.toLowerCase().trim();
    if (term) {
      result = result.filter(i =>
        i.number?.toLowerCase().includes(term) ||
        i.title?.toLowerCase().includes(term) ||
        i.assignedTo?.toLowerCase().includes(term)
      );
    }
  }

  const total  = result.length;
  const offset = Math.max(0, parseInt(filters.offset, 10) || 0);
  const limit  = Math.min(200, Math.max(1, parseInt(filters.limit, 10) || 50));
  result = result.slice(offset, offset + limit);

  return { incidents: result, total, fromCache };
}
