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
  CheckCircle2, XCircle, AlertCircle, Clock, Cpu, MemoryStick,
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
    Healthy: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    Degraded: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    Unhealthy: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  };
  const s = map[health] || { bg: 'bg-surface-50', text: 'text-surface-600', dot: 'bg-surface-400' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {health}
    </span>
  );
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
  const intervalRef = useRef(null);
  const initRan = useRef(false);

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

      {/* Summary Cards — Row 1: Pods */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Box} iconBg="bg-blue-50" iconColor="text-blue-600" label={ts.totalPods} value={pods.total} subValue={`${ts.runningPods}: ${pods.running ?? 0}`} subColor="text-emerald-600" />
        <StatCard icon={CheckCircle2} iconBg="bg-emerald-50" iconColor="text-emerald-600" label={ts.runningPods} value={pods.running} />
        <StatCard icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600" label={ts.pendingPods} value={pods.pending} subColor={pods.pending > 0 ? 'text-amber-600' : undefined} />
        <StatCard icon={XCircle} iconBg="bg-rose-50" iconColor="text-rose-600" label={ts.failedPods} value={pods.failed} subColor={pods.failed > 0 ? 'text-rose-600' : undefined} />
        <StatCard icon={AlertCircle} iconBg="bg-orange-50" iconColor="text-orange-600" label={ts.crashLoopPods} value={pods.crashLoop} subColor={pods.crashLoop > 0 ? 'text-orange-600' : undefined} />
        <StatCard icon={RefreshCw} iconBg="bg-purple-50" iconColor="text-purple-600" label={ts.totalRestarts} value={pods.totalRestarts} />
      </div>

      {/* Summary Cards — Row 2: Cluster */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Layers} iconBg="bg-indigo-50" iconColor="text-indigo-600" label={ts.totalWorkloads} value={wk.total} subValue={`${ts.healthyWorkloads}: ${wk.healthy ?? 0}`} subColor="text-emerald-600" />
        <StatCard icon={Server} iconBg="bg-teal-50" iconColor="text-teal-600" label={ts.nodes} value={cluster.nodeCount} subValue={`${ts.nodesReady}: ${cluster.nodesReady ?? 0}`} subColor="text-emerald-600" />
        <StatCard icon={Network} iconBg="bg-cyan-50" iconColor="text-cyan-600" label={ts.namespaces} value={cluster.namespaceCount} />
        <StatCard icon={Container} iconBg="bg-sky-50" iconColor="text-sky-600" label={ts.deployments} value={wk.byType?.Deployment ?? 0} />
        <StatCard icon={HardDrive} iconBg="bg-violet-50" iconColor="text-violet-600" label={ts.statefulSets} value={wk.byType?.StatefulSet ?? 0} />
        <StatCard icon={Cpu} iconBg="bg-fuchsia-50" iconColor="text-fuchsia-600" label={ts.daemonSets} value={wk.byType?.DaemonSet ?? 0} />
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
