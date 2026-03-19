// ============================================================================
// PollerService.js — HealthCheck Module Background Health Poller
//
// PURPOSE: Background service that polls all active monitored applications at
// a configurable interval. Each poll cycle:
//   1. Loads all active apps from hc_applications
//   2. For each app: HTTP GET → check status code + optional text match
//   3. Saves result (UP/DOWN) to hc_poll_results
//   4. Updates in-memory latest status for dashboard live view
//
// LIFECYCLE:
//   - start()         → Start the interval timer
//   - stop()          → Stop the interval timer
//   - pollNow()       → Execute one immediate poll cycle (manual trigger)
//   - startIfEnabled()→ Load config and start only if poller_config.enabled
//   - getStatus()     → Return current poller state + last poll info
//   - getLatestStatus()→ Return in-memory latest status per app
//
// ARCHITECTURE: Uses native http/https modules for minimal overhead.
// ============================================================================
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { dbSchema, DatabaseService, loadPollerConfig } from '#modules/healthcheck/api/routes/helpers.js';
import { createHcLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';

const log = createHcLogger('PollerService.js');

// ── In-memory state ──────────────────────────────────────────────────────────
let _intervalHandle = null;
let _isRunning = false;
let _isPollInProgress = false;
let _lastPollTime = null;
let _lastPollResults = { up: 0, down: 0, total: 0, errors: 0 };
let _currentConfig = null;
let _latestStatus = {}; // { [appId]: { status, httpCode, responseMs, polledAt, error } }
let _pollCount = 0;     // total polls since start

// ── HTTP probe ───────────────────────────────────────────────────────────────
function probeUrl(url, timeoutMs, expectedStatus, expectedText) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return resolve({ status: 'DOWN', httpCode: null, responseMs: 0, textMatch: null, error: `Invalid URL: ${url}` });
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: timeoutMs || 10000,
      headers: { 'User-Agent': 'PulseOps-HealthCheck/1.0' },
      rejectUnauthorized: false, // Allow self-signed certs
    };

    const req = client.request(options, (res) => {
      const responseMs = Date.now() - startTime;
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const httpCode = res.statusCode;
        const statusOk = httpCode === (expectedStatus || 200);
        let textMatch = null;
        if (expectedText && expectedText.trim()) {
          textMatch = body.includes(expectedText.trim());
        }
        const isUp = statusOk && (textMatch === null || textMatch === true);
        resolve({
          status: isUp ? 'UP' : 'DOWN',
          httpCode,
          responseMs,
          textMatch,
          error: isUp ? null : `HTTP ${httpCode}${textMatch === false ? ' (text mismatch)' : ''}`,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        status: 'DOWN',
        httpCode: null,
        responseMs: Date.now() - startTime,
        textMatch: null,
        error: err.message || 'Connection error',
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 'DOWN',
        httpCode: null,
        responseMs: Date.now() - startTime,
        textMatch: null,
        error: `Timeout after ${timeoutMs || 10000}ms`,
      });
    });

    req.end();
  });
}

// ── Single poll cycle ────────────────────────────────────────────────────────
async function executePollCycle() {
  if (_isPollInProgress) {
    log.warn('Poll cycle skipped — previous cycle still in progress');
    return null;
  }
  _isPollInProgress = true;
  const cycleStart = Date.now();

  try {
    // Load active applications
    const appsResult = await DatabaseService.query(
      `SELECT id, name, url, expected_status_code, expected_text, timeout_ms
       FROM ${dbSchema}.hc_applications
       WHERE is_active = true
       ORDER BY sort_order, name`
    );
    const apps = appsResult.rows || [];

    if (apps.length === 0) {
      log.debug('No active applications to poll');
      _isPollInProgress = false;
      return { up: 0, down: 0, total: 0, errors: 0 };
    }

    log.info(`Poll cycle starting — ${apps.length} application(s)`);

    // Poll all apps concurrently
    const timeoutMs = _currentConfig?.timeoutMs || 10000;
    const results = await Promise.all(
      apps.map(async (app) => {
        const probe = await probeUrl(
          app.url,
          app.timeout_ms || timeoutMs,
          app.expected_status_code,
          app.expected_text
        );
        return { app, probe };
      })
    );

    // Save results to DB in a single transaction
    let up = 0, down = 0, errors = 0;
    const insertValues = [];
    const insertParams = [];
    let paramIdx = 1;

    for (const { app, probe } of results) {
      if (probe.status === 'UP') up++;
      else down++;
      if (probe.error) errors++;

      insertValues.push(
        `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW())`
      );
      insertParams.push(
        app.id,
        probe.status,
        probe.httpCode,
        probe.responseMs,
        probe.textMatch,
        probe.error
      );

      // Update in-memory latest status
      _latestStatus[app.id] = {
        appId: app.id,
        name: app.name,
        url: app.url,
        status: probe.status,
        httpCode: probe.httpCode,
        responseMs: probe.responseMs,
        textMatch: probe.textMatch,
        error: probe.error,
        polledAt: new Date().toISOString(),
      };
    }

    if (insertValues.length > 0) {
      await DatabaseService.query(
        `INSERT INTO ${dbSchema}.hc_poll_results
         (application_id, status, http_status_code, response_time_ms, text_match, error_message, polled_at)
         VALUES ${insertValues.join(', ')}`,
        insertParams
      );
    }

    const duration = Date.now() - cycleStart;
    const summary = { up, down, total: apps.length, errors, durationMs: duration };
    _lastPollTime = new Date().toISOString();
    _lastPollResults = summary;
    _pollCount++;

    log.info(`Poll cycle complete in ${duration}ms — ${up} UP, ${down} DOWN, ${errors} error(s)`);
    return summary;
  } catch (err) {
    log.error('Poll cycle failed', { message: err.message });
    return null;
  } finally {
    _isPollInProgress = false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function start(config) {
  if (_isRunning) {
    log.warn('Poller already running — ignoring start()');
    return;
  }
  _currentConfig = config || await loadPollerConfig();
  const intervalMs = (_currentConfig.intervalSeconds || 60) * 1000;

  log.info(`Starting health poller — interval ${_currentConfig.intervalSeconds}s`);

  // Execute first poll immediately
  await executePollCycle();

  // Start recurring interval
  _intervalHandle = setInterval(() => {
    executePollCycle().catch(err => log.error('Interval poll error', { message: err.message }));
  }, intervalMs);

  _isRunning = true;
}

export function stop() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
  _isRunning = false;
  _isPollInProgress = false;
  log.info('Health poller stopped');
}

export async function pollNow() {
  log.info('Manual poll triggered');
  return executePollCycle();
}

export async function startIfEnabled() {
  try {
    const config = await loadPollerConfig();
    if (config.enabled) {
      await start(config);
    } else {
      log.info('Poller not enabled in config — skipping auto-start');
    }
  } catch (err) {
    log.warn('Could not load poller config for auto-start', { message: err.message });
  }
}

export function getStatus() {
  return {
    isRunning: _isRunning,
    isPollInProgress: _isPollInProgress,
    lastPollTime: _lastPollTime,
    lastPollResults: _lastPollResults,
    pollCount: _pollCount,
    intervalSeconds: _currentConfig?.intervalSeconds || null,
  };
}

export function getLatestStatus() {
  return Object.values(_latestStatus);
}

export function getLatestStatusMap() {
  return { ..._latestStatus };
}
