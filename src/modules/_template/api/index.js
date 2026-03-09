// ============================================================================
// Module API Template — PulseOps V3
//
// PURPOSE: Template for module API routes. Copy this directory and customize.
// Exports an Express Router and optional lifecycle hooks (onEnable/onDisable).
//
// ARCHITECTURE:
//   - Router is mounted on /api/<moduleId>/* via moduleGateway
//   - All routes here are relative (e.g., '/config' → /api/<moduleId>/config)
//   - onEnable() is called when the module is enabled
//   - onDisable() is called when the module is disabled
//
// DEPENDENCIES:
//   - express (from root node_modules)
// ============================================================================

import { Router } from 'express';

const router = Router();

// ── Example route: GET /api/<moduleId>/status ────────────────────────────────
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      message: 'Module API is running.',
    },
  });
});

// ── Example route: GET /api/<moduleId>/config ────────────────────────────────
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      configured: false,
      message: 'Module configuration endpoint — customize this.',
    },
  });
});

// ── Lifecycle hooks ──────────────────────────────────────────────────────────

/**
 * Called when the module is enabled via Module Manager.
 * Use this to initialize connections, start timers, etc.
 */
export async function onEnable() {
  console.log('[_template] Module enabled');
}

/**
 * Called when the module is disabled via Module Manager.
 * Use this to clean up connections, stop timers, etc.
 */
export async function onDisable() {
  console.log('[_template] Module disabled');
}

export default router;
