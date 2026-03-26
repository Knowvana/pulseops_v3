// ============================================================================
// Google GKE Module — CronJobs View Component (Enterprise-Grade)
//
// PURPOSE: Full CronJob monitoring command center that surpasses GCP Console.
// Features NOT available in native GCP:
//   - Real-time alert detection (failures, missed schedules, high failure rate)
//   - Success rate analytics with visual gauges per CronJob
//   - Execution timeline across ALL CronJobs (unified view)
//   - SLA tracking with owner attribution
//   - Expandable execution history per CronJob
//   - Job log viewer with error highlighting
//   - Auto-refresh with configurable interval
//   - Timezone-aware time display (from ServiceNow module)
//
// SECTIONS:
//   1. Active Alerts panel (top — severity-coded, with error/status details)
//   2. Summary table (2-column layout: metrics in col1, col2 reserved)
//   3. CronJob DataTable with health badges, success bars, alert indicators
//   4. Expandable row → execution history + job log viewer
//   5. Execution Timeline (recent jobs across all CronJobs)
//
// API ENDPOINTS:
//   GET /api/google_gke/cronjobs/dashboard        → Full dashboard data
//   GET /api/google_gke/cronjobs/:ns/:name/history → Execution history
//   GET /api/google_gke/cronjobs/:ns/:name/logs   → Job logs
//
// TEXT: uiText.json → cronjobs section
// LOGGING: INFO=minimum (lifecycle), DEBUG=maximum (data, render, state)
// ============================================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Clock, RefreshCw, AlertTriangle, CheckCircle2, XCircle, AlertCircle,
  ChevronDown, ChevronRight, FileText, Download, Play, Pause, Timer,
  Shield, TrendingUp, Activity, Bell, Eye, Grid3X3,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import urls from '../config/urls.json';
import DataTable from './DataTable';

const log = createLogger('CronjobsView');
const T = uiText.cronjobs;
const U = urls.api;

// ── Timezone helpers ──────────────────────────────────────────────────────────
function getTimezoneAbbreviation(iana) {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: iana, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value || '';
  } catch { return ''; }
}

function formatInTimezone(date, iana) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: iana,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true,
    }).format(date instanceof Date ? date : new Date(date));
  } catch { return new Date(date).toLocaleString(); }
}

function formatTimeOnly(date, iana) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: iana,
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true,
    }).format(date instanceof Date ? date : new Date(date));
  } catch { return new Date(date).toLocaleTimeString(); }
}

function tzLabel(tz) {
  if (!tz) return '';
  return ` ${tz.abbr} (${tz.iana})`;
}

// ── Health badge component ──────────────────────────────────────────────────
function HealthBadge({ health }) {
  const cfg = {
    Healthy:   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2 },
    Warning:   { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: AlertTriangle },
    Critical:  { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircle },
    Suspended: { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', icon: Pause },
  }[health] || { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', icon: AlertCircle };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <Icon size={11} /> {health}
    </span>
  );
}

// ── Status badge for job executions ─────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    Succeeded: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    Failed:    { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    Running:   { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    Unknown:   { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' },
  }[status] || { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {status}
    </span>
  );
}

// ── Success rate gauge ──────────────────────────────────────────────────────
function SuccessGauge({ rate, runs }) {
  if (rate === null || rate === undefined) return <span className="text-xs text-gray-400">—</span>;
  const color = rate >= 95 ? 'bg-emerald-500' : rate >= 80 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = rate >= 95 ? 'text-emerald-700' : rate >= 80 ? 'text-amber-700' : 'text-red-700';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <span className={`text-[11px] font-bold ${textColor} whitespace-nowrap`}>{rate}%</span>
      <span className="text-[9px] text-gray-400">({runs})</span>
    </div>
  );
}

// ── Alert severity icon ─────────────────────────────────────────────────────
function SeverityIcon({ severity }) {
  if (severity === 'critical') return <XCircle size={14} className="text-red-500" />;
  if (severity === 'warning') return <AlertTriangle size={14} className="text-amber-500" />;
  return <AlertCircle size={14} className="text-blue-400" />;
}

// ── Alert type label helper ──────────────────────────────────────────────────
function alertTypeLabel(type) {
  const map = {
    failure: 'EXECUTION FAILED',
    missed_schedule: 'MISSED SCHEDULE',
    high_failure_rate: 'HIGH FAILURE RATE',
    long_running: 'LONG RUNNING',
  };
  return map[type] || type.replace(/_/g, ' ').toUpperCase();
}

function alertTypeColor(type) {
  const map = {
    failure: 'bg-red-100 text-red-600',
    missed_schedule: 'bg-amber-100 text-amber-600',
    high_failure_rate: 'bg-orange-100 text-orange-600',
    long_running: 'bg-blue-100 text-blue-600',
  };
  return map[type] || 'bg-gray-100 text-gray-600';
}

// ── Job Logs Dialog ─────────────────────────────────────────────────────────
function JobLogsDialog({ open, onClose, namespace, cronjobName, jobName }) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [tailLines, setTailLines] = useState(500);
  const logRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    if (!namespace || !cronjobName) return;
    setLoading(true);
    try {
      let url = U.cronjobLogs.replace('{ns}', namespace).replace('{name}', cronjobName);
      url += `?tailLines=${tailLines}`;
      if (jobName) url += `&jobName=${jobName}`;
      const res = await ApiClient.get(url);
      setLogs(res.data?.logs || '');
      setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 100);
    } catch { setLogs('Failed to fetch logs.'); }
    setLoading(false);
  }, [namespace, cronjobName, jobName, tailLines]);

  useEffect(() => { if (open) fetchLogs(); }, [open, fetchLogs]);

  if (!open) return null;

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cronjobName}_${jobName || 'latest'}_logs.txt`;
    a.click();
  };

  const highlightedLogs = logs.split('\n').map((line, i) => {
    const isError = /error|ERROR|FATAL|panic/i.test(line);
    const isWarn = /warn|WARNING/i.test(line);
    return (
      <div key={i} className={`${isError ? 'bg-red-50 text-red-700' : isWarn ? 'bg-amber-50 text-amber-700' : 'text-gray-700'} px-2`}>
        {line || '\u00A0'}
      </div>
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900">{T.logs.title}: {cronjobName}</h3>
            <p className="text-[10px] text-gray-400">{jobName ? `Job: ${jobName}` : 'Latest execution'} · {namespace}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-400">{T.logs.tailLines}</label>
            <select value={tailLines} onChange={e => setTailLines(+e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1">
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
            <button onClick={fetchLogs} disabled={loading}
              className="text-xs px-3 py-1 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={handleDownload}
              className="text-xs px-3 py-1 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100">
              <Download size={12} />
            </button>
            <button onClick={onClose}
              className="text-xs px-3 py-1 bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 font-medium">
              {T.logs.close}
            </button>
          </div>
        </div>
        <div ref={logRef} className="flex-1 overflow-auto bg-gray-50 font-mono text-[11px] leading-5 p-0 min-h-[300px]">
          {loading ? <p className="p-4 text-gray-400">Loading logs...</p> : highlightedLogs}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function CronjobsView({ user, onNavigate }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [historyData, setHistoryData] = useState({});
  const [historyLoading, setHistoryLoading] = useState({});
  const [logsDialog, setLogsDialog] = useState({ open: false, ns: null, name: null, jobName: null });
  const [nsFilter, setNsFilter] = useState('');
  const [healthFilter, setHealthFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [timezone, setTimezone] = useState(null);
  const timerRef = useRef(null);

  // ── Load timezone from ServiceNow module ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        log.debug('Fetching timezone config from ServiceNow module');
        const res = await ApiClient.get('/api/servicenow/config/timezone');
        if (res?.success && res.data?.effectiveTimezone) {
          const iana = res.data.effectiveTimezone;
          const abbr = getTimezoneAbbreviation(iana);
          setTimezone({ iana, abbr });
          log.info('Timezone loaded', { iana, abbr });
        } else {
          log.debug('ServiceNow timezone not available, using browser default');
        }
      } catch (err) {
        log.debug('Could not fetch timezone from ServiceNow', { error: err.message });
      }
    })();
  }, []);

  // ── Timezone-aware formatters ─────────────────────────────────────────
  const fmtDateTime = useCallback((val) => {
    if (!val) return '—';
    return timezone ? formatInTimezone(val, timezone.iana) : new Date(val).toLocaleString();
  }, [timezone]);

  const fmtTimeOnly = useCallback((val) => {
    if (!val) return '—';
    return timezone ? formatTimeOnly(val, timezone.iana) : new Date(val).toLocaleTimeString();
  }, [timezone]);

  // ── Fetch dashboard data ────────────────────────────────────────────────
  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); log.info('Fetching CronJob dashboard'); }
    else { log.debug('Silent refresh: fetching CronJob dashboard'); }
    setError(null);
    try {
      const res = await ApiClient.get(U.cronjobDashboard);
      setDashboard(res.data);
      setLastRefreshed(new Date());
      log.debug('Dashboard data received', {
        cronjobs: res.data?.cronjobs?.length,
        alerts: res.data?.alerts?.length,
        executions: res.data?.recentExecutions?.length,
      });
    } catch (err) {
      const msg = err?.message || 'Failed to load CronJob dashboard';
      setError(msg);
      log.error('Dashboard fetch failed', { error: msg });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // ── Auto-refresh ────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh && refreshInterval > 0) {
      log.debug('Auto-refresh enabled', { intervalSec: refreshInterval });
      timerRef.current = setInterval(() => fetchDashboard(true), refreshInterval * 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, refreshInterval, fetchDashboard]);

  // ── Fetch execution history for expanded row ────────────────────────────
  const fetchHistory = useCallback(async (ns, name) => {
    const key = `${ns}/${name}`;
    setHistoryLoading(prev => ({ ...prev, [key]: true }));
    try {
      const url = U.cronjobHistory.replace('{ns}', ns).replace('{name}', name);
      const res = await ApiClient.get(url);
      setHistoryData(prev => ({ ...prev, [key]: res.data || [] }));
    } catch { setHistoryData(prev => ({ ...prev, [key]: [] })); }
    setHistoryLoading(prev => ({ ...prev, [key]: false }));
  }, []);

  const toggleRow = useCallback((ns, name) => {
    const key = `${ns}/${name}`;
    if (expandedRow === key) { setExpandedRow(null); return; }
    setExpandedRow(key);
    if (!historyData[key]) fetchHistory(ns, name);
  }, [expandedRow, historyData, fetchHistory]);

  // ── Derived data ────────────────────────────────────────────────────────
  const summary = dashboard?.summary || {};
  const alerts = dashboard?.alerts || [];
  const cronjobs = dashboard?.cronjobs || [];
  const recentExecs = dashboard?.recentExecutions || [];

  // Unique filter options
  const namespaces = useMemo(() => [...new Set(cronjobs.map(c => c.namespace))].sort(), [cronjobs]);
  const owners = useMemo(() => [...new Set(cronjobs.map(c => c.owner).filter(Boolean))].sort(), [cronjobs]);

  // Filtered cronjobs for table
  const filteredCronjobs = useMemo(() => {
    let list = cronjobs;
    if (nsFilter) list = list.filter(c => c.namespace === nsFilter);
    if (healthFilter) list = list.filter(c => c.health === healthFilter);
    if (ownerFilter) list = list.filter(c => c.owner === ownerFilter);
    return list;
  }, [cronjobs, nsFilter, healthFilter, ownerFilter]);

  // ── DataTable columns ───────────────────────────────────────────────────
  const columns = useMemo(() => [
    { key: 'expand', label: '', width: 36, sortable: false, render: (_v, row) => {
      const key = `${row.namespace}/${row.name}`;
      return (
        <button onClick={e => { e.stopPropagation(); toggleRow(row.namespace, row.name); }}
          className="text-gray-400 hover:text-gray-600">
          {expandedRow === key ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      );
    }},
    { key: 'health', label: T.grid.health, width: 110, render: (_v, row) => <HealthBadge health={row.health} /> },
    { key: 'name', label: T.grid.name, width: 220, render: (_v, row) => (
      <div>
        <span className="text-xs font-bold text-gray-900">{row.name}</span>
        {row.alertCount > 0 && (
          <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-600 text-[9px] font-bold">{row.alertCount}</span>
        )}
        {row.description && <p className="text-[9px] text-gray-400 truncate max-w-[200px]">{row.description}</p>}
      </div>
    )},
    { key: 'namespace', label: T.grid.namespace, width: 100 },
    { key: 'scheduleDescription', label: T.grid.scheduleDesc, width: 110, render: (_v, row) => (
      <div>
        <span className="text-[11px] font-medium text-gray-700">{row.scheduleDescription}</span>
        <p className="text-[9px] text-gray-400 font-mono">{row.schedule}</p>
      </div>
    )},
    { key: 'lastStatus', label: T.grid.lastStatus, width: 100, render: (_v, row) => <StatusBadge status={row.lastStatus} /> },
    { key: 'lastScheduleAge', label: T.grid.lastRun, width: 90 },
    { key: 'nextRunEstimate', label: T.grid.nextRun, width: 110, render: (_v, row) => {
      if (!row.nextRunEstimate) return <span className="text-[11px] text-gray-400">—</span>;
      return <span className="text-[11px] text-gray-600">{fmtDateTime(row.nextRunEstimate)}</span>;
    }},
    { key: 'lastDuration', label: T.grid.lastDuration, width: 90 },
    { key: 'successRate', label: T.grid.successRate, width: 160, render: (_v, row) => <SuccessGauge rate={row.successRate} runs={row.totalRuns} /> },
    { key: 'succeededRuns', label: T.grid.succeeded, width: 70, render: (_v, row) => (
      <span className="text-xs font-bold text-emerald-600">{row.succeededRuns}</span>
    )},
    { key: 'failedRuns', label: T.grid.failed, width: 65, render: (_v, row) => (
      <span className={`text-xs font-bold ${row.failedRuns > 0 ? 'text-red-600' : 'text-gray-300'}`}>{row.failedRuns}</span>
    )},
    { key: 'avgDuration', label: T.grid.avgDuration, width: 100 },
    { key: 'activeJobs', label: T.grid.activeJobs, width: 65, render: (_v, row) => (
      <span className={`text-xs font-bold ${row.activeJobs > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{row.activeJobs}</span>
    )},
    { key: 'owner', label: T.grid.owner, width: 130, render: (_v, row) => (
      <span className="text-[10px] text-gray-500">{row.owner || '—'}</span>
    )},
    { key: 'concurrencyPolicy', label: T.grid.concurrencyPolicy, width: 100 },
    { key: 'age', label: T.grid.age, width: 80 },
    { key: 'actions', label: T.grid.actions, width: 120, sortable: false, render: (_v, row) => (
      <div className="flex items-center gap-1">
        <button onClick={e => { e.stopPropagation(); toggleRow(row.namespace, row.name); }}
          className="text-[10px] px-2 py-0.5 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 flex items-center gap-1">
          <Eye size={10} /> {T.grid.viewHistory}
        </button>
        <button onClick={e => { e.stopPropagation(); setLogsDialog({ open: true, ns: row.namespace, name: row.name, jobName: null }); }}
          className="text-[10px] px-2 py-0.5 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 flex items-center gap-1">
          <FileText size={10} /> {T.grid.viewLogs}
        </button>
      </div>
    )},
  ], [expandedRow, toggleRow, fmtDateTime]);

  // ── Expanded row renderer ───────────────────────────────────────────────
  const renderExpandedRow = useCallback((row) => {
    const key = `${row.namespace}/${row.name}`;
    if (expandedRow !== key) return null;
    const jobs = historyData[key] || [];
    const isLoading = historyLoading[key];

    return (
      <tr>
        <td colSpan={columns.length} className="p-0">
          <div className="bg-slate-50 border-t border-b border-slate-200 px-6 py-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-gray-700">{T.history.title}: {row.name}</h4>
              <button onClick={() => fetchHistory(row.namespace, row.name)}
                className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded hover:bg-gray-50 flex items-center gap-1">
                <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            {isLoading ? (
              <p className="text-xs text-gray-400 py-2">Loading execution history...</p>
            ) : jobs.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No execution history found.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-gray-400 uppercase tracking-wider">
                    <th className="text-left py-1 pr-3">{T.history.jobName}</th>
                    <th className="text-left py-1 pr-3">{T.history.status}</th>
                    <th className="text-left py-1 pr-3">{T.history.startTime}</th>
                    <th className="text-left py-1 pr-3">{T.history.completionTime}</th>
                    <th className="text-left py-1 pr-3">{T.history.duration}</th>
                    <th className="text-left py-1">{T.history.viewLogs}</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job, i) => (
                    <tr key={i} className="border-t border-slate-200/60 hover:bg-white/60">
                      <td className="py-1.5 pr-3 font-mono text-[10px] text-gray-600">{job.name}</td>
                      <td className="py-1.5 pr-3"><StatusBadge status={job.status} /></td>
                      <td className="py-1.5 pr-3 text-gray-500">{fmtDateTime(job.startTime)}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{fmtDateTime(job.completionTime)}</td>
                      <td className="py-1.5 pr-3 font-medium text-gray-700">{job.duration}</td>
                      <td className="py-1.5">
                        <button onClick={() => setLogsDialog({ open: true, ns: row.namespace, name: row.name, jobName: job.name })}
                          className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded hover:bg-gray-50 flex items-center gap-1">
                          <FileText size={10} /> Logs
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </td>
      </tr>
    );
  }, [expandedRow, historyData, historyLoading, columns.length, fetchHistory, fmtDateTime]);

  // ── Loading / Error states ──────────────────────────────────────────────
  if (loading && !dashboard) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={20} className="animate-spin text-gray-400 mr-2" />
        <span className="text-sm text-gray-400">{uiText.common.loading}</span>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <XCircle size={32} className="text-red-400" />
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={() => fetchDashboard()} className="text-xs px-4 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900">{T.dashboardTitle}</h1>
          <p className="text-xs text-gray-400">{T.dashboardSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-[10px] text-gray-400">{T.lastRefreshed}: {fmtTimeOnly(lastRefreshed)}{tzLabel(timezone)}</span>
          )}
          <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer select-none">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="w-3 h-3" />
            {T.autoRefresh}
          </label>
          <select value={refreshInterval} onChange={e => setRefreshInterval(+e.target.value)}
            className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5">
            <option value={10}>10s</option>
            <option value={30}>30s</option>
            <option value={60}>60s</option>
          </select>
          <button onClick={() => fetchDashboard()} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 shadow-sm">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> {uiText.common.refresh}
          </button>
        </div>
      </div>

      {/* ── Active Alerts (TOP — most important section) ───────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-gray-400" />
            <h3 className="text-xs font-bold text-gray-700">{T.alerts.title}</h3>
            {alerts.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">{alerts.length}</span>
            )}
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-6 text-xs text-gray-400">
              <CheckCircle2 size={14} className="text-emerald-400" /> {T.alerts.noAlerts}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-gray-50/50">
                  <th className="text-left px-4 py-1.5">{T.alerts.severity}</th>
                  <th className="text-left px-3 py-1.5">{T.alerts.cronjob}</th>
                  <th className="text-left px-3 py-1.5">Type</th>
                  <th className="text-left px-3 py-1.5">Status</th>
                  <th className="text-left px-3 py-1.5">{T.alerts.message}</th>
                  <th className="text-left px-3 py-1.5">{T.alerts.time}{timezone ? ` (${timezone.abbr})` : ''}</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a, i) => (
                  <tr key={i} className={`border-t border-gray-50 ${
                    a.severity === 'critical' ? 'bg-red-50/30' : a.severity === 'warning' ? 'bg-amber-50/30' : ''
                  }`}>
                    <td className="px-4 py-2"><SeverityIcon severity={a.severity} /></td>
                    <td className="px-3 py-2 font-medium text-gray-700">{a.cronjobName}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${alertTypeColor(a.type)}`}>
                        {alertTypeLabel(a.type)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {a.status ? <StatusBadge status={a.status} /> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 max-w-[400px]">
                      <span>{a.message}</span>
                      {a.jobName && <span className="text-[9px] text-gray-400 ml-1">({a.jobName})</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtTimeOnly(a.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Summary Table (2 columns: metrics | reserved) ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Activity size={14} className="text-gray-400" />
            <h3 className="text-xs font-bold text-gray-700">CronJob Summary</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-gray-50/50">
                <th className="text-left px-4 py-1.5">Metric</th>
                <th className="text-center px-3 py-1.5">CronJobs</th>
                <th className="text-center px-3 py-1.5">Executions</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium text-gray-700">Total</td>
                <td className="px-3 py-2 text-center font-bold text-gray-900">{summary.total ?? '—'}</td>
                <td className="px-3 py-2 text-center font-bold text-gray-900">{summary.totalRuns ?? '—'}</td>
              </tr>
              <tr className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium text-emerald-700">Healthy / Succeeded</td>
                <td className="px-3 py-2 text-center font-bold text-emerald-600">{summary.healthy ?? '—'}</td>
                <td className="px-3 py-2 text-center font-bold text-emerald-600">{summary.totalSucceeded ?? '—'}</td>
              </tr>
              <tr className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium text-amber-700">Warning</td>
                <td className="px-3 py-2 text-center font-bold text-amber-600">{summary.warning ?? '—'}</td>
                <td className="px-3 py-2 text-center text-gray-400">—</td>
              </tr>
              <tr className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium text-red-700">Critical / Failed</td>
                <td className="px-3 py-2 text-center font-bold text-red-600">{summary.critical ?? '—'}</td>
                <td className="px-3 py-2 text-center font-bold text-red-600">{summary.totalFailed ?? '—'}</td>
              </tr>
              <tr className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium text-blue-700">Running</td>
                <td className="px-3 py-2 text-center font-bold text-blue-600">{summary.active ?? '—'}</td>
                <td className="px-3 py-2 text-center text-gray-400">—</td>
              </tr>
              <tr className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium text-violet-700">Success Rate</td>
                <td colSpan={2} className="px-3 py-2 text-center font-bold text-violet-600">
                  {summary.overallSuccessRate !== null && summary.overallSuccessRate !== undefined
                    ? `${summary.overallSuccessRate}% (${summary.totalSucceeded ?? 0}/${summary.totalRuns ?? 0} passed)`
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Reserved column for future use */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Shield size={14} className="text-gray-400" />
            <h3 className="text-xs font-bold text-gray-700">CronJob Success Rates</h3>
          </div>
          <div className="max-h-[250px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-gray-50/50">
                  <th className="text-left px-4 py-1.5">CronJob</th>
                  <th className="text-left px-3 py-1.5">Success Rate</th>
                  <th className="text-center px-3 py-1.5">Last</th>
                  <th className="text-center px-3 py-1.5">Health</th>
                </tr>
              </thead>
              <tbody>
                {cronjobs.map(cj => (
                  <tr key={cj.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2 font-medium text-gray-700">{cj.name}</td>
                    <td className="px-3 py-2"><SuccessGauge rate={cj.successRate} runs={cj.totalRuns} /></td>
                    <td className="px-3 py-2 text-center"><StatusBadge status={cj.lastStatus} /></td>
                    <td className="px-3 py-2 text-center"><HealthBadge health={cj.health} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── CronJobs Grid Table ───────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3X3 size={14} className="text-gray-400" />
            <h3 className="text-xs font-bold text-gray-700">All CronJobs</h3>
          </div>
        </div>
        
        {/* Filters */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap bg-gray-50/50">
          <select value={nsFilter} onChange={e => setNsFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5">
            <option value="">{T.filters.allNamespaces}</option>
            {namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
          </select>
          <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5">
            <option value="">{T.filters.allHealth}</option>
            {['Healthy', 'Warning', 'Critical', 'Suspended'].map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5">
            <option value="">{T.filters.allOwners}</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <span className="text-[10px] text-gray-400 ml-auto">{filteredCronjobs.length} of {cronjobs.length} CronJobs</span>
        </div>

        {/* DataTable */}
        <div className="overflow-x-auto">
          <DataTable
            data={filteredCronjobs}
            columns={columns}
            defaultSort={{ key: 'name', order: 'asc' }}
            searchable
            searchPlaceholder="Search CronJobs..."
            pageSize={20}
            compact
            renderExpandedRow={renderExpandedRow}
          />
        </div>
      </div>

      {/* ── Execution Timeline ────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <TrendingUp size={14} className="text-gray-400" />
          <h3 className="text-xs font-bold text-gray-700">{T.timeline.title}</h3>
          <span className="text-[10px] text-gray-400 ml-1">{T.timeline.subtitle}</span>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-gray-50/80">
                <th className="text-left px-4 py-2">{T.timeline.status}</th>
                <th className="text-left px-3 py-2">{T.timeline.cronjob}</th>
                <th className="text-left px-3 py-2">{T.timeline.jobName}</th>
                <th className="text-left px-3 py-2">{T.timeline.startTime}</th>
                <th className="text-left px-3 py-2">{T.timeline.duration}</th>
                <th className="text-left px-3 py-2">{T.timeline.schedule}</th>
                <th className="text-left px-3 py-2">Logs</th>
              </tr>
            </thead>
            <tbody>
              {recentExecs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No recent executions.</td></tr>
              ) : recentExecs.map((exec, i) => (
                <tr key={i} className={`border-t border-gray-50 hover:bg-gray-50/50 ${
                  exec.status === 'Failed' ? 'bg-red-50/20' : ''
                }`}>
                  <td className="px-4 py-2"><StatusBadge status={exec.status} /></td>
                  <td className="px-3 py-2 font-medium text-gray-700">{exec.cronjobName}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{exec.name}</td>
                  <td className="px-3 py-2 text-gray-500">{fmtDateTime(exec.startTime)}</td>
                  <td className="px-3 py-2 font-medium text-gray-700">{exec.duration}</td>
                  <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{exec.schedule}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => setLogsDialog({ open: true, ns: exec.cronjobNamespace, name: exec.cronjobName, jobName: exec.name })}
                      className="text-[10px] px-2 py-0.5 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 flex items-center gap-1">
                      <FileText size={10} /> Logs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Logs Dialog ────────────────────────────────────────────────── */}
      <JobLogsDialog
        open={logsDialog.open}
        onClose={() => setLogsDialog({ open: false, ns: null, name: null, jobName: null })}
        namespace={logsDialog.ns}
        cronjobName={logsDialog.name}
        jobName={logsDialog.jobName}
      />
    </div>
  );
}
