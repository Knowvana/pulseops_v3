// ============================================================================
// moduleLogger.js — ServiceNow Module Scoped Logger
//
// PURPOSE: Lightweight wrapper around the central Winston logger that:
//   1. Prefixes every log message with [ServiceNow][<component>] for easy filtering
//   2. Checks isModuleLoggingEnabled('ServiceNow') — if the module is disabled
//      in Settings → Log Configuration → Module Logs, ALL log calls are suppressed.
//   3. Log level threshold is governed ONLY by the global defaultLevel setting.
//      Winston itself handles the level gate; this wrapper only gates on/off.
//   4. Persists log entries to DB via LogService.writeModuleLog() so they
//      appear in the Logs Viewer (not just terminal).
//
// USAGE:
//   import { createSnowLogger } from '#modules/servicenow/api/lib/moduleLogger.js';
//   const log = createSnowLogger('AutoAcknowledge');
//   log.debug('Poll cycle starting', { freq: 5 });
//   log.info('Acknowledged INC0001234');
//   log.error('SNOW API failed', { status: 500 });
//
// ARCHITECTURE: Does NOT change the central logger. Only gates on module enabled/disabled.
// ============================================================================
import { logger } from '#shared/logger.js';
import { isModuleLoggingEnabled } from '#core/services/logService.js';
import { getRequestContext } from '#shared/requestContext.js';

const MODULE_NAME = 'ServiceNow';

/**
 * Fire-and-forget DB persistence for module log entries.
 * Uses dynamic import to avoid circular dependency issues at load time.
 * Reads transactionId / sessionId / correlationId / userEmail from
 * AsyncLocalStorage so module logs are tagged with the originating request.
 */
function _persistToDb(level, component, msg, meta) {
  const ctx = getRequestContext();
  import('#core/services/logService.js').then(mod => {
    mod.default.writeModuleLog({
      level,
      source: 'Module',
      event: `[${MODULE_NAME}][${component}]`,
      message: `[${MODULE_NAME}][${component}] ${msg}`,
      module: MODULE_NAME,
      fileName: component,
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
 * Create a scoped logger for a ServiceNow component.
 * @param {string} component - e.g. 'AutoAcknowledge', 'Incidents', 'Sync'
 * @returns {{ debug, info, warn, error }}
 */
export function createSnowLogger(component) {
  const prefix = `[ServiceNow][${component}]`;
  return {
    debug: (msg, meta) => { if (isModuleLoggingEnabled(MODULE_NAME)) { logger.debug(`${prefix} ${msg}`, meta); _persistToDb('debug', component, msg, meta); } },
    info:  (msg, meta) => { if (isModuleLoggingEnabled(MODULE_NAME)) { logger.info(`${prefix} ${msg}`, meta);  _persistToDb('info',  component, msg, meta); } },
    warn:  (msg, meta) => { if (isModuleLoggingEnabled(MODULE_NAME)) { logger.warn(`${prefix} ${msg}`, meta);  _persistToDb('warn',  component, msg, meta); } },
    error: (msg, meta) => { if (isModuleLoggingEnabled(MODULE_NAME)) { logger.error(`${prefix} ${msg}`, meta); _persistToDb('error', component, msg, meta); } },
  };
}
