// ============================================================================
// ClusterService — Accessio Operations Cluster Management Service
//
// PURPOSE: Service layer for managing GKE cluster operations including
// fetching cluster information, namespaces, and workloads with proper separation
// of concerns for optimal performance.
//
// USED BY: clusterRoutes.js → REST API endpoints
// USES: 
//   - KubernetesClient.js → K8s API clients (Core, Apps, Autoscaling, Batch)
//   - ModuleConfigService.js → Cluster configuration file management
//   - helpers.js → Database config (filter_namespaces_default)
//   - moduleLogger.js → Structured logging
//
// FUNCTIONS:
//   - getClusterInfo()     → Cluster metadata + nodes (fast)
//   - getNamespaces()      → Filtered namespaces (fast)  
//   - getWorkloads()       → Workloads/pods (medium performance)
//   - getClusterById()     → Detailed cluster with deployments/services
//   - getAllClusters()     → Legacy combined function (deprecated - not exported)
//   - testClusterHealth()  → Cluster health check (not exported)
// ============================================================================
import { getK8sCoreApi, getK8sAppsApi, getK8sAutoscalingApi, getK8sBatchApi } from '../lib/KubernetesClient.js';
import { getConfigFile } from './ModuleConfigService.js';
import { createAoLogger } from '../lib/moduleLogger.js';
import { loadModuleConfig } from '../routes/helpers.js';

const log = createAoLogger('ClusterService');

/**
 * Get filtered namespaces (excluding core/system namespaces)
 * @returns {Promise<Array>} Array of namespace names to exclude
 */
async function getFilteredNamespaces() {
  try {
    const filterConfig = await loadModuleConfig('filter_namespaces_default');
    return filterConfig?.namespaces || [];
  } catch (err) {
    log.warn('Failed to load filter_namespaces_default config, using empty filter', { error: err.message });
    return [];
  }
}

/**
 * Fetch basic cluster information (no workloads)
 * @returns {Promise<Object>} Cluster metadata and basic info
 */
export async function getClusterInfo() {
  const startTime = Date.now();
  
  try {
    log.debug('Fetching cluster info', { startTime });
    
    // Load cluster configuration to get credentials
    const config = await getConfigFile();
    
    if (!config?.connection?.apiServerUrl) {
      throw new Error('Cluster configuration not found or incomplete');
    }
    
    // Initialize Kubernetes client with cluster credentials
    const coreApi = await getK8sCoreApi(config.connection);
    
    // Fetch nodes to get cluster capacity info
    const nodesResponse = await coreApi.listNode();
    const nodes = nodesResponse.items.map(node => ({
      name: node.metadata.name,
      status: node.status.phase,
      roles: getNodeRoles(node),
      capacity: node.status.capacity,
      creationTime: node.metadata.creationTimestamp,
      version: node.status.nodeInfo.kubeletVersion
    }));
    
    // Build cluster object (no workload data)
    const cluster = {
      id: config.connection.projectId || 'default-cluster',
      name: `${config.connection.clusterName || 'GKE Cluster'} (${config.connection.region || 'unknown'})`,
      location: config.connection.region || 'unknown',
      projectId: config.connection.projectId,
      apiServerUrl: config.connection.apiServerUrl,
      status: 'running',
      creationTime: config._meta?.version || new Date().toISOString(),
      
      // Basic cluster metrics
      metrics: {
        nodes: nodes.length,
        nodesList: nodes.map(node => ({
          name: node.name,
          status: node.status,
          capacity: {
            cpu: node.capacity?.cpu || 'unknown',
            memory: node.capacity?.memory || 'unknown',
            pods: node.capacity?.pods || 'unknown'
          }
        }))
      },
      
      // Raw data for UI compatibility
      data: {
        nodes: nodes.slice(0, 10) // Limit for performance
      }
    };
    
    log.info('Cluster info fetched successfully', {
      clusterId: cluster.id,
      nodesCount: cluster.metrics.nodes,
      duration: Date.now() - startTime
    });
    
    return cluster;
  } catch (err) {
    log.error('Failed to fetch cluster info', { error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

/**
 * Fetch namespaces (filtered)
 * @returns {Promise<Array>} Array of namespace objects
 */
export async function getNamespaces() {
  const startTime = Date.now();
  
  try {
    log.debug('Fetching namespaces', { startTime });
    
    // Load cluster configuration to get credentials
    const config = await getConfigFile();
    const coreApi = await getK8sCoreApi(config.connection);
    
    // Get filtered namespaces to exclude
    const excludedNamespaces = await getFilteredNamespaces();
    log.debug('Loaded namespace filters', { excludedNamespaces });
    
    // Fetch all namespaces
    const namespacesResponse = await coreApi.listNamespace();
    
    if (!namespacesResponse || !namespacesResponse.items) {
      throw new Error('Invalid response from Kubernetes API - no namespaces found');
    }
    
    // Filter out excluded namespaces
    const allNamespaces = namespacesResponse.items.map(ns => ({
      name: ns.metadata.name,
      status: ns.status.phase,
      creationTime: ns.metadata.creationTimestamp,
      labels: ns.metadata.labels || {},
      annotations: ns.metadata.annotations || {}
    }));
    
    const namespaces = allNamespaces.filter(ns => !excludedNamespaces.includes(ns.name));
    const filteredNamespaceCount = allNamespaces.length - namespaces.length;
    
    log.info('Namespaces fetched and filtered', { 
      total: allNamespaces.length, 
      excluded: filteredNamespaceCount, 
      remaining: namespaces.length,
      duration: Date.now() - startTime
    });
    
    return namespaces;
  } catch (err) {
    log.error('Failed to fetch namespaces', { error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

/**
 * Fetch workloads (deployments, statefulsets, cronjobs, pods) for filtered namespaces
 * @returns {Promise<Object>} Workload data grouped by type
 */
export async function getWorkloads() {
  const startTime = Date.now();
  
  try {
    log.debug('Fetching workloads', { startTime });
    
    // Load cluster configuration to get credentials
    const config = await getConfigFile();
    const coreApi = await getK8sCoreApi(config.connection);
    const appsApi = await getK8sAppsApi(config.connection);
    const batchApi = await getK8sBatchApi(config.connection);
    
    // Get filtered namespaces to exclude
    const excludedNamespaces = await getFilteredNamespaces();
    log.debug('Loaded namespace filters for workloads', { excludedNamespaces });
    
    // Fetch all workload types in parallel
    const [deploymentsResponse, statefulSetsResponse, cronJobsResponse, podsResponse] = await Promise.all([
      appsApi.listDeploymentForAllNamespaces(),
      appsApi.listStatefulSetForAllNamespaces(),
      batchApi.listCronJobForAllNamespaces(),
      coreApi.listPodForAllNamespaces()
    ]);
    
    // Filter by excluded namespaces
    const allDeployments = deploymentsResponse.items;
    const allStatefulSets = statefulSetsResponse.items;
    const allCronJobs = cronJobsResponse.items;
    const allPods = podsResponse.items;
    
    const deployments = allDeployments.filter(d => !excludedNamespaces.includes(d.metadata.namespace));
    const statefulSets = allStatefulSets.filter(s => !excludedNamespaces.includes(s.metadata.namespace));
    const cronJobs = allCronJobs.filter(c => !excludedNamespaces.includes(c.metadata.namespace));
    const pods = allPods.filter(p => !excludedNamespaces.includes(p.metadata.namespace));
    
    log.info('Filtered workloads', { 
      deployments: { total: allDeployments.length, excluded: allDeployments.length - deployments.length, remaining: deployments.length },
      statefulSets: { total: allStatefulSets.length, excluded: allStatefulSets.length - statefulSets.length, remaining: statefulSets.length },
      cronJobs: { total: allCronJobs.length, excluded: allCronJobs.length - cronJobs.length, remaining: cronJobs.length },
      pods: { total: allPods.length, excluded: allPods.length - pods.length, remaining: pods.length }
    });
    
    // Create workload objects with proper structure
    const workloads = [];
    
    // Process Deployments
    deployments.forEach(deployment => {
      const readyReplicas = deployment.status.readyReplicas || 0;
      const totalReplicas = deployment.status.replicas || deployment.spec.replicas || 0;
      
      // Determine status based on replica readiness
      let status = 'running';
      if (totalReplicas === 0) {
        status = 'pending';
      } else if (readyReplicas < totalReplicas) {
        status = 'pending';
      } else if (readyReplicas === totalReplicas && totalReplicas > 0) {
        status = 'running';
      }
      
      // Debug log for each deployment
      log.debug('Processing deployment', {
        name: deployment.metadata.name,
        namespace: deployment.metadata.namespace,
        readyReplicas,
        totalReplicas,
        status,
        specReplicas: deployment.spec.replicas,
        statusReplicas: deployment.status.replicas,
        statusReadyReplicas: deployment.status.readyReplicas,
        statusUpdatedReplicas: deployment.status.updatedReplicas,
        statusAvailableReplicas: deployment.status.availableReplicas
      });
      
      workloads.push({
        name: deployment.metadata.name,
        namespace: deployment.metadata.namespace,
        type: 'deployment',
        status: status,
        replicas: {
          ready: readyReplicas,
          total: totalReplicas
        },
        pods: {
          ready: readyReplicas,
          total: totalReplicas
        },
        creationTime: deployment.metadata.creationTimestamp,
        labels: deployment.metadata.labels || {}
      });
    });
    
    // Process StatefulSets
    statefulSets.forEach(statefulSet => {
      const readyReplicas = statefulSet.status.readyReplicas || 0;
      const totalReplicas = statefulSet.status.replicas || statefulSet.spec.replicas || 0;
      
      // Determine status based on replica readiness
      let status = 'running';
      if (totalReplicas === 0) {
        status = 'pending';
      } else if (readyReplicas < totalReplicas) {
        status = 'pending';
      } else if (readyReplicas === totalReplicas && totalReplicas > 0) {
        status = 'running';
      }
      
      workloads.push({
        name: statefulSet.metadata.name,
        namespace: statefulSet.metadata.namespace,
        type: 'statefulset',
        status: status,
        replicas: {
          ready: readyReplicas,
          total: totalReplicas
        },
        pods: {
          ready: readyReplicas,
          total: totalReplicas
        },
        creationTime: statefulSet.metadata.creationTimestamp,
        labels: statefulSet.metadata.labels || {}
      });
    });
    
    // Process CronJobs
    cronJobs.forEach(cronJob => {
      // For CronJobs, we don't have replica counts, but we can check last execution
      const lastSuccessfulTime = cronJob.status?.lastSuccessfulTime;
      const lastFailedTime = cronJob.status?.lastFailedTime;
      
      let status = 'running'; // Default
      if (lastFailedTime && (!lastSuccessfulTime || new Date(lastFailedTime) > new Date(lastSuccessfulTime))) {
        status = 'failed';
      } else if (lastSuccessfulTime) {
        status = 'running';
      }
      
      workloads.push({
        name: cronJob.metadata.name,
        namespace: cronJob.metadata.namespace,
        type: 'cronjob',
        status: status,
        replicas: {
          ready: 0,
          total: 0
        },
        pods: {
          ready: 0,
          total: 0
        },
        schedule: cronJob.spec.schedule,
        creationTime: cronJob.metadata.creationTimestamp,
        labels: cronJob.metadata.labels || {}
      });
    });
    
    // Build response object
    const workloadsResponse = {
      workloads: {
        total: workloads.length,
        items: workloads.slice(0, 100) // Limit for performance
      },
      pods: {
        total: pods.length,
        running: pods.filter(pod => pod.status.phase === 'Running').length,
        pending: pods.filter(pod => pod.status.phase === 'Pending').length,
        failed: pods.filter(pod => pod.status.phase === 'Failed').length,
        items: pods.map(pod => ({
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          type: pod.metadata.labels?.['app.kubernetes.io/component'] || 'unknown'
        })).slice(0, 50) // Keep for backward compatibility
      },
      summary: {
        deployments: deployments.length,
        statefulSets: statefulSets.length,
        cronJobs: cronJobs.length,
        pods: pods.length
      }
    };
    
    log.info('Workloads fetched successfully', {
      totalWorkloads: workloadsResponse.workloads.total,
      deployments: workloadsResponse.summary.deployments,
      statefulSets: workloadsResponse.summary.statefulSets,
      cronJobs: workloadsResponse.summary.cronJobs,
      pods: workloadsResponse.summary.pods,
      duration: Date.now() - startTime
    });
    
    return workloadsResponse;
  } catch (err) {
    log.error('Failed to fetch workloads', { error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

/**
 * Fetch all available clusters from configuration and Kubernetes API
 * @returns {Promise<Array>} Array of cluster objects with metadata
 * @deprecated Use getClusterInfo(), getNamespaces(), and getWorkloads() separately
 */
export async function getAllClusters() {
  const startTime = Date.now();
  
  try {
    log.debug('Fetching all clusters (legacy)', { startTime });
    
    // Get cluster info
    const cluster = await getClusterInfo();
    
    // Get namespaces
    const namespaces = await getNamespaces();
    
    // Get workloads
    const workloads = await getWorkloads();
    
    // Combine for backward compatibility
    const enhancedCluster = {
      ...cluster,
      metrics: {
        ...cluster.metrics,
        namespaces: namespaces.length,
        pods: workloads.pods
      },
      data: {
        ...cluster.data,
        namespaces: namespaces.slice(0, 20), // Limit for performance
        workloads: workloads.pods.items
      }
    };
    
    log.info('All clusters fetched (legacy)', {
      clusterId: enhancedCluster.id,
      namespacesCount: enhancedCluster.metrics.namespaces,
      podsCount: enhancedCluster.metrics.pods.total,
      duration: Date.now() - startTime
    });
    
    return [enhancedCluster]; // Return as array for consistency with REST patterns
  } catch (err) {
    log.error('Failed to fetch all clusters (legacy)', { error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

/**
 * Fetch a specific cluster by ID or name
 * @param {string} clusterId - Cluster identifier (project ID or cluster name)
 * @returns {Promise<Object>} Cluster object with detailed information
 */
export async function getClusterById(clusterId) {
  const startTime = Date.now();
  
  try {
    log.debug('Fetching cluster by ID', { clusterId, startTime });
    
    // Get all clusters first (since we currently have single cluster config)
    const clusters = await getAllClusters();
    
    // Find cluster by ID or name
    const cluster = clusters.find(c => 
      c.id === clusterId || 
      c.name.toLowerCase().includes(clusterId.toLowerCase()) ||
      c.projectId === clusterId
    );
    
    if (!cluster) {
      throw new Error(`Cluster '${clusterId}' not found`);
    }
    
    // Enhance with additional detailed data for specific cluster
    const config = await getConfigFile();
    const coreApi = await getK8sCoreApi(config.connection);
    const appsApi = await getK8sAppsApi(config.connection);
    
    // Get filtered namespaces to exclude
    const excludedNamespaces = await getFilteredNamespaces();
    log.debug('Loaded namespace filters for cluster details', { excludedNamespaces });
    
    // Fetch deployments for detailed workload info (filtered by namespace)
    const deploymentsResponse = await appsApi.listDeploymentForAllNamespaces();
    const allDeployments = deploymentsResponse.body.items;
    const deployments = allDeployments
      .filter(deployment => !excludedNamespaces.includes(deployment.metadata.namespace))
      .map(deployment => ({
        name: deployment.metadata.name,
        namespace: deployment.metadata.namespace,
        replicas: deployment.spec.replicas,
        readyReplicas: deployment.status.readyReplicas || 0,
        availableReplicas: deployment.status.availableReplicas || 0,
        creationTime: deployment.metadata.creationTimestamp,
        labels: deployment.metadata.labels || {}
      }));
    
    log.info('Filtered deployments', { 
      total: allDeployments.length, 
      excluded: allDeployments.length - deployments.length, 
      remaining: deployments.length 
    });
    
    // Fetch services (filtered by namespace)
    const servicesResponse = await coreApi.listServiceForAllNamespaces();
    const allServices = servicesResponse.body.items;
    const services = allServices
      .filter(service => !excludedNamespaces.includes(service.metadata.namespace))
      .map(service => ({
        name: service.metadata.name,
        namespace: service.metadata.namespace,
        type: service.spec.type,
        clusterIP: service.spec.clusterIP,
        ports: service.spec.ports || [],
        creationTime: service.metadata.creationTimestamp
      }));
    
    log.info('Filtered services', { 
      total: allServices.length, 
      excluded: allServices.length - services.length, 
      remaining: services.length 
    });
    
    // Enhance cluster object with detailed data
    const enhancedCluster = {
      ...cluster,
      workloads: {
        deployments: deployments.slice(0, 20), // Limit for performance
        totalDeployments: deployments.length
      },
      networking: {
        services: services.slice(0, 20), // Limit for performance
        totalServices: services.length
      },
      fetchedAt: new Date().toISOString()
    };
    
    log.info('Cluster fetched successfully by ID', {
      duration: Date.now() - startTime,
      clusterId,
      clusterName: enhancedCluster.name,
      deploymentsCount: enhancedCluster.workloads.totalDeployments,
      servicesCount: enhancedCluster.networking.totalServices
    });
    
    return enhancedCluster;
    
  } catch (err) {
    log.error('Failed to fetch cluster by ID', {
      clusterId,
      error: err.message,
      stack: err.stack,
      duration: Date.now() - startTime
    });
    
    throw new Error(`Failed to fetch cluster '${clusterId}': ${err.message}`);
  }
}

/**
 * Helper function to extract node roles from node labels
 * @param {Object} node - Kubernetes node object
 * @returns {Array} Array of role strings
 */
function getNodeRoles(node) {
  const labels = node.metadata.labels || {};
  const roles = [];
  
  if (labels['node-role.kubernetes.io/master'] !== undefined || 
      labels['node-role.kubernetes.io/control-plane'] !== undefined) {
    roles.push('control-plane');
  }
  
  if (labels['node-role.kubernetes.io/worker'] !== undefined) {
    roles.push('worker');
  }
  
  // Default to worker if no roles specified
  if (roles.length === 0) {
    roles.push('worker');
  }
  
  return roles;
}

/**
 * Test cluster connectivity and health
 * @returns {Promise<Object>} Health check result
 */
export async function testClusterHealth() {
  const startTime = Date.now();
  
  try {
    log.debug('Testing cluster health', { startTime });
    
    const config = await getConfigFile();
    const coreApi = await getK8sCoreApi(config.connection);
    
    // Basic connectivity test - try to list namespaces
    const namespacesResponse = await coreApi.listNamespace();
    
    // Test API server responsiveness
    const apiServerTest = {
      responsive: true,
      namespacesCount: namespacesResponse.body.items.length,
      responseTime: Date.now() - startTime
    };
    
    // Test nodes availability
    const nodesResponse = await coreApi.listNode();
    const nodesTest = {
      available: nodesResponse.body.items.length > 0,
      nodesCount: nodesResponse.body.items.length,
      readyNodes: nodesResponse.body.items.filter(node => 
        node.status.conditions?.some(condition => 
          condition.type === 'Ready' && condition.status === 'True'
        )
      ).length
    };
    
    const healthResult = {
      healthy: apiServerTest.responsive && nodesTest.available,
      apiServer: apiServerTest,
      nodes: nodesTest,
      testedAt: new Date().toISOString()
    };
    
    log.info('Cluster health test completed', {
      duration: Date.now() - startTime,
      healthy: healthResult.healthy,
      namespacesCount: healthResult.apiServer.namespacesCount,
      nodesCount: healthResult.nodes.nodesCount,
      readyNodes: healthResult.nodes.readyNodes
    });
    
    return healthResult;
    
  } catch (err) {
    log.error('Cluster health test failed', {
      error: err.message,
      stack: err.stack,
      duration: Date.now() - startTime
    });
    
    return {
      healthy: false,
      error: err.message,
      testedAt: new Date().toISOString()
    };
  }
}
