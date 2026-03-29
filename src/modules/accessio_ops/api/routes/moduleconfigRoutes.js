// ============================================================================
// moduleConfigRoutes.js — Accessio Operations Module Configuration Routes
//
// PURPOSE: REST API endpoints for module configuration management.
// Implements strict REST patterns with proper HTTP methods and status codes.
//
// ENDPOINTS:
//   - GET /api/accessio_ops/config - Get cluster config file
//   - PUT /api/accessio_ops/config - Save cluster config file
//
// Import via: #modules/accessio_ops/api/routes/moduleConfigRoutes.js
// ============================================================================
import { Router } from 'express';
import { getConfigFile, saveConfigFile } from '../services/ModuleConfigService.js';
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
    log.debug('GET /config request received', {
      requestId: req.id || 'unknown',
      startTime
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

    log.debug('GET /config completed successfully', {
      requestId: req.id || 'unknown',
      duration: Date.now() - startTime,
      dataKeys: Object.keys(configData)
    });

    res.status(200).json(response);

  } catch (err) {
    log.error('GET /config failed', {
      requestId: req.id || 'unknown',
      error: err.message,
      stack: err.stack,
      duration: Date.now() - startTime
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

// ── PUT /config ─────────────────────────────────────────────────────────────
/**
 * Save the cluster configuration file
 * REST: PUT individual resource endpoint
 */
router.put('/config', async function saveModuleConfig(req, res) {
  const startTime = Date.now();

  try {
    const configData = req.body;
    
    log.info('PUT /config request received', {
      requestId: req.id || 'unknown',
      startTime,
      hasData: !!configData,
      dataKeys: configData ? Object.keys(configData) : [],
      contentType: req.get('Content-Type'),
      bodyPreview: configData ? JSON.stringify(configData).substring(0, 200) + '...' : 'null'
    });

    if (!configData) {
      const errorResponse = {
        success: false,
        error: {
          code: 'INVALID_REQUEST_BODY',
          message: 'Request body is required',
          details: 'Configuration data must be provided in the request body'
        }
      };
      log.warn('PUT /config rejected: No request body', {
        requestId: req.id || 'unknown',
        duration: Date.now() - startTime
      });
      return res.status(400).json(errorResponse);
    }

    log.debug('Attempting to save configuration', {
      requestId: req.id || 'unknown',
      configStructure: {
        hasConnection: !!configData.connection,
        hasConnectionStatus: !!configData.connectionStatus,
        hasMeta: !!configData._meta,
        connectionKeys: configData.connection ? Object.keys(configData.connection) : [],
        statusKeys: configData.connectionStatus ? Object.keys(configData.connectionStatus) : []
      }
    });

    // Save the configuration file
    const savedConfig = await saveConfigFile(configData);

    const response = {
      success: true,
      data: {
        config: savedConfig,
        metadata: {
          lastSaved: new Date().toISOString()
        }
      },
      message: 'Cluster configuration saved successfully'
    };

    log.info('PUT /config completed successfully', {
      requestId: req.id || 'unknown',
      duration: Date.now() - startTime,
      dataKeys: Object.keys(savedConfig),
      savedConnectionKeys: savedConfig.connection ? Object.keys(savedConfig.connection) : [],
      savedStatusKeys: savedConfig.connectionStatus ? Object.keys(savedConfig.connectionStatus) : []
    });

    res.status(200).json(response);

  } catch (err) {
    log.error('PUT /config failed', {
      requestId: req.id || 'unknown',
      error: err.message,
      stack: err.stack,
      duration: Date.now() - startTime
    });

    const errorResponse = {
      success: false,
      error: {
        code: 'CONFIG_FILE_SAVE_FAILED',
        message: 'Failed to save cluster configuration file',
        details: err.message
      }
    };

    // Determine appropriate status code based on error
    let statusCode = 500;
    if (err.message.includes('permission denied') || err.message.includes('EACCES')) {
      statusCode = 403;
      errorResponse.error.code = 'CONFIG_FILE_PERMISSION_DENIED';
    } else if (err.message.includes('ENOENT') || err.message.includes('directory not found')) {
      statusCode = 404;
      errorResponse.error.code = 'CONFIG_DIRECTORY_NOT_FOUND';
    }

    res.status(statusCode).json(errorResponse);
  }
});

export default router;
