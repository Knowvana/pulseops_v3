// ============================================================================
// ModuleConfigService.js — Accessio Operations Module Configuration Service
//
// PURPOSE: Read the cluster configuration file
//
// Import via: #modules/accessio_ops/api/services/ModuleConfigService.js
// ============================================================================
import fs from 'fs/promises';
import path from 'path';
import { createAoLogger } from '../lib/moduleLogger.js';

const log = createAoLogger('ModuleConfigService');

// Cluster config file path
const CLUSTER_CONFIG_PATH = path.resolve(process.cwd(), 'src/modules/accessio_ops/api/config/ClusterConfig.json');

/**
 * Read the cluster configuration file
 * @returns {Promise<object>} - Cluster configuration data
 */
export async function getConfigFile() {
  log.debug('Starting cluster config file read operation', {
    operation: 'GET_CONFIG_START',
    filePath: CLUSTER_CONFIG_PATH
  });

  try {
    // Check if file exists first
    try {
      await fs.access(CLUSTER_CONFIG_PATH);
      log.debug('Config file exists, proceeding to read', {
        filePath: CLUSTER_CONFIG_PATH
      });
    } catch (accessErr) {
      const error = new Error(`Configuration file not found: ${CLUSTER_CONFIG_PATH}`);
      error.code = 'ENOENT';
      error.filePath = CLUSTER_CONFIG_PATH;
      log.error('Config file does not exist', {
        filePath: CLUSTER_CONFIG_PATH,
        errorCode: 'ENOENT'
      });
      throw error;
    }

    // Read file content
    const rawContent = await fs.readFile(CLUSTER_CONFIG_PATH, 'utf8');
    log.debug('Cluster config file read successfully', {
      contentLength: rawContent.length,
      filePath: CLUSTER_CONFIG_PATH,
      operation: 'GET_CONFIG_FILE_READ'
    });

    // Parse JSON content
    const configData = JSON.parse(rawContent);
    log.info('Cluster config loaded', {
      dataKeys: Object.keys(configData),
      filePath: CLUSTER_CONFIG_PATH
    });

    return configData;

  } catch (err) {
    // Don't double-log the ENOENT error we already handled
    if (err.code !== 'ENOENT') {
      log.error('Failed to read cluster config file', {
        error: err.message,
        stack: err.stack,
        filePath: CLUSTER_CONFIG_PATH,
        operation: 'GET_CONFIG_FAILED',
        errorCode: err.code,
        errno: err.errno
      });
    }
    throw err;
  }
}

/**
 * Save the cluster configuration file
 * @param {object} configData - Configuration data to save
 * @returns {Promise<object>} - Saved configuration data
 */
export async function saveConfigFile(configData) {
  log.debug('Starting cluster config save operation', {
    operation: 'PUT_CONFIG_START',
    filePath: CLUSTER_CONFIG_PATH,
    hasData: !!configData,
    dataKeys: configData ? Object.keys(configData) : [],
    dataType: typeof configData
  });

  try {
    if (!configData) {
      const error = new Error('Configuration data is required');
      log.error('Save failed: No configuration data provided', {
        error: error.message,
        filePath: CLUSTER_CONFIG_PATH,
        receivedData: configData
      });
      throw error;
    }

    // Ensure directory exists
    const dirPath = path.dirname(CLUSTER_CONFIG_PATH);
    try {
      await fs.access(dirPath);
      log.debug('Config directory exists', { dirPath });
    } catch (dirErr) {
      log.debug('Config directory does not exist, creating it', { dirPath });
      try {
        await fs.mkdir(dirPath, { recursive: true });
        log.debug('Config directory created', { dirPath });
      } catch (mkdirErr) {
        const error = new Error(`Failed to create config directory: ${dirPath}`);
        error.code = 'EACCES';
        error.originalError = mkdirErr;
        log.error('Failed to create config directory', {
          dirPath,
          error: mkdirErr.message,
          errorCode: mkdirErr.code
        });
        throw error;
      }
    }

    // Convert to JSON string
    const configString = JSON.stringify(configData, null, 2);
    log.debug('Configuration serialized to JSON', {
      stringLength: configString.length,
      filePath: CLUSTER_CONFIG_PATH
    });
    
    // Write to file
    try {
      await fs.writeFile(CLUSTER_CONFIG_PATH, configString, 'utf8');
      log.debug('File written successfully', {
        filePath: CLUSTER_CONFIG_PATH,
        bytesWritten: configString.length
      });
    } catch (writeErr) {
      const error = new Error(`Failed to write config file: ${CLUSTER_CONFIG_PATH}`);
      error.code = writeErr.code || 'EACCES';
      error.originalError = writeErr;
      log.error('Failed to write config file', {
        filePath: CLUSTER_CONFIG_PATH,
        error: writeErr.message,
        errorCode: writeErr.code,
        errno: writeErr.errno
      });
      throw error;
    }

    // Verify file was written by reading it back
    const verifyContent = await fs.readFile(CLUSTER_CONFIG_PATH, 'utf8');
    const verifyConfig = JSON.parse(verifyContent);
    
    // Compare the written content with what we expected
    const expectedContent = configString;
    const actualContent = verifyContent;
    const contentMatches = expectedContent === actualContent;
    
    log.debug('File verification details', {
      filePath: CLUSTER_CONFIG_PATH,
      verifiedKeys: Object.keys(verifyConfig),
      verificationMatches: contentMatches,
      expectedLength: expectedContent.length,
      actualLength: actualContent.length,
      expectedStart: expectedContent.substring(0, 100),
      actualStart: actualContent.substring(0, 100),
      expectedEnd: expectedContent.substring(-100),
      actualEnd: actualContent.substring(-100)
    });
    
    if (!contentMatches) {
      log.error('File verification failed - content mismatch', {
        filePath: CLUSTER_CONFIG_PATH,
        expectedContent,
        actualContent
      });
      throw new Error(`File verification failed: written content does not match expected content`);
    }
    
    log.info('Cluster config saved', {
      filePath: CLUSTER_CONFIG_PATH,
      dataKeys: Object.keys(configData)
    });

    return configData;

  } catch (err) {
    log.error('Failed to save cluster config file', {
      error: err.message,
      stack: err.stack,
      filePath: CLUSTER_CONFIG_PATH,
      operation: 'PUT_CONFIG_FAILED',
      errorCode: err.code,
      errno: err.errno,
      dataKeys: configData ? Object.keys(configData) : null
    });
    throw err;
  }
}
