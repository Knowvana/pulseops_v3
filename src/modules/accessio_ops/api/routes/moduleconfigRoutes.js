// ============================================================================
// moduleConfigRoutes.js — Accessio Operations Module Configuration Routes
//
// PURPOSE: REST API endpoints for module configuration management.
// Implements strict REST patterns with proper HTTP methods and status codes.
//
// ENDPOINTS:
//   - GET /api/accessio_ops/config - Get cluster config file
//
// Import via: #modules/accessio_ops/api/routes/moduleConfigRoutes.js
// ============================================================================
import { Router } from 'express';
import { getConfigFile } from '../services/ModuleConfigService.js';
import { createAoLogger } from '../lib/moduleLogger.js';

const log = createAoLogger('moduleConfigRoutes.js');
const router = Router();

// ── GET /config ─────────────────────────────────────────────────────────────
/**
 * Get the cluster configuration file
 * REST: GET individual resource endpoint
 */
router.get('/config', async function getModuleConfig(req, res) {
  const startTime = Date.now();

  try {
    log.info('Starting cluster config read operation', {
      operation: 'GET_CONFIG_START'
    });

    log.debug('Fetching cluster configuration file', {
      operation: 'GET_FILE_START'
    });

    // Get the configuration file
    const configData = await getConfigFile();

    const response = {
      success: true,
      data: {
        config: configData,
        metadata: {
          lastRead: new Date().toISOString()
        }
      }
    };

    log.info('Cluster configuration retrieved successfully', {
      dataKeys: Object.keys(configData),
      operation: 'GET_FILE_COMPLETE'
    });

    res.status(200).json(response);

  } catch (err) {
    log.error('Failed to retrieve cluster configuration', {
      error: err.message,
      stack: err.stack,
      operation: 'GET_FILE_FAILED'
    });

    const errorResponse = {
      success: false,
      error: {
        code: 'CONFIG_FILE_READ_FAILED',
        message: 'Failed to read cluster configuration file',
        details: err.message
      }
    };

    // Determine appropriate status code based on error
    let statusCode = 500;
    if (err.message.includes('not found') || err.message.includes('ENOENT')) {
      statusCode = 404;
      errorResponse.error.code = 'CONFIG_FILE_NOT_FOUND';
    } else if (err.message.includes('Invalid JSON') || err.message.includes('parse')) {
      statusCode = 422;
      errorResponse.error.code = 'CONFIG_FILE_INVALID_JSON';
    }

    res.status(statusCode).json(errorResponse);
  }
});

export default router;
