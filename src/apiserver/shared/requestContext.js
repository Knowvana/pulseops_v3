// ============================================================================
// requestContext.js — Async Request Context for PulseOps V2
//
// PURPOSE: Propagates HTTP request metadata (session ID, transaction ID,
// correlation ID, user email) across async boundaries so that module-scoped
// loggers can tag DB entries with the originating request context without
// requiring the `req` object to be explicitly passed through every call.
//
// MECHANISM: Node.js AsyncLocalStorage (stable since v16). The middleware
// in security.js calls `run()` to bind the context for the lifetime of each
// request. Any code executing within that request (route handlers, services,
// module loggers) can call `get()` to read the current context.
//
// Import via: #shared/requestContext.js
// ============================================================================
import { AsyncLocalStorage } from 'node:async_hooks';

const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Run a callback within a request context.
 * Called by requestIdMiddleware to bind context for the request lifetime.
 * @param {Object} ctx - { sessionId, transactionId, correlationId, userEmail }
 * @param {Function} fn - Callback to execute within the context
 */
export function runWithContext(ctx, fn) {
  asyncLocalStorage.run(ctx, fn);
}

/**
 * Get the current request context (or empty object if none).
 * Safe to call from anywhere — returns {} outside of a request.
 * @returns {{ sessionId?: string, transactionId?: string, correlationId?: string, userEmail?: string }}
 */
export function getRequestContext() {
  return asyncLocalStorage.getStore() || {};
}
