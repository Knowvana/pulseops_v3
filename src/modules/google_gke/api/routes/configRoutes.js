// ============================================================================
// Google GKE Module — Configuration Routes
//
// PURPOSE: Express routes for module configuration endpoints. These routes
// handle HTTP requests from the frontend and manage cluster connection settings,
// poller configuration, alert thresholds, and general settings.
//
// ENDPOINTS:
//   GET  /config              → Load current config (credentials redacted)
//   PUT  /config              → Save cluster + poller + alert settings
//   POST /config/test         → Test connectivity to GKE cluster
//
// MOUNT: router.use('/', configRoutes)  (in index.js)
//   - Success messages come from APIMessages.json (never hardcoded)
//   - All logging via createGkeLogger (module-scoped Winston logger)
//
// HOW TO ADD A NEW CONFIG ENDPOINT:
//   1. Add the route path to api/config/urls.json
//   2. Add error messages to api/config/APIErrors.json
//   3. Add success messages to api/config/APIMessages.json
//   4. Add default values in helpers.js (e.g., NEW_CONFIG_DEFAULTS)
//   5. Add the loader function in helpers.js (e.g., loadNewConfig)
//   6. Add the GET/PUT route handlers below
//   7. Add the UI config tab in ui/components/settings/
//
// PATTERN SOURCE: Identical to HealthCheck module's routes/configRoutes.js
// ============================================================================
import { Router } from 'express';
import {
  loadClusterConfigFile, saveClusterConfigFile,
  loadPollerConfig, loadAlertConfig, saveModuleConfig,
} from './helpers.js';
import { createGkeLogger } from '../lib/moduleLogger.js';
import { testConnection } from '../lib/KubernetesClient.js';
import { encryptToken, decryptToken, isEncrypted } from '../lib/credentialEncryption.js';

const log = createGkeLogger('configRoutes');
const router = Router();

// ── GET /config — Load current config (credentials redacted) ────────────────
router.get('/config', async (req, res) => {
  try {
    const clusterConfig = loadClusterConfigFile();
    const pollerConfig = await loadPollerConfig();
    const alertConfig = await loadAlertConfig();

    log.info('Config loaded', { isConfigured: clusterConfig.connectionStatus?.isConfigured });

    // SECURITY: Never return serviceAccountToken to frontend
    // Token is stored server-side only and used for test connection
    const sanitizedClusterConfig = {
      ...clusterConfig,
      connection: {
        ...clusterConfig.connection,
        serviceAccountToken: '', // Always empty - never expose to frontend
        hasToken: !!clusterConfig.connection?.serviceAccountToken,
      },
    };

    return res.json({
      success: true,
      data: {
        cluster: sanitizedClusterConfig,
        poller: pollerConfig,
        alerts: alertConfig,
      },
    });
  } catch (err) {
    log.error('Failed to load config', { error: err.message });
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to load configuration' },
    });
  }
});

// ── PUT /config — Save cluster + poller + alert settings ────────────────────
router.put('/config', async (req, res) => {
  try {
    const { cluster, poller, alerts } = req.body;
    log.debug('PUT /config — saving configuration', {
      hasCluster: !!cluster,
      hasPoller: !!poller,
      hasAlerts: !!alerts,
    });

    // Save cluster config to file
    if (cluster) {
      // Encrypt the service account token before saving to disk
      if (cluster.connection?.serviceAccountToken) {
        const rawToken = cluster.connection.serviceAccountToken;
        if (!isEncrypted(rawToken)) {
          log.debug('Encrypting service account token before save');
          cluster.connection.serviceAccountToken = encryptToken(rawToken);
        }
      }
      log.debug('Saving cluster config to file', { apiServerUrl: cluster.connection?.apiServerUrl });
      saveClusterConfigFile(cluster);
    }

    // Save poller config to DB
    if (poller) {
      log.debug('Saving poller config to DB');
      await saveModuleConfig('poller', poller, 'Poller configuration');
    }

    // Save alert config to DB
    if (alerts) {
      log.debug('Saving alert config to DB');
      await saveModuleConfig('alerts', alerts, 'Alert thresholds');
    }

    log.info('Configuration saved successfully');

    return res.json({
      success: true,
      message: 'Configuration saved successfully',
    });
  } catch (err) {
    log.error('Failed to save config', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to save configuration' },
    });
  }
});

// ── POST /config/test — Test cluster connectivity ──────────────────────────
router.post('/config/test', async (req, res) => {
  try {
    log.info('POST /config/test — testing cluster connectivity');

    // Load current config to pass to testConnection
    const current = loadClusterConfigFile();
    const connectionConfig = { ...current.connection };

    // Decrypt token if it was stored encrypted
    if (connectionConfig.serviceAccountToken && isEncrypted(connectionConfig.serviceAccountToken)) {
      log.debug('Decrypting stored token for connection test');
      connectionConfig.serviceAccountToken = decryptToken(connectionConfig.serviceAccountToken);
    }

    log.debug('Connection config loaded', {
      apiServerUrl: connectionConfig?.apiServerUrl,
      hasToken: !!connectionConfig?.serviceAccountToken,
      clusterName: connectionConfig?.clusterName,
    });

    // Test connectivity using KubernetesClient with explicit config
    const testResult = await testConnection(connectionConfig);

    if (!testResult.success) {
      log.warn('Connection test returned failure', { error: testResult.error });
      // Update last tested timestamp with failure
      current.connectionStatus.lastTested = new Date().toISOString();
      current.connectionStatus.testStatus = 'failed';
      saveClusterConfigFile(current);

      return res.status(502).json({
        success: false,
        error: { message: `Failed to connect to cluster: ${testResult.error}` },
      });
    }

    // Update last tested timestamp and cluster info
    current.connectionStatus.lastTested = new Date().toISOString();
    current.connectionStatus.testStatus = 'success';
    current.connectionStatus.isConfigured = true;
    current.connectionStatus.clusterInfo = {
      name: testResult.clusterName,
      version: testResult.serverVersion,
      platform: testResult.platform,
      nodeCount: testResult.nodeCount,
      nodesReady: testResult.nodesReady,
      namespaceCount: testResult.namespaceCount,
      podCount: testResult.podCount,
      podsRunning: testResult.podsRunning,
    };
    saveClusterConfigFile(current);

    log.info('Cluster test passed', {
      clusterName: testResult.clusterName,
      serverVersion: testResult.serverVersion,
      nodeCount: testResult.nodeCount,
    });

    return res.json({
      success: true,
      data: {
        success: true,
        testedAt: current.connectionStatus.lastTested,
        clusterInfo: {
          clusterName: testResult.clusterName,
          serverVersion: testResult.serverVersion,
          platform: testResult.platform,
          apiServerUrl: testResult.apiServerUrl,
          nodeCount: testResult.nodeCount,
          nodesReady: testResult.nodesReady,
          namespaceCount: testResult.namespaceCount,
          podCount: testResult.podCount,
          podsRunning: testResult.podsRunning,
        },
      },
    });
  } catch (err) {
    log.error('Cluster test threw exception', {
      error: err.message,
      stack: err.stack,
      statusCode: err.statusCode || err.response?.statusCode,
    });

    // Update last tested timestamp with failure
    try {
      const current = loadClusterConfigFile();
      current.connectionStatus.lastTested = new Date().toISOString();
      current.connectionStatus.testStatus = 'failed';
      saveClusterConfigFile(current);
    } catch (saveErr) {
      log.error('Failed to save test failure status', { error: saveErr.message });
    }

    return res.status(502).json({
      success: false,
      error: { message: `Failed to connect to cluster: ${err.message}` },
    });
  }
});

export default router;
