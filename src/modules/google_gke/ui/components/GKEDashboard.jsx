// ============================================================================
// Google GKE Module — Dashboard View Component
//
// PURPOSE: Enterprise-grade GKE infrastructure monitoring dashboard with
// real-time cluster health, pod/workload summary, node info, and auto-refresh.
//
// API ENDPOINTS:
//   GET /api/google_gke/dashboard/summary     → Full cluster dashboard data
//   GET /api/google_gke/config/refresh-interval → Refresh interval setting
//
// TEXT: uiText.json → dashboard section
// PATTERN SOURCE: Follows ServiceNow module's ServiceNowDashboard.jsx
// ============================================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  RefreshCw, AlertTriangle, Settings, Loader2,
  Server, Container, Layers, Box, HardDrive, Network,
  CheckCircle2, XCircle, AlertCircle, Clock, Cpu, MemoryStick, Bell,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import uiErrors from '../config/uiErrors.json';
import urls from '../config/urls.json';

const log = createLogger('GKEDashboard');
const t = uiText.dashboard;
const ts = t.summary;
const api = urls.api;

// ── Timezone helpers ──────────────────────────────────────────────────────────
function getTimezoneAbbreviation(iana) {
  try {
    const short = new Intl.DateTimeFormat('en', { timeZone: iana, timeZoneName: 'shortGeneric' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value || '';
    if (!short.startsWith('GMT')) return short;
    const long = new Intl.DateTimeFormat('en', { timeZone: iana, timeZoneName: 'long' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value || '';
    const words = long.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 2) return words.map(w => w[0].toUpperCase()).join('');
    return short || long;
  } catch { return ''; }
}

function getTimezoneOffset(iana) {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const localStr = now.toLocaleString('en-US', { timeZone: iana });
    const diffMs = new Date(localStr) - new Date(utcStr);
    const totalMin = Math.round(diffMs / 60000);
    const sign = totalMin >= 0 ? '+' : '-';
    const absMin = Math.abs(totalMin);
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;
    return `GMT${sign}${h}${m > 0 ? ':' + String(m).padStart(2, '0') : ''}`;
  } catch { return 'GMT'; }
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

function formatTimeFromNow(date) {
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
  
  if (diffMs < 0) {
    const absSecs = Math.abs(diffSecs);
    const absMins = Math.abs(diffMins);
    const absHours = Math.abs(diffHours);
    const absDays = Math.abs(diffDays);
    if (absSecs < 60) return `${absSecs}s ago`;
    if (absMins < 60) return `${absMins}m ${remainingSecs}s ago`;
    if (absHours < 24) return `${absHours}h ${remainingMins}m ago`;
    return `${absDays}d ago`;
  } else {
    if (diffSecs < 60) return `in ${diffSecs}s`;
    if (diffMins < 60) return `in ${diffMins}m ${remainingSecs}s`;
    if (diffHours < 24) return `in ${diffHours}h ${remainingMins}m`;
    return `in ${diffDays}d`;
  }
}

function formatTimeWithRelative(date, iana) {
  if (!date) return '—';
  const actualTime = formatTimeOnly(date, iana);
  const relativeTime = formatTimeFromNow(date);
  return `${actualTime} (${relativeTime})`;
}

// ── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, iconBg, iconColor, label, value, subValue, subColor, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-surface-200 shadow-sm p-4 flex items-center gap-3 transition-all hover:shadow-md ${onClick ? 'cursor-pointer hover:border-brand-300' : ''}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-surface-800 leading-tight">{value ?? '—'}</p>
        {subValue != null && (
          <p className={`text-[10px] font-medium ${subColor || 'text-surface-400'}`}>{subValue}</p>
        )}
      </div>
    </div>
  );
}

// ── Health Badge ────────────────────────────────────────────────────────────
function HealthBadge({ health }) {
  const map = {
    Available: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    Degraded: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    Unavailable: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  };
  const s = map[health] || { bg: 'bg-surface-50', text: 'text-surface-600', dot: 'bg-surface-400' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {health}
    </span>
  );
}

// ── Alert Severity Icon ──────────────────────────────────────────────────────
function SeverityIcon({ severity }) {
  if (severity === 'critical') return <XCircle size={14} className="text-red-500" />;
  if (severity === 'warning') return <AlertTriangle size={14} className="text-amber-500" />;
  return <AlertCircle size={14} className="text-blue-400" />;
}

// ── Alert Type Badge ────────────────────────────────────────────────────────
function alertTypeColor(type) {
  const map = {
    failure: 'bg-red-100 text-red-600',
    missed_schedule: 'bg-amber-100 text-amber-600',
    high_failure_rate: 'bg-orange-100 text-orange-600',
    long_running: 'bg-blue-100 text-blue-600',
    crashloop: 'bg-red-100 text-red-600',
    failed: 'bg-red-100 text-red-600',
    high_restarts: 'bg-amber-100 text-amber-600',
    pending: 'bg-yellow-100 text-yellow-600',
    workload_unavailable: 'bg-rose-100 text-rose-700',
  };
  return map[type] || 'bg-gray-100 text-gray-600';
}

function alertTypeLabel(type) {
  const map = {
    failure: 'FAILED',
    missed_schedule: 'MISSED',
    high_failure_rate: 'HIGH RATE',
    long_running: 'LONG RUN',
    crashloop: 'CRASHLOOP',
    failed: 'FAILED',
    high_restarts: 'HIGH RESTARTS',
    pending: 'PENDING',
    workload_unavailable: 'UNAVAILABLE',
  };
  return map[type] || type.replace(/_/g, ' ').toUpperCase();
}

function alertComponentLabel(alert) {
  if (alert.workloadName) return `${alert.workloadType || 'Workload'}`;
  if (alert.podName) return 'Pods';
  if (alert.cronjobName) return 'CronJobs';
  return alert.component || '—';
}

function alertSubLabel(alert) {
  return alert.workloadName || alert.podName || alert.cronjobName || alert.namespace || '—';
}

// ── Mini Bar ────────────────────────────────────────────────────────────────
function MiniBar({ value, max, color = 'bg-brand-500', height = 'h-1.5' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`w-full ${height} bg-surface-100 rounded-full overflow-hidden`}>
      <div className={`${height} ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Distribution Bar ────────────────────────────────────────────────────────
function DistributionRow({ label, value, total, color }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-surface-600 truncate font-medium">{label}</span>
      <div className="flex-1">
        <MiniBar value={value} max={total} color={color} />
      </div>
      <span className="w-8 text-right text-surface-500 font-bold">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function GKEDashboard({ user, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [timezone, setTimezone] = useState(null);
  const intervalRef = useRef(null);
  const initRan = useRef(false);

  // ── Load timezone from ServiceNow module ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        log.debug('Timezone', 'Fetching config from ServiceNow module');
        const res = await ApiClient.get('/api/servicenow/config/timezone');
        if (res?.success && res.data?.effectiveTimezone) {
          const iana = res.data.effectiveTimezone;
          const abbr = getTimezoneAbbreviation(iana);
          const offset = getTimezoneOffset(iana);
          const label = `${offset} ${iana}, ${abbr}`;
          setTimezone({ iana, abbr, offset, label });
          log.info('Timezone', `Loaded: ${label}`);
        } else {
          log.debug('Timezone', 'ServiceNow timezone not available, using browser default');
        }
      } catch (err) {
        log.debug('Timezone', 'Could not fetch timezone from ServiceNow', { error: err.message });
      }
    })();
  }, []);

  // ── Fetch dashboard summary ─────────────────────────────────────────────
  const fetchDashboard = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      log.debug('fetchDashboard', 'Fetching dashboard summary');
      const res = await ApiClient.get(api.dashboardSummary);
      if (res?.success) {
        setData(res.data);
        setLastRefreshed(new Date().toLocaleTimeString());
        log.info('fetchDashboard', 'Summary loaded', { pods: res.data?.pods?.total, workloads: res.data?.workloads?.total });
      } else {
        setError(res?.error?.message || uiErrors.common.fetchError);
        log.warn('fetchDashboard', 'Summary fetch returned failure');
      }
    } catch (err) {
      log.error('fetchDashboard', 'Failed', { error: err.message });
      setError(uiErrors.common.fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load refresh interval from DB ───────────────────────────────────────
  const loadRefreshInterval = useCallback(async () => {
    try {
      const res = await ApiClient.get(api.configRefreshInterval);
      if (res?.success) setRefreshInterval(res.data.refreshInterval);
    } catch { /* use default */ }
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadRefreshInterval();
    fetchDashboard();
  }, [fetchDashboard, loadRefreshInterval]);

  // ── Auto-refresh timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh && refreshInterval > 0) {
      intervalRef.current = setInterval(() => fetchDashboard(false), refreshInterval * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, refreshInterval, fetchDashboard]);

  // ── Derived data ────────────────────────────────────────────────────────
  const pods = data?.pods || {};
  const wk = data?.workloads || {};
  const cluster = data?.cluster || {};
  const wkItems = wk.items || [];

  // Not configured check
  const isConfigured = data != null;

  // ── Render: loading ─────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="text-brand-400 animate-spin" />
      </div>
    );
  }

  // ── Render: error / not configured ──────────────────────────────────────
  if (error && !data) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <AlertTriangle size={32} className="text-amber-400 mx-auto" />
        <p className="text-sm font-semibold text-surface-700">{t.notConfiguredTitle}</p>
        <p className="text-xs text-surface-500">{error}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => fetchDashboard()} className="px-4 py-2 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors">
            {t.refresh}
          </button>
          {onNavigate && (
            <button onClick={() => onNavigate('config')} className="px-4 py-2 text-xs font-semibold rounded-lg border border-surface-300 text-surface-600 hover:bg-surface-50 transition-colors">
              <Settings size={13} className="inline mr-1" />{t.goToConfig}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Render: dashboard ───────────────────────────────────────────────────
  const allAlerts = data?.alerts || [];
  const criticalAlerts = allAlerts.filter(a => a.severity === 'critical');
  const warningAlerts = allAlerts.filter(a => a.severity === 'warning');
  log.debug('render', 'Alerts ready', { total: allAlerts.length, critical: criticalAlerts.length, warning: warningAlerts.length });

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-surface-800">{t.title}</h1>
          <p className="text-xs text-surface-500">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-[10px] text-surface-400 flex items-center gap-1">
              <Clock size={10} /> {lastRefreshed}
            </span>
          )}
          <label className="flex items-center gap-1 text-[10px] text-surface-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="w-3 h-3 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            />
            {t.autoRefresh} ({refreshInterval}{t.seconds})
          </label>
          <button
            onClick={() => fetchDashboard()}
            disabled={loading}
            className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Alerts Section */}
      {allAlerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-200 bg-gradient-to-r from-amber-200 to-amber-50 flex items-center justify-between">
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
          <div className={allAlerts.length > 8 ? 'max-h-[400px] overflow-y-auto' : ''}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-surface-500 uppercase tracking-wider bg-surface-50/50 border-b border-surface-100 font-bold">
                  <th className="text-left px-4 py-2">Time (GMT{timezone?.offset?.replace('GMT', '')}) {timezone?.abbr}</th>
                  <th className="text-left px-3 py-2">Severity</th>
                  <th className="text-left px-3 py-2">Component</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Message</th>
                  <th className="text-left px-3 py-2">Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {allAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map((alert, idx) => (
                  <tr key={idx} className="hover:bg-surface-50/60">
                    <td className="px-4 py-2 text-surface-600 whitespace-nowrap">
                      <div className="text-[10px]">
                        {timezone ? formatTimeWithRelative(alert.timestamp, timezone.iana) : (alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : '—')}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <SeverityIcon severity={alert.severity} />
                        <span className="capitalize text-[10px] font-bold">{alert.severity}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-surface-600">
                      <div className="text-xs font-medium">{alertComponentLabel(alert)}</div>
                      <div className="text-[10px] text-surface-400">{alertSubLabel(alert)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${alertTypeColor(alert.type)}`}>
                        {alertTypeLabel(alert.type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-surface-700 max-w-md">{alert.message}</td>
                    <td className="px-3 py-2 text-surface-700 max-w-sm">
                      <div className="text-xs text-surface-700 break-words">{alert.logMessage || '—'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Cards — 2 Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Column 1: Pods & Workloads Overview - Same Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 auto-rows-fr">
          {/* Pods Section */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100 shadow-sm p-4 pb-2 h-fit">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
                <Box size={14} className="text-white" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-surface-800">Pods</h3>
                <p className="text-[9px] text-surface-500">Container instances</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div className="bg-white rounded-lg p-1.5 border border-blue-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded-lg bg-surface-100 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-surface-400"></div>
                  </div>
                  <span className="text-[9px] font-medium text-surface-600">Total</span>
                </div>
                <div className="text-sm font-bold text-surface-800">{pods.total}</div>
              </div>
              <div className="bg-white rounded-lg p-1.5 border border-emerald-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 size={10} className="text-emerald-600" />
                  </div>
                  <span className="text-[9px] font-medium text-surface-600">Running</span>
                </div>
                <div className="text-sm font-bold text-emerald-600">{pods.running ?? 0}</div>
              </div>
              <div className="bg-white rounded-lg p-1.5 border border-amber-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded-lg bg-amber-100 flex items-center justify-center">
                    <Clock size={10} className="text-amber-600" />
                  </div>
                  <span className="text-[9px] font-medium text-surface-600">Pending</span>
                </div>
                <div className="text-sm font-bold text-amber-600">{pods.pending ?? 0}</div>
              </div>
              <div className="bg-white rounded-lg p-1.5 border border-rose-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded-lg bg-rose-100 flex items-center justify-center">
                    <XCircle size={10} className="text-rose-600" />
                  </div>
                  <span className="text-[9px] font-medium text-surface-600">Failed</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-surface-500">CrashLoop</span>
                    <span className="text-xs font-bold text-orange-600">{pods.crashLoop ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-surface-500">Failed</span>
                    <span className="text-xs font-bold text-rose-600">{(pods.failed ?? 0) - (pods.crashLoop ?? 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Workloads Section */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-100 shadow-sm p-4 pb-2 h-fit">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
                <Layers size={14} className="text-white" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-surface-800">Workloads</h3>
                <p className="text-[9px] text-surface-500">Deployments & services</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div className="bg-white rounded-lg p-1.5 border border-indigo-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded-lg bg-surface-100 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-surface-400"></div>
                  </div>
                  <span className="text-[9px] font-medium text-surface-600">Total</span>
                </div>
                <div className="text-sm font-bold text-surface-800">{wk.total}</div>
              </div>
              <div className="bg-white rounded-lg p-1.5 border border-emerald-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 size={10} className="text-emerald-600" />
                  </div>
                  <span className="text-[9px] font-medium text-surface-600">Available</span>
                </div>
                <div className="text-sm font-bold text-emerald-600">{wk.available ?? 0}</div>
              </div>
              <div className="bg-white rounded-lg p-1.5 border border-amber-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded-lg bg-amber-100 flex items-center justify-center">
                    <AlertTriangle size={10} className="text-amber-600" />
                  </div>
                  <span className="text-[9px] font-medium text-surface-600">Degraded</span>
                </div>
                <div className="text-sm font-bold text-amber-600">{wk.degraded ?? 0}</div>
              </div>
              <div className="bg-white rounded-lg p-1.5 border border-rose-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded-lg bg-rose-100 flex items-center justify-center">
                    <XCircle size={10} className="text-rose-600" />
                  </div>
                  <span className="text-[9px] font-medium text-surface-600">Unavailable</span>
                </div>
                <div className="text-sm font-bold text-rose-600">{wk.unavailable ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        
        {/* Column 2: Namespaces, Deployments & StatefulSets */}
        <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg border border-cyan-100 shadow-sm p-4 pb-2 h-fit">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-cyan-500 flex items-center justify-center">
              <Network size={14} className="text-white" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-surface-800">Resources</h3>
              <p className="text-[9px] text-surface-500">Namespaces & Workloads</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1">
            <div className="bg-white rounded-lg p-1.5 border border-cyan-100">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-4 h-4 rounded-lg bg-cyan-100 flex items-center justify-center">
                  <Network size={10} className="text-cyan-600" />
                </div>
                <span className="text-[9px] font-medium text-surface-600">Namespaces</span>
              </div>
              <div className="text-sm font-bold text-cyan-600">{cluster.namespaceCount}</div>
            </div>
            <div className="bg-white rounded-lg p-1.5 border border-sky-100">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-4 h-4 rounded-lg bg-sky-100 flex items-center justify-center">
                  <Container size={10} className="text-sky-600" />
                </div>
                <span className="text-[9px] font-medium text-surface-600">Deployments</span>
              </div>
              <div className="text-sm font-bold text-sky-600">{wk.byType?.Deployment ?? 0}</div>
            </div>
            <div className="bg-white rounded-lg p-1.5 border border-violet-100">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-4 h-4 rounded-lg bg-violet-100 flex items-center justify-center">
                  <HardDrive size={10} className="text-violet-600" />
                </div>
                <span className="text-[9px] font-medium text-surface-600">StatefulSets</span>
              </div>
              <div className="text-sm font-bold text-violet-600">{wk.byType?.StatefulSet ?? 0}</div>
            </div>
            <div className="bg-white rounded-lg p-1.5 border border-orange-100">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-4 h-4 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Clock size={10} className="text-orange-600" />
                </div>
                <span className="text-[9px] font-medium text-surface-600">CronJobs</span>
              </div>
              <div className="text-sm font-bold text-orange-600">{data.cronjobs?.summary?.total ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Middle: Workload Health + Pod Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Workload Health Table */}
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-surface-700">{t.workloadHealth.title}</p>
              <p className="text-[10px] text-surface-400">{t.workloadHealth.subtitle}</p>
            </div>
            {onNavigate && (
              <button onClick={() => onNavigate('workloads')} className="text-[10px] text-brand-600 hover:text-brand-700 font-semibold">
                View All →
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-50 text-surface-500 border-b border-surface-100">
                  <th className="text-left px-4 py-2 font-bold text-[10px] uppercase">Name</th>
                  <th className="text-left px-3 py-2 font-bold text-[10px] uppercase">Type</th>
                  <th className="text-left px-3 py-2 font-bold text-[10px] uppercase">NS</th>
                  <th className="text-center px-3 py-2 font-bold text-[10px] uppercase">Ready</th>
                  <th className="text-center px-3 py-2 font-bold text-[10px] uppercase">Health</th>
                  <th className="text-center px-3 py-2 font-bold text-[10px] uppercase">Restarts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {wkItems.slice(0, 15).map(w => (
                  <tr key={w.id} className="hover:bg-surface-50/60">
                    <td className="px-4 py-1.5 font-medium text-surface-700">{w.name}</td>
                    <td className="px-3 py-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-surface-100 text-surface-600">{w.type}</span>
                    </td>
                    <td className="px-3 py-1.5 text-surface-500">{w.namespace}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className="font-bold">{w.ready}</span>
                      <span className="text-surface-400">/{w.desired}</span>
                      <MiniBar value={w.ready} max={w.desired} color={w.ready === w.desired ? 'bg-emerald-500' : w.ready > 0 ? 'bg-amber-500' : 'bg-rose-500'} />
                    </td>
                    <td className="px-3 py-1.5 text-center"><HealthBadge health={w.health} /></td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`font-bold ${w.restarts > 0 ? 'text-amber-600' : 'text-surface-400'}`}>{w.restarts}</span>
                    </td>
                  </tr>
                ))}
                {wkItems.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-400 text-xs">No workloads found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pod Distribution */}
        <div className="space-y-4">
          {/* By Namespace */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4">
            <p className="text-xs font-bold text-surface-700 mb-3">{t.podDistribution.byNamespace}</p>
            <div className="space-y-2">
              {Object.entries(pods.byNamespace || {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([ns, count]) => (
                  <DistributionRow key={ns} label={ns} value={count} total={pods.total} color="bg-blue-500" />
                ))}
              {Object.keys(pods.byNamespace || {}).length === 0 && (
                <p className="text-xs text-surface-400 text-center py-4">No pod data</p>
              )}
            </div>
          </div>

          {/* By Health */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4">
            <p className="text-xs font-bold text-surface-700 mb-3">{t.podDistribution.byHealth}</p>
            <div className="space-y-2">
              {Object.entries(pods.byHealth || {})
                .sort((a, b) => b[1] - a[1])
                .map(([h, count]) => {
                  const colorMap = { Healthy: 'bg-emerald-500', Degraded: 'bg-amber-500', Pending: 'bg-sky-500', CrashLoopBackOff: 'bg-rose-500', Failed: 'bg-rose-600', Completed: 'bg-surface-400' };
                  return <DistributionRow key={h} label={h} value={count} total={pods.total} color={colorMap[h] || 'bg-surface-400'} />;
                })}
            </div>
          </div>
        </div>
      </div>

      {/* Node Information */}
      {cluster.nodes?.length > 0 && (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
            <p className="text-xs font-bold text-surface-700">{t.nodeInfo.title}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-50 text-surface-500 border-b border-surface-100">
                  <th className="text-left px-4 py-2 font-bold text-[10px] uppercase">{t.nodeInfo.name}</th>
                  <th className="text-center px-3 py-2 font-bold text-[10px] uppercase">{t.nodeInfo.status}</th>
                  <th className="text-left px-3 py-2 font-bold text-[10px] uppercase">{t.nodeInfo.roles}</th>
                  <th className="text-left px-3 py-2 font-bold text-[10px] uppercase">{t.nodeInfo.kubelet}</th>
                  <th className="text-left px-3 py-2 font-bold text-[10px] uppercase">{t.nodeInfo.runtime}</th>
                  <th className="text-left px-3 py-2 font-bold text-[10px] uppercase">{t.nodeInfo.os}</th>
                  <th className="text-left px-3 py-2 font-bold text-[10px] uppercase">{t.nodeInfo.cpu}</th>
                  <th className="text-left px-3 py-2 font-bold text-[10px] uppercase">{t.nodeInfo.memory}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {cluster.nodes.map(node => (
                  <tr key={node.name} className="hover:bg-surface-50/60">
                    <td className="px-4 py-1.5 font-mono font-medium text-surface-700">{node.name}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${node.ready ? 'text-emerald-600' : 'text-rose-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${node.ready ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {node.ready ? 'Ready' : 'NotReady'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-surface-600">{node.roles}</td>
                    <td className="px-3 py-1.5 text-surface-600">{node.kubeletVersion}</td>
                    <td className="px-3 py-1.5 text-surface-600">{node.containerRuntime}</td>
                    <td className="px-3 py-1.5 text-surface-500">{node.os}</td>
                    <td className="px-3 py-1.5 font-medium text-surface-700">{node.allocatableCpu}</td>
                    <td className="px-3 py-1.5 font-medium text-surface-700">{node.allocatableMemory}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
