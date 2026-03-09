// ============================================================================
// UI Logger Service — PulseOps V2
//
// PURPOSE: Capture frontend console logs, user interactions, and errors
// and send them to the backend /api/logs/ui endpoint for centralized logging.
//
// FEATURES:
//   - Intercepts console.log, console.warn, console.error, console.info
//   - Captures unhandled errors and promise rejections
//   - Batches log entries and sends to backend periodically
//   - Tracks user interactions (clicks, navigation, form submissions)
//   - Provides manual logging methods for custom events
//
// USAGE:
//   import { uiLogger } from '@shared/services/uiLogger';
//   uiLogger.init(); // Call once in main.jsx
//   uiLogger.log('Custom log message', { data: 'value' });
// ============================================================================

class UILogger {
  constructor() {
    this.logBuffer = [];
    this.maxBufferSize = 50;
    this.flushInterval = 5000; // 5 seconds
    this.flushTimer = null;
    this.isInitialized = false;
    this.apiEndpoint = '/api/logs/ui';
    this.originalConsole = {};
  }

  /**
   * Initialize the UI logger - intercept console methods and error handlers
   */
  init() {
    if (this.isInitialized) return;

    // Store original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
    };

    // Intercept console methods
    this.interceptConsole();

    // Capture unhandled errors
    this.captureErrors();

    // Track user interactions
    this.trackInteractions();

    // Start periodic flush
    this.startFlushTimer();

    this.isInitialized = true;
    this.originalConsole.info('[UILogger] Initialized - capturing console logs and user interactions');
  }

  /**
   * Intercept console methods to capture logs
   */
  interceptConsole() {
    const levels = ['log', 'info', 'warn', 'error', 'debug'];

    levels.forEach((level) => {
      console[level] = (...args) => {
        // Call original console method
        this.originalConsole[level](...args);

        // Skip logging our own logger messages
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');

        if (message.includes('[UILogger]')) return;

        // Add to buffer
        this.addLog({
          level: level === 'log' ? 'info' : level,
          source: 'console',
          event: level,
          message,
          meta: args.length > 1 ? { args: args.slice(1) } : undefined,
        });
      };
    });
  }

  /**
   * Capture unhandled errors and promise rejections
   */
  captureErrors() {
    // Unhandled errors
    window.addEventListener('error', (event) => {
      this.addLog({
        level: 'error',
        source: 'window',
        event: 'error',
        message: event.message || 'Unhandled error',
        meta: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        },
      });
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.addLog({
        level: 'error',
        source: 'window',
        event: 'unhandledrejection',
        message: event.reason?.message || String(event.reason) || 'Unhandled promise rejection',
        meta: {
          reason: event.reason,
          stack: event.reason?.stack,
        },
      });
    });
  }

  /**
   * Track user interactions
   */
  trackInteractions() {
    // Track clicks on buttons and links
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (target.tagName === 'BUTTON' || target.tagName === 'A') {
        this.addLog({
          level: 'debug',
          source: 'user',
          event: 'click',
          message: `Clicked ${target.tagName}: ${target.textContent?.trim().substring(0, 50) || target.id || 'unknown'}`,
          meta: {
            tag: target.tagName,
            id: target.id,
            className: target.className,
            href: target.href,
          },
        });
      }
    });

    // Track navigation
    let lastPath = window.location.pathname;
    const checkNavigation = () => {
      const currentPath = window.location.pathname;
      if (currentPath !== lastPath) {
        this.addLog({
          level: 'info',
          source: 'navigation',
          event: 'route-change',
          message: `Navigated to ${currentPath}`,
          meta: {
            from: lastPath,
            to: currentPath,
          },
        });
        lastPath = currentPath;
      }
    };

    // Check for navigation changes
    setInterval(checkNavigation, 500);
  }

  /**
   * Add a log entry to the buffer
   */
  addLog(entry) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: entry.level || 'info',
      source: entry.source || 'app',
      event: entry.event || 'log',
      message: entry.message || '',
      meta: entry.meta || {},
    };

    this.logBuffer.push(logEntry);

    // Flush if buffer is full
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  /**
   * Manual logging methods
   */
  log(message, meta = {}) {
    this.addLog({ level: 'info', source: 'app', event: 'log', message, meta });
  }

  info(message, meta = {}) {
    this.addLog({ level: 'info', source: 'app', event: 'info', message, meta });
  }

  warn(message, meta = {}) {
    this.addLog({ level: 'warn', source: 'app', event: 'warn', message, meta });
  }

  error(message, meta = {}) {
    this.addLog({ level: 'error', source: 'app', event: 'error', message, meta });
  }

  debug(message, meta = {}) {
    this.addLog({ level: 'debug', source: 'app', event: 'debug', message, meta });
  }

  /**
   * Flush log buffer to backend
   */
  async flush() {
    if (this.logBuffer.length === 0) return;

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entries }),
      });

      if (!response.ok) {
        this.originalConsole.error('[UILogger] Failed to send logs to backend:', response.status);
      }
    } catch (error) {
      this.originalConsole.error('[UILogger] Error sending logs:', error.message);
      // Re-add entries to buffer if send failed
      this.logBuffer.unshift(...entries);
    }
  }

  /**
   * Start periodic flush timer
   */
  startFlushTimer() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
  }

  /**
   * Stop logging and cleanup
   */
  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Restore original console methods
    Object.keys(this.originalConsole).forEach((method) => {
      console[method] = this.originalConsole[method];
    });

    this.flush(); // Final flush
    this.isInitialized = false;
  }
}

// Export singleton instance
export const uiLogger = new UILogger();
export default uiLogger;
