// ============================================================================
// Module Gateway — PulseOps V2 API
//
// PURPOSE: Middleware that dispatches requests to dynamically registered
// module routers. Registered in app.js BEFORE the 404 handler so routes
// added at runtime by dynamicRouteLoader are always reachable.
//
// HOW IT WORKS:
//   1. dynamicRouteLoader calls addModuleRouter('servicenow', authenticate, router)
//   2. Gateway middleware intercepts requests matching /api/<moduleId>/*
//   3. Strips the prefix and delegates to the module's router
//   4. If no module matches, calls next() (falls through to 404)
//
// WHY SEPARATE FILE: Avoids circular imports between app.js and
// dynamicRouteLoader.js. Both import this module — no cycle.
// ============================================================================

// Map of moduleId → { authenticate, router }
const _moduleRouters = new Map();

/**
 * Register a module router for a given moduleId.
 * @param {string} moduleId
 * @param {Function} authMiddleware - authenticate middleware
 * @param {import('express').Router} router - module's Express router
 */
export function addModuleRouter(moduleId, authMiddleware, router) {
  _moduleRouters.set(moduleId, { auth: authMiddleware, router });
}

/**
 * Remove a module router.
 * @param {string} moduleId
 */
export function removeModuleRouter(moduleId) {
  _moduleRouters.delete(moduleId);
}

/**
 * Check if a module router is registered.
 * @param {string} moduleId
 * @returns {boolean}
 */
export function hasModuleRouter(moduleId) {
  return _moduleRouters.has(moduleId);
}

/**
 * Express middleware that routes /api/<moduleId>/* to the registered module router.
 */
export default function moduleGateway(req, res, next) {
  // Match /api/<moduleId>/...
  const match = req.path.match(/^\/api\/([a-zA-Z0-9_-]+)(\/.*)?$/);
  if (!match) return next();

  const moduleId = match[1];
  const entry = _moduleRouters.get(moduleId);
  if (!entry) return next();

  // Delegate to the module's auth middleware then router
  entry.auth(req, res, (authErr) => {
    if (authErr) return next(authErr);
    // Rewrite req.url to strip the /api/<moduleId> prefix so the module router
    // sees paths like /config, /stats, /incidents instead of /api/servicenow/config
    const originalUrl = req.url;
    req.url = match[2] || '/';
    entry.router(req, res, (routerErr) => {
      req.url = originalUrl; // restore
      next(routerErr);
    });
  });
}
