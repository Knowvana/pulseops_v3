// ============================================================================
// Server Entry Point — PulseOps V2 API
//
// PURPOSE: Bootstraps the Express application and starts the HTTP server.
// Implements graceful shutdown for Kubernetes readiness.
//
// ARCHITECTURE: Imports the Express app factory, binds to the configured
// port, and handles SIGTERM/SIGINT for zero-downtime deployments.
// On shutdown, closes the HTTP server and database pool gracefully.
//
// ENDPOINTS AVAILABLE AFTER START:
//   - Health:  http://localhost:{port}/api/health
//   - Swagger: http://localhost:{port}/swagger-ui
//   - API:     http://localhost:{port}/api/*
// ============================================================================
import { createApp, initializeModules } from '#root/app.js';
import { config } from '#config';
import { logger } from '#shared/logger.js';
import { messages } from '#shared/loadJson.js';
import DatabaseService from '#core/database/databaseService.js';
import apiUrls from '#config/urls.json' with { type: 'json' };
import packageJson from '#apiRoot/package.json' with { type: 'json' };
const app = createApp();
const PORT = config.port;

const server = app.listen(PORT, async () => {
  logger.info(messages.success.serverStarted);
  logger.info(`Version: ${packageJson.version}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Health:  http://localhost:${PORT}${apiUrls.apiPrefix}${apiUrls.health.base}`);
  logger.info(`Swagger: http://localhost:${PORT}${apiUrls.swagger.ui}`);

  // Rehydrate enabled module routes (K8s safe — survives pod restarts)
  await initializeModules(app);
});

// --- Graceful Shutdown (K8s Ready) ---
const shutdown = async (signal) => {
  logger.info(`${signal} received. ${messages.success.serverShutdown}`);
  server.close(async () => {
    await DatabaseService.shutdown();
    logger.info(messages.success.databasePoolClosed);
    process.exit(0);
  });
  // Force exit after 10s if connections aren't closing
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
