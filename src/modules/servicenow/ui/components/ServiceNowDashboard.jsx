// ============================================================================
// ServiceNowDashboard — PulseOps V3 ServiceNow Module
//
// PURPOSE: Main dashboard view for the ServiceNow module. Displays:
//   1. Connection Health (top) — status, refresh, timezone, last fetch
//   2. Summary Section — incident metrics, SLA compliance %, auto-ack counts,
//      Response SLA % with met/notMet, priority breakdown (bordered cards)
//   3. Incidents Grids (separate) — Today's Incidents, Resolution SLAs
//      Breaching Today, Auto Acknowledged Incidents Today
//
// ARCHITECTURE:
//   - Fetches dashboard data on mount (guarded with useRef for StrictMode)
//   - Refresh button inside Connection Health section
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
  Clock, AlertCircle, ArrowRight, Wifi, WifiOff,
  BarChart3, ShieldCheck, ShieldAlert, MessageSquare, ExternalLink,
  TrendingUp, TrendingDown, Minus, Calendar, FolderOpen, FolderClosed,
  Globe,
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

const PRIORITY_DOTS = {
  '1 - Critical': 'bg-rose-500',
  '2 - High':     'bg-amber-500',
  '3 - Medium':   'bg-blue-500',
  '4 - Low':      'bg-surface-400',
  '5 - Planning': 'bg-violet-500',
  critical:       'bg-rose-500',
  high:           'bg-amber-500',
  medium:         'bg-blue-500',
  low:            'bg-surface-400',
  planning:       'bg-violet-500',
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
function StatCard({ label, value, icon: Icon, color = 'text-brand-600', bg = 'bg-brand-50', loading }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 flex items-center gap-3 shadow-sm">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-surface-500 font-medium truncate leading-tight">{label}</p>
        {loading ? (
          <div className="h-5 w-10 bg-surface-100 rounded animate-pulse mt-0.5" />
        ) : (
          <p className="text-xl font-bold text-surface-800">{value ?? 0}</p>
        )}
      </div>
    </div>
  );
}

// ── SLA % card with met/notMet breakdown ─────────────────────────────────────
function SlaPctCard({ label, pct, met, notMet, loading }) {
  const color = pct == null ? 'text-surface-400' : pct >= 90 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-rose-600';
  const bg    = pct == null ? 'bg-surface-50'    : pct >= 90 ? 'bg-emerald-50'    : pct >= 70 ? 'bg-amber-50'    : 'bg-rose-50';
  const Icon  = pct == null ? Minus : pct >= 90 ? TrendingUp : pct >= 70 ? Minus : TrendingDown;
  return (
    <div className={`rounded-lg border border-surface-200 p-3 ${bg}`}>
      <div className="flex items-center gap-2">
        <Icon size={14} className={color} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-surface-500 font-medium truncate">{label}</p>
          {loading ? (
            <div className="h-4 w-8 bg-surface-100 rounded animate-pulse mt-0.5" />
          ) : (
            <p className={`text-sm font-bold ${color}`}>{pct != null ? `${pct}%` : ts.noData}</p>
          )}
        </div>
      </div>
      {!loading && pct != null && (
        <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-surface-100/60">
          <span className="text-[9px] text-emerald-600 font-semibold">{ts.met}: {met ?? 0}</span>
          <span className="text-[9px] text-rose-600 font-semibold">{ts.notMet}: {notMet ?? 0}</span>
        </div>
      )}
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
    { key: 'targetMinutes', label: cols.resolutionSlaTarget, sortable: true, align: 'right', width: '110px',
      render: (v) => <span className="text-xs text-surface-500">{formatMinutes(v)}</span> },
    { key: 'slaVariance', label: cols.slaVariance, sortable: true, align: 'right', width: '100px',
      render: (v) => {
        if (v == null) return <span className="text-xs text-surface-400">—</span>;
        const color = v >= 0 ? 'text-emerald-600' : 'text-rose-600';
        return <span className={`text-xs font-semibold ${color}`}>{v >= 0 ? '+' : ''}{formatMinutes(v)}</span>;
      } },
    { key: 'resolutionSlaStatus', label: cols.resolutionSlaStatus, sortable: true, align: 'center', width: '120px',
      render: (v) => <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${SLA_STATUS_STYLES[v] || SLA_STATUS_STYLES.pending}`}>
        {v === 'met' ? <ShieldCheck size={10} /> : v === 'breached' ? <ShieldAlert size={10} /> : <Clock size={10} />}
        {slaLabels[v] || v}
      </span> },
    { key: 'expectedResponse', label: cols.expectedResponse, sortable: true, width: '150px',
      render: (v) => v ? <span className="text-xs font-bold text-blue-700">{v}</span> : <span className="text-xs text-surface-400">—</span> },
    { key: 'actualResponse', label: cols.actualResponse, sortable: true, width: '150px',
      render: (v) => v ? <span className="text-xs font-bold text-teal-700">{v}</span> : <span className="text-xs text-surface-400">—</span> },
    { key: 'responseTargetMinutes', label: cols.responseTargetMinutes, sortable: true, align: 'right', width: '120px',
      render: (v) => <span className="text-xs text-surface-500">{formatMinutes(v)}</span> },
    { key: 'responseSlaStatus', label: cols.responseSlaStatus, sortable: true, align: 'center', width: '120px',
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

// ── Grid section sub-component ───────────────────────────────────────────────
function GridSection({ icon: Icon, iconColor, title, count, countColor, data, columns, gridLoading, emptyMessage, searchPlaceholder }) {
  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between px-5 py-3 bg-white border border-surface-200 rounded-t-2xl border-b-0">
        <div className="flex items-center gap-2">
          <Icon size={14} className={iconColor} />
          <h3 className="text-sm font-bold text-surface-700">{title}</h3>
          {count != null && (
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${countColor}`}>{count}</span>
          )}
        </div>
      </div>
      <DataTable
        columns={columns}
        data={data}
        loading={gridLoading}
        pageSize={20}
        searchable={true}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        compact={true}
        className="rounded-t-none border-t-0"
        rowKeyField="sysId"
        defaultSort={{ key: 'number', order: 'desc' }}
      />
    </div>
  );
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
        log.debug('fetchDashboard', 'Grid data loaded', { today: gridRes.data.totalToday, breaching: gridRes.data.totalBreaching, autoAck: gridRes.data.totalAutoAck });
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
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
          <Headset size={20} className="text-brand-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-surface-800">{t.title}</h1>
          <p className="text-sm text-surface-500">{t.subtitle}</p>
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
         SECTION 1: CONNECTION HEALTH (TOP)
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Wifi size={14} className="text-brand-600" />
                <h3 className="text-sm font-bold text-surface-700">{tc.title}</h3>
              </div>
              {/* Connection Status & Timezone */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  {stats?.connectionStatus === 'connected' ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  <span className={`text-xs font-semibold ${
                    stats?.connectionStatus === 'connected' ? 'text-emerald-600' : 'text-surface-400'
                  }`}>
                    {t.connectionStatus[stats?.connectionStatus] || t.connectionStatus.not_configured}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-medium text-surface-500 uppercase tracking-wide">{tc.timezone}:</span>
                  <Globe size={10} className="text-surface-400" />
                  <span className="text-xs font-semibold text-surface-700">
                    {gridData?.timezone || '—'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Last Fetch */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-medium text-surface-500 uppercase tracking-wide">{tc.lastFetch}</span>
                <span className="text-xs font-semibold text-surface-700">
                  {lastFetchTime.current ? new Date(lastFetchTime.current).toLocaleString() : tc.never}
                </span>
              </div>
              <button
                onClick={fetchDashboard}
                disabled={loading}
                title={t.refreshTooltip}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                {t.refresh}
              </button>
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 divide-x divide-surface-200">
            {/* Instance URL */}
            <div className="px-3 py-2">
              <div className="flex flex-col">
                <span className="text-[9px] font-medium text-surface-500 uppercase tracking-wide">{tc.instanceUrl}</span>
                <span className="text-xs font-semibold text-surface-700 break-all leading-tight mt-0.5">
                  {configData?.connection?.instanceUrl || '—'}
                </span>
              </div>
            </div>
            {/* ServiceNow Metadata link */}
            <div className="px-3 py-2">
              <div className="flex flex-col">
                <span className="text-[9px] font-medium text-surface-500 uppercase tracking-wide">{tc.metadata}</span>
                {configData?.connection?.instanceUrl ? (
                  <a
                    href={`${configData.connection.instanceUrl}/stats.do`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 mt-0.5"
                  >
                    {tc.metadataLink} <ExternalLink size={10} />
                  </a>
                ) : (
                  <span className="text-xs text-surface-400">—</span>
                )}
              </div>
            </div>
            {/* Incidents Fetched */}
            <div className="px-3 py-2">
              <div className="flex flex-col">
                <span className="text-[9px] font-medium text-surface-500 uppercase tracking-wide">{tc.incidentsFetched}</span>
                <span className="text-xs font-bold text-surface-800 mt-0.5">{stats?.totalIncidents ?? '—'}</span>
              </div>
            </div>
            {/* Auto Acknowledge Status */}
            <div className="px-3 py-2">
              <div className="flex flex-col">
                <span className="text-[9px] font-medium text-surface-500 uppercase tracking-wide">{tc.autoAckStatus}</span>
                <span className={`text-xs font-semibold flex items-center gap-1 mt-0.5 ${
                  autoAckStatus?.running ? 'text-emerald-600' : 'text-surface-400'
                }`}>
                  {autoAckStatus?.running ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                  {autoAckStatus?.running ? `${tc.running} (${autoAckStatus.pollFreqMinutes}m)` : tc.stopped}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
         SECTION 2: SUMMARY (bordered cards)
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        {/* Row 1: Total / Open / Closed */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label={ts.total}  value={stats?.totalIncidents} icon={Headset}       color="text-brand-600"   bg="bg-brand-50"    loading={loading} />
          <StatCard label={ts.open}   value={stats?.totalOpen}      icon={FolderOpen}    color="text-rose-600"    bg="bg-rose-50"     loading={loading} />
          <StatCard label={ts.closed} value={stats?.totalClosed}    icon={FolderClosed}  color="text-emerald-600" bg="bg-emerald-50"  loading={loading} />
        </div>

        {/* Row 2: 4-column layout — Period, Resolution SLA, Response SLA, Priority */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Created / Closed This Period */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
              <Calendar size={14} className="text-brand-600" />
              <h3 className="text-xs font-bold text-surface-700">{ts.title}</h3>
            </div>
            <div className="p-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th className="text-left py-2 font-semibold text-surface-600 text-[10px] uppercase">{ts.tablePeriod}</th>
                    <th className="text-center py-2 font-semibold text-surface-600 text-[10px] uppercase">{ts.tableCreated}</th>
                    <th className="text-center py-2 font-semibold text-surface-600 text-[10px] uppercase">{ts.tableClosed}</th>
                    <th className="text-center py-2 font-semibold text-surface-600 text-[10px] uppercase">{ts.tableAutoAck}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { period: ts.today, created: stats?.created?.today, closed: stats?.closed?.today, autoAck: stats?.autoAcknowledged?.today },
                    { period: ts.week, created: stats?.created?.week, closed: stats?.closed?.week, autoAck: stats?.autoAcknowledged?.week },
                    { period: ts.month, created: stats?.created?.month, closed: stats?.closed?.month, autoAck: stats?.autoAcknowledged?.month },
                  ].map(row => (
                    <tr key={row.period} className="border-b border-surface-50 last:border-0">
                      <td className="py-2 text-[10px] text-surface-500 font-medium">{row.period}</td>
                      <td className="py-2 text-center">
                        {loading ? (
                          <div className="h-3.5 w-6 bg-surface-100 rounded animate-pulse mx-auto" />
                        ) : (
                          <span className="text-xs font-bold text-surface-800">{row.created ?? 0}</span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {loading ? (
                          <div className="h-3.5 w-6 bg-surface-100 rounded animate-pulse mx-auto" />
                        ) : (
                          <span className="text-xs font-bold text-emerald-700">{row.closed ?? 0}</span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {loading ? (
                          <div className="h-3.5 w-6 bg-surface-100 rounded animate-pulse mx-auto" />
                        ) : (
                          <span className="text-xs font-bold text-brand-700">{row.autoAck ?? 0}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resolution SLA % */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
              <BarChart3 size={14} className="text-brand-600" />
              <h3 className="text-xs font-bold text-surface-700">{ts.slaResolution}</h3>
            </div>
            <div className="p-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th className="text-left py-2 font-semibold text-surface-600 text-[10px] uppercase">{ts.tablePeriod}</th>
                    <th className="text-center py-2 font-semibold text-surface-600 text-[10px] uppercase">SLA %</th>
                    <th className="text-center py-2 font-semibold text-surface-600 text-[10px] uppercase">{ts.met}</th>
                    <th className="text-center py-2 font-semibold text-surface-600 text-[10px] uppercase">{ts.notMet}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { period: ts.today, pct: stats?.slaResolution?.today?.pct, met: stats?.slaResolution?.today?.met, notMet: stats?.slaResolution?.today?.notMet },
                    { period: ts.week,  pct: stats?.slaResolution?.week?.pct,  met: stats?.slaResolution?.week?.met,  notMet: stats?.slaResolution?.week?.notMet },
                    { period: ts.month, pct: stats?.slaResolution?.month?.pct, met: stats?.slaResolution?.month?.met, notMet: stats?.slaResolution?.month?.notMet },
                  ].map(row => {
                    const color = row.pct == null ? 'text-surface-400' : row.pct >= 90 ? 'text-emerald-600' : row.pct >= 70 ? 'text-amber-600' : 'text-rose-600';
                    return (
                      <tr key={row.period} className="border-b border-surface-50 last:border-0">
                        <td className="py-2 text-[10px] text-surface-500 font-medium">{row.period}</td>
                        <td className="py-2 text-center">
                          {loading ? (
                            <div className="h-3.5 w-8 bg-surface-100 rounded animate-pulse mx-auto" />
                          ) : (
                            <span className={`text-xs font-bold ${color}`}>{row.pct != null ? `${row.pct}%` : ts.noData}</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          {loading ? (
                            <div className="h-3.5 w-6 bg-surface-100 rounded animate-pulse mx-auto" />
                          ) : (
                            <span className="text-xs font-bold text-emerald-600">{row.met ?? 0}</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          {loading ? (
                            <div className="h-3.5 w-6 bg-surface-100 rounded animate-pulse mx-auto" />
                          ) : (
                            <span className="text-xs font-bold text-rose-600">{row.notMet ?? 0}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Response SLA % */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
              <ShieldCheck size={14} className="text-teal-600" />
              <h3 className="text-xs font-bold text-surface-700">{ts.slaResponse}</h3>
            </div>
            <div className="p-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th className="text-left py-2 font-semibold text-surface-600 text-[10px] uppercase">{ts.tablePeriod}</th>
                    <th className="text-center py-2 font-semibold text-surface-600 text-[10px] uppercase">SLA %</th>
                    <th className="text-center py-2 font-semibold text-surface-600 text-[10px] uppercase">{ts.met}</th>
                    <th className="text-center py-2 font-semibold text-surface-600 text-[10px] uppercase">{ts.notMet}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { period: ts.today, pct: stats?.slaResponse?.today?.pct, met: stats?.slaResponse?.today?.met, notMet: stats?.slaResponse?.today?.notMet },
                    { period: ts.week,  pct: stats?.slaResponse?.week?.pct,  met: stats?.slaResponse?.week?.met,  notMet: stats?.slaResponse?.week?.notMet },
                    { period: ts.month, pct: stats?.slaResponse?.month?.pct, met: stats?.slaResponse?.month?.met, notMet: stats?.slaResponse?.month?.notMet },
                  ].map(row => {
                    const color = row.pct == null ? 'text-surface-400' : row.pct >= 90 ? 'text-emerald-600' : row.pct >= 70 ? 'text-amber-600' : 'text-rose-600';
                    return (
                      <tr key={row.period} className="border-b border-surface-50 last:border-0">
                        <td className="py-2 text-[10px] text-surface-500 font-medium">{row.period}</td>
                        <td className="py-2 text-center">
                          {loading ? (
                            <div className="h-3.5 w-8 bg-surface-100 rounded animate-pulse mx-auto" />
                          ) : (
                            <span className={`text-xs font-bold ${color}`}>{row.pct != null ? `${row.pct}%` : ts.noData}</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          {loading ? (
                            <div className="h-3.5 w-6 bg-surface-100 rounded animate-pulse mx-auto" />
                          ) : (
                            <span className="text-xs font-bold text-emerald-600">{row.met ?? 0}</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          {loading ? (
                            <div className="h-3.5 w-6 bg-surface-100 rounded animate-pulse mx-auto" />
                          ) : (
                            <span className="text-xs font-bold text-rose-600">{row.notMet ?? 0}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* By Priority */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
              <AlertTriangle size={14} className="text-brand-600" />
              <h3 className="text-xs font-bold text-surface-700">{ts.byPriority}</h3>
            </div>
            <div className="p-3 space-y-1.5">
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
                  .map(([priority, count]) => {
                    const total = stats.totalIncidents || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={priority} className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-surface-700">
                            <span className={`w-2 h-2 rounded-full ${PRIORITY_DOTS[priority] || 'bg-surface-400'}`} />
                            {priority}
                          </span>
                          <span className="text-xs font-bold text-surface-800">{count}</span>
                        </div>
                        <div className="w-full bg-surface-100 rounded-full h-1">
                          <div
                            className={`h-1 rounded-full transition-all ${PRIORITY_DOTS[priority]?.replace('bg-', 'bg-') || 'bg-surface-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
              ) : (
                <p className="text-xs text-surface-400 text-center py-4">{ts.noData}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
         SECTION 3: TODAY'S INCIDENTS GRID
         ═══════════════════════════════════════════════════════════════════════ */}
      <GridSection
        icon={Activity}
        iconColor="text-brand-600"
        title={tg.title}
        count={gridData?.totalToday}
        countColor="bg-brand-100 text-brand-700"
        data={gridData?.todaysIncidents || []}
        columns={gridColumns}
        gridLoading={gridLoading}
        emptyMessage={tg.noIncidents}
        searchPlaceholder={tg.searchPlaceholder}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
         SECTION 4: RESOLUTION SLAs BREACHING TODAY
         ═══════════════════════════════════════════════════════════════════════ */}
      <GridSection
        icon={ShieldAlert}
        iconColor="text-rose-600"
        title={tg.breachingTitle}
        count={gridData?.totalBreaching}
        countColor="bg-rose-100 text-rose-700"
        data={gridData?.slaBreachingToday || []}
        columns={gridColumns}
        gridLoading={gridLoading}
        emptyMessage={tg.noBreaching}
        searchPlaceholder={tg.searchPlaceholder}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
         SECTION 5: AUTO ACKNOWLEDGED INCIDENTS TODAY
         ═══════════════════════════════════════════════════════════════════════ */}
      <GridSection
        icon={CheckCircle2}
        iconColor="text-brand-600"
        title={tg.autoAckTitle}
        count={gridData?.totalAutoAck}
        countColor="bg-brand-100 text-brand-700"
        data={gridData?.autoAckToday || []}
        columns={gridColumns}
        gridLoading={gridLoading}
        emptyMessage={tg.noAutoAck}
        searchPlaceholder={tg.searchPlaceholder}
      />

      {/* View All link */}
      <div className="flex justify-end">
        <button
          onClick={() => onNavigate?.('incidents')}
          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-semibold"
        >
          {t.viewAll} <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
