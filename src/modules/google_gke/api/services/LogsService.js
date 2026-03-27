// ============================================================================
// Google GKE Module — Logs Service
//
// PURPOSE: Business logic for log-based monitoring. Provides functions to
// search logs, stream live logs, and manage log-based alert rules.
//
// ═══════════════════════════════════════════════════════════════════════════════
// CRITICAL DESIGN: Environment Abstraction (Zero Code Changes)
// ═══════════════════════════════════════════════════════════════════════════════
//
//   LOCAL (Kind + Podman):
//   ┌─────────────────────────────────────────────────────────────────┐
//   │ Reads logs directly from Kubernetes API (pod logs).             │
//   │                                                                 │
//   │ K8s API calls:                                                  │
//   │   coreApi.readNamespacedPodLog(name, namespace, {               │
//   │     tailLines: 100,                                             │
//   │     sinceSeconds: 3600,                                         │
//   │     container: 'main',                                          │
//   │   })                                                            │
//   │                                                                 │
//   │ For live streaming:                                              │
//   │   coreApi.readNamespacedPodLog(name, namespace, {               │
//   │     follow: true,  // ← Server-Sent Events (SSE) stream        │
//   │   })                                                            │
//   │                                                                 │
//   │ Optionally deploy EFK stack (Elasticsearch+Fluentd+Kibana)     │
//   │ for richer log search capabilities.                             │
//   └─────────────────────────────────────────────────────────────────┘
//
//   GCP (Production):
//   ┌─────────────────────────────────────────────────────────────────┐
//   │ Uses Google Cloud Logging API (formerly Stackdriver).           │
//   │                                                                 │
//   │ npm package: @google-cloud/logging                              │
//   │                                                                 │
//   │ Cloud Logging filter syntax:                                    │
//   │   resource.type="k8s_container"                                │
//   │   resource.labels.namespace_name="accessio"                    │
//   │   severity>=WARNING                                            │
//   │   textPayload:"error"                                          │
//   │                                                                 │
//   │ Auth: GKE Workload Identity (automatic).                       │
//   └─────────────────────────────────────────────────────────────────┘
//
//   ZERO CODE CHANGES because:
//   - isLocalMode() check determines which backend to use
//   - Both return normalized log entries:
//     { timestamp, severity, source, message, metadata }
//   - Log alert rules are DB-driven (gke_log_alerts table)
//
// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE FUNCTIONS TO IMPLEMENT:
// ═══════════════════════════════════════════════════════════════════════════════
//
//   searchLogs(filters)              → Array of log entries
//   streamLogs(filters, callback)    → Live log stream
//   getAlertRules()                  → Array of log-based alert rules
//   evaluateAlerts(logs)             → Check logs against alert rules
//
// ============================================================================
import { createGkeLogger } from '../lib/moduleLogger.js';

const log = createGkeLogger('LogsService');

// ─── Constants ────────────────────────────────────────────────────────────────
const ERROR_PATTERNS = [/error/i, /failed/i, /exception/i, /fatal/i, /panic/i, /timeout/i, /oomkill/i, /crashloop/i];
const LOG_TAIL_LINES = 50;
const MAX_LOG_MESSAGE_LENGTH = 300;

// ─── Helper: trim log line to reasonable length ────────────────────────────
function trimLogLine(line) {
  if (!line) return null;
  const trimmed = line.trim();
  return trimmed.length > MAX_LOG_MESSAGE_LENGTH
    ? trimmed.substring(0, MAX_LOG_MESSAGE_LENGTH) + '...'
    : trimmed;
}

// ─── Helper: extract best error line from raw log text ────────────────────
function extractErrorLine(logText) {
  if (!logText) return null;
  const lines = logText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // Prefer lines that match known error patterns (search in reverse for most recent)
  const reversed = [...lines].reverse();
  const errorLine = reversed.find(l => ERROR_PATTERNS.some(p => p.test(l)));
  return trimLogLine(errorLine || reversed[0]);
}

/**
 * Fetch the last meaningful error log line for a pod.
 * Tries current logs first, then previous (terminated) container logs.
 * Uses the K8s readNamespacedPodLog API (works with service account token).
 *
 * @param {object} coreApi - CoreV1Api instance
 * @param {string} namespace - Pod namespace
 * @param {string} podName - Pod name
 * @param {string} [containerName] - Specific container (defaults to first)
 * @returns {Promise<string|null>} Last error log line or null
 */
export async function getPodLastErrorLog(coreApi, namespace, podName, containerName = undefined) {
  log.debug('Fetching pod error logs', { namespace, podName, containerName });

  // Strategy: try multiple approaches since different pod states need different log access
  // - Running/CrashLoop pods: current logs with container name
  // - Failed pods (restartPolicy: Never): current logs without container name
  // - CrashLoop previous: previous=true
  const attempts = [
    { label: 'current+container', container: containerName, previous: false },
    { label: 'current+noContainer', container: undefined, previous: false },
    { label: 'previous+container', container: containerName, previous: true },
    { label: 'previous+noContainer', container: undefined, previous: true },
  ];

  for (const attempt of attempts) {
    try {
      const logText = await coreApi.readNamespacedPodLog({
        name: podName,
        namespace,
        container: attempt.container,
        previous: attempt.previous,
        tailLines: LOG_TAIL_LINES,
      });
      const errorLine = extractErrorLine(logText);
      if (errorLine) {
        log.debug('Got error from pod logs', { namespace, podName, attempt: attempt.label, errorLine });
        return errorLine;
      }
    } catch (err) {
      log.debug('Log attempt failed', { namespace, podName, attempt: attempt.label, error: err.message });
    }
  }

  log.debug('No error log found for pod', { namespace, podName });
  return null;
}

/**
 * Fetch Kubernetes events for a specific pod to extract failure reasons.
 * Events capture scheduling failures, image pull errors, OOMKill etc.
 *
 * @param {object} coreApi - CoreV1Api instance
 * @param {string} namespace - Pod namespace
 * @param {string} podName - Pod name
 * @returns {Promise<string|null>} Most recent warning event message or null
 */
export async function getPodLastEvent(coreApi, namespace, podName) {
  log.debug('Fetching pod events', { namespace, podName });
  try {
    const res = await coreApi.listNamespacedEvent({
      namespace,
      fieldSelector: `involvedObject.name=${podName},involvedObject.kind=Pod`,
    });
    const events = (res.items || []);

    // Sort by lastTimestamp descending, prefer Warning events
    const warnings = events
      .filter(e => e.type === 'Warning')
      .sort((a, b) => new Date(b.lastTimestamp || 0) - new Date(a.lastTimestamp || 0));

    if (warnings.length > 0) {
      const msg = `${warnings[0].reason}: ${warnings[0].message}`;
      log.debug('Got warning event for pod', { namespace, podName, msg });
      return trimLogLine(msg);
    }

    // Fallback: any event message
    if (events.length > 0) {
      const sorted = events.sort((a, b) => new Date(b.lastTimestamp || 0) - new Date(a.lastTimestamp || 0));
      return trimLogLine(`${sorted[0].reason}: ${sorted[0].message}`);
    }
  } catch (err) {
    log.debug('Could not fetch pod events', { namespace, podName, error: err.message });
  }
  return null;
}

/**
 * Get the best failure message for a pod — tries logs first, then events, then conditions.
 * This is the primary entry point for alert log messages.
 *
 * @param {object} coreApi - CoreV1Api instance
 * @param {object} pod - Formatted pod object from formatPod()
 * @returns {Promise<string>} Human-readable failure reason
 */
export async function getPodFailureMessage(coreApi, pod) {
  const { namespace, name, conditions, containers } = pod;
  log.debug('Resolving pod failure message', { namespace, name, health: pod.health });

  // 1. Try actual pod logs (most informative)
  const primaryContainer = containers?.[0]?.name;
  const logMsg = await getPodLastErrorLog(coreApi, namespace, name, primaryContainer);
  if (logMsg) return logMsg;

  // 2. Try K8s events (catches scheduling/image/probe failures)
  const eventMsg = await getPodLastEvent(coreApi, namespace, name);
  if (eventMsg) return eventMsg;

  // 3. Fallback: pod conditions
  if (conditions?.length > 0) {
    const failedCond = conditions.find(c => c.status === 'False' && c.message);
    if (failedCond?.message) return trimLogLine(failedCond.message);
  }

  // 4. Final fallback: container last terminated reason
  if (containers?.length > 0) {
    const lastReason = containers[0].lastTerminatedReason;
    if (lastReason && lastReason !== 'null') return lastReason;
  }

  return pod.health || 'Unknown failure';
}

/**
 * Get failure reason for a workload/deployment.
 * Extracts the DeadlineExceeded or Unavailable condition message.
 *
 * @param {object} workload - Formatted workload object
 * @returns {string} Failure condition message
 */
export function getWorkloadFailureMessage(workload) {
  const conditions = workload.conditions || [];

  // Priority: ProgressDeadlineExceeded > ReplicaFailure > any False condition
  const deadlineCond = conditions.find(c => c.reason === 'ProgressDeadlineExceeded');
  if (deadlineCond) return trimLogLine(`Deadline exceeded: ${deadlineCond.message || 'deployment progress deadline exceeded'}`);

  const replicaFail = conditions.find(c => c.type === 'ReplicaFailure');
  if (replicaFail) return trimLogLine(replicaFail.message || 'Replica failure');

  const unavailable = conditions.find(c => c.type === 'Available' && c.status === 'False');
  if (unavailable) return trimLogLine(unavailable.message || `${workload.ready}/${workload.desired} replicas ready`);

  return `${workload.ready}/${workload.desired} replicas ready`;
}
