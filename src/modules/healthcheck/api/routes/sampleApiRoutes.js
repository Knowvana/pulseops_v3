// ============================================================================
// HealthCheck Module — Sample Authenticated API Endpoints
//
// PURPOSE: Provides 2 sample API endpoints that require Basic Auth credentials
// for health check monitoring. These serve as built-in test targets to
// demonstrate the API health check functionality.
//
// ENDPOINTS:
//   GET  /sample-api/status    → Returns system status JSON (requires Basic Auth)
//   POST /sample-api/heartbeat → Accepts heartbeat POST and returns health (requires Basic Auth)
//
// CREDENTIALS: username: "pulseops_api" / password: "healthcheck_secret_2024"
//
// USED BY: DefaultData.json seeds these as monitored applications under "Source Interfaces"
// ============================================================================
import { Router } from 'express';
import { createHcLogger } from '../lib/moduleLogger.js';

const log = createHcLogger('sampleApiRoutes.js');
const router = Router();

// ── Sample API credentials ─────────────────────────────────────────────────────
const SAMPLE_API_USERNAME = 'pulseops_api';
const SAMPLE_API_PASSWORD = 'healthcheck_secret_2024';

// ── Basic Auth middleware for sample APIs ───────────────────────────────────────
function requireBasicAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  log.debug('Sample API auth check', { path: req.path, hasAuthHeader: !!authHeader, authType: authHeader ? authHeader.split(' ')[0] : 'none' });

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    log.warn('Sample API auth missing or wrong type', { path: req.path, authHeader: authHeader ? authHeader.substring(0, 20) + '...' : 'none' });
    res.setHeader('WWW-Authenticate', 'Basic realm="PulseOps Sample API"');
    return res.status(401).json({
      success: false,
      error: { message: 'Authentication required. Provide Basic Auth credentials.' },
    });
  }

  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [username, password] = credentials.split(':');

    if (username === SAMPLE_API_USERNAME && password === SAMPLE_API_PASSWORD) {
      req.apiUser = username;
      log.info('Sample API auth success', { path: req.path, username });
      return next();
    }

    log.warn('Sample API invalid credentials', { path: req.path, username });
    return res.status(403).json({
      success: false,
      error: { message: 'Invalid credentials. Access denied.' },
    });
  } catch (err) {
    log.error('Sample API malformed auth header', { path: req.path, error: err.message });
    return res.status(401).json({
      success: false,
      error: { message: 'Malformed Authorization header.' },
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SAMPLE API 1: GET /sample-api/status — System Status (Basic Auth, GET)
// ═════════════════════════════════════════════════════════════════════════════
router.get('/sample-api/status', requireBasicAuth, (req, res) => {
  log.debug('Sample API /status called', { user: req.apiUser });

  res.json({
    success: true,
    data: {
      service: 'PulseOps Sample Interface API',
      status: 'operational',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: 'development',
      checks: {
        database: 'connected',
        cache: 'available',
        queue: 'healthy',
      },
    },
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SAMPLE API 2: POST /sample-api/heartbeat — Heartbeat Check (Basic Auth, POST)
// ═════════════════════════════════════════════════════════════════════════════
router.post('/sample-api/heartbeat', requireBasicAuth, (req, res) => {
  log.debug('Sample API /heartbeat called', { user: req.apiUser, body: req.body });

  res.json({
    success: true,
    data: {
      service: 'PulseOps Heartbeat Service',
      status: 'alive',
      received: req.body || {},
      respondedAt: new Date().toISOString(),
      metrics: {
        memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
      },
    },
  });
});

export default router;
