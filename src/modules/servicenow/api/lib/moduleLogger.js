// ============================================================================
// moduleLogger.js — Generic Module Scoped Logger
//
// PURPOSE: Lightweight wrapper around the central Winston logger that:
//   1. Passes moduleName, fileName, functionName as Winston metadata — the
//      central logger printf format renders them as:
//      [API][Date][Level][ModuleName][FileName][FunctionName] Message
//   2. Checks isModuleLoggingEnabled(moduleName) — if the module is disabled
//      in Settings → Log Configuration → Module Logs, ALL log calls are suppressed.
//   3. Log level threshold is governed ONLY by the global defaultLevel setting.
//      Winston itself handles the level gate; this wrapper only gates on/off.
//   4. Persists log entries to DB via LogService.writeModuleLog() so they
//      appear in the Logs Viewer (not just terminal).
//
// USAGE:
//   import { createModuleLogger, createSnowLogger } from '#modules/servicenow/api/lib/moduleLogger.js';
//   const log = createSnowLogger('AutoAcknowledgePoller.js');
//   log.debug('Poll cycle starting', { freq: 5 });
//   log.info('Acknowledged INC0001234');
//   log.error('SNOW API failed', { status: 500 });
//
// ARCHITECTURE: Does NOT change the central logger. Only gates on module enabled/disabled.
// ============================================================================
import { logger } from '#shared/logger.js';
import { isModuleLoggingEnabled } from '#core/services/logService.js';
import { getRequestContext } from '#shared/requestContext.js';

// Pre-compiled regex for stack frame parsing (matches Node.js V8 stack frames)
const FRAME_RE = /at (?:(?:async )?(\S+?)\.?(\S+?) )?\(?(?:.*[\\/])?([\w.-]+\.(?:js|mjs|ts)):(\d+)/;
const SKIP_FRAMES = ['moduleLogger.js', 'node_modules'];

/**
 * Extract the caller's function name from the Error stack trace.
 * Skips internal frames (this file, node_modules).
 * @returns {string} function name or 'anonymous'
 */
function _extractCaller() {
  try {
    const lines = (new Error().stack || '').split('\n');
    // Skip: [0] Error, [1] _extractCaller, [2] _log, [3] debug/info/warn/error wrapper
    for (let i = 4; i < Math.min(lines.length, 12); i++) {
      const line = lines[i];
      if (!line || SKIP_FRAMES.some(f => line.includes(f))) continue;
      const m = line.match(FRAME_RE);
      if (m) {
        // m[1] = class/object, m[2] = method, m[3] = file, m[4] = line
        const func = m[2] || m[1] || 'anonymous';
        return func.replace(/^Object\./, '').replace(/^Module\./, '');
      }
    }
  } catch { /* ignore */ }
  return 'anonymous';
}

/**
 * Fire-and-forget DB persistence for module log entries.
 * Uses dynamic import to avoid circular dependency issues at load time.
 * Reads transactionId / sessionId / correlationId / userEmail from
 * AsyncLocalStorage so module logs are tagged with the originating request.
 */
function _persistToDb(level, moduleName, fileName, functionName, msg, meta) {
  const ctx = getRequestContext();
  import('#core/services/logService.js').then(mod => {
    mod.default.writeModuleLog({
      level,
      source: 'Module',
      event: `[${moduleName}][${fileName}]`,
      message: msg,
      module: moduleName,
      fileName: `${fileName}:${functionName}`,
      data: meta && typeof meta === 'object' ? meta : (meta != null ? { detail: meta } : null),
      transactionId: ctx.transactionId || null,
      sessionId: ctx.sessionId || null,
      correlationId: ctx.correlationId || null,
      user: ctx.userEmail || null,
      timestamp: new Date().toISOString(),
    });
  }).catch(() => {});
}

/**
 * Create a scoped logger for any module.
 * @param {string} moduleName - e.g. 'ServiceNow', 'Roster', 'Reporting'
 * @param {string} fileName   - e.g. 'AutoAcknowledgePoller.js', 'Incidents'
 * @returns {{ debug, info, warn, error }}
 */
export function createModuleLogger(moduleName, fileName) {
  const _log = (level, msg, meta) => {
    if (!isModuleLoggingEnabled(moduleName)) return;
    const functionName = _extractCaller();
    logger[level](msg, { ...meta, moduleName, fileName, functionName });
    _persistToDb(level, moduleName, fileName, functionName, msg, meta);
  };
  return {
    debug: (msg, meta) => _log('debug', msg, meta),
    info:  (msg, meta) => _log('info',  msg, meta),
    warn:  (msg, meta) => _log('warn',  msg, meta),
    error: (msg, meta) => _log('error', msg, meta),
  };
}

/**
 * Backward-compatible wrapper: creates a logger scoped to the ServiceNow module.
 * @param {string} component - e.g. 'AutoAcknowledgePoller.js', 'Config', 'Incidents'
 * @returns {{ debug, info, warn, error }}
 */
export function createSnowLogger(component) {
  return createModuleLogger('ServiceNow', component);
}
