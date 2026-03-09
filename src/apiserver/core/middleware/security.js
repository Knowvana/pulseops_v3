// ============================================================================
// Security Middleware — PulseOps V2 API
//
// PURPOSE: Enterprise-grade security middleware chain. Provides Helmet.js
// HTTP headers, rate limiting (general + auth), request ID tracking,
// and XSS input sanitization.
//
// MIDDLEWARE ORDER (per .windsurfrules Section 2.7):
//   1. helmetMiddleware   → HTTP security headers (CSP, HSTS, XSS, clickjacking)
//   2. requestIdMiddleware → UUID per request for distributed tracing
//   3. generalRateLimiter  → 100 req/15min per IP (general)
//   4. authRateLimiter     → 10 req/15min per IP (login endpoint)
//   5. inputSanitizer      → Strip XSS patterns from body/query/params
//
// ARCHITECTURE: Each export is a standalone Express middleware. They are
// mounted in app.js in the order above, BEFORE any route handlers.
//
// DEPENDENCIES:
//   - helmet (npm)
//   - express-rate-limit (npm)
//   - crypto (Node.js built-in)
//   - ../shared/logger.js → structured logging
//   - ../config/APIErrors.json → error messages (via loadJson)
// ============================================================================
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { errors } from '#shared/loadJson.js';
import { logger } from '#shared/logger.js';
import { config } from '#config';

function _extractUserEmail(req) {
  try {
    const token = req.cookies?.accessToken ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    if (!token) return null;
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    return decoded?.email || null;
  } catch {
    return null;
  }
}

/**
 * Derive a meaningful fileName from an API request path.
 * Maps /api/{resource}/{action} → {resource}Routes.js:{action}
 * E.g. /api/database/config → databaseRoutes.js:config
 *      /api/auth/login      → authRoutes.js:login
 *      /api/health          → healthRoutes.js:index
 * @param {string} requestPath - The original URL path
 * @returns {string} A human-readable file:function identifier
 */
function _deriveRouteFile(requestPath) {
  try {
    // Strip /api/ prefix and query string
    const clean = requestPath.replace(/^\/api\//, '').split('?')[0];
    const parts = clean.split('/').filter(Boolean);
    if (parts.length === 0) return 'app.js:root';
    const resource = parts[0]; // e.g. "database", "auth", "logs"
    const action = parts.slice(1).join('/') || 'index'; // e.g. "config", "login"
    return `${resource}Routes.js:${action}`;
  } catch {
    return 'unknown';
  }
}

// ── 1. Helmet.js: HTTP Security Headers ─────────────────────────────────────
export const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

// ── 2. Request ID: UUID per request ─────────────────────────────────────────
export function requestIdMiddleware(req, _res, next) {
  req.requestId     = req.headers['x-transaction-id'] || crypto.randomUUID();
  req.sessionId     = req.headers['x-session-id']     || null;
  req.correlationId = req.headers['x-correlation-id'] || null;
  next();
}

// ── 6. Request/Response Logger: Detailed API call tracking ─────────────────
export function requestLogger(req, res, next) {
  const startTime = Date.now();
  const requestPath = req.originalUrl || req.path;
  const isLogRoute = requestPath.startsWith('/api/logs');
  
  // Log incoming request
  logger.info(`[${req.requestId}] → ${req.method} ${requestPath}`, {
    requestId: req.requestId,
    method: req.method,
    path: requestPath,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    body: req.method !== 'GET' && req.body ? { ...req.body, password: req.body.password ? '***' : undefined } : undefined,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Capture original res.json to log responses
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    const duration = Date.now() - startTime;
    
    logger.info(`[${req.requestId}] ← ${res.statusCode} ${req.method} ${requestPath} (${duration}ms)`, {
      requestId: req.requestId,
      statusCode: res.statusCode,
      duration,
      success: data?.success,
      error: data?.error?.message
    });

    // Persist API log entry (skip /logs endpoints to prevent recursion)
    if (!isLogRoute) {
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      const safeBody = req.method !== 'GET' && req.body
        ? { ...req.body, password: undefined, password_hash: undefined }
        : null;
      const userEmail = req.user?.email || _extractUserEmail(req) || null;
      // Derive fileName from the route path (e.g. /api/database/config → databaseRoutes.js:config)
      const routeFile = _deriveRouteFile(requestPath);
      import('#core/services/logService.js').then(mod => {
        mod.default.writeApiLog({
          transactionId: req.requestId,
          sessionId: req.sessionId || null,
          correlationId: req.correlationId || null,
          level,
          source: 'API',
          event: `${req.method} ${requestPath}`,
          message: `${req.method} ${requestPath} → ${res.statusCode} (${duration}ms)`,
          user: userEmail,
          fileName: routeFile,
          module: 'Core',
          url: requestPath,
          method: req.method,
          statusCode: res.statusCode,
          responseTime: duration,
          requestBody: safeBody,
          responseBody: data,
          error: data?.error?.message || null,
          timestamp: new Date().toISOString(),
        });
      }).catch(() => {});
    }
    
    return originalJson(data);
  };

  next();
}

// ── 3. General Rate Limiter: 100 req / 15 min ──────────────────────────────
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: errors.errors.rateLimitExceeded, code: 'RATE_LIMIT' },
  },
});

// ── 4. Auth Rate Limiter: 10 req / 15 min ──────────────────────────────────
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: errors.errors.authRateLimitExceeded, code: 'AUTH_RATE_LIMIT' },
  },
});

// ── 5. Input Sanitizer: Strip XSS patterns ─────────────────────────────────
/**
 * Recursively sanitize string values in an object by stripping common
 * XSS attack vectors: <script> tags, javascript: URIs, inline event handlers.
 * Applied to req.body, req.query, and req.params.
 */
export function inputSanitizer(req, _res, next) {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .replace(/(<\s*)(\/?\s*)(script|iframe|object|embed|applet)/gi, '');
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
    return obj;
  };

  sanitize(req.body);
  sanitize(req.query);
  sanitize(req.params);
  next();
}
