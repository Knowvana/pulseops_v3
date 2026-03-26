// ============================================================================
// Google GKE Module — Workload Service
//
// PURPOSE: Business logic for GKE workload monitoring. Provides functions to
// list, inspect, and poll Kubernetes workloads (Deployments, StatefulSets,
// DaemonSets) and their Pods with full enterprise-grade detail.
//
// EXPORTS:
//   - getDashboardSummary(coreApi, appsApi)  → Cluster-wide summary stats
//   - getAllPods(coreApi)                     → All pods across namespaces
//   - getAllWorkloads(coreApi, appsApi)       → Workloads + their pods
//   - getPodLogs(coreApi, ns, name, opts)    → Logs for a single pod
//   - getNamespaces(coreApi)                 → Namespace list
//
// PATTERN SOURCE: ESM functional style (same as KubernetesClient.js)
// ============================================================================
import { createGkeLogger } from '../lib/moduleLogger.js';

const log = createGkeLogger('WorkloadService');

// ─── Helper: human-readable age ────────────────────────────────────────────
function formatAge(isoTimestamp) {
  if (!isoTimestamp) return '—';
  const seconds = Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / 1000);
  if (seconds < 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// ─── Helper: pod health from container statuses ────────────────────────────
function derivePodHealth(pod) {
  const phase = pod.status?.phase || 'Unknown';
  const containerStatuses = pod.status?.containerStatuses || [];
  const initStatuses = pod.status?.initContainerStatuses || [];

  // Check for CrashLoopBackOff or Error in any container
  for (const cs of containerStatuses) {
    const waiting = cs.state?.waiting;
    if (waiting?.reason === 'CrashLoopBackOff') return 'CrashLoopBackOff';
    if (waiting?.reason === 'Error' || waiting?.reason === 'CreateContainerError') return 'Error';
    if (waiting?.reason === 'ImagePullBackOff' || waiting?.reason === 'ErrImagePull') return 'ImagePullError';
    if (cs.state?.terminated?.reason === 'OOMKilled') return 'OOMKilled';
    if (cs.state?.terminated?.reason === 'Error') return 'Error';
  }

  // Check init containers
  for (const cs of initStatuses) {
    const waiting = cs.state?.waiting;
    if (waiting?.reason === 'CrashLoopBackOff') return 'InitCrashLoop';
    if (cs.state?.terminated && cs.state.terminated.exitCode !== 0) return 'InitError';
  }

  // All containers ready?
  const allReady = containerStatuses.length > 0 && containerStatuses.every(cs => cs.ready);
  if (phase === 'Running' && allReady) return 'Healthy';
  if (phase === 'Running' && !allReady) return 'Degraded';
  if (phase === 'Succeeded') return 'Completed';
  if (phase === 'Pending') return 'Pending';
  if (phase === 'Failed') return 'Failed';
  return phase;
}

// ─── Helper: extract container detail from a pod ───────────────────────────
function extractContainers(pod) {
  const containerStatuses = pod.status?.containerStatuses || [];
  const specs = pod.spec?.containers || [];

  return specs.map(spec => {
    const status = containerStatuses.find(cs => cs.name === spec.name) || {};
    const state = status.state || {};
    let stateStr = 'Unknown';
    if (state.running) stateStr = 'Running';
    else if (state.waiting) stateStr = state.waiting.reason || 'Waiting';
    else if (state.terminated) stateStr = state.terminated.reason || 'Terminated';

    return {
      name: spec.name,
      image: spec.image || '—',
      imageTag: (spec.image || '').split(':').pop() || 'latest',
      state: stateStr,
      ready: !!status.ready,
      restartCount: status.restartCount || 0,
      cpuRequest: spec.resources?.requests?.cpu || '—',
      cpuLimit: spec.resources?.limits?.cpu || '—',
      memoryRequest: spec.resources?.requests?.memory || '—',
      memoryLimit: spec.resources?.limits?.memory || '—',
      lastTerminatedAt: status.lastState?.terminated?.finishedAt || null,
      lastTerminatedReason: status.lastState?.terminated?.reason || null,
    };
  });
}

// ─── Helper: format a raw pod into a rich pod row ──────────────────────────
function formatPod(pod) {
  const containerStatuses = pod.status?.containerStatuses || [];
  const totalRestarts = containerStatuses.reduce((sum, cs) => sum + (cs.restartCount || 0), 0);
  const readyCount = containerStatuses.filter(cs => cs.ready).length;
  const totalContainers = containerStatuses.length;
  const containers = extractContainers(pod);
  const health = derivePodHealth(pod);

  // Find owner workload
  const ownerRef = (pod.metadata?.ownerReferences || [])[0] || {};

  // QoS class
  const qosClass = pod.status?.qosClass || 'BestEffort';

  // Node scheduling
  const nodeName = pod.spec?.nodeName || '—';
  const podIP = pod.status?.podIP || '—';
  const hostIP = pod.status?.hostIP || '—';

  // Primary container image (first container)
  const primaryImage = containers[0]?.image || '—';
  const primaryImageTag = containers[0]?.imageTag || 'latest';

  // Aggregate CPU/memory requests from all containers
  const cpuRequest = containers.map(c => c.cpuRequest).filter(v => v !== '—').join(', ') || '—';
  const cpuLimit = containers.map(c => c.cpuLimit).filter(v => v !== '—').join(', ') || '—';
  const memoryRequest = containers.map(c => c.memoryRequest).filter(v => v !== '—').join(', ') || '—';
  const memoryLimit = containers.map(c => c.memoryLimit).filter(v => v !== '—').join(', ') || '—';

  // Last restart time (most recent across all containers)
  let lastRestartAt = null;
  for (const cs of containerStatuses) {
    const t = cs.lastState?.terminated?.finishedAt;
    if (t && (!lastRestartAt || new Date(t) > new Date(lastRestartAt))) lastRestartAt = t;
  }

  // Conditions summary
  const conditions = (pod.status?.conditions || []).map(c => ({
    type: c.type,
    status: c.status,
    reason: c.reason || '',
    message: c.message || '',
    lastTransitionTime: c.lastTransitionTime,
  }));

  const isReady = conditions.some(c => c.type === 'Ready' && c.status === 'True');

  return {
    id: `${pod.metadata?.namespace}/${pod.metadata?.name}`,
    name: pod.metadata?.name || 'Unknown',
    namespace: pod.metadata?.namespace || 'Unknown',
    phase: pod.status?.phase || 'Unknown',
    health,
    ready: isReady,
    readyDisplay: `${readyCount}/${totalContainers}`,
    restarts: totalRestarts,
    lastRestartAt,
    lastRestartAge: lastRestartAt ? formatAge(lastRestartAt) : '—',
    age: formatAge(pod.metadata?.creationTimestamp),
    createdAt: pod.metadata?.creationTimestamp || null,
    startedAt: pod.status?.startTime || null,
    nodeName,
    podIP,
    hostIP,
    qosClass,
    ownerKind: ownerRef.kind || '—',
    ownerName: ownerRef.name || '—',
    image: primaryImage,
    imageTag: primaryImageTag,
    cpuRequest,
    cpuLimit,
    memoryRequest,
    memoryLimit,
    containerCount: totalContainers,
    containers,
    conditions,
    labels: pod.metadata?.labels || {},
    annotations: pod.metadata?.annotations || {},
    serviceAccount: pod.spec?.serviceAccountName || '—',
    restartPolicy: pod.spec?.restartPolicy || '—',
    priorityClassName: pod.spec?.priorityClassName || '—',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all pods across all namespaces with full detail.
 * @param {object} coreApi - CoreV1Api instance
 * @returns {Promise<Array>} Formatted pod rows
 */
export async function getAllPods(coreApi) {
  log.debug('Fetching all pods across all namespaces');
  try {
    const res = await coreApi.listPodForAllNamespaces();
    const pods = (res.items || []).map(formatPod);
    log.info('Pods fetched', { total: pods.length });
    return pods;
  } catch (err) {
    log.error('Failed to fetch pods', { error: err.message });
    throw err;
  }
}

/**
 * Get all workloads (Deployments, StatefulSets, DaemonSets) with their pod counts.
 * @param {object} coreApi - CoreV1Api instance
 * @param {object} appsApi - AppsV1Api instance
 * @returns {Promise<Array>} Formatted workload rows
 */
export async function getAllWorkloads(coreApi, appsApi) {
  log.debug('Fetching all workloads across all namespaces');
  try {
    const [deploymentsRes, statefulSetsRes, daemonSetsRes, podsRes] = await Promise.all([
      appsApi.listDeploymentForAllNamespaces(),
      appsApi.listStatefulSetForAllNamespaces(),
      appsApi.listDaemonSetForAllNamespaces(),
      coreApi.listPodForAllNamespaces(),
    ]);

    const allPods = podsRes.items || [];
    const workloads = [];

    // ── Deployments ──
    for (const dep of (deploymentsRes.items || [])) {
      const desired = dep.spec?.replicas ?? 1;
      const ready = dep.status?.readyReplicas ?? 0;
      const updated = dep.status?.updatedReplicas ?? 0;
      const available = dep.status?.availableReplicas ?? 0;
      const matchLabels = dep.spec?.selector?.matchLabels || {};

      // Find pods matching this deployment's selector
      const ownedPods = allPods.filter(p =>
        p.metadata?.namespace === dep.metadata?.namespace &&
        Object.entries(matchLabels).every(([k, v]) => (p.metadata?.labels || {})[k] === v)
      );
      const restarts = ownedPods.reduce((sum, p) =>
        sum + (p.status?.containerStatuses || []).reduce((s, cs) => s + (cs.restartCount || 0), 0), 0);

      let health = 'Healthy';
      if (ready === 0 && desired > 0) health = 'Unhealthy';
      else if (ready < desired) health = 'Degraded';

      workloads.push({
        id: `Deployment/${dep.metadata?.namespace}/${dep.metadata?.name}`,
        name: dep.metadata?.name,
        namespace: dep.metadata?.namespace,
        type: 'Deployment',
        desired,
        ready,
        updated,
        available,
        health,
        restarts,
        age: formatAge(dep.metadata?.creationTimestamp),
        createdAt: dep.metadata?.creationTimestamp,
        image: dep.spec?.template?.spec?.containers?.[0]?.image || '—',
        podCount: ownedPods.length,
        labels: dep.metadata?.labels || {},
        strategy: dep.spec?.strategy?.type || '—',
      });
    }

    // ── StatefulSets ──
    for (const ss of (statefulSetsRes.items || [])) {
      const desired = ss.spec?.replicas ?? 1;
      const ready = ss.status?.readyReplicas ?? 0;
      const updated = ss.status?.updatedReplicas ?? 0;
      const matchLabels = ss.spec?.selector?.matchLabels || {};

      const ownedPods = allPods.filter(p =>
        p.metadata?.namespace === ss.metadata?.namespace &&
        Object.entries(matchLabels).every(([k, v]) => (p.metadata?.labels || {})[k] === v)
      );
      const restarts = ownedPods.reduce((sum, p) =>
        sum + (p.status?.containerStatuses || []).reduce((s, cs) => s + (cs.restartCount || 0), 0), 0);

      let health = 'Healthy';
      if (ready === 0 && desired > 0) health = 'Unhealthy';
      else if (ready < desired) health = 'Degraded';

      workloads.push({
        id: `StatefulSet/${ss.metadata?.namespace}/${ss.metadata?.name}`,
        name: ss.metadata?.name,
        namespace: ss.metadata?.namespace,
        type: 'StatefulSet',
        desired,
        ready,
        updated,
        available: ready,
        health,
        restarts,
        age: formatAge(ss.metadata?.creationTimestamp),
        createdAt: ss.metadata?.creationTimestamp,
        image: ss.spec?.template?.spec?.containers?.[0]?.image || '—',
        podCount: ownedPods.length,
        labels: ss.metadata?.labels || {},
        strategy: ss.spec?.updateStrategy?.type || '—',
      });
    }

    // ── DaemonSets ──
    for (const ds of (daemonSetsRes.items || [])) {
      const desired = ds.status?.desiredNumberScheduled ?? 0;
      const ready = ds.status?.numberReady ?? 0;
      const updated = ds.status?.updatedNumberScheduled ?? 0;
      const available = ds.status?.numberAvailable ?? 0;
      const matchLabels = ds.spec?.selector?.matchLabels || {};

      const ownedPods = allPods.filter(p =>
        p.metadata?.namespace === ds.metadata?.namespace &&
        Object.entries(matchLabels).every(([k, v]) => (p.metadata?.labels || {})[k] === v)
      );
      const restarts = ownedPods.reduce((sum, p) =>
        sum + (p.status?.containerStatuses || []).reduce((s, cs) => s + (cs.restartCount || 0), 0), 0);

      let health = 'Healthy';
      if (ready === 0 && desired > 0) health = 'Unhealthy';
      else if (ready < desired) health = 'Degraded';

      workloads.push({
        id: `DaemonSet/${ds.metadata?.namespace}/${ds.metadata?.name}`,
        name: ds.metadata?.name,
        namespace: ds.metadata?.namespace,
        type: 'DaemonSet',
        desired,
        ready,
        updated,
        available,
        health,
        restarts,
        age: formatAge(ds.metadata?.creationTimestamp),
        createdAt: ds.metadata?.creationTimestamp,
        image: ds.spec?.template?.spec?.containers?.[0]?.image || '—',
        podCount: ownedPods.length,
        labels: ds.metadata?.labels || {},
        strategy: ds.spec?.updateStrategy?.type || '—',
      });
    }

    log.info('Workloads fetched', {
      deployments: deploymentsRes.items?.length || 0,
      statefulSets: statefulSetsRes.items?.length || 0,
      daemonSets: daemonSetsRes.items?.length || 0,
      total: workloads.length,
    });

    return workloads;
  } catch (err) {
    log.error('Failed to fetch workloads', { error: err.message });
    throw err;
  }
}

/**
 * Get dashboard summary stats for the entire cluster.
 * @param {object} coreApi - CoreV1Api instance
 * @param {object} appsApi - AppsV1Api instance
 * @returns {Promise<Object>} Summary stats
 */
export async function getDashboardSummary(coreApi, appsApi) {
  log.debug('Building dashboard summary');
  try {
    const [pods, workloads, namespacesRes, nodesRes] = await Promise.all([
      getAllPods(coreApi),
      getAllWorkloads(coreApi, appsApi),
      coreApi.listNamespace(),
      coreApi.listNode(),
    ]);

    const namespaces = (namespacesRes.items || []).map(ns => ns.metadata?.name);
    const nodes = (nodesRes.items || []).map(node => {
      const isReady = (node.status?.conditions || []).find(c => c.type === 'Ready')?.status === 'True';
      return {
        name: node.metadata?.name,
        ready: isReady,
        roles: Object.keys(node.metadata?.labels || {})
          .filter(l => l.startsWith('node-role.kubernetes.io/'))
          .map(l => l.replace('node-role.kubernetes.io/', ''))
          .join(', ') || 'worker',
        kubeletVersion: node.status?.nodeInfo?.kubeletVersion || '—',
        os: node.status?.nodeInfo?.osImage || '—',
        arch: node.status?.nodeInfo?.architecture || '—',
        containerRuntime: node.status?.nodeInfo?.containerRuntimeVersion || '—',
        allocatableCpu: node.status?.allocatable?.cpu || '—',
        allocatableMemory: node.status?.allocatable?.memory || '—',
      };
    });

    // Pod stats
    const podsByHealth = {};
    const podsByNamespace = {};
    const podsByNode = {};
    let totalRestarts = 0;
    let crashLoopPods = 0;
    let pendingPods = 0;

    for (const p of pods) {
      podsByHealth[p.health] = (podsByHealth[p.health] || 0) + 1;
      podsByNamespace[p.namespace] = (podsByNamespace[p.namespace] || 0) + 1;
      podsByNode[p.nodeName] = (podsByNode[p.nodeName] || 0) + 1;
      totalRestarts += p.restarts;
      if (p.health === 'CrashLoopBackOff') crashLoopPods++;
      if (p.health === 'Pending') pendingPods++;
    }

    // Workload stats
    const workloadsByType = {};
    const workloadsByHealth = {};
    for (const w of workloads) {
      workloadsByType[w.type] = (workloadsByType[w.type] || 0) + 1;
      workloadsByHealth[w.health] = (workloadsByHealth[w.health] || 0) + 1;
    }

    const summary = {
      cluster: {
        nodeCount: nodes.length,
        nodesReady: nodes.filter(n => n.ready).length,
        namespaceCount: namespaces.length,
        namespaces,
        nodes,
      },
      pods: {
        total: pods.length,
        running: pods.filter(p => p.phase === 'Running').length,
        pending: pendingPods,
        failed: pods.filter(p => p.phase === 'Failed').length,
        succeeded: pods.filter(p => p.phase === 'Succeeded').length,
        crashLoop: crashLoopPods,
        totalRestarts,
        byHealth: podsByHealth,
        byNamespace: podsByNamespace,
        byNode: podsByNode,
      },
      workloads: {
        total: workloads.length,
        healthy: workloadsByHealth['Healthy'] || 0,
        degraded: workloadsByHealth['Degraded'] || 0,
        unhealthy: workloadsByHealth['Unhealthy'] || 0,
        byType: workloadsByType,
        byHealth: workloadsByHealth,
        items: workloads,
      },
      fetchedAt: new Date().toISOString(),
    };

    log.info('Dashboard summary built', {
      pods: summary.pods.total,
      workloads: summary.workloads.total,
      nodes: summary.cluster.nodeCount,
    });

    return summary;
  } catch (err) {
    log.error('Failed to build dashboard summary', { error: err.message });
    throw err;
  }
}

/**
 * Get logs for a specific pod.
 * @param {object} coreApi - CoreV1Api instance
 * @param {string} namespace - Pod namespace
 * @param {string} podName - Pod name
 * @param {object} [opts] - Options
 * @param {string} [opts.container] - Specific container name (default: first)
 * @param {number} [opts.tailLines=500] - Number of lines from the end
 * @param {number} [opts.sinceSeconds] - Logs since N seconds ago
 * @param {boolean} [opts.previous=false] - Get previous container logs (for crash investigation)
 * @returns {Promise<string>} Log text
 */
export async function getPodLogs(coreApi, namespace, podName, opts = {}) {
  log.debug('Fetching pod logs', { namespace, podName, opts });
  try {
    const logOpts = {
      tailLines: opts.tailLines || 500,
    };
    if (opts.container) logOpts.container = opts.container;
    if (opts.sinceSeconds) logOpts.sinceSeconds = opts.sinceSeconds;
    if (opts.previous) logOpts.previous = true;

    const logText = await coreApi.readNamespacedPodLog(
      podName, namespace,
      logOpts.container,      // container
      undefined,              // follow
      undefined,              // insecureSkipTLSVerifyBackend
      undefined,              // limitBytes
      undefined,              // pretty
      logOpts.previous,       // previous
      logOpts.sinceSeconds,   // sinceSeconds
      logOpts.tailLines,      // tailLines
      undefined,              // timestamps
    );

    log.debug('Pod logs fetched', { namespace, podName, length: (logText || '').length });
    return logText || '';
  } catch (err) {
    log.error('Failed to fetch pod logs', { namespace, podName, error: err.message });
    throw err;
  }
}

/**
 * Get all namespaces.
 * @param {object} coreApi - CoreV1Api instance
 * @returns {Promise<Array>} Namespace objects
 */
export async function getNamespaces(coreApi) {
  log.debug('Fetching namespaces');
  try {
    const res = await coreApi.listNamespace();
    const namespaces = (res.items || []).map(ns => ({
      name: ns.metadata?.name,
      status: ns.status?.phase || 'Active',
      age: formatAge(ns.metadata?.creationTimestamp),
      labels: ns.metadata?.labels || {},
    }));
    log.debug('Namespaces fetched', { count: namespaces.length });
    return namespaces;
  } catch (err) {
    log.error('Failed to fetch namespaces', { error: err.message });
    throw err;
  }
}
