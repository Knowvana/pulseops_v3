// ============================================================================
// Google GKE Module — Workloads View Component
//
// PURPOSE: Enterprise-grade monitoring view with two tabs (Pods / Workloads),
// DataTable with sorting/pagination/search/column-reorder/resize, health
// badges, resource bars, auto-refresh, refresh interval control, and pod
// log viewing dialog.
//
// API ENDPOINTS:
//   GET /api/google_gke/workloads/pods          → All pods
//   GET /api/google_gke/workloads               → All workloads
//   GET /api/google_gke/config/refresh-interval → Refresh interval
//   PUT /api/google_gke/config/refresh-interval → Update refresh interval
//
// TEXT: uiText.json → workloads section
// PATTERN: Follows ServiceNow module's DataTable + Dashboard patterns
// ============================================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  RefreshCw, Clock, Loader2, Box, Layers, FileText,
  AlertTriangle, Filter, Timer,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import DataTable from './DataTable';
import PodLogsDialog from './PodLogsDialog';
import uiText from '../config/uiText.json';
import uiErrors from '../config/uiErrors.json';
import urls from '../config/urls.json';

const log = createLogger('WorkloadsView');
const t = uiText.workloads;
const tPod = t.podGrid;
const tWk = t.workloadGrid;
const tFilt = t.filters;
const api = urls.api;

// ── Health badge renderer ───────────────────────────────────────────────────
function HealthBadge({ value }) {
  const map = {
    Healthy:          { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    Degraded:         { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
    Unhealthy:        { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
    CrashLoopBackOff: { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
    Pending:          { bg: 'bg-sky-50',     text: 'text-sky-700',     dot: 'bg-sky-500' },
    Failed:           { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
    Error:            { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
    ImagePullError:   { bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-500' },
    OOMKilled:        { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
    Completed:        { bg: 'bg-surface-50', text: 'text-surface-600', dot: 'bg-surface-400' },
  };
  const s = map[value] || { bg: 'bg-surface-50', text: 'text-surface-600', dot: 'bg-surface-400' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {value}
    </span>
  );
}

// ── Restart count badge ─────────────────────────────────────────────────────
function RestartBadge({ value }) {
  if (value === 0) return <span className="text-surface-400 font-medium">0</span>;
  const color = value >= 10 ? 'bg-rose-100 text-rose-700' : value >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-surface-100 text-surface-600';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${color}`}>{value}</span>;
}

// ── Type badge ──────────────────────────────────────────────────────────────
function TypeBadge({ value }) {
  const colorMap = { Deployment: 'bg-blue-100 text-blue-700', StatefulSet: 'bg-violet-100 text-violet-700', DaemonSet: 'bg-fuchsia-100 text-fuchsia-700' };
  const c = colorMap[value] || 'bg-surface-100 text-surface-600';
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${c}`}>{value}</span>;
}

// ── Pod columns ─────────────────────────────────────────────────────────────
function buildPodColumns(onViewLogs) {
  return [
    { key: 'name',          label: tPod.name,          sortable: true, width: '200px', render: (v) => <span className="font-mono font-medium text-surface-800">{v}</span> },
    { key: 'namespace',     label: tPod.namespace,     sortable: true, width: '120px' },
    { key: 'health',        label: tPod.health,        sortable: true, width: '130px', render: (v) => <HealthBadge value={v} /> },
    { key: 'readyDisplay',  label: tPod.ready,         sortable: false, width: '70px', align: 'center' },
    { key: 'restarts',      label: tPod.restarts,      sortable: true, width: '80px', align: 'center', render: (v) => <RestartBadge value={v} /> },
    { key: 'lastRestartAge',label: tPod.lastRestart,   sortable: true, width: '100px' },
    { key: 'age',           label: tPod.age,           sortable: true, width: '70px' },
    { key: 'nodeName',      label: tPod.node,          sortable: true, width: '140px', render: (v) => <span className="font-mono text-[10px]">{v}</span> },
    { key: 'podIP',         label: tPod.podIP,         sortable: true, width: '110px', render: (v) => <span className="font-mono text-[10px]">{v}</span> },
    { key: 'image',         label: tPod.image,         sortable: true, width: '200px', render: (v) => <span className="font-mono text-[10px] truncate max-w-[200px] inline-block">{v}</span> },
    { key: 'imageTag',      label: tPod.imageTag,      sortable: true, width: '80px', render: (v) => <span className="px-1 py-0.5 rounded bg-surface-100 text-[9px] font-bold text-surface-600">{v}</span> },
    { key: 'cpuRequest',    label: tPod.cpuRequest,    sortable: true, width: '80px' },
    { key: 'cpuLimit',      label: tPod.cpuLimit,      sortable: true, width: '80px' },
    { key: 'memoryRequest', label: tPod.memoryRequest, sortable: true, width: '80px' },
    { key: 'memoryLimit',   label: tPod.memoryLimit,   sortable: true, width: '80px' },
    { key: 'containerCount',label: tPod.containers,    sortable: true, width: '70px', align: 'center' },
    { key: 'qosClass',      label: tPod.qosClass,      sortable: true, width: '90px' },
    { key: 'ownerKind',     label: tPod.ownerKind,     sortable: true, width: '90px', render: (v) => <TypeBadge value={v} /> },
    { key: 'ownerName',     label: tPod.ownerName,     sortable: true, width: '160px' },
    { key: 'serviceAccount',label: tPod.serviceAccount,sortable: true, width: '140px' },
    { key: '_logs',         label: tPod.logs,          sortable: false, width: '80px', align: 'center',
      render: (_v, row) => (
        <button
          onClick={e => { e.stopPropagation(); onViewLogs(row); }}
          className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
        >
          {tPod.viewLogs}
        </button>
      ),
    },
  ];
}

// ── Workload columns ────────────────────────────────────────────────────────
function buildWorkloadColumns() {
  return [
    { key: 'name',      label: tWk.name,      sortable: true, width: '180px', render: (v) => <span className="font-medium text-surface-800">{v}</span> },
    { key: 'namespace', label: tWk.namespace, sortable: true, width: '120px' },
    { key: 'type',      label: tWk.type,      sortable: true, width: '110px', render: (v) => <TypeBadge value={v} /> },
    { key: 'health',    label: tWk.health,    sortable: true, width: '110px', render: (v) => <HealthBadge value={v} /> },
    { key: 'desired',   label: tWk.desired,   sortable: true, width: '70px', align: 'center' },
    { key: 'ready',     label: tWk.ready,     sortable: true, width: '70px', align: 'center',
      render: (v, row) => {
        const pct = row.desired > 0 ? (v / row.desired) * 100 : 0;
        const barColor = pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-rose-500';
        return (
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-bold">{v}<span className="text-surface-400 font-normal">/{row.desired}</span></span>
            <div className="w-10 h-1 bg-surface-100 rounded-full overflow-hidden">
              <div className={`h-1 ${barColor} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        );
      },
    },
    { key: 'updated',   label: tWk.updated,   sortable: true, width: '70px', align: 'center' },
    { key: 'available', label: tWk.available, sortable: true, width: '70px', align: 'center' },
    { key: 'restarts',  label: tWk.restarts,  sortable: true, width: '80px', align: 'center', render: (v) => <RestartBadge value={v} /> },
    { key: 'podCount',  label: tWk.podCount,  sortable: true, width: '60px', align: 'center' },
    { key: 'age',       label: tWk.age,       sortable: true, width: '70px' },
    { key: 'image',     label: tWk.image,     sortable: true, width: '220px', render: (v) => <span className="font-mono text-[10px] truncate max-w-[220px] inline-block">{v}</span> },
    { key: 'strategy',  label: tWk.strategy,  sortable: true, width: '100px' },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function WorkloadsView({ user, onNavigate }) {
  const [activeTab, setActiveTab] = useState('pods');
  const [pods, setPods] = useState([]);
  const [workloads, setWorkloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [logsPod, setLogsPod] = useState(null);

  // Filters
  const [nsFilter, setNsFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [healthFilter, setHealthFilter] = useState('');

  const intervalRef = useRef(null);
  const initRan = useRef(false);

  // ── Fetch data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      log.debug('fetchData', 'Fetching workloads + pods');
      const [podsRes, wkRes] = await Promise.all([
        ApiClient.get(api.workloadPods),
        ApiClient.get(api.workloads),
      ]);
      if (podsRes?.success) setPods(podsRes.data || []);
      if (wkRes?.success) setWorkloads(wkRes.data || []);
      if (!podsRes?.success && !wkRes?.success) {
        setError(podsRes?.error?.message || wkRes?.error?.message || uiErrors.common.fetchError);
      }
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      log.error('fetchData', 'Failed', { error: err.message });
      setError(uiErrors.workloads.fetchFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load refresh interval ───────────────────────────────────────────────
  const loadRefreshInterval = useCallback(async () => {
    try {
      const res = await ApiClient.get(api.configRefreshInterval);
      if (res?.success) setRefreshInterval(res.data.refreshInterval);
    } catch { /* default */ }
  }, []);

  // ── Save refresh interval ──────────────────────────────────────────────
  const saveRefreshInterval = useCallback(async (val) => {
    const interval = Math.max(5, Math.min(300, parseInt(val, 10) || 30));
    setRefreshInterval(interval);
    try {
      await ApiClient.put(api.configRefreshInterval, { refreshInterval: interval });
      log.info('saveRefreshInterval', 'Saved', { interval });
    } catch (err) {
      log.error('saveRefreshInterval', 'Failed', { error: err.message });
    }
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadRefreshInterval();
    fetchData();
  }, [fetchData, loadRefreshInterval]);

  // ── Auto-refresh ────────────────────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh && refreshInterval > 0) {
      intervalRef.current = setInterval(() => fetchData(false), refreshInterval * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, refreshInterval, fetchData]);

  // ── Derived: unique namespaces, types, health values ────────────────────
  const allNamespaces = useMemo(() => [...new Set(pods.map(p => p.namespace))].sort(), [pods]);
  const allHealthValues = useMemo(() => [...new Set(pods.map(p => p.health))].sort(), [pods]);
  const allTypes = useMemo(() => [...new Set(workloads.map(w => w.type))].sort(), [workloads]);

  // ── Filtered data ──────────────────────────────────────────────────────
  const filteredPods = useMemo(() => {
    let d = pods;
    if (nsFilter) d = d.filter(p => p.namespace === nsFilter);
    if (healthFilter) d = d.filter(p => p.health === healthFilter);
    return d;
  }, [pods, nsFilter, healthFilter]);

  const filteredWorkloads = useMemo(() => {
    let d = workloads;
    if (nsFilter) d = d.filter(w => w.namespace === nsFilter);
    if (typeFilter) d = d.filter(w => w.type === typeFilter);
    if (healthFilter) d = d.filter(w => w.health === healthFilter);
    return d;
  }, [workloads, nsFilter, typeFilter, healthFilter]);

  // ── Columns ────────────────────────────────────────────────────────────
  const podColumns = useMemo(() => buildPodColumns((pod) => setLogsPod(pod)), []);
  const workloadColumns = useMemo(() => buildWorkloadColumns(), []);

  // ── Tab counts ─────────────────────────────────────────────────────────
  const podCount = filteredPods.length;
  const wkCount = filteredWorkloads.length;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-8">
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
          {/* Refresh interval selector */}
          <div className="flex items-center gap-1 text-[10px] text-surface-500">
            <Timer size={10} />
            <select
              value={refreshInterval}
              onChange={e => saveRefreshInterval(e.target.value)}
              className="px-1 py-0.5 rounded border border-surface-200 text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-brand-200"
            >
              {[5, 10, 15, 30, 60, 120].map(s => (
                <option key={s} value={s}>{s}s</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1 text-[10px] text-surface-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="w-3 h-3 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            />
            {t.autoRefresh}
          </label>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-200 rounded-xl">
          <AlertTriangle size={14} className="text-rose-500" />
          <p className="text-xs text-rose-700 font-medium">{error}</p>
        </div>
      )}

      {/* Tabs + Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-surface-100 rounded-xl p-0.5">
          <button
            onClick={() => setActiveTab('pods')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'pods' ? 'bg-white text-brand-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            <Box size={13} />
            {t.tabs.pods}
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${activeTab === 'pods' ? 'bg-brand-100 text-brand-700' : 'bg-surface-200 text-surface-500'}`}>
              {podCount}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('workloads')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'workloads' ? 'bg-white text-brand-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            <Layers size={13} />
            {t.tabs.workloads}
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${activeTab === 'workloads' ? 'bg-brand-100 text-brand-700' : 'bg-surface-200 text-surface-500'}`}>
              {wkCount}
            </span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-surface-400" />
          <select
            value={nsFilter}
            onChange={e => setNsFilter(e.target.value)}
            className="px-2 py-1 rounded-lg border border-surface-200 text-[11px] text-surface-600 bg-white focus:outline-none focus:ring-1 focus:ring-brand-200"
          >
            <option value="">{tFilt.allNamespaces}</option>
            {allNamespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
          </select>
          {activeTab === 'workloads' && (
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-2 py-1 rounded-lg border border-surface-200 text-[11px] text-surface-600 bg-white focus:outline-none focus:ring-1 focus:ring-brand-200"
            >
              <option value="">{tFilt.allTypes}</option>
              {allTypes.map(tp => <option key={tp} value={tp}>{tp}</option>)}
            </select>
          )}
          <select
            value={healthFilter}
            onChange={e => setHealthFilter(e.target.value)}
            className="px-2 py-1 rounded-lg border border-surface-200 text-[11px] text-surface-600 bg-white focus:outline-none focus:ring-1 focus:ring-brand-200"
          >
            <option value="">{tFilt.allHealth}</option>
            {allHealthValues.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          {(nsFilter || typeFilter || healthFilter) && (
            <button
              onClick={() => { setNsFilter(''); setTypeFilter(''); setHealthFilter(''); }}
              className="text-[10px] text-brand-600 hover:text-brand-700 font-semibold"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* DataTable */}
      {activeTab === 'pods' && (
        <DataTable
          columns={podColumns}
          data={filteredPods}
          loading={loading && pods.length === 0}
          pageSize={50}
          pageSizeOptions={[20, 50, 100, 200]}
          searchable={true}
          searchPlaceholder="Search pods by name, namespace, node, image..."
          emptyMessage="No pods found matching filters."
          emptyIcon={Box}
          compact={true}
          defaultSort={{ key: 'name', order: 'asc' }}
          rowKeyField="id"
        />
      )}

      {activeTab === 'workloads' && (
        <DataTable
          columns={workloadColumns}
          data={filteredWorkloads}
          loading={loading && workloads.length === 0}
          pageSize={50}
          pageSizeOptions={[20, 50, 100]}
          searchable={true}
          searchPlaceholder="Search workloads by name, namespace, type..."
          emptyMessage="No workloads found matching filters."
          emptyIcon={Layers}
          compact={true}
          defaultSort={{ key: 'name', order: 'asc' }}
          rowKeyField="id"
        />
      )}

      {/* Pod Logs Dialog */}
      {logsPod && (
        <PodLogsDialog
          pod={logsPod}
          onClose={() => setLogsPod(null)}
        />
      )}
    </div>
  );
}
