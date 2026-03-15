// ============================================================================
// SnowApiClient.js — ServiceNow Module HTTP Client
//
// The ONLY file that makes HTTP calls to the ServiceNow REST API.
// - Enforces sysparm_fields from incident config + mandatory system fields.
// - Handles {link, value} reference object unwrapping (snowVal).
// - STATELESS — no in-memory caching. Safe for Kubernetes multi-instance deploys.
// - All config is passed as parameters; nothing is read from disk here.
//
// Import via: #modules/servicenow/api/lib/SnowApiClient.js
// ============================================================================
import https from 'https';
import http from 'http';

import { snowUrls } from '#modules/servicenow/api/config/index.js';

const REQUEST_TIMEOUT_MS = 15000;

// Fields always included regardless of user column configuration
const MANDATORY_FIELDS = snowUrls.snow.mandatoryIncidentFields;

// ── Value Extraction ─────────────────────────────────────────────────────────

/**
 * Extract the primitive value from a ServiceNow reference field.
 * ServiceNow returns reference columns as { display_value, link, value } objects.
 * For scalar fields the value is returned as-is.
 *
 * @param {*} field - Raw field value from ServiceNow result.
 * @returns {*}
 */
export function snowVal(field) {
  if (field == null) return field;
  return (typeof field === 'object' && field?.value !== undefined) ? field.value : field;
}

// ── Field Builder ────────────────────────────────────────────────────────────

/**
 * Build the sysparm_fields query string.
 *
 * Merges mandatory system fields, incident config selected columns, date columns
 * required for SLA math, and any caller-supplied extra fields.
 * Deduplicates and returns a comma-separated string for sysparm_fields.
 *
 * @param {object} incidentConfig - Loaded incident config (selectedColumns, createdColumn, closedColumn…).
 * @param {string[]} [extraFields=[]] - Additional fields required by the calling route.
 * @returns {string}
 */
export function buildSnowFields(incidentConfig = {}, extraFields = []) {
  const configured  = Array.isArray(incidentConfig.selectedColumns) ? incidentConfig.selectedColumns : [];
  const dateColumns = [incidentConfig.createdColumn, incidentConfig.closedColumn, incidentConfig.priorityColumn].filter(Boolean);
  return [
    ...new Set([
      ...MANDATORY_FIELDS,
      ...configured,
      ...dateColumns,
      ...extraFields,
    ]),
  ].join(',');
}

// ── HTTP Transport ───────────────────────────────────────────────────────────

/**
 * Build the Node.js http/https request options for a ServiceNow call.
 */
function buildRequestOptions(conn, tablePath, method = 'GET', bodyLength = 0) {
  const base = conn.instanceUrl.replace(/\/$/, '');
  const version = conn.apiVersion || 'v2';
  const url = new URL(`${base}/api/now/${version}/${tablePath}`);

  const auth = Buffer.from(`${conn.username}:${conn.password}`).toString('base64');
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (bodyLength > 0) headers['Content-Length'] = String(bodyLength);

  return {
    url,
    options: {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers,
    },
  };
}

/**
 * Execute a raw HTTP/HTTPS request and resolve with { statusCode, data }.
 */
function executeRequest(reqOptions, url, bodyStr = '') {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(reqOptions, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ statusCode: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`ServiceNow request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * GET a ServiceNow Table API resource.
 *
 * @param {object} conn        - Connection config { instanceUrl, username, password, apiVersion }.
 * @param {string} tablePath   - ServiceNow table path, e.g. 'table/incident'.
 * @param {string} [query='']  - URL query string WITHOUT leading '?', e.g. 'sysparm_limit=50&…'.
 * @returns {Promise<{statusCode: number, data: any}>}
 */
export async function snowGet(conn, tablePath, query = '') {
  const { url, options } = buildRequestOptions(conn, tablePath);
  if (query) url.search = '?' + query;
  options.path = url.pathname + url.search;
  return executeRequest(options, url);
}

/**
 * Write to a ServiceNow Table API resource (POST / PATCH / PUT).
 *
 * @param {object} conn       - Connection config.
 * @param {string} tablePath  - e.g. 'table/incident' or 'table/incident/<sys_id>'.
 * @param {string} [method='POST'] - HTTP verb.
 * @param {string} [bodyStr='']    - JSON-serialised request body.
 * @returns {Promise<{statusCode: number, data: any}>}
 */
export async function snowWrite(conn, tablePath, method = 'POST', bodyStr = '') {
  const { url, options } = buildRequestOptions(conn, tablePath, method, Buffer.byteLength(bodyStr || ''));
  return executeRequest(options, url, bodyStr);
}

// ── Response Helpers ─────────────────────────────────────────────────────────

/**
 * Return true if a ServiceNow HTTP status code indicates success.
 * @param {number} statusCode
 * @returns {boolean}
 */
export function isSnowSuccess(statusCode) {
  return statusCode >= 200 && statusCode < 300;
}

/**
 * Extract a human-readable error string from a ServiceNow error response body.
 * @param {any} data - Parsed response body.
 * @param {string} [fallback] - Default message if no detail found.
 * @returns {string}
 */
export function extractSnowError(data, fallback = 'Unknown ServiceNow error') {
  return data?.error?.detail || data?.error?.message || String(data?.error ?? fallback);
}
