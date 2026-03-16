// ============================================================================
// UILogService — PulseOps V2 Frontend Logging
//
// PURPOSE: Enterprise-grade structured logging for the frontend application.
//
// FEATURES:
//   - Explicit API: debug(msg,ctx) / info(msg,ctx) / warn(msg,ctx) / error(msg,err?,ctx)
//   - Fetch interceptor: full request + response body capture (sanitized, max 10KB)
//   - Navigation tracker: logs route changes via history.pushState + popstate
//   - Interaction tracker: button/link clicks via event delegation on document
//   - Error tracker: window.onerror + unhandledrejection capture
//   - Console intercept: ONLY warn + error (exceptional conditions, not render noise)
//   - Caller extraction: fileName:functionName from Error stack trace
//   - Ring buffer: 1000 UI log entries + 500 API call entries per browser session
//   - Batch push: every 30s to POST /api/logs/ui (fire-and-forget, non-blocking)
//   - Immediate flush: error-level entries pushed without waiting for the timer
//   - Session-scoped ID: regenerated per page load, sent as X-Session-Id header
//   - Subscriber pattern: React components subscribe for real-time monitor updates
//
// USAGE:
//   import UILogService from '@shared/services/UILogService';
//   UILogService.init();                           // Once at app start
//   UILogService.setUserEmail('user@email.com');   // After login
//   UILogService.info('[Component] msg', { key }); // Explicit log
//   UILogService.subscribe(({ logs, apiCalls }) => {}); // Sidebar monitor
//
// ARCHITECTURE:
//   Sidebar monitor  = session-scoped (in-memory ring buffer, current user only)
//   Log Viewer page  = all users (reads from backend DB/file via API)
// ============================================================================
import urls from '@config/urls.json';
import TimezoneService from '@shared/services/timezoneService';

// ── Configuration ─────────────────────────────────────────────────────────────
const MAX_UI_ENTRIES   = 1000;     // UI log ring buffer
const MAX_API_ENTRIES  = 500;      // API call ring buffer
const PUSH_INTERVAL_MS = 30_000;   // Batch push to backend every 30s
const NOTIFY_DEBOUNCE  = 250;      // Sidebar refresh throttle (max 4/sec)
const MAX_BODY_BYTES   = 10_000;   // Max req/res body to capture in bytes

// ── Regex (pre-compiled) ──────────────────────────────────────────────────────
// Strip emoji for clean log storage
const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2702}-\u{27B0}]/gu;

// Parse Vite/Webpack bundled stack frames:
//   "at FuncName (http://host/src/path/File.jsx?t=123:45:6)"
//   "at http://host/src/path/File.jsx:45:6"
const FRAME_RE = /at\s+(?:([^\s(]+)\s+)?\(?(?:https?:\/\/[^/]+)?\/?(src\/[^?:]+)(?:\?[^:]*)?:(\d+)/;

// Console noise to skip from the warn/error intercept
const CONSOLE_NOISE = [
  'Download the React DevTools', '[HMR]', '[vite]', '[Violation]',
  '[DOM]', 'Warning: ', 'React does not recognize',
  'Password field is not contained', '%c',
];

// Internal frames to skip during caller extraction
const SKIP_FRAMES = ['UILogService', 'node_modules', 'chunk-'];

// Generate industry-grade unique transaction IDs using crypto.randomUUID()
const nextId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

// ── Service class ─────────────────────────────────────────────────────────────
class UILogServiceClass {
  constructor() {
    this._uiLogs      = [];        // UI log ring buffer
    this._apiCalls    = [];        // API call ring buffer
    this._pending     = [];        // Queued for backend push
    this._listeners   = new Set();
    this._pushTimer   = null;
    this._notifyTimer = null;
    this._notifyPending = false;
    this._sessionId   = null;
    this._userId      = null;
    this._initialized = false;
    // Saved originals for cleanup on destroy()
    this._origConsole      = {};
    this._origFetch        = null;
    this._origPushState    = null;
    this._origReplaceState = null;
    this._navPopHandler    = null;
    this._correlationId    = null;   // Active correlation ID linking UI click → API calls
    this._correlationTimer = null;   // Auto-clear timer for correlationId
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this._sessionId = this._genSessionId();
    this._interceptFetch();
    this._interceptConsole();
    this._trackNavigation();
    this._trackInteractions();
    this._trackErrors();
    this._pushTimer = setInterval(() => this._pushToBackend(), PUSH_INTERVAL_MS);
  }

  destroy() {
    if (!this._initialized) return;
    Object.entries(this._origConsole).forEach(([k, v]) => { console[k] = v; });
    if (this._origFetch)        window.fetch           = this._origFetch;
    if (this._origPushState)    history.pushState      = this._origPushState;
    if (this._origReplaceState) history.replaceState   = this._origReplaceState;
    if (this._navPopHandler)    window.removeEventListener('popstate', this._navPopHandler);
    clearInterval(this._pushTimer);
    clearTimeout(this._notifyTimer);
    this._initialized = false;
  }

  // ── Public: Identity ──────────────────────────────────────────────────────

  /** Call after successful login with the user's email */
  setUserEmail(email) { this._userId = email || null; }
  getUserEmail()      { return this._userId; }
  getSessionId()      { return this._sessionId; }

  // Backward-compat aliases
  getSessionTxId()   { return this._sessionId; }
  setSessionTxId()   { /* sessions are auto-generated; no-op */ }
  getCorrelationId() { return this._correlationId; }

  /**
   * Generate a new correlationId that links a UI interaction to the API calls
   * it triggers. Auto-clears after 2 seconds (typical SPA fetch round-trip).
   * @returns {string} The generated correlationId
   */
  _setCorrelation() {
    clearTimeout(this._correlationTimer);
    this._correlationId = `cor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this._correlationTimer = setTimeout(() => { this._correlationId = null; }, 2000);
    return this._correlationId;
  }

  // ── Public: Explicit Logging API ──────────────────────────────────────────

  /**
   * DEBUG — verbose diagnostic information.
   * @param {string} message  Prefix with [Component] for clarity, e.g. '[Settings] loading'
   * @param {object} [context]  Optional structured key/value data
   */
  debug(message, context) {
    this._addUiEntry('debug', message, context, 'app');
  }

  /**
   * INFO — normal operational events (page accessed, data loaded, action completed).
   */
  info(message, context) {
    this._addUiEntry('info', message, context, 'app');
  }

  /**
   * WARN — unexpected but recoverable conditions.
   */
  warn(message, context) {
    this._addUiEntry('warn', message, context, 'app');
  }

  /**
   * ERROR — failures requiring attention. Triggers an immediate backend push.
   * @param {string} message
   * @param {Error|object} [errOrCtx]  Pass an Error object or additional context object
   * @param {object} [context]          Extra context when errOrCtx is an Error
   */
  error(message, errOrCtx, context) {
    const ctx = (errOrCtx instanceof Error)
      ? { ...context, errorMessage: errOrCtx.message, stack: errOrCtx.stack?.split('\n').slice(0, 4).join(' | ') }
      : { ...errOrCtx, ...context };
    this._addUiEntry('error', message, ctx || undefined, 'app');
    this._flushNow();
  }

  // ── Public: Data access ───────────────────────────────────────────────────

  getLogs()     { return this._uiLogs; }
  getApiCalls() { return this._apiCalls; }

  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  clearLogs()     { this._uiLogs   = []; this._notify(); }
  clearApiCalls() { this._apiCalls = []; this._notify(); }

  /**
   * Force immediate notification to all subscribers without debouncing.
   * Useful for real-time monitoring when the logs panel is open.
   */
  forceNotify() {
    clearTimeout(this._notifyTimer);
    this._notifyTimer = null;
    this._notifyPending = false;
    const snap = { logs: this._uiLogs, apiCalls: this._apiCalls };
    this._listeners.forEach(cb => { try { cb(snap); } catch { /* ignore */ } });
  }

  // ── Instrumentation: Fetch interceptor ───────────────────────────────────

  _interceptFetch() {
    this._origFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const [input, init] = args;
      const rawUrl = typeof input === 'string' ? input : (input?.url || String(input));
      const method = (init?.method || 'GET').toUpperCase();
      const isLogPush = rawUrl.includes('/api/logs/') && method === 'POST';

      // Capture request body synchronously before the request fires
      const requestBody = this._captureRequestBody(init?.body);

      // Attach session + correlation IDs to every request header (except log-push to avoid recursion)
      const correlationId = this._correlationId;
      const augInit = {
        ...(init || {}),
        headers: {
          ...(init?.headers || {}),
          ...(!isLogPush && this._sessionId    ? { 'X-Session-Id': this._sessionId }       : {}),
          ...(!isLogPush && correlationId      ? { 'X-Correlation-Id': correlationId }     : {}),
        },
      };

      const t0 = performance.now();
      try {
        const response = await this._origFetch(input, augInit);
        const duration = Math.round(performance.now() - t0);

        if (!isLogPush) {
          // Clone the response stream and capture body asynchronously (non-blocking)
          const cloned = response.clone();
          this._captureResponseBody(cloned)
            .then(responseBody => {
              this._addApiEntry({ method, url: this._shortUrl(rawUrl), status: response.status, duration, requestBody, responseBody, error: null, correlationId });
            })
            .catch(() => {
              this._addApiEntry({ method, url: this._shortUrl(rawUrl), status: response.status, duration, requestBody, responseBody: null, error: null, correlationId });
            });
        }
        return response;
      } catch (err) {
        const duration = Math.round(performance.now() - t0);
        if (!isLogPush) {
          this._addApiEntry({ method, url: this._shortUrl(rawUrl), status: 0, duration, requestBody, responseBody: null, error: err.message, correlationId });
        }
        throw err;
      }
    };
  }

  // ── Instrumentation: Console (warn + error only) ──────────────────────────

  _interceptConsole() {
    ['log', 'info', 'warn', 'error', 'debug'].forEach(level => {
      this._origConsole[level] = console[level].bind(console);
      console[level] = (...args) => {
        // Always pass through to browser DevTools
        this._origConsole[level](...args);

        // Only capture warn and error from console — these are exceptional conditions.
        // info/debug/log are too noisy from React render cycles.
        const mapped = level === 'log' ? 'info' : level;
        if (mapped !== 'warn' && mapped !== 'error') return;

        const firstArg = typeof args[0] === 'string' ? args[0] : '';
        if (CONSOLE_NOISE.some(n => firstArg.startsWith(n))) return;

        const msg = this._argsToString(args).replace(EMOJI_RE, '').trim();
        if (!msg || msg.includes('UILogService')) return;

        // Extra skip = 1: Error > _extractCaller > _addUiEntry > console-override > actual caller
        const caller = this._extractCaller(1);
        this._addUiEntryRaw(mapped, msg, undefined, 'app', caller);
      };
    });
  }

  // ── Instrumentation: Navigation tracker ──────────────────────────────────

  _trackNavigation() {
    this._origPushState    = history.pushState.bind(history);
    this._origReplaceState = history.replaceState.bind(history);

    const self = this;
    history.pushState = function (...a) {
      self._origPushState(...a);
      self._logNav(a[2]);
    };
    // replaceState fires on initial React Router setup — log it once but not on every replace
    history.replaceState = function (...a) {
      self._origReplaceState(...a);
    };

    this._navPopHandler = () => self._logNav(window.location.pathname);
    window.addEventListener('popstate', this._navPopHandler);

    // Log initial page load — derive fileName from the page path
    this._addUiEntryRaw('info',
      `[Navigation] App loaded → ${window.location.pathname}`,
      { path: window.location.pathname }, 'navigation',
      { file: this._pageToFileName(window.location.pathname), func: 'init' });
  }

  _logNav(url) {
    const path = typeof url === 'string'
      ? url.replace(/^https?:\/\/[^/]+/, '')
      : window.location.pathname;
    this._addUiEntryRaw('info',
      `[Navigation] → ${path}`,
      { path }, 'navigation',
      { file: this._pageToFileName(path), func: 'navigation' });
  }

  // ── Instrumentation: User interaction tracker ─────────────────────────────

  _trackInteractions() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, a[href], [role="button"], [data-log], input, select, textarea');
      if (!target) return;

      const tag       = target.tagName.toLowerCase();
      const ariaLabel = target.getAttribute('aria-label');
      const title     = target.getAttribute('title');
      // For <select>, use the selected option text (not all options concatenated)
      let directText;
      if (tag === 'select' && target.selectedIndex >= 0) {
        directText = ariaLabel || title || target.options[target.selectedIndex]?.text || '';
      } else {
        directText = ariaLabel || title || this._getDirectText(target);
      }
      const rawText   = (directText || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      const dataLog   = target.getAttribute('data-log');

      if (!rawText && !dataLog) return;

      const ctx = {
        interactionType: 'click',
        element:         tag,
        ...(target.id                           && { id:       target.id }),
        ...(target.name                         && { name:     target.name }),
        ...(ariaLabel                           && { ariaLabel }),
        ...(title                               && { title }),
        ...(target.getAttribute('role')         && { role:     target.getAttribute('role') }),
        ...(target.getAttribute('type')         && { type:     target.getAttribute('type') }),
        ...(tag === 'a' && target.href          && { href:     target.getAttribute('href') }),
        ...(target.getAttribute('data-testid')  && { testId:   target.getAttribute('data-testid') }),
        ...(dataLog                             && { dataLog }),
        ...(rawText                             && { text:     rawText }),
        page: window.location.pathname,
      };

      // Generate a correlationId so API calls triggered by this click can be traced back
      const correlationId = this._setCorrelation();
      ctx.correlationId = correlationId;

      const label = tag === 'a' ? 'Link' : tag === 'input' ? 'Input' : tag === 'select' ? 'Select' : 'Button';
      this._addUiEntryRaw('debug',
        `[Interaction] ${label}: ${rawText || dataLog || tag}`,
        ctx, 'interaction',
        { file: this._pageToFileName(window.location.pathname), func: 'interaction' });
    }, { capture: true, passive: true });
  }

  // ── Instrumentation: Global error tracker ────────────────────────────────

  _trackErrors() {
    window.addEventListener('unhandledrejection', (e) => {
      const msg   = e.reason?.message || String(e.reason) || 'Unhandled Promise Rejection';
      const stack = e.reason?.stack?.split('\n').slice(0, 3).join(' | ');
      // Extract actual file from the rejection stack trace if available
      const caller = this._callerFromStack(e.reason?.stack);
      this._addUiEntryRaw('error',
        `[UnhandledRejection] ${msg}`,
        stack ? { stack } : undefined, 'error',
        caller || { file: this._pageToFileName(window.location.pathname), func: 'unhandledRejection' });
      this._flushNow();
    });

    window.addEventListener('error', (e) => {
      if (!e.message || e.message === 'Script error.') return;
      // Use the actual error filename if available
      const errorFile = e.filename ? e.filename.split('/').pop()?.split('?')[0] : null;
      this._addUiEntryRaw('error',
        `[WindowError] ${e.message}`,
        { file: e.filename, line: e.lineno }, 'error',
        { file: errorFile || this._pageToFileName(window.location.pathname), func: 'windowError' });
      this._flushNow();
    });
  }

  // ── Internal: Create UI log entry ─────────────────────────────────────────

  /** Used by explicit public API (debug/info/warn/error) — extracts caller from stack */
  _addUiEntry(level, message, context, type) {
    const caller = this._extractCaller(0);
    const clean  = (typeof message === 'string' ? message : this._argsToString([message]))
      .replace(EMOJI_RE, '').trim();
    this._addUiEntryRaw(level, clean, context, type, caller);
  }

  /** Core entry creation — all instrumentation paths converge here */
  _addUiEntryRaw(level, message, context, type, caller) {
    const entry = {
      id:           nextId('log'),
      timestamp:    new Date().toISOString(),
      displayTime:  TimezoneService.formatCurrentTime(),
      sessionId:    this._sessionId,
      correlationId: this._correlationId || null,
      userId:       this._userId || 'Anonymous',
      level,
      type:         type || 'app',
      source:       'UI',
      message,
      context:      context || undefined,
      fileName:     caller?.file  || null,
      functionName: caller?.func  || null,
      pageUrl:      typeof window !== 'undefined' ? window.location.pathname : null,
    };

    this._uiLogs.push(entry);
    if (this._uiLogs.length > MAX_UI_ENTRIES) {
      this._uiLogs = this._uiLogs.slice(-MAX_UI_ENTRIES);
    }
    this._pending.push(entry);
    this._notify();
  }

  // ── Internal: Create API call entry ──────────────────────────────────────

  _addApiEntry({ method, url, status, duration, requestBody, responseBody, error, correlationId }) {
    const entry = {
      id:           nextId('api'),
      timestamp:    new Date().toISOString(),
      displayTime:  TimezoneService.formatCurrentTime(),
      sessionId:    this._sessionId,
      correlationId: correlationId || null,
      userId:       this._userId || 'Anonymous',
      method,
      url,
      status,
      duration,
      requestBody:  requestBody  || null,
      responseBody: responseBody || null,
      error:        error        || null,
    };

    this._apiCalls.push(entry);
    if (this._apiCalls.length > MAX_API_ENTRIES) {
      this._apiCalls = this._apiCalls.slice(-MAX_API_ENTRIES);
    }
    this._notify();
  }

  // ── Internal: Body capture ────────────────────────────────────────────────

  _captureRequestBody(body) {
    if (!body) return null;
    try {
      let parsed;
      if (typeof body === 'string') {
        try { parsed = JSON.parse(body); } catch { return body.length > 500 ? '[large text body]' : body; }
      } else if (body instanceof FormData)      { return '[FormData]'; }
      else if (body instanceof URLSearchParams) { parsed = Object.fromEntries(body); }
      else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) { return '[Binary]'; }
      else { return null; }

      if (parsed && typeof parsed === 'object') {
        const safe = { ...parsed };
        ['password', 'password_hash', 'token', 'secret', 'authorization'].forEach(k => {
          if (safe[k] !== undefined) safe[k] = '***';
        });
        return safe;
      }
      return parsed;
    } catch { return null; }
  }

  async _captureResponseBody(response) {
    try {
      const ct = response.headers?.get('content-type') || '';
      if (!ct.includes('application/json')) return null;
      const text = await response.text();
      if (text.length > MAX_BODY_BYTES) return { _note: `[truncated — ${text.length} bytes]` };
      return JSON.parse(text);
    } catch { return null; }
  }

  // ── Internal: Stack trace caller extraction ───────────────────────────────

  /**
   * Walk the call stack to find the first frame outside this service.
   * @param {number} extraSkip  Additional frames to skip beyond the 4-frame base
   *   Base stack: [0] Error, [1] _extractCaller, [2] _addUiEntry, [3] public method, [4] actual caller
   */
  _extractCaller(extraSkip = 0) {
    try {
      const lines = (new Error().stack || '').split('\n');
      const start = 4 + extraSkip;
      for (let i = start; i < Math.min(lines.length, start + 10); i++) {
        const line = lines[i];
        if (!line) continue;
        if (SKIP_FRAMES.some(f => line.includes(f))) continue;
        const m = line.match(FRAME_RE);
        if (m) {
          const func = (m[1] || 'anonymous')
            .replace(/^Object\./, '').replace(/^Array\./, '')
            .split('.').pop();
          const file = (m[2] || '').split('/').pop() || m[2];
          return { file, func };
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  // ── Internal: Backend push ────────────────────────────────────────────────

  async _pushToBackend() {
    if (this._pending.length === 0) return;
    const batch = this._pending.splice(0); // Drain atomically
    try {
      const fetcher = this._origFetch || window.fetch;
      await fetcher(urls.logs.ui, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entries: batch.map(e => ({
            transactionId:  e.id,
            sessionId:      e.sessionId,
            correlationId:  e.correlationId || null,
            level:          e.level,
            source:         'UI',
            event:          e.type,
            fileName:       e.fileName ? `${e.fileName}:${e.functionName || 'anonymous'}` : null,
            module:         'Core',
            message:        e.message,
            user:           this._userId || null,
            pageUrl:        e.pageUrl || null,
            data:           e.context ?? null,
            timestamp:      e.timestamp,
          })),
        }),
      });
    } catch {
      // Re-queue on network failure — prepend so retried entries stay in order
      if (this._pending.length < MAX_UI_ENTRIES) {
        this._pending.unshift(...batch);
      }
    }
  }

  /** Push immediately (used for error-level entries) — non-blocking */
  _flushNow() {
    Promise.resolve().then(() => this._pushToBackend()).catch(() => {});
  }

  // ── Internal: Subscriber notification (debounced) ─────────────────────────

  _notify() {
    this._notifyPending = true;
    if (this._notifyTimer) return;
    this._notifyTimer = setTimeout(() => {
      this._notifyTimer = null;
      if (!this._notifyPending) return;
      this._notifyPending = false;
      const snap = { logs: this._uiLogs, apiCalls: this._apiCalls };
      this._listeners.forEach(cb => { try { cb(snap); } catch { /* ignore */ } });
    }, NOTIFY_DEBOUNCE);
  }

  // ── Internal: Utilities ───────────────────────────────────────────────────

  _argsToString(args) {
    return args.map(a => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
  }

  /** Extract only direct text-node content from an element (skips child elements like badges/avatars) */
  _getDirectText(el) {
    let text = '';
    // Walk children; collect TEXT_NODE content, recurse into child elements
    // but skip decorative children (badges with numbers, avatar initials)
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {                       // TEXT_NODE
          text += child.textContent;
        } else if (child.nodeType === 1) {                // ELEMENT_NODE
          const childText = (child.textContent || '').trim();
          // Skip badge/counter elements (purely numeric) and avatar initials (single char)
          if (/^\d+$/.test(childText) || childText.length <= 1) continue;
          walk(child);
        }
      }
    };
    walk(el);
    return text;
  }

  _shortUrl(url) {
    try {
      const u = new URL(url, window.location.origin);
      return u.pathname + (u.search ? u.search.slice(0, 60) : '');
    } catch {
      return url.length > 80 ? url.slice(0, 80) + '\u2026' : url;
    }
  }

  /**
   * Derive a meaningful filename from a URL path.
   * E.g. /platform_admin/Settings → Settings.jsx
   *      /platform_admin/logs     → LogManager.jsx
   *      /                        → App.jsx
   * Falls back to the last path segment capitalized + .jsx
   */
  _pageToFileName(path) {
    if (!path || path === '/') return 'App.jsx';
    const segment = path.split('/').filter(Boolean).pop() || 'App';
    // Capitalize first letter and add .jsx extension
    const name = segment.charAt(0).toUpperCase() + segment.slice(1);
    return `${name}.jsx`;
  }

  /**
   * Extract caller { file, func } from an Error stack trace string.
   * Used by error handlers where we have a stack but no Error() to construct.
   * @param {string} stackStr - The .stack property of an Error
   * @returns {{ file: string, func: string } | null}
   */
  _callerFromStack(stackStr) {
    if (!stackStr) return null;
    try {
      const lines = stackStr.split('\n');
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const line = lines[i];
        if (!line) continue;
        if (SKIP_FRAMES.some(f => line.includes(f))) continue;
        const m = line.match(FRAME_RE);
        if (m) {
          const func = (m[1] || 'anonymous').replace(/^Object\./, '').replace(/^Array\./, '').split('.').pop();
          const file = (m[2] || '').split('/').pop() || m[2];
          return { file, func };
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  _genSessionId() {
    return `ses-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const UILogService = new UILogServiceClass();
export default UILogService;
