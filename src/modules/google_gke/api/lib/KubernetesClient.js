// ============================================================================
// Google GKE Module — Kubernetes Client Abstraction Layer
//
// PURPOSE: Provides a unified Kubernetes API client that works identically in
// both local development (Kind/Podman) and production (GCP GKE). Same code,
// same configuration parameters, ZERO CODE CHANGES between environments.
//
// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED AUTHENTICATION APPROACH
// ═══════════════════════════════════════════════════════════════════════════════
//
// The client uses explicit connection parameters from ClusterConfig.json:
//   - apiServerUrl: Kubernetes API server endpoint
//   - serviceAccountToken: Bearer token for authentication
//   - projectId: GCP project ID (optional, for reference)
//   - region: Cluster region (optional, for reference)
//   - clusterName: Cluster name (optional, for reference)
//
// Priority:
//   1. Check if KUBERNETES_SERVICE_HOST env var is set (in-cluster)
//      → YES: Use auto-injected service account token (production GKE)
//      → NO: Use explicit parameters from ClusterConfig.json
//
// SAME PARAMETERS WORK FOR BOTH:
//   LOCAL (Kind + Podman):
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │ 1. Get Kind cluster API URL: kubectl cluster-info                  │
//   │ 2. Get service account token: kubectl get secret ... -o jsonpath   │
//   │ 3. Enter both in Settings → Cluster Configuration                  │
//   │ 4. KubernetesClient uses explicit parameters → connects to Kind    │
//   │ 5. All K8s API calls work identically                              │
//   └─────────────────────────────────────────────────────────────────────┘
//
//   PRODUCTION (GCP GKE):
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │ 1. PulseOps runs as a pod inside the GKE cluster                   │
//   │ 2. K8s auto-injects service account token                          │
//   │ 3. KUBERNETES_SERVICE_HOST env var is set                          │
//   │ 4. KubernetesClient auto-detects in-cluster → uses injected token  │
//   │ 5. All K8s API calls work identically                              │
//   └─────────────────────────────────────────────────────────────────────┘
//
// ═══════════════════════════════════════════════════════════════════════════════
// KUBERNETES API OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
//
// Kubernetes exposes a REST API that lets you manage all cluster resources:
//
//   - Workloads API:
//     GET /apis/apps/v1/namespaces/{ns}/deployments     → List deployments
//     GET /apis/apps/v1/namespaces/{ns}/statefulsets     → List statefulsets
//     GET /apis/apps/v1/namespaces/{ns}/daemonsets       → List daemonsets
//
//   - Pod API:
//     GET /api/v1/namespaces/{ns}/pods                   → List pods
//     GET /api/v1/namespaces/{ns}/pods/{name}/log        → Get pod logs
//
//   - CronJob API:
//     GET /apis/batch/v1/namespaces/{ns}/cronjobs        → List cronjobs
//     GET /apis/batch/v1/namespaces/{ns}/jobs            → List jobs (cron results)
//
//   - Events API:
//     GET /api/v1/namespaces/{ns}/events                 → List events
//
// We use the official @kubernetes/client-node npm package which wraps all of
// these REST calls into a clean JavaScript API.
//
// ═══════════════════════════════════════════════════════════════════════════════
// USAGE:
// ═══════════════════════════════════════════════════════════════════════════════
//
//   import { getK8sClient, getK8sAppsApi, getK8sBatchApi, getK8sCoreApi, testConnection }
//     from '#modules/google_gke/api/lib/KubernetesClient.js';
//
//   // Test connection with explicit config
//   const config = { apiServerUrl: '...', serviceAccountToken: '...' };
//   const result = await testConnection(config);
//
//   // Get the core API client (for pods, services, namespaces, events)
//   const coreApi = getK8sCoreApi(config);
//   const pods = await coreApi.listNamespacedPod('default');
//
//   // Get the apps API client (for deployments, statefulsets, daemonsets)
//   const appsApi = getK8sAppsApi(config);
//   const deployments = await appsApi.listNamespacedDeployment('default');
//
//   // Get the batch API client (for jobs, cronjobs)
//   const batchApi = getK8sBatchApi(config);
//   const cronjobs = await batchApi.listNamespacedCronJob('default');
//
// ============================================================================

import * as k8s from '@kubernetes/client-node';
import { createGkeLogger } from './moduleLogger.js';

const log = createGkeLogger('KubernetesClient.js');

/**
 * Cached KubeConfig instance (singleton).
 * Initialized on first call to getK8sClient().
 * Reset when cluster config changes.
 * @type {object|null}
 */
let _kubeConfig = null;

/**
 * Initialize the Kubernetes client with explicit connection parameters.
 *
 * Unified approach for both local and production:
 *   1. Check if running in-cluster (KUBERNETES_SERVICE_HOST env var)
 *      → YES: Use auto-injected service account token (production GKE)
 *      → NO: Use explicit parameters from ClusterConfig.json
 *
 * Connection parameters (from ClusterConfig.json):
 *   - apiServerUrl: Kubernetes API server URL (e.g., https://10.0.0.1:443)
 *   - serviceAccountToken: Service account token for authentication
 *   - projectId: GCP project ID (optional, for reference)
 *   - region: Cluster region (optional, for reference)
 *   - clusterName: Cluster name (optional, for reference)
 *
 * SAME PARAMETERS WORK FOR BOTH:
 *   - LOCAL DEV: Provide Kind cluster URL + token in config
 *   - GKE PROD: Auto-detected in-cluster, or provide explicit URL + token
 *
 * @param {object} [config] - Optional explicit connection config
 * @returns {object} KubeConfig instance
 */
export function initializeClient(config) {
  const kc = new k8s.KubeConfig();

  try {
    // Priority 1: Check if running inside a Kubernetes cluster (in-cluster auth)
    if (process.env.KUBERNETES_SERVICE_HOST) {
      log.info('Detected in-cluster environment', {
        serviceHost: process.env.KUBERNETES_SERVICE_HOST,
      });
      kc.loadFromCluster();
      log.info('Kubernetes client initialized with in-cluster service account token');
      return kc;
    }

    // Priority 2: Use explicit connection parameters from config
    if (config?.apiServerUrl && config?.serviceAccountToken) {
      log.info('Initializing with explicit connection parameters', {
        apiServerUrl: config.apiServerUrl,
        clusterName: config.clusterName,
      });

      const clusterName = config.clusterName || 'cluster';

      // Use loadFromOptions — the proper API for programmatic config in v1.x
      // Direct property assignment (kc.clusters = [...]) does NOT work in v1.4+
      kc.loadFromOptions({
        clusters: [{
          name: clusterName,
          server: config.apiServerUrl,
          skipTLSVerify: true,
        }],
        users: [{
          name: 'pulseops-user',
          token: config.serviceAccountToken,
        }],
        contexts: [{
          name: 'pulseops-context',
          cluster: clusterName,
          user: 'pulseops-user',
        }],
        currentContext: 'pulseops-context',
      });

      const resolvedServer = kc.getCurrentCluster()?.server;
      log.info('Kubernetes client initialized with explicit parameters', {
        resolvedServer,
      });
      return kc;
    }

    // No valid configuration found
    log.error('No valid Kubernetes configuration found', {
      hasInClusterEnv: !!process.env.KUBERNETES_SERVICE_HOST,
      hasExplicitConfig: !!(config?.apiServerUrl && config?.serviceAccountToken),
    });
    throw new Error(
      'No valid Kubernetes configuration. Provide apiServerUrl and serviceAccountToken in ClusterConfig.json, or run in-cluster with service account token.'
    );
  } catch (err) {
    log.error('Failed to initialize Kubernetes client', { error: err.message });
    throw new Error(`Failed to initialize K8s client: ${err.message}`);
  }
}

/**
 * Get the cached KubeConfig instance, initializing if needed.
 * @param {object} [config] - Optional explicit connection config
 * @returns {object} KubeConfig instance
 */
export function getK8sClient(config) {
  if (!_kubeConfig) {
    _kubeConfig = initializeClient(config);
  }
  return _kubeConfig;
}

/**
 * Get CoreV1Api — for pods, services, namespaces, events, configmaps, secrets.
 * @returns {object} CoreV1Api instance
 */
export function getK8sCoreApi() {
  const kc = getK8sClient();
  return kc.makeApiClient(k8s.CoreV1Api);
}

/**
 * Get AppsV1Api — for deployments, statefulsets, daemonsets, replicasets.
 * @returns {object} AppsV1Api instance
 */
export function getK8sAppsApi() {
  const kc = getK8sClient();
  return kc.makeApiClient(k8s.AppsV1Api);
}

/**
 * Get BatchV1Api — for jobs, cronjobs.
 * @returns {object} BatchV1Api instance
 */
export function getK8sBatchApi() {
  const kc = getK8sClient();
  return kc.makeApiClient(k8s.BatchV1Api);
}

/**
 * Test the cluster connection by listing namespaces.
 *
 * @param {object} [config] - Optional explicit connection config
 * @returns {Promise<{success: boolean, clusterName: string, serverVersion: string, error: string}>}
 */
export async function testConnection(config) {
  try {
    log.info('Testing cluster connection');
    // Always create a fresh client for testing — never use cached singleton
    // This ensures the latest config (apiServerUrl, token) is always used
    const kc = initializeClient(config);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);

    // 1. List namespaces to verify basic connectivity
    log.debug('Verifying connectivity by listing namespaces');
    const namespaces = await coreApi.listNamespace();
    const namespaceCount = namespaces.items?.length || 0;
    log.debug('Namespace list retrieved', { namespaceCount });

    const clusterName = kc.getCurrentCluster()?.name || 'Unknown';
    const apiServerUrl = kc.getCurrentCluster()?.server || 'Unknown';

    // 2. Get server version via VersionApi
    let serverVersion = 'Unknown';
    let platform = 'Unknown';
    let versionMajor = '';
    let versionMinor = '';
    try {
      log.debug('Fetching Kubernetes server version');
      const versionApi = kc.makeApiClient(k8s.VersionApi);
      const versionInfo = await versionApi.getCode();
      serverVersion = versionInfo?.gitVersion || `v${versionInfo?.major}.${versionInfo?.minor}`;
      platform = versionInfo?.platform || 'Unknown';
      versionMajor = versionInfo?.major || '';
      versionMinor = versionInfo?.minor || '';
      log.debug('Server version retrieved', { serverVersion, platform });
    } catch (versionErr) {
      log.warn('Could not fetch server version via VersionApi', { error: versionErr.message });
    }

    // 3. List nodes for cluster topology
    let nodeCount = 0;
    let nodesReady = 0;
    let nodes = [];
    try {
      log.debug('Listing cluster nodes');
      const nodesRes = await coreApi.listNode();
      nodes = (nodesRes.items || []).map(node => {
        const isReady = (node.status?.conditions || []).find(c => c.type === 'Ready')?.status === 'True';
        if (isReady) nodesReady++;
        const roles = Object.keys(node.metadata?.labels || {})
          .filter(l => l.startsWith('node-role.kubernetes.io/'))
          .map(l => l.replace('node-role.kubernetes.io/', ''))
          .join(', ') || 'worker';
        return {
          name: node.metadata?.name || 'Unknown',
          status: isReady ? 'Ready' : 'NotReady',
          roles,
          kubeletVersion: node.status?.nodeInfo?.kubeletVersion || 'Unknown',
          os: node.status?.nodeInfo?.osImage || 'Unknown',
          arch: node.status?.nodeInfo?.architecture || 'Unknown',
          containerRuntime: node.status?.nodeInfo?.containerRuntimeVersion || 'Unknown',
        };
      });
      nodeCount = nodes.length;
      log.debug('Node list retrieved', { nodeCount, nodesReady });
    } catch (nodeErr) {
      log.warn('Could not list cluster nodes', { error: nodeErr.message });
    }

    // 4. Count namespaces for the response
    const namespaceNames = (namespaces.items || []).map(ns => ns.metadata?.name).filter(Boolean);

    // 5. Count pods across all namespaces
    let podCount = 0;
    let podsRunning = 0;
    try {
      log.debug('Counting pods across all namespaces');
      const podsRes = await coreApi.listPodForAllNamespaces();
      podCount = podsRes.items?.length || 0;
      podsRunning = (podsRes.items || []).filter(p => p.status?.phase === 'Running').length;
      log.debug('Pod count retrieved', { podCount, podsRunning });
    } catch (podErr) {
      log.warn('Could not list pods', { error: podErr.message });
    }

    log.info('Cluster connection test successful', {
      clusterName,
      serverVersion,
      platform,
      nodeCount,
      nodesReady,
      namespaceCount,
      podCount,
      podsRunning,
    });

    return {
      success: true,
      clusterName,
      serverVersion,
      versionMajor,
      versionMinor,
      platform,
      apiServerUrl,
      nodeCount,
      nodesReady,
      namespaceCount,
      namespaces: namespaceNames,
      nodes,
      podCount,
      podsRunning,
    };
  } catch (err) {
    log.error('Cluster connection test failed', {
      error: err.message,
      stack: err.stack,
      statusCode: err.statusCode || err.response?.statusCode,
    });
    return {
      success: false,
      clusterName: null,
      serverVersion: null,
      error: err.message,
    };
  }
}

/**
 * Reset the cached client. Call this when cluster config changes.
 * Next call to getK8sClient() will re-initialize.
 */
export function resetClient() {
  log.info('Resetting Kubernetes client cache');
  _kubeConfig = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER INFO (for connection testing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get cluster information (name, version, node count).
 * Used by the Settings UI to verify cluster connectivity.
 *
 * @returns {Promise<{name: string, version: string, nodeCount: number}>}
 */
export async function getClusterInfo() {
  log.info('Getting cluster info');
  try {
    const coreApi = getK8sCoreApi();
    if (!coreApi) {
      log.warn('CoreV1Api not initialized');
      return { name: 'Unknown', version: 'Unknown', nodeCount: 0 };
    }

    // Get nodes to count them
    const nodesRes = await coreApi.listNode();
    const nodeCount = nodesRes?.items?.length || 0;

    // Get API version info
    const k8sClient = getK8sClient();
    const clusterName = k8sClient?.getCurrentCluster?.()?.name || 'Unknown';

    // Try to get server version
    let serverVersion = 'Unknown';
    try {
      const versionRes = await coreApi.getAPIResources?.();
      serverVersion = versionRes?.groupVersion || 'Unknown';
    } catch (err) {
      log.debug('Could not fetch API version', { error: err.message });
    }

    return {
      name: clusterName,
      version: serverVersion,
      nodeCount,
    };
  } catch (err) {
    log.error('Failed to get cluster info', { error: err.message });
    return { name: 'Unknown', version: 'Unknown', nodeCount: 0 };
  }
}
