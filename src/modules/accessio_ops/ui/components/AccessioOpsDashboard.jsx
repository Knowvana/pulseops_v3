// ============================================================================
// AccessioOpsDashboard — Accessio Operations Module Dashboard
//
// PURPOSE: Main dashboard view for the Accessio Operations module.
// Features cluster health alerts, workload status, and system monitoring.
//
// USED BY: manifest.jsx → getViews() → dashboard
// ============================================================================
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Bell, XCircle, AlertTriangle, AlertCircle, RefreshCw, Loader2, X } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import urls from '../config/urls.json';

const log = createLogger('AccessioOpsDashboard');
const t = uiText.dashboard;

// ── Alert Helper Functions ──────────────────────────────────────────────────────
function SeverityIcon({ severity }) {
  if (severity === 'critical') return <XCircle size={14} className="text-red-500" />;
  if (severity === 'warning') return <AlertTriangle size={14} className="text-amber-500" />;
  return <AlertCircle size={14} className="text-blue-400" />;
}

function alertTypeColor(type) {
  const map = {
    failure: 'bg-red-100 text-red-600',
    pending: 'bg-amber-100 text-amber-600',
    running: 'bg-green-100 text-green-600',
    unknown: 'bg-gray-100 text-gray-600',
    pod_error: 'bg-purple-100 text-purple-600',
  };
  return map[type] || 'bg-gray-100 text-gray-600';
}

function alertTypeLabel(type) {
  const map = {
    failure: 'FAILURE',
    pending: 'PENDING',
    running: 'RUNNING',
    unknown: 'UNKNOWN',
    pod_error: 'POD ERROR',
  };
  return map[type] || type.replace(/_/g, ' ').toUpperCase();
}

function alertComponentLabel(alert) {
  if (alert.workloadName) return `${alert.workloadType || 'Workload'}`;
  if (alert.podName) return 'Pods';
  if (alert.namespace) return 'Namespace';
  return alert.component || '—';
}

function alertSubLabel(alert) {
  return alert.workloadName || alert.podName || alert.namespace || '—';
}

function getTimezoneWithOffset(timezone) {
  if (!timezone) return 'GMT +0 (UTC)';
  
  try {
    // Get current date for offset calculation
    const now = new Date();
    
    // Format timezone name and offset
    const tzName = timezone.split('/').pop(); // Get last part like "Kolkata"
    
    // Get GMT offset
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset'
    });
    
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find(p => p.type === 'timeZoneName');
    const offset = offsetPart ? offsetPart.value.replace('GMT', '') : '+0';
    
    // Get full timezone name
    const fullFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'long'
    });
    
    const fullParts = fullFormatter.formatToParts(now);
    const fullTzPart = fullParts.find(p => p.type === 'timeZoneName');
    const fullTzName = fullTzPart ? fullTzPart.value : tzName;
    
    // Extract short name from full name (e.g., "India Standard Time" -> "IST")
    let shortName = tzName;
    if (fullTzName.includes('Standard')) {
      shortName = fullTzName.split(' ').map(word => word[0]).join('');
    } else if (fullTzName.includes('Time')) {
      shortName = fullTzName.replace(' Time', '');
    }
    
    return `GMT ${offset} (${shortName})`;
  } catch (error) {
    // Fallback to simple format
    const tzName = timezone.split('/').pop();
    return `GMT +0 (${tzName})`;
  }
}

function formatTimeFromNow(date, generalSettings) {
  if (!date) return '—';
  const now = new Date();
  const target = new Date(date);
  const diffMs = target - now;
  const diffSecs = Math.floor(Math.abs(diffMs) / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const remainingSecs = diffSecs % 60;
  const remainingMins = diffMins % 60;
  
  // Get timezone and format settings
  const timezone = generalSettings?.timezone || 'Asia/Kolkata';
  const timeFormat = generalSettings?.timeFormat || 'HH:mm:ss';
  
  // Convert time format to Intl.DateTimeFormat options
  let timeOptions = { hour: '2-digit', minute: '2-digit' };
  if (timeFormat.includes('ss')) {
    timeOptions.second = '2-digit';
  }
  if (timeFormat.includes('hh') || timeFormat.includes('h')) {
    timeOptions.hour12 = true;
  } else {
    timeOptions.hour12 = false;
  }
  
  // Format actual time with configured timezone
  const actualTime = target.toLocaleTimeString('en-US', {
    ...timeOptions,
    timeZone: timezone
  });
  
  // Format relative time
  let relativeTime;
  if (diffMs < 0) {
    const absSecs = Math.abs(diffSecs);
    const absMins = Math.abs(diffMins);
    const absHours = Math.abs(diffHours);
    const absDays = Math.abs(diffDays);
    if (absSecs < 60) relativeTime = `${absSecs}s ago`;
    else if (absMins < 60) relativeTime = `${absMins}m ago`;
    else if (absHours < 24) relativeTime = `${absHours}h ${remainingMins}m ago`;
    else relativeTime = `${absDays}d ago`;
  } else {
    if (diffSecs < 60) relativeTime = `in ${diffSecs}s`;
    else if (diffMins < 60) relativeTime = `in ${diffMins}m`;
    else if (diffHours < 24) relativeTime = `in ${diffHours}h ${remainingMins}m`;
    else relativeTime = `in ${diffDays}d`;
  }
  
  return (
    <div>
      <div className="text-[10px] text-surface-900 font-medium">{actualTime}</div>
      <div className="text-[9px] text-surface-500">{relativeTime}</div>
    </div>
  );
}

function formatPodErrors(podErrors, onClick) {
  if (!podErrors || podErrors.length === 0) return '—';
  
  const criticalCount = podErrors.filter(err => err.severity === 'critical').length;
  const warningCount = podErrors.filter(err => err.severity === 'warning').length;
  
  return (
    <div className="space-y-2 min-w-[500px] max-w-[600px]">
      <div className="text-sm font-medium text-surface-700">
        {podErrors.length} error{podErrors.length > 1 ? 's' : ''}
      </div>
      
      <div className="flex items-center gap-2 flex-wrap">
        {criticalCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
            🔴 {criticalCount} critical
          </span>
        )}
        {warningCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
            🟡 {warningCount} warning
          </span>
        )}
        <button
          onClick={onClick}
          className="text-xs text-blue-600 hover:text-blue-800 underline font-medium"
        >
          View Details →
        </button>
      </div>
      
      <div className="space-y-1">
        {podErrors.slice(0, 2).map((error, idx) => (
          <div key={idx} className="text-xs text-surface-600">
            <div className="font-medium text-surface-800">{error.type.replace('_', ' ')}</div>
            <div className="text-surface-400">{error.message}</div>
            {error.container && (
              <div className="text-surface-400 text-xs">
                Container: {error.container}
              </div>
            )}
            {error.image && (
              <div className="text-surface-400 text-xs">
                Image: {error.image}
              </div>
            )}
            {error.exitCode !== undefined && (
              <div className="text-surface-400 text-xs">
                Exit Code: {error.exitCode}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AccessioOpsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [generalSettings, setGeneralSettings] = useState(null);
  const [selectedPodErrors, setSelectedPodErrors] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Load dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load general settings, cluster data, workloads, and pod errors
        const [generalSettingsResponse, clusterInfoResponse, workloadsResponse, podErrorsResponse] = await Promise.all([
          ApiClient.get('/api/settings'),
          ApiClient.get(urls.api.clusterInfo),
          ApiClient.get(urls.api.clusterWorkloads),
          ApiClient.get('/api/accessio_ops/cluster/pods/errors')
        ]);
        
        // Get general settings
        const settings = generalSettingsResponse.success ? generalSettingsResponse.data || {} : {};
        setGeneralSettings(settings);
        
        if (!clusterInfoResponse.success) {
          throw new Error(clusterInfoResponse.error?.message || 'Failed to load cluster info');
        }
        
        if (!workloadsResponse.success) {
          throw new Error(workloadsResponse.error?.message || 'Failed to load workloads');
        }

        // Get pod errors data
        const podErrors = podErrorsResponse.success ? podErrorsResponse.data?.podErrors || [] : [];
        const podErrorsSummary = podErrorsResponse.success ? podErrorsResponse.data?.summary || {} : {};

        // Generate alerts from workload data
        const alerts = [];
        const workloads = Array.isArray(workloadsResponse.data?.workloads?.items) ? workloadsResponse.data.workloads.items : [];
        
        // Debug: Log the structure
        log.debug('Workloads response structure', {
          workloadsResponse: workloadsResponse,
          workloadsData: workloadsResponse.data,
          workloadsArray: workloadsResponse.data?.workloads?.items,
          isArray: Array.isArray(workloadsResponse.data?.workloads?.items),
          workloadsCount: workloads.length
        });
        
        workloads.forEach(workload => {
          // Find associated pod errors for this workload
          const associatedPodErrors = podErrors.filter(pe => 
            pe.labels?.app === workload.name || 
            pe.name?.includes(workload.name)
          );
          
          // Get the most recent error time from associated pods
          let errorTime = workload.createdAt || workload.creationTime || new Date().toISOString();
          if (associatedPodErrors.length > 0) {
            const podErrorTimes = associatedPodErrors
              .flatMap(pe => pe.errors?.map(err => err.errorTime) || [])
              .filter(time => time);
            if (podErrorTimes.length > 0) {
              errorTime = podErrorTimes.sort().reverse()[0];
            }
          }
          
          // Check for failed/pending workloads
          if (workload.status === 'pending') {
            alerts.push({
              severity: 'warning',
              type: 'pending',
              component: alertComponentLabel(workload),
              workloadName: workload.name,
              workloadType: workload.type,
              namespace: workload.namespace,
              message: `${workload.type} '${workload.name}' is pending`,
              timestamp: errorTime,
              logMessage: `Ready: ${workload.pods?.ready || 0}/${workload.pods?.total || 0}`,
              podErrors: []
            });
          }
          
          // Check for failed replicas
          if (workload.pods && workload.pods.ready < workload.pods.total) {
            alerts.push({
              severity: workload.pods.ready === 0 ? 'critical' : 'warning',
              type: 'failure',
              component: alertComponentLabel(workload),
              workloadName: workload.name,
              workloadType: workload.type,
              namespace: workload.namespace,
              message: `${workload.type} '${workload.name}' has ${workload.pods.ready}/${workload.pods.total} ready pods`,
              timestamp: errorTime,
              logMessage: `Replica mismatch detected`,
              podErrors: []
            });
          }
        });

        // Add alerts for pod errors
        podErrors.forEach(podError => {
          // Get the most recent error time from all errors
          let errorTime = podError.creationTime;
          if (podError.errors && podError.errors.length > 0) {
            const errorTimes = podError.errors
              .map(err => err.errorTime)
              .filter(time => time);
            if (errorTimes.length > 0) {
              // Use the most recent error time
              errorTime = errorTimes.sort().reverse()[0];
            }
          }
          
          alerts.push({
            severity: 'critical',
            type: 'pod_error',
            component: 'Pods',
            workloadName: podError.name,
            workloadType: 'Pod',
            namespace: podError.namespace,
            message: `Pod '${podError.name}' has ${podError.errors.length} error(s)`,
            timestamp: errorTime || podError.createdAt || new Date().toISOString(),
            logMessage: `Phase: ${podError.phase}, Restarts: ${podError.restartCount}`,
            podErrors: podError.errors
          });
        });

        // Calculate pod summary statistics
        const podSummary = {
          totalPods: 0,
          runningPods: 0,
          pendingPods: 0,
          errorPods: 0,
          failedPods: 0
        };

        // Count pods from workloads
        workloads.forEach(workload => {
          if (workload.pods) {
            podSummary.totalPods += workload.pods.total || 0;
            podSummary.runningPods += workload.pods.ready || 0;
            // Don't calculate pending here - we'll get it from actual pod data
          }
        });

        // Count pods with errors (unique pod names to avoid double counting)
        const errorPodNames = new Set();
        podErrors.forEach(podError => {
          if (podError.name) {
            errorPodNames.add(podError.name);
          }
        });
        podSummary.errorPods = errorPodNames.size;

        // Calculate pending as total - running - error
        podSummary.pendingPods = podSummary.totalPods - podSummary.runningPods - podSummary.errorPods;

        // Calculate workload types
        const workloadTypes = {
          deployments: 0,
          statefulSets: 0,
          cronJobs: 0,
          jobs: 0,
          daemonSets: 0
        };

        workloads.forEach(workload => {
          switch (workload.type?.toLowerCase()) {
            case 'deployment':
              workloadTypes.deployments++;
              break;
            case 'statefulset':
              workloadTypes.statefulSets++;
              break;
            case 'cronjob':
              workloadTypes.cronJobs++;
              break;
            case 'job':
              workloadTypes.jobs++;
              break;
            case 'daemonset':
              workloadTypes.daemonSets++;
              break;
          }
        });

        const dashboardData = {
          cluster: clusterInfoResponse.data,
          workloads: workloadsResponse.data,
          alerts: alerts,
          podErrors: podErrors,
          podErrorsSummary: podErrorsSummary,
          podSummary: podSummary,
          workloadTypes: workloadTypes,
          summary: {
            totalWorkloads: workloads.length,
            healthyWorkloads: workloads.filter(w => w.status === 'running').length,
            pendingWorkloads: workloads.filter(w => w.status === 'pending').length,
            totalAlerts: alerts.length,
            criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
            warningAlerts: alerts.filter(a => a.severity === 'warning').length,
          }
        };

        setData(dashboardData);
        setLastRefreshed(new Date());
        
      } catch (err) {
        setError(err.message);
        log.error('loadDashboardData', 'Failed to load dashboard data', { error: err.message });
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  // ── Render: dashboard ───────────────────────────────────────────────────
  const allAlerts = data?.alerts || [];
  const criticalAlerts = allAlerts.filter(a => a.severity === 'critical');
  const warningAlerts = allAlerts.filter(a => a.severity === 'warning');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">{t.title}</h1>
          <p className="text-surface-500">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-surface-400">
          {lastRefreshed && (
            <span>Last refreshed: {formatTimeFromNow(lastRefreshed, generalSettings)}</span>
          )}
          <button
            onClick={() => window.location.reload()}
            className="p-1.5 rounded hover:bg-surface-100 text-surface-400 hover:text-surface-600"
            title="Refresh dashboard"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-xl border border-surface-200 p-12 text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-surface-300" size={32} />
          <p className="text-surface-500">Loading dashboard...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-center gap-2 text-red-600 mb-2">
            <XCircle size={16} />
            <span className="font-semibold">Error</span>
          </div>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Summary Stats */}
      {!loading && !error && data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Workloads */}
          <div className="bg-white rounded-xl border border-surface-200 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-surface-500">Total Workloads</p>
              <div className="p-1 bg-green-100 rounded-lg">
                <LayoutDashboard size={16} className="text-green-600" />
              </div>
            </div>
            <div className="flex items-end justify-between mb-2">
              <div className="flex items-center gap-4">
                <p className="text-2xl font-bold text-surface-900">{data.summary.totalWorkloads}</p>
                <div className="flex gap-1">
                  <div className="text-center">
                    <span className="text-xs font-bold text-blue-600">{data.workloadTypes?.deployments || 0}</span>
                    <div className="text-[9px] text-blue-600">Deployments</div>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-bold text-purple-600">{data.workloadTypes?.statefulSets || 0}</span>
                    <div className="text-[9px] text-purple-600">StatefulSets</div>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-bold text-orange-600">{data.workloadTypes?.cronJobs || 0}</span>
                    <div className="text-[9px] text-orange-600">CronJobs</div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="text-center">
                  <span className="text-sm font-bold text-green-600">{data.summary.healthyWorkloads}</span>
                  <div className="text-xs text-green-600">✓ Healthy</div>
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold text-amber-600">{data.summary.pendingWorkloads}</span>
                  <div className="text-xs text-amber-600">⚠ Pending</div>
                </div>
              </div>
            </div>
          </div>

          {/* Total Pods */}
          <div className="bg-white rounded-xl border border-surface-200 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-surface-500">Total Pods</p>
              <div className="p-1 bg-blue-100 rounded-lg">
                <LayoutDashboard size={16} className="text-blue-600" />
              </div>
            </div>
            <div className="flex items-end justify-between mb-2">
              <p className="text-xl font-bold text-surface-900">{data.podSummary?.totalPods || 0}</p>
              <div className="flex gap-3">
                <div className="text-center">
                  <span className="text-sm font-bold text-green-600">{data.podSummary?.runningPods || 0}</span>
                  <div className="text-xs text-green-600">↑ Running</div>
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold text-amber-600">{data.podSummary?.pendingPods || 0}</span>
                  <div className="text-xs text-amber-600">↓ Pending</div>
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold text-red-600">{data.podSummary?.errorPods || 0}</span>
                  <div className="text-xs text-red-600">✕ Errors</div>
                </div>
              </div>
            </div>
          </div>

          {/* Alerts */}
          <div className="bg-white rounded-xl border border-surface-200 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-surface-500">Alerts</p>
              <div className="p-1 bg-red-100 rounded-lg">
                <Bell size={16} className="text-red-600" />
              </div>
            </div>
            <div className="flex items-end justify-between mb-2">
              <p className="text-xl font-bold text-red-600">{data.summary.totalAlerts}</p>
              <div className="flex gap-3">
                <div className="text-center">
                  <span className="text-sm font-bold text-red-600">{data.summary.criticalAlerts || 0}</span>
                  <div className="text-xs text-red-600">🔴 Critical</div>
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold text-amber-600">{data.summary.warningAlerts || 0}</span>
                  <div className="text-xs text-amber-600">🟡 Warning</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Alerts Section */}
      {!loading && !error && allAlerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-5 py-2 border-b border-amber-200 bg-gradient-to-r from-amber-200 to-amber-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-amber-700" />
              <div>
                <p className="text-xs font-bold text-amber-900">Active Alerts</p>
                <p className="text-[10px] text-amber-700">{criticalAlerts.length} critical, {warningAlerts.length} warning</p>
              </div>
            </div>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">
              {allAlerts.length}
            </span>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[550px]">
            <table className="w-full min-w-[1600px] text-sm border border-surface-200">
              <thead>
                <tr className="text-[10px] text-surface-500 uppercase tracking-wider bg-gradient-to-r from-surface-100 to-surface-50 border-b-2 border-surface-200 font-bold sticky top-0 z-10">
                  <th className="text-left px-4 py-2 min-w-[140px] border-r border-surface-200 text-[9px]">
                  Time ({getTimezoneWithOffset(generalSettings?.timezone)})
                </th>
                  <th className="text-left px-3 py-2 min-w-[100px] border-r border-surface-200">Severity</th>
                  <th className="text-left px-3 py-2 min-w-[150px] border-r border-surface-200">Component</th>
                  <th className="text-left px-3 py-2 min-w-[120px] border-r border-surface-200">Type</th>
                  <th className="text-left px-3 py-2 min-w-[300px] border-r border-surface-200">Message</th>
                  <th className="text-left px-3 py-2 min-w-[200px] border-r border-surface-200">Details</th>
                  <th className="text-left px-3 py-2 min-w-[600px]">Pod Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {allAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map((alert, idx) => (
                  <tr key={idx} className="hover:bg-surface-50/60 border-b border-surface-50">
                    <td className="px-4 py-2 text-surface-600 whitespace-nowrap min-w-[140px] border-r border-surface-100">
                      <div className="text-xs">
                        {formatTimeFromNow(alert.timestamp, generalSettings)}
                      </div>
                    </td>
                    <td className="px-3 py-2 min-w-[100px] border-r border-surface-100">
                      <div className="flex items-center gap-1">
                        <SeverityIcon severity={alert.severity} />
                        <span className="capitalize text-[10px] font-bold">{alert.severity}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-surface-600 min-w-[150px] border-r border-surface-100">
                      <div className="text-xs font-medium">{alertComponentLabel(alert)}</div>
                      <div className="text-[10px] text-surface-400">{alertSubLabel(alert)}</div>
                    </td>
                    <td className="px-3 py-2 min-w-[120px] border-r border-surface-100">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${alertTypeColor(alert.type)}`}>
                        {alertTypeLabel(alert.type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-surface-700 min-w-[300px] border-r border-surface-100">{alert.message}</td>
                    <td className="px-3 py-2 text-surface-700 min-w-[200px] border-r border-surface-100">
                      <div className="text-xs text-surface-700 break-words">{alert.logMessage || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-surface-700 min-w-[600px]">
                      {formatPodErrors(alert.podErrors, () => {
                        setSelectedPodErrors(alert.podErrors);
                        setShowModal(true);
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No Alerts State */}
      {!loading && !error && allAlerts.length === 0 && (
        <div className="bg-white rounded-xl border border-surface-200 p-12 text-center">
          <LayoutDashboard size={48} className="mx-auto mb-4 text-green-500" />
          <p className="text-surface-500 font-medium">All systems operational</p>
          <p className="text-surface-400 text-sm mt-1">No active alerts detected</p>
        </div>
      )}

      {/* Pod Errors Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-surface-200 shadow-xl max-w-4xl max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-surface-200 bg-gradient-to-r from-red-50 to-amber-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} className="text-red-600" />
                <h3 className="text-lg font-semibold text-surface-900">
                  Pod Error Details
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded hover:bg-surface-100 text-surface-400 hover:text-surface-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
              {selectedPodErrors && selectedPodErrors.length > 0 ? (
                <div className="space-y-4">
                  {/* Error Summary */}
                  <div className="bg-surface-50 rounded-lg p-4">
                    <div className="text-sm font-medium text-surface-700 mb-2">
                      Total Errors: {selectedPodErrors.length}
                    </div>
                    <div className="flex gap-2">
                      {selectedPodErrors.filter(err => err.severity === 'critical').length > 0 && (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                          🔴 {selectedPodErrors.filter(err => err.severity === 'critical').length} Critical
                        </span>
                      )}
                      {selectedPodErrors.filter(err => err.severity === 'warning').length > 0 && (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                          🟡 {selectedPodErrors.filter(err => err.severity === 'warning').length} Warning
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Individual Errors */}
                  {selectedPodErrors.map((error, idx) => (
                    <div key={idx} className="bg-white border border-surface-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                            error.severity === 'critical' 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {error.severity === 'critical' ? '🔴' : '🟡'} {error.severity}
                          </span>
                          <span className="text-sm font-medium text-surface-800">
                            {error.type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs font-medium text-surface-500 mb-1">Message</div>
                          <div className="text-sm text-surface-700">{error.message}</div>
                        </div>
                        
                        {error.details && (
                          <div>
                            <div className="text-xs font-medium text-surface-500 mb-1">Details</div>
                            <div className="text-sm text-surface-700 bg-surface-50 p-2 rounded">
                              {error.details}
                            </div>
                          </div>
                        )}
                        
                        {error.container && (
                          <div>
                            <div className="text-xs font-medium text-surface-500 mb-1">Container</div>
                            <div className="text-sm text-surface-700 font-mono bg-surface-50 px-2 py-1 rounded">
                              {error.container}
                            </div>
                          </div>
                        )}
                        
                        {error.image && (
                          <div>
                            <div className="text-xs font-medium text-surface-500 mb-1">Image</div>
                            <div className="text-sm text-surface-700 font-mono bg-surface-50 px-2 py-1 rounded">
                              {error.image}
                            </div>
                          </div>
                        )}
                        
                        {error.exitCode !== undefined && (
                          <div>
                            <div className="text-xs font-medium text-surface-500 mb-1">Exit Code</div>
                            <div className="text-sm text-surface-700 font-mono bg-surface-50 px-2 py-1 rounded">
                              {error.exitCode}
                            </div>
                          </div>
                        )}
                        
                        {error.errorTime && (
                          <div>
                            <div className="text-xs font-medium text-surface-500 mb-1">Error Time</div>
                            <div className="text-sm text-surface-700">
                              {formatTimeFromNow(error.errorTime, generalSettings)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle size={48} className="mx-auto mb-4 text-surface-300" />
                  <p className="text-surface-500">No error details available</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-surface-200 bg-surface-50">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-surface-200 text-surface-700 rounded-lg hover:bg-surface-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
