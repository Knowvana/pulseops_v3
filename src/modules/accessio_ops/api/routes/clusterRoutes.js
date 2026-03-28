import { Router } from 'express';
import { loadClusterConfigFile, saveClusterConfigFile } from './helpers.js';
import { testConnection } from '../lib/KubernetesClient.js';
import { createAoLogger } from '../lib/moduleLogger.js';

const log = createAoLogger('clusterRoutes.js');
const router = Router();

// ── GET /cluster — Get cluster configuration ───────────────────────────────
router.get('/cluster', async (req, res) => {
  try {
    const config = loadClusterConfigFile();
    log.debug('Cluster config loaded');
    
    // SECURITY: Never return serviceAccountToken to frontend
    // Token is stored server-side only and used for test connection
    const responseData = {
      apiServerUrl: config.connection?.apiServerUrl || '',
      serviceAccountToken: '', // Always empty - never expose to frontend
      projectId: config.connection?.projectId || '',
      region: config.connection?.region || '',
      clusterName: config.connection?.clusterName || '',
      connectionStatus: config.connectionStatus || 'not_connected',
      lastTestedAt: config.lastTestedAt || null,
      hasToken: !!config.connection?.serviceAccountToken, // Flag to indicate token exists
    };
    
    res.json({
      success: true,
      data: responseData
    });
  } catch (err) {
    log.error('Failed to load cluster config', { message: err.message });
    res.status(500).json({
      success: false,
      error: { message: err.message }
    });
  }
});

// ── PUT /cluster — Update cluster configuration ────────────────────────────
router.put('/cluster', async (req, res) => {
  try {
    const configData = req.body;
    
    log.info('PUT /cluster — saving cluster configuration', {
      apiServerUrl: configData.apiServerUrl,
      projectId: configData.projectId,
      clusterName: configData.clusterName,
      hasTokenInRequest: !!configData.serviceAccountToken
    });
    
    // Load existing config to preserve token if not provided
    const existingConfig = loadClusterConfigFile();
    
    log.info('Existing config loaded', {
      hasExistingConfig: !!existingConfig,
      hasExistingToken: !!existingConfig.connection?.serviceAccountToken
    });
    
    // Validate required fields (VB.NET style validation)
    if (!configData?.apiServerUrl || !configData?.projectId || !configData?.clusterName) {
      return res.status(400).json({
        success: false,
        error: { message: 'Required fields missing: apiServerUrl, projectId, and clusterName' }
      });
    }

    // Create config object in expected format
    const config = {
      connection: {
        apiServerUrl: configData.apiServerUrl,
        serviceAccountToken: configData.serviceAccountToken || existingConfig.connection?.serviceAccountToken || '',
        projectId: configData.projectId,
        region: configData.region,
        clusterName: configData.clusterName,
      },
      connectionStatus: configData.connectionStatus || 'not_tested',
      lastTestedAt: configData.lastTestedAt || null,
    };

    // Save to file
    saveClusterConfigFile(config);
    log.info('Cluster config saved', { 
      apiServerUrl: config.connection.apiServerUrl,
      projectId: config.connection.projectId,
      clusterName: config.connection.clusterName,
      hasToken: !!config.connection.serviceAccountToken
    });
    
    res.json({
      success: true,
      message: 'Configuration saved successfully',
      data: config
    });
  } catch (err) {
    log.error('Failed to save cluster config', { message: err.message });
    res.status(500).json({
      success: false,
      error: { message: err.message }
    });
  }
});

// ── POST /cluster/test — Test cluster connection ────────────────────────────
router.post('/cluster/test', async (req, res) => {
  try {
    log.info('POST /cluster/test — testing cluster connectivity');

    // Load current config from storage (like GKE pattern)
    const current = loadClusterConfigFile();
    const connectionConfig = { ...current.connection };

    // Debug logging - what did we actually load?
    log.debug('Config loaded for test', {
      hasCurrent: !!current,
      hasConnection: !!current.connection,
      apiServerUrl: connectionConfig?.apiServerUrl,
      hasToken: !!connectionConfig?.serviceAccountToken,
      tokenLength: connectionConfig?.serviceAccountToken?.length || 0,
      clusterName: connectionConfig?.clusterName
    });

    // Validate required fields (VB.NET style validation)
    if (!connectionConfig?.apiServerUrl || !connectionConfig?.serviceAccountToken) {
      log.error('Validation failed for test connection', {
        hasApiServerUrl: !!connectionConfig?.apiServerUrl,
        hasServiceAccountToken: !!connectionConfig?.serviceAccountToken,
        apiServerUrl: connectionConfig?.apiServerUrl
      });
      return res.status(400).json({
        success: false,
        error: { message: 'Cluster configuration not complete. Please save API Server URL and Service Account Token first.' }
      });
    }

    // Test connection using stored config (like GKE pattern)
    const result = await testConnection(connectionConfig);
    
    if (result.success) {
      log.info('Cluster connection test successful', { 
        namespaceCount: result.namespaceCount,
        podCount: result.podCount 
      });
      
      // Return cluster info in expected format (VB.NET style response)
      res.json({
        success: true,
        message: 'Cluster connection test successful',
        data: {
          clusterInfo: {
            platform: 'Kubernetes',
            apiServer: connectionConfig.apiServerUrl,
            nodes: result.nodeCount || 0,
            namespaces: result.namespaceCount || 0,
            pods: result.podCount || 0,
          },
          nodes: result.nodeCount || 0,
          namespaces: result.namespaceCount || 0,
          pods: result.podCount || 0,
        }
      });
    } else {
      log.error('Cluster connection test failed', { error: result.error });
      
      res.status(400).json({
        success: false,
        error: { message: `Connection test failed: ${result.error}` }
      });
    }
  } catch (err) {
    log.error('Cluster connection test error', { message: err.message });
    res.status(500).json({
      success: false,
      error: { message: err.message }
    });
  }
});

export default router;
