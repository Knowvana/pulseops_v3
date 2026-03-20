// ============================================================================
// Express App Factory — PulseOps V2 API
//
// PURPOSE: Creates and configures the Express application with enterprise
// middleware chain in the MANDATORY order defined in .windsurfrules.
//
// MIDDLEWARE CHAIN (Section 2.7):
//   1. Helmet.js       → HTTP security headers (CSP, HSTS, XSS, clickjacking)
//   2. Request ID      → UUID per request for distributed tracing
//   3. Cookie Parser   → Parse HttpOnly cookies for Dual-Auth Protocol
//   4. CORS            → Whitelist-based, credentials: true
//   5. Rate Limiting   → 100 req/15min general
//   6. JSON Body Parser → 10MB limit
//   7. Input Sanitizer → Strip XSS patterns from body/query/params
//   8. Request Logging → Structured logging with request ID and duration
//   9. Swagger UI      → API Explorer (public, no auth)
//  10. Public Routes   → health, auth/login, database setup, module bundles
//  11. Auth Rate Limit → 10 req/15min on auth endpoints
//  12. Protected Routes → database destructive, modules CRUD, config
//  13. 404 Handler
//  14. Global Error Handler
//
// SECURITY:
//   - Helmet.js: CSP, HSTS, XSS, clickjacking protection
//   - Rate limiting: 100 req/15min (general), 10 req/15min (auth)
//   - JWT: Access token (24h) + Refresh token (7d)
//   - bcrypt: Password hashing with configurable rounds
//   - Input sanitization: XSS pattern stripping
//   - Request ID: UUID traceability in all logs
//   - HttpOnly cookies: Frontend session security
//
// ARCHITECTURE: Separated from server.js for testability. Returns the
// configured Express app — server.js handles binding and shutdown.
// ============================================================================
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { config } from '#config';
import { logger } from '#shared/logger.js';
import { loadJson, errors } from '#shared/loadJson.js';
import apiUrls from '#config/urls.json' with { type: 'json' };

// Security middleware
import {
  helmetMiddleware,
  generalRateLimiter,
  authRateLimiter,
  requestIdMiddleware,
  inputSanitizer,
  requestLogger,
} from '#core/middleware/security.js';

// Auth middleware
import { authenticate } from '#core/middleware/auth.js';

// Routes
import healthRoutes from '#core/routes/healthRoutes.js';
import authRoutes from '#core/routes/authRoutes.js';
import superAdminRoutes from '#core/routes/superAdminRoutes.js';
import databaseRoutes from '#core/routes/databaseRoutes.js';
import configRoutes from '#core/routes/configRoutes.js';
import logRoutes from '#core/routes/logRoutes.js';
import generalSettingsRoutes from '#core/routes/generalSettingsRoutes.js';
import timezoneRoutes from '#core/routes/timezoneRoutes.js';
import modulesRoutes from '#core/routes/modulesRoutes.js';
import { rehydrateEnabledModules } from '#core/modules/dynamicRouteLoader.js';
import moduleGateway from '#core/modules/moduleGateway.js';

// Swagger spec
const swaggerSpec = loadJson('swagger.json');

export function createApp() {
  const app = express();
  const prefix = apiUrls.apiPrefix;

  // ── 1. Helmet.js: HTTP Security Headers ─────────────────────────────────
  app.use(helmetMiddleware);

  // ── 2. Request ID: UUID per request ─────────────────────────────────────
  app.use(requestIdMiddleware);

  // ── 3. Cookie Parser ────────────────────────────────────────────────────
  app.use(cookieParser());

  // ── 4. CORS: Whitelist-based with credentials ──────────────────────────
  app.use(cors({
    ...config.cors,
    credentials: true,
  }));

  // ── 5. General Rate Limiter ─────────────────────────────────────────────
  app.use(generalRateLimiter);

  // ── 6. JSON Body Parser (10MB limit) ────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));

  // ── 7. Input Sanitizer ──────────────────────────────────────────────────
  app.use(inputSanitizer);

  // ── 8. Request Logging ──────────────────────────────────────────────────
  app.use(requestLogger);

  // ── 9. Swagger API Explorer (public) ────────────────────────────────────
  app.use(apiUrls.swagger.ui, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'PulseOps V2 API Explorer',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
    },
  }));
  app.get(apiUrls.swagger.json, (_req, res) => res.json(swaggerSpec));

  // ── 10. Public Routes (no auth required) ────────────────────────────────
  app.use(`${prefix}${apiUrls.health.base}`, healthRoutes);
  app.use(`${prefix}${apiUrls.auth.base}`, authRateLimiter, authRoutes);
  // SuperAdmin routes share the /auth prefix but have their own router
  app.use(`${prefix}${apiUrls.superAdmin.base}`, authRateLimiter, superAdminRoutes);
  app.use(`${prefix}${apiUrls.database.base}`, databaseRoutes);
  app.use(`${prefix}${apiUrls.logs.base}`, logRoutes);
  app.use(`${prefix}${apiUrls.settings.base}`, generalSettingsRoutes);
  // Timezone — GET is public (modules fetch timezone without auth), POST is protected
  app.use(`${prefix}/timezone`, timezoneRoutes);
  // Modules route — public list endpoint + protected enable/disable
  app.use(`${prefix}${apiUrls.modules.base}`, modulesRoutes);
  // ── Dynamic Module Gateway ─────────────────────────────────────────────
  // All dynamic module routes (e.g. /api/servicenow/*) are mounted onto
  // moduleGateway at runtime by dynamicRouteLoader. This MUST sit before
  // the 404 handler so dynamically added routes are reachable.
  app.use(moduleGateway);

  // ── 11. Protected Routes (JWT required) ─────────────────────────────────
  app.use(`${prefix}${apiUrls.systemConfig.base}`, authenticate, configRoutes);

  // ── 12. 404 Handler ─────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { message: `${errors.errors.routeNotFound}: ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' },
    });
  });

  // ── 13. Global Error Handler ────────────────────────────────────────────
  app.use((err, req, res, _next) => {
    logger.error(errors.errors.internalServerError, {
      error: err.message,
      stack: err.stack,
      requestId: req.requestId,
    });
    res.status(500).json({
      success: false,
      error: {
        message: errors.errors.internalServerError,
        requestId: req.requestId,
      },
    });
  });

  return app;
}

/**
 * Initialize the app and rehydrate enabled modules.
 * Called from server.js after createApp().
 * @param {import('express').Express} app
 * @returns {Promise<void>}
 */
export async function initializeModules(app) {
  await rehydrateEnabledModules(app);
}
