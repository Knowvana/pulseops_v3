// ============================================================================
// moduleLogger.js — HealthCheck Module Scoped Logger
//
// PURPOSE: Lightweight wrapper around the central Winston logger that:
//   1. Passes moduleName, fileName, functionName as Winston metadata
//   2. Checks isModuleLoggingEnabled('HealthCheck') — if disabled, suppresses
//   3. Persists log entries to DB via LogService.writeModuleLog()
//
// USAGE:
//   import { createHcLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';
//   const log = createHcLogger('PollerService.js');
//   log.info('Poll cycle starting', { appCount: 5 });
// ============================================================================
import { logger } from '#shared/logger.js';
import { isModuleLoggingEnabled } from '#core/services/logService.js';
import { getRequestContext } from '#shared/requestContext.js';

const MODULE_NAME = 'HealthCheck';

const FRAME_RE = /at (?:(?:async )?(\S+?)\.?(\S+?) )?\(?(?:.*[\\/])?([\w.-]+\.(?:js|mjs|ts)):(\d+)/;
const SKIP_FRAMES = ['moduleLogger.js', 'node_modules'];

function _extractCaller() {
  try {
    const lines = (new Error().stack || '').split('\n');
    for (let i = 4; i < Math.min(lines.length, 12); i++) {
      const line = lines[i];
      if (!line || SKIP_FRAMES.some(f => line.includes(f))) continue;
      const m = line.match(FRAME_RE);
      if (m) {
        const func = m[2] || m[1] || 'anonymous';
        return func.replace(/^Object\./, '').replace(/^Module\./, '');
      }
    }
  } catch { /* ignore */ }
  return 'anonymous';
}

function _persistToDb(level, fileName, functionName, msg, meta) {
  const ctx = getRequestContext();
  const sessionId     = ctx.sessionId     || `bg-healthcheck-${process.pid}`;
  const transactionId = ctx.transactionId || `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const correlationId = ctx.correlationId || `${MODULE_NAME}:${fileName}:${functionName}`;
  const user          = ctx.userEmail     || 'system';

  import('#core/services/logService.js').then(mod => {
    mod.default.writeModuleLog({
      level,
      source: 'Module',
      event: `[${MODULE_NAME}][${fileName}]`,
      message: msg,
      module: MODULE_NAME,
      fileName: `${fileName}:${functionName}`,
      data: meta && typeof meta === 'object' ? meta : (meta != null ? { detail: meta } : null),
      transactionId,
      sessionId,
      correlationId,
      user,
      timestamp: new Date().toISOString(),
    });
  }).catch(() => {});
}

/**
 * Create a scoped logger for the HealthCheck module.
 * @param {string} fileName - e.g. 'PollerService.js', 'Config', 'Reports'
 * @returns {{ debug, info, warn, error }}
 */
export function createHcLogger(fileName) {
  const _log = (level, msg, meta) => {
    if (!isModuleLoggingEnabled(MODULE_NAME)) return;
    const functionName = _extractCaller();
    logger[level](msg, { ...meta, moduleName: MODULE_NAME, fileName, functionName });
    _persistToDb(level, fileName, functionName, msg, meta);
  };
  return {
    debug: (msg, meta) => _log('debug', msg, meta),
    info:  (msg, meta) => _log('info',  msg, meta),
    warn:  (msg, meta) => _log('warn',  msg, meta),
    error: (msg, meta) => _log('error', msg, meta),
  };
}
