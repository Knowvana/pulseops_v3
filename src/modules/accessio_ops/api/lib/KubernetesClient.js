// ============================================================================
// KubernetesClient.js — Accessio Operations Module
//
// PURPOSE: Simple Kubernetes client for Accessio Operations.
// Uses explicit connection parameters from ClusterConfig.json.
// Works for both GKE and local Kind clusters.
// ============================================================================
import * as k8s from '@kubernetes/client-node';
import { createAoLogger } from './moduleLogger.js';
import { loadClusterConfigFile } from '../routes/helpers.js';

const log = createAoLogger('KubernetesClient.js');

// ── Initialize Kubernetes client with explicit connection parameters ───────────
export function initializeClient(config) {
  try {
    const kc = new k8s.KubeConfig();
    
    // Use explicit connection parameters from ClusterConfig.json
    kc.loadFromOptions({
      clusters: [{
        name: config.clusterName || 'cluster',
        server: config.apiServerUrl,
        skipTLSVerify: true,
      }],
      users: [{
        name: 'pulseops-user',
        token: config.serviceAccountToken,
      }],
      contexts: [{
        name: 'pulseops-context',
        cluster: config.clusterName || 'cluster',
        user: 'pulseops-user',
      }],
      currentContext: 'pulseops-context',
    });

    log.info('Kubernetes client initialized', { 
      cluster: config.clusterName,
      server: config.apiServerUrl 
    });

    return kc;
  } catch (err) {
    log.error('Failed to initialize Kubernetes client', { message: err.message });
    throw err;
  }
}

// ── Test connection to cluster ───────────────────────────────────────────────
export async function testConnection(config) {
  try {
    const kc = initializeClient(config);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    
    // Test by listing namespaces and pods (in parallel for efficiency)
    const [namespaceResponse, podResponse] = await Promise.all([
      coreApi.listNamespace(),
      coreApi.listPodForAllNamespaces()
    ]);
    
    // Debug: Log the actual response structure
    log.debug('Kubernetes API response structure', {
      hasResponse: !!namespaceResponse,
      hasBody: !!namespaceResponse.body,
      bodyType: typeof namespaceResponse.body,
      bodyKeys: namespaceResponse.body ? Object.keys(namespaceResponse.body) : [],
      hasItems: !!namespaceResponse.body?.items,
      itemsType: typeof namespaceResponse.body?.items,
      itemsLength: namespaceResponse.body?.items?.length || 0,
      responseType: typeof namespaceResponse,
      responseKeys: Object.keys(namespaceResponse),
      hasResponseItems: !!namespaceResponse.items,
      responseItemsType: typeof namespaceResponse.items,
      responseItemsLength: namespaceResponse.items?.length || 0,
      hasPodResponse: !!podResponse,
      hasPodItems: !!podResponse.body?.items,
      podItemsLength: podResponse.body?.items?.length || 0
    });
    
    // Check response structure - Kubernetes client might return items directly or in body
    let namespaces;
    if (namespaceResponse.body && namespaceResponse.body.items) {
      namespaces = namespaceResponse.body.items;
      log.debug('Using namespaceResponse.body.items');
    } else if (namespaceResponse.items) {
      namespaces = namespaceResponse.items;
      log.debug('Using namespaceResponse.items directly');
    } else {
      log.error('Invalid Kubernetes API response structure', {
        hasResponse: !!namespaceResponse,
        hasBody: !!namespaceResponse.body,
        hasItems: !!namespaceResponse.body?.items,
        hasResponseItems: !!namespaceResponse.items,
        responseBody: namespaceResponse.body,
        responseItems: namespaceResponse.items
      });
      throw new Error('Invalid response structure from Kubernetes API - no items found');
    }
    
    // Check pods response structure
    let pods;
    if (podResponse.body && podResponse.body.items) {
      pods = podResponse.body.items;
      log.debug('Using podResponse.body.items');
    } else if (podResponse.items) {
      pods = podResponse.items;
      log.debug('Using podResponse.items directly');
    } else {
      log.warn('Could not fetch pod data, using 0 as fallback');
      pods = [];
    }
    
    const namespaceCount = namespaces.length;
    const podCount = pods.length;
    
    log.info('Connection test successful', { 
      namespaceCount: namespaceCount,
      podCount: podCount,
      cluster: config.clusterName,
      server: config.apiServerUrl
    });
    
    return {
      success: true,
      namespaceCount: namespaceCount,
      podCount: podCount,
      nodeCount: 0, // Will be populated later if needed
      clusterInfo: {
        platform: 'Kubernetes',
        apiServer: config.apiServerUrl,
        nodes: 0,
        namespaces: namespaceCount,
        pods: podCount,
      }
    };
  } catch (err) {
    log.error('Connection test failed', { 
      message: err.message,
      cluster: config.clusterName,
      server: config.apiServerUrl,
      hasToken: !!config.serviceAccountToken
    });
    
    return {
      success: false,
      error: err.message
    };
  }
}

// ── Get cluster configuration ───────────────────────────────────────────────────
export function getClusterConfig() {
  return loadClusterConfigFile();
}
