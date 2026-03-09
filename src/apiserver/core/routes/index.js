// ============================================================================
// Route Registration — PulseOps V2 API
//
// PURPOSE: Central route registration point. Mounts all public and
// protected routes in the correct order per Section 2.7.
//
// ARCHITECTURE:
//   - Public routes: health, auth/login, module bundles
//   - Protected routes: database, modules CRUD, config, users
// ============================================================================

/**
 * Register all API routes on the Express app.
 * @param {import('express').Application} app
 */
export function registerRoutes(app) {
  // --- Public Routes (No Auth Required) ---

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
      },
    });
  });

  // Readiness probe (K8s)
  app.get('/api/health/readiness', (_req, res) => {
    // TODO: Check database connectivity
    res.json({
      success: true,
      data: { status: 'ready' },
    });
  });

  // --- Protected Routes (JWT Required) ---
  // TODO: Mount auth, database, module, config routes
  // app.use('/api/auth', authRoutes);
  // app.use('/api/database', authenticate, databaseRoutes);
  // app.use('/api/modules', authenticate, moduleRoutes);
  // app.use('/api/config', authenticate, configRoutes);
}
