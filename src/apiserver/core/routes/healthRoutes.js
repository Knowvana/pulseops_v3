// ============================================================================
// Health Routes — PulseOps V2 API
//
// PURPOSE: Health check and readiness probe endpoints for K8s orchestration.
// These are PUBLIC routes — no authentication required.
//
// ENDPOINTS:
//   GET /api/health            — General health check (liveness probe)
//   GET /api/health/readiness  — Readiness probe (checks DB connectivity)
//
// ARCHITECTURE: Mounted in app.js as the first public route. K8s uses
// these endpoints to determine pod health and traffic routing.
//
// DEPENDENCIES:
//   - ../database/databaseService.js → DB connectivity check
//   - ../../shared/loadJson.js → messages from JSON
// ============================================================================
import { Router } from 'express';
import DatabaseService from '#core/database/databaseService.js';
import { messages } from '#shared/loadJson.js';

const router = Router();

// ── GET /health — Liveness Probe ────────────────────────────────────────────
router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
    },
  });
});

// ── GET /health/readiness — Readiness Probe ─────────────────────────────────
router.get('/readiness', async (_req, res) => {
  try {
    await DatabaseService.testConnection();
    res.json({
      success: true,
      data: { status: 'ready', database: 'connected' },
    });
  } catch {
    res.json({
      success: true,
      data: { status: 'degraded', database: 'disconnected' },
    });
  }
});

export default router;
