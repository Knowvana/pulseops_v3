// ============================================================================
// Cluster Routes — Accessio Operations Cluster Management REST API
//
// PURPOSE: REST API endpoints for cluster configuration, testing, and data retrieval.
// Provides separate endpoints for cluster info, namespaces, and workloads to enable
// optimal performance and flexible UI loading patterns.
//
// USED BY: Frontend UI components (Cluster dashboard, configuration panels)
// USES:
//   - ModuleConfigService.js → Cluster configuration file management
//   - KubernetesClient.js → K8s API connection testing
//   - ClusterService.js → Cluster data fetching (new separated functions)
//   - moduleLogger.js → Structured logging
//
// ENDPOINTS:
//   - GET /cluster          → Cluster configuration file data (settings panel)
//   - POST /cluster/test    → Test cluster connectivity
//   - GET /cluster/info      → Cluster metadata + nodes only (fast) - NEW
//   - GET /cluster/namespaces → Filtered namespaces (fast) - NEW
//   - GET /cluster/workloads   → Workloads/pods (medium) - NEW
//
// TODO: All new separated endpoints have been implemented above!
// ============================================================================
import { Router } from 'express';
import { getConfigFile, saveConfigFile } from '../services/ModuleConfigService.js';
import { testConnection, getK8sCoreApi } from '../lib/KubernetesClient.js';
import { createAoLogger } from '../lib/moduleLogger.js';
import { getClusterInfo, getNamespaces, getWorkloads, getWorkloadsMetrics } from '../services/ClusterService.js';
import { saveModuleConfig, loadModuleConfig } from './helpers.js';

const log = createAoLogger('clusterRoutes.js');
const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// NEW SEPARATED ENDPOINTS - Optimal performance and flexible loading
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /cluster/info — Get cluster metadata and nodes (fast) ─────────────────────
router.get('/cluster/info', async (req, res) => {
  const startTime = Date.now();
  
  try {
    log.info('GET /cluster/info request received', { startTime });

    const clusterInfo = await getClusterInfo();

    const response = {
      success: true,
      data: clusterInfo,
      metadata: {
        fetchedAt: new Date().toISOString(),
        duration: Date.now() - startTime
      }
    };

    log.info('GET /cluster/info completed successfully', {
      duration: Date.now() - startTime,
      clusterId: clusterInfo.id
    });

    res.status(200).json(response);

  } catch (err) {
    log.error('GET /cluster/info failed', {
      error: err.message,
      duration: Date.now() - startTime
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'CLUSTER_INFO_FETCH_FAILED',
        message: 'Failed to retrieve cluster information',
        details: err.message
      }
    });
  }
});

// ── GET /cluster/namespaces — Get filtered namespaces (fast) ───────────────────────
router.get('/cluster/namespaces', async (req, res) => {
  const startTime = Date.now();
  
  try {
    log.info('GET /cluster/namespaces request received', { startTime });

    const namespaces = await getNamespaces();

    const response = {
      success: true,
      data: {
        namespaces: namespaces,
        count: namespaces.length
      },
      metadata: {
        fetchedAt: new Date().toISOString(),
        duration: Date.now() - startTime
      }
    };

    log.info('GET /cluster/namespaces completed successfully', {
      duration: Date.now() - startTime,
      namespaceCount: namespaces.length
    });

    res.status(200).json(response);

  } catch (err) {
    log.error('GET /cluster/namespaces failed', {
      error: err.message,
      duration: Date.now() - startTime
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'NAMESPACES_FETCH_FAILED',
        message: 'Failed to retrieve namespaces',
        details: err.message
      }
    });
  }
});

// ── GET /cluster/workloads — Get workloads/pods (medium performance) ─────────────────
router.get('/cluster/workloads', async (req, res) => {
  const startTime = Date.now();
  
  try {
    log.info('GET /cluster/workloads request received', { startTime });

    const workloads = await getWorkloads();

    const response = {
      success: true,
      data: workloads,
      metadata: {
        fetchedAt: new Date().toISOString(),
        duration: Date.now() - startTime
      }
    };

    log.info('GET /cluster/workloads completed successfully', {
      duration: Date.now() - startTime,
      totalPods: workloads.pods.total
    });

    res.status(200).json(response);

  } catch (err) {
    log.error('GET /cluster/workloads failed', {
      error: err.message,
      duration: Date.now() - startTime
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'WORKLOADS_FETCH_FAILED',
        message: 'Failed to retrieve workloads',
        details: err.message
      }
    });
  }
});

// ── GET /cluster/metrics — Get live CPU/memory metrics for workloads ─────────────────
router.get('/cluster/metrics', async (req, res) => {
  const startTime = Date.now();
  
  try {
    log.info('GET /cluster/metrics request received', { startTime });

    const metrics = await getWorkloadsMetrics();

    const response = {
      success: true,
      data: metrics,
      metadata: {
        fetchedAt: new Date().toISOString(),
        duration: Date.now() - startTime
      }
    };

    log.info('GET /cluster/metrics completed successfully', {
      duration: Date.now() - startTime,
      workloadCount: metrics.workloads?.length || 0
    });

    res.status(200).json(response);

  } catch (err) {
    log.error('GET /cluster/metrics failed', {
      error: err.message,
      duration: Date.now() - startTime
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'METRICS_FETCH_FAILED',
        message: 'Failed to retrieve workload metrics',
        details: err.message
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION ENDPOINTS - Cluster settings and connection management
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /cluster — Get cluster configuration (settings panel) ───────────────────
router.get('/cluster', async (req, res) => {
  try {
    const config = await getConfigFile();
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

// ── POST /cluster/test — Test cluster connection ────────────────────────────
router.post('/cluster/test', async (req, res) => {
  try {
    log.info('POST /cluster/test — testing cluster connectivity');

    // Load current config from storage (like GKE pattern)
    const current = await getConfigFile();
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
      
      // Update configuration with successful test status and timestamp
      const updatedConfig = {
        ...current,
        connectionStatus: {
          isConfigured: true,
          testStatus: 'success',
          lastTested: new Date().toISOString()
        }
      };
      
      log.debug('Attempting to save updated configuration', {
        testStatus: 'success',
        lastTested: updatedConfig.connectionStatus.lastTested
      });
      
      // Save the updated configuration
      try {
        await saveConfigFile(updatedConfig);
        
        log.info('Configuration updated with successful test status', {
          testStatus: 'success',
          lastTested: updatedConfig.connectionStatus.lastTested
        });
      } catch (saveErr) {
        log.error('Failed to save configuration after successful test', {
          error: saveErr.message,
          stack: saveErr.stack,
          testStatus: 'success',
          lastTested: updatedConfig.connectionStatus.lastTested
        });
        // Don't fail the test response, just log the error
      }
      
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
      
      // Update configuration with failed test status and timestamp
      const updatedConfig = {
        ...current,
        connectionStatus: {
          isConfigured: false,
          testStatus: 'failed',
          lastTested: new Date().toISOString()
        }
      };
      
      // Save the updated configuration
      await saveConfigFile(updatedConfig);
      
      log.info('Configuration updated with failed test status', {
        testStatus: 'failed',
        lastTested: updatedConfig.connectionStatus.lastTested,
        error: result.error
      });
      
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

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER CONFIGURATION ENDPOINTS - Save/Load filter selections
// ═══════════════════════════════════════════════════════════════════════════════

// ── PUT /cluster/config/filters ────────────────────────────────────────────────
router.put('/cluster/config/filters', async (req, res) => {
  try {
    const { configKey, configValue, description } = req.body;
    
    log.debug('Saving cluster filter config', { 
      configKey, 
      description,
      clusterNamesCount: configValue?.clusterNames?.length || 0,
      namespacesCount: configValue?.namespaces?.length || 0,
      workloadsCount: configValue?.workloads?.length || 0
    });
    
    await saveModuleConfig(configKey, configValue, description);
    
    log.info('PUT cluster filter config successful', { configKey });
    
    res.json({ 
      success: true, 
      data: configValue, 
      message: 'Cluster filter configuration saved successfully' 
    });
  } catch (err) {
    log.debug('PUT cluster filter config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── GET /cluster/config/filters ────────────────────────────────────────────────
router.get('/cluster/config/filters', async (req, res) => {
  try {
    const config = await loadModuleConfig('cluster_filter_custom');
    
    log.debug('Loading cluster filter config', {
      hasConfig: !!config,
      hasClusterNames: !!config?.clusterNames,
      hasNamespaces: !!config?.namespaces,
      hasWorkloads: !!config?.workloads,
      clusterNamesCount: config?.clusterNames?.length || 0,
      namespacesCount: config?.namespaces?.length || 0,
      workloadsCount: config?.workloads?.length || 0
    });
    
    res.json({ success: true, data: config });
  } catch (err) {
    log.debug('GET cluster filter config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── GET /cluster/pods/errors ─────────────────────────────────────────────────────
router.get('/cluster/pods/errors', async (req, res) => {
  const startTime = Date.now();
  const { podName, namespace } = req.query;
  
  try {
    log.debug('GET pod errors started', { podName, namespace, startTime });
    
    // Load cluster configuration to get credentials
    const config = await getConfigFile();
    const coreApi = await getK8sCoreApi(config.connection);
    
    // If podName specified, get specific pod errors
    if (podName) {
      let targetPod = null;
      
      // If namespace provided, search in specific namespace
      if (namespace) {
        try {
          const podResponse = await coreApi.readNamespacedPod({ name: podName, namespace });
          
          // Check response structure - Kubernetes client might return pod directly or in body
          if (podResponse.body) {
            targetPod = podResponse.body;
            log.debug('Using podResponse.body for specific namespace search', { podName, namespace });
          } else if (podResponse.metadata) {
            targetPod = podResponse;
            log.debug('Using podResponse directly for specific namespace search', { podName, namespace });
          } else {
            log.error('Invalid Kubernetes API response structure for specific namespace pod search', {
              hasResponse: !!podResponse,
              hasBody: !!podResponse.body,
              hasMetadata: !!podResponse.metadata,
              responseBody: podResponse.body,
              responseMetadata: podResponse.metadata
            });
            return res.status(500).json({
              success: false,
              error: { message: 'Invalid response structure from Kubernetes API - no pod data found' }
            });
          }
        } catch (err) {
          log.debug('Pod not found in specific namespace', { podName, namespace, error: err.message });
        }
      } else {
        // Search across all namespaces
        const podsResponse = await coreApi.listPodForAllNamespaces();
        
        // Check response structure - Kubernetes client might return items directly or in body
        let allPods;
        if (podsResponse.body && podsResponse.body.items) {
          allPods = podsResponse.body.items;
          log.debug('Using podsResponse.body.items for specific pod search', { count: allPods.length });
        } else if (podsResponse.items) {
          allPods = podsResponse.items;
          log.debug('Using podsResponse.items directly for specific pod search', { count: allPods.length });
        } else {
          log.error('Invalid Kubernetes API response structure for specific pod search', {
            hasResponse: !!podsResponse,
            hasBody: !!podsResponse.body,
            hasItems: !!podsResponse.body?.items,
            hasResponseItems: !!podsResponse.items,
            responseBody: podsResponse.body,
            responseItems: podsResponse.items
          });
          return res.status(500).json({
            success: false,
            error: { message: 'Invalid response structure from Kubernetes API - no pod items found' }
          });
        }
        
        targetPod = allPods.find(pod => pod.metadata.name === podName);
        log.debug('Specific pod search result', { 
          podName, 
          found: !!targetPod, 
          totalPods: allPods.length,
          podNamespace: targetPod?.metadata?.namespace 
        });
      }
      
      if (!targetPod) {
        return res.status(404).json({
          success: false,
          error: { message: `Pod '${podName}' not found${namespace ? ` in namespace '${namespace}'` : ''}` }
        });
      }
      
      // Analyze specific pod for errors
      const podData = analyzePodErrors(targetPod);
      
      log.debug('GET specific pod errors completed', {
        podName,
        namespace: targetPod.metadata.namespace,
        hasErrors: podData.hasErrors,
        errorCount: podData.errors.length,
        duration: Date.now() - startTime
      });
      
      res.json({
        success: true,
        data: podData
      });
      
    } else {
      // Get all pods with errors
      const podsResponse = await coreApi.listPodForAllNamespaces();
      
      // Check response structure - Kubernetes client might return items directly or in body
      let allPods;
      if (podsResponse.body && podsResponse.body.items) {
        allPods = podsResponse.body.items;
        log.debug('Using podsResponse.body.items', { count: allPods.length });
      } else if (podsResponse.items) {
        allPods = podsResponse.items;
        log.debug('Using podsResponse.items directly', { count: allPods.length });
      } else {
        log.error('Invalid Kubernetes API response structure for pods', {
          hasResponse: !!podsResponse,
          hasBody: !!podsResponse.body,
          hasItems: !!podsResponse.body?.items,
          hasResponseItems: !!podsResponse.items,
          responseBody: podsResponse.body,
          responseItems: podsResponse.items
        });
        return res.status(500).json({
          success: false,
          error: { message: 'Invalid response structure from Kubernetes API - no pod items found' }
        });
      }
      
      // Filter pods with errors
      const podErrors = [];
      
      allPods.forEach(pod => {
        const podData = analyzePodErrors(pod);
        if (podData.hasErrors) {
          podErrors.push(podData);
        }
      });
      
      // Sort by creation time (newest first)
      podErrors.sort((a, b) => new Date(b.creationTime) - new Date(a.creationTime));
      
      log.debug('GET all pod errors completed', {
        totalPods: allPods.length,
        errorPods: podErrors.length,
        duration: Date.now() - startTime
      });
      
      res.json({
        success: true,
        data: {
          podErrors: podErrors,
          summary: {
            totalPods: allPods.length,
            errorPods: podErrors.length,
            errorTypes: {
              phase_error: podErrors.filter(p => p.errors.some(e => e.type === 'phase_error')).length,
              container_waiting: podErrors.filter(p => p.errors.some(e => e.type === 'container_waiting')).length,
              container_terminated: podErrors.filter(p => p.errors.some(e => e.type === 'container_terminated')).length,
              ready_condition: podErrors.filter(p => p.errors.some(e => e.type === 'ready_condition')).length,
              image_pull_error: podErrors.filter(p => p.errors.some(e => e.type === 'image_pull_error')).length
            }
          }
        }
      });
    }
    
  } catch (err) {
    log.debug('GET pod errors failed', { 
      podName,
      namespace,
      message: err.message, 
      duration: Date.now() - startTime 
    });
    res.status(500).json({ 
      success: false, 
      error: { message: err.message } 
    });
  }
});

// Helper function to analyze pod for errors
function analyzePodErrors(pod) {
  const podData = {
    name: pod.metadata.name,
    namespace: pod.metadata.namespace,
    phase: pod.status.phase || 'Unknown',
    hasErrors: false,
    errors: [],
    restartCount: pod.status.containerStatuses?.reduce((sum, cs) => sum + (cs.restartCount || 0), 0) || 0,
    creationTime: pod.metadata.creationTimestamp,
    labels: pod.metadata.labels || {},
    nodeName: pod.spec.nodeName,
    podIP: pod.status.podIP,
    containerStatuses: pod.status.containerStatuses?.map(cs => ({
      name: cs.name,
      ready: cs.ready,
      restartCount: cs.restartCount || 0,
      state: cs.state,
      image: cs.image,
      imageID: cs.imageID
    })) || []
  };
  
  // Check for error conditions
  const phase = pod.status.phase || 'Unknown';
  
  // Check pod phase
  if (phase === 'Failed' || phase === 'Error' || phase === 'CrashLoopBackOff') {
    podData.hasErrors = true;
    podData.errors.push({
      type: 'phase_error',
      severity: 'critical',
      message: `Pod phase: ${phase}`,
      details: `Pod is in ${phase} state`
    });
  }
  
  // Check container statuses
  if (pod.status.containerStatuses) {
    pod.status.containerStatuses.forEach(containerStatus => {
      if (containerStatus.state?.waiting?.reason) {
        podData.hasErrors = true;
        podData.errors.push({
          type: 'container_waiting',
          severity: containerStatus.state.waiting.reason === 'ImagePullBackOff' ? 'critical' : 'warning',
          message: `Container ${containerStatus.name} waiting: ${containerStatus.state.waiting.reason}`,
          details: containerStatus.state.waiting.message || `Container is waiting: ${containerStatus.state.waiting.reason}`,
          container: containerStatus.name,
          errorTime: pod.metadata.creationTimestamp
        });
      }
      if (containerStatus.state?.terminated?.reason && containerStatus.state.terminated.reason !== 'Completed') {
        podData.hasErrors = true;
        podData.errors.push({
          type: 'container_terminated',
          severity: 'critical',
          message: `Container ${containerStatus.name} terminated: ${containerStatus.state.terminated.reason}`,
          details: containerStatus.state.terminated.message || `Container terminated with exit code ${containerStatus.state.terminated.exitCode}`,
          container: containerStatus.name,
          exitCode: containerStatus.state.terminated.exitCode
        });
      }
    });
  }
  
  // Check pod conditions
  if (pod.status.conditions) {
    const failedConditions = pod.status.conditions.filter(condition => 
      condition.type === 'Ready' && condition.status === 'False'
    );
    
    failedConditions.forEach(condition => {
      podData.hasErrors = true;
      podData.errors.push({
        type: 'ready_condition',
        severity: 'warning',
        message: `Pod not ready: ${condition.reason || 'Unknown reason'}`,
        details: condition.message || 'Pod readiness check failed',
        condition: condition.type,
        errorTime: condition.lastTransitionTime || condition.lastProbeTime || pod.metadata.creationTimestamp
      });
    });
  }
  
  // Check for ImagePullBackOff specifically
  if (pod.status.containerStatuses) {
    const imagePullErrors = pod.status.containerStatuses.filter(containerStatus => 
      containerStatus.state?.waiting?.reason === 'ImagePullBackOff'
    );
    
    imagePullErrors.forEach(containerStatus => {
      podData.hasErrors = true;
      podData.errors.push({
        type: 'image_pull_error',
        severity: 'critical',
        message: `Image pull error for container: ${containerStatus.name}`,
        details: `Failed to pull image: ${containerStatus.image}`,
        container: containerStatus.name,
        image: containerStatus.image
      });
    });
  }
  
  // Check for GKE/GCP specific errors
  if (pod.status.containerStatuses) {
    pod.status.containerStatuses.forEach(containerStatus => {
      // GKE Resource Quota Issues
      if (containerStatus.state?.waiting?.reason === 'ResourceQuota') {
        podData.hasErrors = true;
        podData.errors.push({
          type: 'resource_quota_error',
          severity: 'critical',
          message: `Resource quota exceeded for container: ${containerStatus.name}`,
          details: `GKE resource quota limits reached - insufficient CPU/memory`,
          container: containerStatus.name
        });
      }
      
      // GKE Node Issues
      if (containerStatus.state?.waiting?.reason === 'NodeLost') {
        podData.hasErrors = true;
        podData.errors.push({
          type: 'node_lost_error',
          severity: 'critical',
          message: `Node lost for container: ${containerStatus.name}`,
          details: `GKE node became unavailable - pod needs rescheduling`,
          container: containerStatus.name
        });
      }
      
      // GKE Autopilot Issues
      if (containerStatus.state?.waiting?.reason === 'Autopilot') {
        podData.hasErrors = true;
        podData.errors.push({
          type: 'autopilot_error',
          severity: 'warning',
          message: `Autopilot scheduling delay for container: ${containerStatus.name}`,
          details: `GKE Autopilot is provisioning resources - pod pending`,
          container: containerStatus.name
        });
      }
    });
  }
  
  // Check for GKE Pod Conditions
  if (pod.status.conditions) {
    const podConditions = pod.status.conditions;
    
    // GKE Pod Scheduling Issues
    const schedulingFailed = podConditions.find(condition => 
      condition.type === 'PodScheduled' && condition.status === 'False'
    );
    if (schedulingFailed) {
      podData.hasErrors = true;
      podData.errors.push({
        type: 'scheduling_error',
        severity: 'critical',
        message: `Pod scheduling failed: ${schedulingFailed.reason || 'Unknown'}`,
        details: schedulingFailed.message || 'GKE scheduler cannot place pod on any node',
        condition: 'PodScheduled',
        errorTime: schedulingFailed.lastTransitionTime || schedulingFailed.lastProbeTime || pod.metadata.creationTimestamp
      });
    }
    
    // GKE Storage Issues
    const storageIssues = podConditions.find(condition => 
      condition.type === 'VolumesAreAttached' && condition.status === 'False'
    );
    if (storageIssues) {
      podData.hasErrors = true;
      podData.errors.push({
        type: 'storage_error',
        severity: 'critical',
        message: `Storage attachment failed: ${storageIssues.reason || 'Unknown'}`,
        details: storageIssues.message || 'GKE PersistentVolume cannot be attached to pod',
        condition: 'VolumesAreAttached'
      });
    }
    
    // GKE Network Issues
    const networkIssues = podConditions.find(condition => 
      condition.type === 'NetworkAvailable' && condition.status === 'False'
    );
    if (networkIssues) {
      podData.hasErrors = true;
      podData.errors.push({
        type: 'network_error',
        severity: 'warning',
        message: `Network unavailable: ${networkIssues.reason || 'Unknown'}`,
        details: networkIssues.message || 'GKE network connectivity issues detected',
        condition: 'NetworkAvailable'
      });
    }
  }
  
  // Check for high restart counts (GKE stability indicator)
  if (podData.restartCount > 5) {
    podData.hasErrors = true;
    podData.errors.push({
      type: 'high_restart_count',
      severity: 'warning',
      message: `High restart count detected: ${podData.restartCount} restarts`,
      details: `Pod has restarted ${podData.restartCount} times - may indicate GKE resource or configuration issues`
    });
  }
  
  // Sort errors by severity (critical first)
  podData.errors.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
  
  return podData;
}

export default router;
