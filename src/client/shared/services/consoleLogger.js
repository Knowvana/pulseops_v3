// ============================================================================
// consoleLogger — PulseOps V2 Shared Service
//
// PURPOSE: Structured, styled browser console output for every frontend file.
// Replaces raw console.log/warn/error calls with a consistent, readable format.
//
// OUTPUT FORMAT (per entry):
//   ● INFO  [App.jsx:checkSession]    Application mounted — checking session
//   ▲ WARN  [Settings.jsx:handleSave] Save failed: 400 Bad Request
//   ✖ ERROR [App.jsx:handleLogin]     Network error  ▼ (collapsible details)
//   ○ DEBUG [UILogService.js:click]   Interaction registered
//
// USAGE:
//   import { createLogger } from '@shared';
//   const log = createLogger('App.jsx');
//
//   log.info ('checkSession', 'Application mounted — checking session');
//   log.warn ('handleSave',   'Save failed',       { status: 400 });
//   log.error('handleLogin',  'Network error',     err);
//   log.debug('click',        'Button registered', { id: 'btn-save' });
//
// PARAMETERS:
//   file   — Filename string, e.g. 'App.jsx'  (passed to createLogger)
//   func   — Function name, e.g. 'handleLogin' (first arg to each method)
//   msg    — Human-readable message string     (second arg)
//   data   — Optional object/value             (third arg — shown collapsed)
//
// BEHAVIOUR:
//   - debug entries suppressed in production (NODE_ENV !== 'development')
//   - When data is provided: uses console.groupCollapsed for collapsible detail
//   - All output goes to the real browser console (not intercepted)
// ============================================================================

const isDev = typeof import.meta !== 'undefined'
  ? import.meta.env?.MODE !== 'production'
  : true;

// ── Level definitions ─────────────────────────────────────────────────────────
const LEVELS = {
  debug: {
    glyph: '○',
    label: 'DEBUG',
    style: 'color:#94a3b8;font-weight:normal',
    fn: 'debug',
  },
  info: {
    glyph: '●',
    label: 'INFO ',
    style: 'color:#0ea5e9;font-weight:bold',
    fn: 'log',
  },
  warn: {
    glyph: '▲',
    label: 'WARN ',
    style: 'color:#f59e0b;font-weight:bold',
    fn: 'warn',
  },
  error: {
    glyph: '✖',
    label: 'ERROR',
    style: 'color:#ef4444;font-weight:bold',
    fn: 'error',
  },
};

const SRC_STYLE  = 'color:#64748b;font-style:italic;font-weight:normal';
const MSG_STYLE  = 'color:inherit;font-weight:normal';
const RESET      = 'color:inherit;font-weight:normal';

// ── Core emit function ────────────────────────────────────────────────────────
function emit(level, file, func, msg, data) {
  if (level === 'debug' && !isDev) return;

  const L   = LEVELS[level] || LEVELS.info;
  const src = func ? `${file}:${func}` : file;

  // Format: GLYPH LABEL  [file:func]  message
  const fmt = `%c${L.glyph} ${L.label}%c  [${src}]%c  ${msg}`;

  if (data !== undefined && data !== null) {
    // Use groupCollapsed so data is available but not distracting
    console.groupCollapsed(fmt, L.style, SRC_STYLE, MSG_STYLE);
    console.log(data);
    console.groupEnd();
  } else {
    console[L.fn](fmt, L.style, SRC_STYLE, MSG_STYLE);
  }
}

// ── Factory: creates a logger bound to a specific file ───────────────────────
export function createLogger(file) {
  return {
    debug: (func, msg, data) => emit('debug', file, func, msg, data),
    info:  (func, msg, data) => emit('info',  file, func, msg, data),
    warn:  (func, msg, data) => emit('warn',  file, func, msg, data),
    error: (func, msg, data) => emit('error', file, func, msg, data),
  };
}

export default createLogger;
