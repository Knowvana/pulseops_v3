// ============================================================================
// ModuleConfigService.js — Accessio Operations Module Configuration Service
//
// PURPOSE: Read the cluster configuration file
//
// Import via: #modules/accessio_ops/api/services/ModuleConfigService.js
// ============================================================================
import fs from 'fs/promises';
import path from 'path';
import { createAoLogger } from '#modules/accessio_ops/api/lib/moduleLogger.js';

const log = createAoLogger('ModuleConfigService');

// Cluster config file path
const CLUSTER_CONFIG_PATH = path.resolve(process.cwd(), 'src/modules/accessio_ops/api/config/clusterconfig.json');

/**
 * Read the cluster configuration file
 * @returns {Promise<object>} - Cluster configuration data
 */
export async function getConfigFile() {
  log.info('Starting cluster config file read operation', {
    operation: 'GET_CONFIG_START'
  });

  try {
    // Read file content
    const rawContent = await fs.readFile(CLUSTER_CONFIG_PATH, 'utf8');
    log.debug('Cluster config file read successfully', {
      contentLength: rawContent.length,
      operation: 'GET_CONFIG_FILE_READ'
    });

    // Parse JSON content
    const configData = JSON.parse(rawContent);
    log.info('Cluster config file retrieved successfully', {
      dataKeys: Object.keys(configData),
      operation: 'GET_CONFIG_COMPLETE'
    });

    return configData;

  } catch (err) {
    log.error('Cluster config file read operation failed', {
      error: err.message,
      stack: err.stack,
      operation: 'GET_CONFIG_FAILED'
    });
    throw err;
  }
}
