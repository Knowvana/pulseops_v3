// ============================================================================
// ServiceNowDashboard — PulseOps V3 ServiceNow Module
//
// PURPOSE: Main dashboard view for the ServiceNow module. Displays:
//   1. Summary Section — incident metrics, SLA compliance %, auto-ack counts,
//      priority breakdown (all fetched live from SNOW API via /dashboard/stats)
//   2. Incidents Grid — "Today's Incidents" and "Resolution SLAs Breaching
//      Today" using the DataTable component with SLA + auto-ack columns
//   3. Connection Health — instance URL, connection status, metadata link,
//      last fetch date/time, and counts of fetched incidents/RITMs
//
// ARCHITECTURE:
//   - Fetches dashboard data on mount (guarded with useRef for StrictMode)
//   - Single refresh button — no duplicate refresh icons, no sync summary
//   - Uses only project theme colors (brand/teal/surface palette)
//   - All text from uiText.json — zero hardcoded strings
//
// USED BY: src/modules/servicenow/manifest.jsx → getViews().dashboard
//
// DEPENDENCIES:
//   - lucide-react                         → Icons
//   - @modules/servicenow/uiText.json      → All UI labels
//   - @shared                              → createLogger
//   - ./DataTable                          → Reusable data grid
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Headset, RefreshCw, AlertTriangle, Activity, CheckCircle2,
  Clock, AlertCircle, ArrowRight, Wifi, WifiOff, Loader2,
  BarChart3, ShieldCheck, ShieldAlert, MessageSquare, ExternalLink,
  TrendingUp, TrendingDown, Minus, Calendar, FolderOpen, FolderClosed,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import DataTable from './DataTable';

const log = createLogger('ServiceNowDashboard.jsx');
const t   = uiText.dashboard;
const ts  = t.summary;
const tg  = t.incidentsGrid;
const tc  = t.connectionHealth;

// Module-local API URLs
const snApi = {
  dashboardStats:     '/api/servicenow/dashboard/stats',
  dashboardIncidents: '/api/servicenow/dashboard/incidents',
  config:             '/api/servicenow/config',
  autoAckStatus:      '/api/servicenow/auto-acknowledge/status',
  ritms:              '/api/servicenow/ritms',
};

// ── Priority badge config ─────────────────────────────────────────────────────
const PRIORITY_STYLES = {
  '1 - Critical': 'bg-rose-100 text-rose-700 border-rose-200',
  '2 - High':     'bg-amber-100 text-amber-700 border-amber-200',
  '3 - Medium':   'bg-blue-100 text-blue-700 border-blue-200',
  '4 - Low':      'bg-surface-100 text-surface-600 border-surface-200',
  '5 - Planning': 'bg-violet-100 text-violet-700 border-violet-200',
  critical:       'bg-rose-100 text-rose-700 border-rose-200',
  high:           'bg-amber-100 text-amber-700 border-amber-200',
  medium:         'bg-blue-100 text-blue-700 border-blue-200',
  low:            'bg-surface-100 text-surface-600 border-surface-200',
  planning:       'bg-violet-100 text-violet-700 border-violet-200',
};

const SLA_STATUS_STYLES = {
  met:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  breached: 'bg-rose-50 text-rose-700 border-rose-200',
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatMinutes(mins) {
  if (mins == null) return '—';
  const absMin = Math.abs(Math.round(mins));
  if (absMin < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  const sign = mins < 0 ? '-' : '';
  return m > 0 ? `${sign}${h}h ${m}m` : `${sign}${h}h`;
}

// ── Stat card sub-component ────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color = 'text-brand-600', bg = 'bg-brand-50', loading, small }) {
  return (
    <div className={`bg-white rounded-xl border border-surface-200 ${small ? 'p-3' : 'p-4'} flex items-center gap-3 shadow-sm`}>
      <div className={`${small ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={small ? 14 : 18} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-surface-500 font-medium truncate leading-tight">{label}</p>
        {loading ? (
          <div className="h-5 w-10 bg-surface-100 rounded animate-pulse mt-0.5" />
        ) : (
          <p className={`${small ? 'text-lg' : 'text-xl'} font-bold text-surface-800`}>{value ?? 0}</p>
        )}
      </div>
    </div>
  );
}

// ── SLA % card ────────────────────────────────────────────────────────────────
function SlaPctCard({ label, value, loading }) {
  const color = value == null ? 'text-surface-400' : value >= 90 ? 'text-emerald-600' : value >= 70 ? 'text-amber-600' : 'text-rose-600';
  const bg    = value == null ? 'bg-surface-50'    : value >= 90 ? 'bg-emerald-50'    : value >= 70 ? 'bg-amber-50'    : 'bg-rose-50';
  const Icon  = value == null ? Minus : value >= 90 ? TrendingUp : value >= 70 ? Minus : TrendingDown;
  return (
    <div className={`rounded-lg border border-surface-200 p-3 ${bg} flex items-center gap-2`}>
      <Icon size={14} className={color} />
      <div className="min-w-0">
        <p className="text-[10px] text-surface-500 font-medium truncate">{label}</p>
        {loading ? (
          <div className="h-4 w-8 bg-surface-100 rounded animate-pulse mt-0.5" />
        ) : (
          <p className={`text-sm font-bold ${color}`}>{value != null ? `${value}%` : ts.noData}</p>
        )}
      </div>
    </div>
  );
}

// ── Incidents Grid column definitions ────────────────────────────────────────
function buildGridColumns() {
  const cols = tg.columns;
  const slaLabels = tg.slaStatusLabels;
  return [
    { key: 'number', label: cols.number, sortable: true, width: '110px',
      render: (v) => <span className="font-mono text-xs text-brand-600 font-semibold">{v}</span> },
    { key: 'shortDescription', label: cols.shortDescription, sortable: true,
      render: (v) => <span className="text-xs text-surface-700 max-w-[260px] truncate block">{v || '—'}</span> },
    { key: 'priority', label: cols.priority, sortable: true, align: 'center', width: '100px',
      render: (v) => <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${PRIORITY_STYLES[v] || PRIORITY_STYLES.low}`}>{v || '—'}</span> },
    { key: 'state', label: cols.state, sortable: true, align: 'center', width: '80px' },
    { key: 'assignedTo', label: cols.assignedTo, sortable: true,
      render: (v) => <span className="text-xs text-surface-500">{v || '—'}</span> },
    { key: 'createdAt', label: cols.createdAt, sortable: true, width: '150px',
      render: (v) => <span className="text-xs text-surface-600">{v || '—'}</span> },
    { key: 'closedAt', label: cols.closedAt, sortable: true, width: '150px',
      render: (v) => v ? <span className="text-xs font-bold text-emerald-700">{v}</span> : <span className="text-xs text-surface-400">—</span> },
    { key: 'expectedClosure', label: cols.expectedClosure, sortable: true, width: '150px',
      render: (v) => v ? <span className="text-xs font-bold text-surface-800">{v}</span> : <span className="text-xs text-surface-400">—</span> },
    { key: 'resolutionMinutes', label: cols.resolutionTime, sortable: true, align: 'right', width: '110px',
      render: (v) => <span className="text-xs text-surface-600 font-medium">{formatMinutes(v)}</span> },
    { key: 'targetMinutes', label: cols.slaTarget, sortable: true, align: 'right', width: '100px',
      render: (v) => <span className="text-xs text-surface-500">{formatMinutes(v)}</span> },
    { key: 'slaVariance', label: cols.slaVariance, sortable: true, align: 'right', width: '100px',
      render: (v) => {
        if (v == null) return <span className="text-xs text-surface-400">—</span>;
        const color = v >= 0 ? 'text-emerald-600' : 'text-rose-600';
        return <span className={`text-xs font-semibold ${color}`}>{v >= 0 ? '+' : ''}{formatMinutes(v)}</span>;
      } },
    { key: 'slaStatus', label: cols.slaStatus, sortable: true, align: 'center', width: '90px',
      render: (v) => <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${SLA_STATUS_STYLES[v] || SLA_STATUS_STYLES.pending}`}>
        {v === 'met' ? <ShieldCheck size={10} /> : v === 'breached' ? <ShieldAlert size={10} /> : <Clock size={10} />}
        {slaLabels[v] || v}
      </span> },
    { key: 'autoAcknowledged', label: cols.autoAcknowledged, sortable: true, align: 'center', width: '120px',
      render: (v) => v
        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200"><CheckCircle2 size={10} /> {uiText.common.yes}</span>
        : <span className="text-xs text-surface-400">{uiText.common.no}</span> },
    { key: 'autoAcknowledgedAt', label: cols.autoAcknowledgedAt, sortable: true, width: '150px',
      render: (v) => <span className="text-xs text-surface-500">{v || '—'}</span> },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowDashboard({ onNavigate }) {
  const [stats, setStats]               = useState(null);
  const [gridData, setGridData]         = useState(null);
  const [configData, setConfigData]     = useState(null);
  const [autoAckStatus, setAutoAckStatus] = useState(null);
  const [ritmCount, setRitmCount]       = useState(null);
  const [loading, setLoading]           = useState(true);
  const [gridLoading, setGridLoading]   = useState(true);
  const [error, setError]               = useState(null);
  const [activeGrid, setActiveGrid]     = useState('today'); // 'today' | 'breaching'
  const initRan = useRef(false);
  const lastFetchTime = useRef(null);

  const gridColumns = useMemo(() => buildGridColumns(), []);

  // ── Fetch all dashboard data ──────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    log.debug('fetchDashboard', 'Fetching dashboard data');
    setLoading(true);
    setGridLoading(true);
    setError(null);
    try {
      const [statsRes, gridRes, cfgRes, ackStatusRes, ritmRes] = await Promise.all([
        ApiClient.get(snApi.dashboardStats),
        ApiClient.get(snApi.dashboardIncidents),
        ApiClient.get(snApi.config).catch(() => null),
        ApiClient.get(snApi.autoAckStatus).catch(() => null),
        ApiClient.get(`${snApi.ritms}?limit=1`).catch(() => null),
      ]);

      if (statsRes?.success) {
        log.info('fetchDashboard', 'Stats loaded', { connectionStatus: statsRes.data.connectionStatus });
        setStats(statsRes.data);
      } else {
        log.warn('fetchDashboard', 'Stats fetch failed', { error: statsRes?.error?.message });
        setError(statsRes?.error?.message || uiText.common.fetchError);
      }

      if (gridRes?.success) {
        log.debug('fetchDashboard', 'Grid data loaded', { today: gridRes.data.totalToday, breaching: gridRes.data.totalBreaching });
        setGridData(gridRes.data);
      }

      if (cfgRes?.success)       setConfigData(cfgRes.data);
      if (ackStatusRes?.success) setAutoAckStatus(ackStatusRes.data);
      if (ritmRes?.success)      setRitmCount(ritmRes.data?.totalCount ?? ritmRes.data?.ritms?.length ?? null);

      lastFetchTime.current = new Date().toISOString();
    } catch (err) {
      log.error('fetchDashboard', 'Unexpected error', { error: err.message });
      setError(uiText.common.fetchError);
    } finally {
      setLoading(false);
      setGridLoading(false);
    }
  }, []);

  // StrictMode guard — only run on first mount
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('mount', 'ServiceNow Dashboard mounted');
    fetchDashboard();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        log.info('visibilitychange', 'Dashboard regained focus — refreshing data');
        fetchDashboard();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchDashboard]);

  // Active grid data
  const activeGridData = useMemo(() => {
    if (!gridData) return [];
    return activeGrid === 'today' ? gridData.todaysIncidents || [] : gridData.slaBreachingToday || [];
  }, [gridData, activeGrid]);

  // ── Not configured state ──────────────────────────────────────────────────
  if (!loading && stats?.notConfigured) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <Headset size={20} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800">{t.title}</h1>
            <p className="text-sm text-surface-500">{t.subtitle}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-surface-200 p-12 flex flex-col items-center text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-surface-50 flex items-center justify-center mb-4">
            <WifiOff size={28} className="text-surface-400" />
          </div>
          <h2 className="text-base font-bold text-surface-700 mb-1">{t.notConfiguredTitle}</h2>
          <p className="text-sm text-surface-500 max-w-sm mb-6">{t.notConfiguredSubtitle}</p>
          <button
            onClick={() => onNavigate?.('config')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
          >
            {t.goToConfig} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Page header — single refresh button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <Headset size={20} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800">{t.title}</h1>
            <p className="text-sm text-surface-500">{t.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats?.connectionStatus && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${
              stats.connectionStatus === 'connected' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
              stats.connectionStatus === 'error'     ? 'bg-rose-50 border-rose-200 text-rose-700' :
              'bg-surface-50 border-surface-200 text-surface-600'
            }`}>
              {stats.connectionStatus === 'connected' ? <Wifi size={13} /> : <WifiOff size={13} />}
              <span>{t.connectionStatus[stats.connectionStatus] || t.connectionStatus.not_configured}</span>
            </div>
          )}
          <button
            onClick={fetchDashboard}
            disabled={loading}
            title={t.refreshTooltip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50 transition-colors border border-brand-200"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {t.refresh}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <AlertCircle size={15} />
          <span>{error}</span>
          <button onClick={fetchDashboard} className="ml-auto text-xs underline">{uiText.common.retry}</button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
         SECTION 1: SUMMARY
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        {/* Row 1: Total / Open / Closed */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label={ts.total}  value={stats?.totalIncidents} icon={Headset}       color="text-brand-600"   bg="bg-brand-50"    loading={loading} />
          <StatCard label={ts.open}   value={stats?.totalOpen}      icon={FolderOpen}    color="text-rose-600"    bg="bg-rose-50"     loading={loading} />
          <StatCard label={ts.closed} value={stats?.totalClosed}    icon={FolderClosed}  color="text-emerald-600" bg="bg-emerald-50"  loading={loading} />
        </div>

        {/* Row 2: Created/Closed by period + Auto-Ack + Priority */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Created / Closed This Period */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
              <Calendar size={14} className="text-brand-600" />
              <h3 className="text-sm font-bold text-surface-700">{ts.title}</h3>
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-2">
              {[
                { label: ts.createdToday, value: stats?.created?.today },
                { label: ts.closedToday,  value: stats?.closed?.today },
                { label: ts.createdWeek,  value: stats?.created?.week },
                { label: ts.closedWeek,   value: stats?.closed?.week },
                { label: ts.createdMonth, value: stats?.created?.month },
                { label: ts.closedMonth,  value: stats?.closed?.month },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-1">
                  <span className="text-[11px] text-surface-500">{row.label}</span>
                  {loading ? (
                    <div className="h-4 w-6 bg-surface-100 rounded animate-pulse" />
                  ) : (
                    <span className="text-sm font-bold text-surface-800">{row.value ?? 0}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* SLA Compliance + Auto-Ack */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
              <BarChart3 size={14} className="text-brand-600" />
              <h3 className="text-sm font-bold text-surface-700">{ts.slaResolution}</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <SlaPctCard label={ts.today} value={stats?.slaResolution?.today} loading={loading} />
                <SlaPctCard label={ts.week}  value={stats?.slaResolution?.week}  loading={loading} />
                <SlaPctCard label={ts.month} value={stats?.slaResolution?.month} loading={loading} />
              </div>
              <div className="border-t border-surface-100 pt-3 space-y-1.5">
                {[
                  { label: ts.autoAckToday, value: stats?.autoAcknowledged?.today, icon: MessageSquare },
                  { label: ts.autoAckWeek,  value: stats?.autoAcknowledged?.week,  icon: MessageSquare },
                  { label: ts.autoAckMonth, value: stats?.autoAcknowledged?.month, icon: MessageSquare },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-[11px] text-surface-500 flex items-center gap-1">
                      <row.icon size={10} className="text-surface-400" /> {row.label}
                    </span>
                    {loading ? (
                      <div className="h-4 w-6 bg-surface-100 rounded animate-pulse" />
                    ) : (
                      <span className="text-sm font-bold text-brand-700">{row.value ?? 0}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* By Priority */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
              <AlertTriangle size={14} className="text-brand-600" />
              <h3 className="text-sm font-bold text-surface-700">{ts.byPriority}</h3>
            </div>
            <div className="p-4 space-y-2">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <div className="h-4 w-20 bg-surface-100 rounded animate-pulse" />
                    <div className="h-4 w-8 bg-surface-100 rounded animate-pulse" />
                  </div>
                ))
              ) : stats?.priorityCounts && Object.keys(stats.priorityCounts).length > 0 ? (
                Object.entries(stats.priorityCounts)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([priority, count]) => (
                    <div key={priority} className="flex items-center justify-between py-1">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${PRIORITY_STYLES[priority] || PRIORITY_STYLES.low}`}>
                        {priority}
                      </span>
                      <span className="text-sm font-bold text-surface-800">{count}</span>
                    </div>
                  ))
              ) : (
                <p className="text-xs text-surface-400 text-center py-4">{ts.noData}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
         SECTION 2: INCIDENTS GRID
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-0">
        {/* Tab header */}
        <div className="flex items-center justify-between px-5 py-3 bg-white border border-surface-200 rounded-t-2xl border-b-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveGrid('today')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeGrid === 'today'
                  ? 'bg-brand-50 text-brand-700 border border-brand-200'
                  : 'text-surface-500 hover:text-brand-600 hover:bg-brand-50/50'
              }`}
            >
              <Activity size={13} />
              {tg.title}
              {gridData && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold">{gridData.totalToday}</span>}
            </button>
            <button
              onClick={() => setActiveGrid('breaching')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeGrid === 'breaching'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'text-surface-500 hover:text-rose-600 hover:bg-rose-50/50'
              }`}
            >
              <ShieldAlert size={13} />
              {tg.breachingTitle}
              {gridData && gridData.totalBreaching > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">{gridData.totalBreaching}</span>
              )}
            </button>
          </div>
          <button
            onClick={() => onNavigate?.('incidents')}
            className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-semibold"
          >
            {t.viewAll} <ArrowRight size={12} />
          </button>
        </div>
        <DataTable
          columns={gridColumns}
          data={activeGridData}
          loading={gridLoading}
          pageSize={20}
          searchable={true}
          searchPlaceholder={tg.searchPlaceholder}
          emptyMessage={activeGrid === 'today' ? tg.noIncidents : tg.noBreaching}
          compact={true}
          className="rounded-t-none border-t-0"
          rowKeyField="sysId"
          defaultSort={{ key: 'number', order: 'desc' }}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
         SECTION 3: CONNECTION HEALTH
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
          <Wifi size={14} className="text-brand-600" />
          <h3 className="text-sm font-bold text-surface-700">{tc.title}</h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
          {/* Instance URL */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500">{tc.instanceUrl}</span>
            <span className="text-xs font-semibold text-surface-700 truncate max-w-[200px]">
              {configData?.connection?.instanceUrl || '—'}
            </span>
          </div>
          {/* Connection Status */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500">{tc.connectionStatus}</span>
            <span className={`text-xs font-semibold flex items-center gap-1 ${
              stats?.connectionStatus === 'connected' ? 'text-emerald-600' : 'text-surface-400'
            }`}>
              {stats?.connectionStatus === 'connected' ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
              {t.connectionStatus[stats?.connectionStatus] || t.connectionStatus.not_configured}
            </span>
          </div>
          {/* ServiceNow Metadata link */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500">{tc.metadata}</span>
            {configData?.connection?.instanceUrl ? (
              <a
                href={`${configData.connection.instanceUrl}/stats.do`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                {tc.metadataLink} <ExternalLink size={10} />
              </a>
            ) : (
              <span className="text-xs text-surface-400">—</span>
            )}
          </div>
          {/* Last Fetch */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500">{tc.lastFetch}</span>
            <span className="text-xs font-semibold text-surface-700">
              {lastFetchTime.current ? new Date(lastFetchTime.current).toLocaleString() : tc.never}
            </span>
          </div>
          {/* Incidents Fetched */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500">{tc.incidentsFetched}</span>
            <span className="text-xs font-bold text-surface-800">
              {stats?.totalIncidents ?? '—'}
            </span>
          </div>
          {/* RITMs Fetched */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500">{tc.ritmsFetched}</span>
            <span className="text-xs font-bold text-surface-800">
              {ritmCount ?? '—'}
            </span>
          </div>
          {/* Auto Acknowledge Status */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500">{tc.autoAckStatus}</span>
            <span className={`text-xs font-semibold flex items-center gap-1 ${
              autoAckStatus?.running ? 'text-emerald-600' : 'text-surface-400'
            }`}>
              {autoAckStatus?.running ? <CheckCircle2 size={11} /> : <Clock size={11} />}
              {autoAckStatus?.running ? `${tc.running} (${autoAckStatus.pollFreqMinutes}m)` : tc.stopped}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
