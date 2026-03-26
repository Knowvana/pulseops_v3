// ============================================================================
// Google GKE Module — CronJob Service
//
// PURPOSE: Complete backend service for Kubernetes CronJob monitoring.
// Fetches CronJobs, their child Jobs, derives execution history, calculates
// success rates, detects missed schedules, failed runs, and provides
// comprehensive dashboard summary data.
//
// FUNCTIONS:
//   getAllCronjobs(batchApi, coreApi)           → All CronJobs with job history
//   getCronjobDashboard(batchApi, coreApi)      → Dashboard summary + alerts
//   getExecutionHistory(batchApi, coreApi, ns, name, limit) → Job history
//   getJobLogs(coreApi, ns, jobName, opts)      → Pod logs from a Job
//
// ALERT DETECTION:
//   - Failed Jobs: Any Job with status.failed > 0
//   - Missed Schedules: lastScheduleTime older than 2× schedule interval
//   - Long Running: Active jobs exceeding activeDeadlineSeconds
//   - High Failure Rate: success rate < 80% in last 10 runs
//
// PATTERN SOURCE: Follows WorkloadService.js ESM pattern
// ============================================================================
import { createGkeLogger } from '../lib/moduleLogger.js';

const log = createGkeLogger('CronjobService');

// ── Cron schedule parser ────────────────────────────────────────────────────
// Parses a cron expression and returns the interval in seconds (approximate)
function parseCronIntervalSeconds(schedule) {
  if (!schedule) return null;
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [minute, hour, dom, month, dow] = parts;

  // Every N minutes: */N * * * *
  if (minute.startsWith('*/') && hour === '*' && dom === '*') {
    return parseInt(minute.slice(2), 10) * 60;
  }
  // Every hour at minute M: M * * * *
  if (/^\d+$/.test(minute) && hour === '*' && dom === '*') {
    return 3600;
  }
  // Every N hours: 0 */N * * *
  if (hour.startsWith('*/') && dom === '*') {
    return parseInt(hour.slice(2), 10) * 3600;
  }
  // Daily at specific time: M H * * *
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === '*' && month === '*') {
    if (dow === '*') return 86400; // daily
    return 604800; // weekly
  }
  // Monthly: M H D * *
  if (/^\d+$/.test(dom) && month === '*') return 2592000;
  return 86400; // fallback: assume daily
}

// ── Human-readable cron description ─────────────────────────────────────────
function describeCron(schedule) {
  if (!schedule) return '—';
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return schedule;
  const [minute, hour, dom, month, dow] = parts;

  if (minute.startsWith('*/') && hour === '*') return `Every ${minute.slice(2)} min`;
  if (hour.startsWith('*/') && minute === '0') return `Every ${hour.slice(2)} hrs`;
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === '*' && month === '*' && dow === '*') {
    return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === '*' && month === '*' && /^\d+$/.test(dow)) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[parseInt(dow, 10)] || dow} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
  return schedule;
}

// ── Duration formatter ──────────────────────────────────────────────────────
function formatDuration(startTime, endTime) {
  if (!startTime) return '—';
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const diffMs = end - start;
  if (diffMs < 0) return '—';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

// ── Age formatter ───────────────────────────────────────────────────────────
function formatAge(timestamp) {
  if (!timestamp) return '—';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (diffMs < 0) return '—';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// ── Format a single Job execution ───────────────────────────────────────────
function formatJob(job) {
  const succeeded = job.status?.succeeded ?? 0;
  const failed = job.status?.failed ?? 0;
  const active = job.status?.active ?? 0;
  let status = 'Unknown';
  if (succeeded > 0) status = 'Succeeded';
  else if (failed > 0) status = 'Failed';
  else if (active > 0) status = 'Running';
  else if (job.status?.conditions?.some(c => c.type === 'Complete' && c.status === 'True')) status = 'Succeeded';
  else if (job.status?.conditions?.some(c => c.type === 'Failed' && c.status === 'True')) status = 'Failed';

  const startTime = job.status?.startTime || job.metadata?.creationTimestamp;
  const completionTime = job.status?.completionTime;

  return {
    name: job.metadata?.name,
    namespace: job.metadata?.namespace,
    status,
    startTime,
    completionTime,
    duration: formatDuration(startTime, completionTime),
    durationSeconds: startTime ? Math.floor((new Date(completionTime || Date.now()) - new Date(startTime)) / 1000) : 0,
    succeeded,
    failed,
    active,
    backoffLimit: job.spec?.backoffLimit ?? 6,
    activeDeadlineSeconds: job.spec?.activeDeadlineSeconds ?? null,
    completions: job.spec?.completions ?? 1,
    parallelism: job.spec?.parallelism ?? 1,
    createdAt: job.metadata?.creationTimestamp,
    age: formatAge(job.metadata?.creationTimestamp),
    labels: job.metadata?.labels || {},
  };
}

// ── Format a CronJob with its child Jobs ────────────────────────────────────
function formatCronjob(cj, jobs) {
  const name = cj.metadata?.name;
  const namespace = cj.metadata?.namespace;
  const schedule = cj.spec?.schedule || '—';
  const lastScheduleTime = cj.status?.lastScheduleTime;
  const activeJobs = (cj.status?.active || []).length;
  const suspended = cj.spec?.suspend === true;

  // Annotations (owner, description, SLA)
  const annotations = cj.metadata?.annotations || {};
  const description = annotations['pulseops.io/description'] || '';
  const owner = annotations['pulseops.io/owner'] || '';
  const slaMinutes = parseInt(annotations['pulseops.io/sla-minutes'] || '0', 10);

  // Filter Jobs owned by this CronJob
  const ownedJobs = jobs.filter(j =>
    (j.metadata?.ownerReferences || []).some(ref =>
      ref.kind === 'CronJob' && ref.name === name
    ) && j.metadata?.namespace === namespace
  );

  // Sort by startTime descending
  ownedJobs.sort((a, b) => {
    const tA = new Date(a.status?.startTime || a.metadata?.creationTimestamp || 0);
    const tB = new Date(b.status?.startTime || b.metadata?.creationTimestamp || 0);
    return tB - tA;
  });

  const formattedJobs = ownedJobs.map(formatJob);

  // Calculate stats from recent jobs
  const recentJobs = formattedJobs.slice(0, 20);
  const totalRuns = recentJobs.filter(j => j.status === 'Succeeded' || j.status === 'Failed').length;
  const succeededRuns = recentJobs.filter(j => j.status === 'Succeeded').length;
  const failedRuns = recentJobs.filter(j => j.status === 'Failed').length;
  const successRate = totalRuns > 0 ? Math.round((succeededRuns / totalRuns) * 100) : null;

  // Average duration (succeeded jobs only)
  const durations = recentJobs.filter(j => j.status === 'Succeeded' && j.durationSeconds > 0).map(j => j.durationSeconds);
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null;

  // Last execution
  const lastJob = formattedJobs[0] || null;
  const lastStatus = lastJob?.status || '—';
  const lastDuration = lastJob?.duration || '—';

  // Next run estimate (based on lastScheduleTime + interval)
  const intervalSec = parseCronIntervalSeconds(schedule);
  let nextRunEstimate = null;
  if (lastScheduleTime && intervalSec) {
    const next = new Date(new Date(lastScheduleTime).getTime() + intervalSec * 1000);
    nextRunEstimate = next.toISOString();
  }

  // Alert detection
  const alerts = [];

  // 1. Failed last run
  if (lastStatus === 'Failed') {
    alerts.push({
      type: 'failure',
      severity: 'critical',
      message: `Last execution failed`,
      timestamp: lastJob?.startTime,
    });
  }

  // 2. Missed schedule: lastScheduleTime is older than 2× interval
  if (lastScheduleTime && intervalSec && !suspended) {
    const expectedLatest = new Date(Date.now() - intervalSec * 2000);
    if (new Date(lastScheduleTime) < expectedLatest) {
      alerts.push({
        type: 'missed_schedule',
        severity: 'warning',
        message: `Schedule may be missed — last run ${formatAge(lastScheduleTime)}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 3. High failure rate (< 80%)
  if (totalRuns >= 3 && successRate !== null && successRate < 80) {
    alerts.push({
      type: 'high_failure_rate',
      severity: 'warning',
      message: `Success rate is ${successRate}% (${failedRuns}/${totalRuns} failed)`,
      timestamp: new Date().toISOString(),
    });
  }

  // 4. Long running active job
  if (activeJobs > 0 && lastJob?.status === 'Running' && lastJob?.durationSeconds > 300) {
    alerts.push({
      type: 'long_running',
      severity: 'info',
      message: `Active job running for ${lastJob.duration}`,
      timestamp: new Date().toISOString(),
    });
  }

  // Overall health
  let health = 'Healthy';
  if (suspended) health = 'Suspended';
  else if (alerts.some(a => a.severity === 'critical')) health = 'Critical';
  else if (alerts.some(a => a.severity === 'warning')) health = 'Warning';

  return {
    id: `CronJob/${namespace}/${name}`,
    name,
    namespace,
    schedule,
    scheduleDescription: describeCron(schedule),
    intervalSeconds: intervalSec,
    suspended,
    concurrencyPolicy: cj.spec?.concurrencyPolicy || 'Allow',
    successfulJobsHistoryLimit: cj.spec?.successfulJobsHistoryLimit ?? 3,
    failedJobsHistoryLimit: cj.spec?.failedJobsHistoryLimit ?? 1,
    startingDeadlineSeconds: cj.spec?.startingDeadlineSeconds ?? null,
    lastScheduleTime,
    lastScheduleAge: formatAge(lastScheduleTime),
    nextRunEstimate,
    nextRunAge: nextRunEstimate ? formatAge(new Date(Date.now() - (new Date(nextRunEstimate) - Date.now())).toISOString()) : null,
    activeJobs,
    lastStatus,
    lastDuration,
    totalRuns,
    succeededRuns,
    failedRuns,
    successRate,
    avgDurationSeconds: avgDuration,
    avgDuration: avgDuration ? formatDuration(new Date(0), new Date(avgDuration * 1000)) : '—',
    health,
    alerts,
    alertCount: alerts.length,
    description,
    owner,
    slaMinutes,
    labels: cj.metadata?.labels || {},
    image: cj.spec?.jobTemplate?.spec?.template?.spec?.containers?.[0]?.image || '—',
    createdAt: cj.metadata?.creationTimestamp,
    age: formatAge(cj.metadata?.creationTimestamp),
    recentJobs: formattedJobs.slice(0, 10),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORTED FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Get all CronJobs across all namespaces with their child Jobs, stats, and alerts.
 */
export async function getAllCronjobs(batchApi, coreApi) {
  log.debug('getAllCronjobs', 'Fetching all CronJobs and Jobs');

  const [cronjobsRes, jobsRes] = await Promise.all([
    batchApi.listCronJobForAllNamespaces(),
    batchApi.listJobForAllNamespaces(),
  ]);

  const cronjobs = (cronjobsRes.items || []).map(cj =>
    formatCronjob(cj, jobsRes.items || [])
  );

  // Sort by name
  cronjobs.sort((a, b) => a.name.localeCompare(b.name));

  return cronjobs;
}

/**
 * Get comprehensive dashboard summary for CronJobs.
 * Includes aggregate stats, alerts, health breakdown, execution timeline.
 */
export async function getCronjobDashboard(batchApi, coreApi) {
  log.debug('getCronjobDashboard', 'Building dashboard');

  const cronjobs = await getAllCronjobs(batchApi, coreApi);

  // Aggregate stats
  const total = cronjobs.length;
  const suspended = cronjobs.filter(c => c.suspended).length;
  const active = cronjobs.filter(c => c.activeJobs > 0).length;
  const healthy = cronjobs.filter(c => c.health === 'Healthy').length;
  const warning = cronjobs.filter(c => c.health === 'Warning').length;
  const critical = cronjobs.filter(c => c.health === 'Critical').length;

  // Total runs across all CronJobs
  const totalRuns = cronjobs.reduce((s, c) => s + c.totalRuns, 0);
  const totalSucceeded = cronjobs.reduce((s, c) => s + c.succeededRuns, 0);
  const totalFailed = cronjobs.reduce((s, c) => s + c.failedRuns, 0);
  const overallSuccessRate = totalRuns > 0 ? Math.round((totalSucceeded / totalRuns) * 100) : null;

  // Collect all alerts from all CronJobs
  const allAlerts = [];
  for (const cj of cronjobs) {
    for (const alert of cj.alerts) {
      allAlerts.push({
        ...alert,
        cronjobName: cj.name,
        cronjobNamespace: cj.namespace,
      });
    }
  }
  // Sort alerts by severity then timestamp
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  allAlerts.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  // Execution timeline: all recent jobs across all CronJobs, sorted by time
  const allRecentJobs = [];
  for (const cj of cronjobs) {
    for (const job of cj.recentJobs) {
      allRecentJobs.push({
        ...job,
        cronjobName: cj.name,
        cronjobNamespace: cj.namespace,
        schedule: cj.schedule,
      });
    }
  }
  allRecentJobs.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));

  // By-team breakdown
  const byTeam = {};
  for (const cj of cronjobs) {
    const team = cj.labels?.team || 'unknown';
    if (!byTeam[team]) byTeam[team] = { total: 0, healthy: 0, warning: 0, critical: 0 };
    byTeam[team].total++;
    if (cj.health === 'Healthy') byTeam[team].healthy++;
    else if (cj.health === 'Warning') byTeam[team].warning++;
    else if (cj.health === 'Critical') byTeam[team].critical++;
  }

  return {
    summary: {
      total,
      suspended,
      active,
      healthy,
      warning,
      critical,
      totalRuns,
      totalSucceeded,
      totalFailed,
      overallSuccessRate,
    },
    alerts: allAlerts,
    alertCount: allAlerts.length,
    cronjobs,
    recentExecutions: allRecentJobs.slice(0, 50),
    byTeam,
  };
}

/**
 * Get execution history for a specific CronJob.
 */
export async function getExecutionHistory(batchApi, coreApi, namespace, name, limit = 20) {
  log.debug('getExecutionHistory', `Fetching history for ${namespace}/${name}`);

  const jobsRes = await batchApi.listNamespacedJob(namespace);
  const ownedJobs = (jobsRes.items || []).filter(j =>
    (j.metadata?.ownerReferences || []).some(ref =>
      ref.kind === 'CronJob' && ref.name === name
    )
  );

  // Sort newest first
  ownedJobs.sort((a, b) => {
    const tA = new Date(a.status?.startTime || a.metadata?.creationTimestamp || 0);
    const tB = new Date(b.status?.startTime || b.metadata?.creationTimestamp || 0);
    return tB - tA;
  });

  return ownedJobs.slice(0, limit).map(formatJob);
}

/**
 * Get logs from a Job's pods.
 */
export async function getJobLogs(coreApi, namespace, jobName, opts = {}) {
  const { tailLines = 500, container, previous = false } = opts;
  log.debug('getJobLogs', `Fetching logs for job ${namespace}/${jobName}`);

  // Find pods owned by the Job
  const podsRes = await coreApi.listNamespacedPod(namespace, undefined, undefined, undefined, undefined,
    `job-name=${jobName}`
  );

  const pods = podsRes.items || [];
  if (pods.length === 0) return { logs: '', podName: null, message: 'No pods found for this job' };

  // Get logs from the first (or only) pod
  const pod = pods[0];
  const podName = pod.metadata?.name;
  const logOpts = { tailLines, previous };
  if (container) logOpts.container = container;

  try {
    const logRes = await coreApi.readNamespacedPodLog(podName, namespace, container || undefined,
      undefined, undefined, undefined, previous, undefined, tailLines
    );
    return { logs: logRes || '', podName, namespace };
  } catch (err) {
    log.warn('getJobLogs', `Could not read logs for ${podName}: ${err.message}`);
    return { logs: '', podName, error: err.message };
  }
}
