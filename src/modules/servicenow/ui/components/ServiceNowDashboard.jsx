// ============================================================================
// ServiceNowDashboard — PulseOps V3 ServiceNow Module
//
// PURPOSE: Main dashboard view for the ServiceNow module. Displays live
// incident statistics, SLA breach count, connection status, and a recent
// incident table. Fetches stats from GET /api/servicenow/stats and initiates
// manual sync via POST /api/servicenow/sync.
//
// ARCHITECTURE:
//   - Fetches dashboard stats on mount (guarded with useRef for StrictMode)
//   - Manual sync button triggers POST /sync → clears server cache + re-fetches
//   - Uses only project theme colors (brand/teal/surface palette)
//   - All text from uiText.json — zero hardcoded strings
//
// USED BY: src/modules/servicenow/manifest.jsx → getViews().dashboard
//
// DEPENDENCIES:
//   - lucide-react                         → Icons
//   - @modules/servicenow/uiText.json      → All UI labels
//   - @config/urls.json                    → API endpoints
//   - @shared                              → createLogger
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Headset, RefreshCw, AlertTriangle, Activity, CheckCircle2,
  Clock, AlertCircle, ArrowRight, Wifi, WifiOff, Loader2, MessageSquare,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
// Module-local API URLs — no dependency on platform urls.json
const snApi = {
  stats:      '/api/servicenow/stats',
  incidents:  '/api/servicenow/incidents',
  sync:       '/api/servicenow/sync',
  syncStatus: '/api/servicenow/sync/status',
  config:     '/api/servicenow/config',
};
import uiText from '../config/uiText.json';
import DataTable from './DataTable';

const log = createLogger('ServiceNowDashboard.jsx');
const t   = uiText.dashboard;
const inc = uiText.incidents;

// ── Priority badge config ─────────────────────────────────────────────────────
const PRIORITY_STYLES = {
  critical: 'bg-rose-100 text-rose-700 border-rose-200',
  high:     'bg-amber-100 text-amber-700 border-amber-200',
  medium:   'bg-blue-100 text-blue-700 border-blue-200',
  low:      'bg-surface-100 text-surface-600 border-surface-200',
  planning: 'bg-violet-100 text-violet-700 border-violet-200',
};

const STATE_STYLES = {
  open:        'bg-rose-50 text-rose-600',
  in_progress: 'bg-amber-50 text-amber-600',
  on_hold:     'bg-violet-50 text-violet-600',
  resolved:    'bg-emerald-50 text-emerald-600',
  closed:      'bg-surface-100 text-surface-500',
  cancelled:   'bg-surface-50 text-surface-400',
};

// ── Stat card sub-component ────────────────────────────────────────────────────
/**
 * Single stat tile showing a metric label + animated count.
 * @param {{ label, value, icon: React.ComponentType, color, loading }} props
 */
function StatCard({ label, value, icon: Icon, color = 'text-brand-600', bg = 'bg-brand-50', loading }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 flex items-center gap-3 shadow-sm">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-surface-500 font-medium truncate">{label}</p>
        {loading ? (
          <div className="h-5 w-10 bg-surface-100 rounded animate-pulse mt-0.5" />
        ) : (
          <p className="text-xl font-bold text-surface-800">{value ?? 0}</p>
        )}
      </div>
    </div>
  );
}

// ── Connection status banner ──────────────────────────────────────────────────
/**
 * Top-of-page banner indicating connection state.
 * @param {{ status: string, lastSync: string|null }} props
 */
function ConnectionBanner({ status, lastSync }) {
  const statusConfig = {
    connected:      { icon: Wifi,    text: t.connectionStatus.connected,      cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    error:          { icon: WifiOff, text: t.connectionStatus.error,          cls: 'bg-rose-50 border-rose-200 text-rose-700' },
    not_configured: { icon: WifiOff, text: t.connectionStatus.not_configured, cls: 'bg-surface-50 border-surface-200 text-surface-600' },
  };
  const cfg = statusConfig[status] || statusConfig.not_configured;
  const StatusIcon = cfg.icon;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${cfg.cls}`}>
      <StatusIcon size={13} />
      <span>{cfg.text}</span>
      {lastSync && status === 'connected' && (
        <span className="ml-2 text-surface-400 font-normal">
          {t.lastSync}: {new Date(lastSync).toLocaleString()}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowDashboard({ onNavigate }) {
  const [stats, setStats]             = useState(null);
  const [incidents, setIncidents]     = useState([]);
  const [syncStatus, setSyncStatus]   = useState(null);
  const [configData, setConfigData]   = useState(null);
  const [incidentConfig, setIncidentConfig] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [syncing, setSyncing]         = useState(false);
  const [error, setError]             = useState(null);
  const [syncMessage, setSyncMessage] = useState(null); // { type: 'success'|'error', text, summary }
  const [autoAckLog, setAutoAckLog]         = useState([]);
  const [autoAckLoading, setAutoAckLoading] = useState(false);
  const [autoAckStatus, setAutoAckStatus]   = useState(null);
  const initRan = useRef(false);

  // ── Fetch dashboard stats ─────────────────────────────────────────────────
  const fetchAutoAckLog = useCallback(async () => {
    setAutoAckLoading(true);
    try {
      const [ackRes, statusRes] = await Promise.all([
        ApiClient.get('/api/servicenow/auto-acknowledge/log').catch(() => null),
        ApiClient.get('/api/servicenow/auto-acknowledge/status').catch(() => null),
      ]);
      if (ackRes?.success) setAutoAckLog(ackRes.data || []);
      if (statusRes?.success) setAutoAckStatus(statusRes.data);
    } catch { /* ignore */ } finally {
      setAutoAckLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    log.debug('fetchStats', 'Fetching dashboard stats');
    setLoading(true);
    setError(null);
    try {
      const [statsRes, incRes, syncRes, cfgRes, incCfgRes] = await Promise.all([
        ApiClient.get(snApi.stats),
        ApiClient.get(`${snApi.incidents}?limit=5`),
        ApiClient.get(snApi.syncStatus).catch(() => null),
        ApiClient.get(snApi.config).catch(() => null),
        ApiClient.get('/api/servicenow/config/incidents').catch(() => null),
      ]);

      if (statsRes?.success) {
        log.info('fetchStats', 'Stats loaded', { connectionStatus: statsRes.data.connectionStatus });
        setStats(statsRes.data);
      } else {
        log.warn('fetchStats', 'Stats fetch failed', { error: statsRes?.error?.message });
        setError(statsRes?.error?.message || uiText.common.fetchError);
      }

      if (incRes?.success) {
        log.debug('fetchStats', 'Recent incidents loaded', { count: incRes.data.incidents?.length });
        setIncidents(incRes.data.incidents || []);
      }
      if (syncRes?.success) setSyncStatus(syncRes.data);
      if (cfgRes?.success) setConfigData(cfgRes.data);
      if (incCfgRes?.success) setIncidentConfig(incCfgRes.data);

      // Fetch today's auto-acknowledged incidents + poller status
      try {
        const [ackRes, statusRes] = await Promise.all([
          ApiClient.get('/api/servicenow/auto-acknowledge/log').catch(() => null),
          ApiClient.get('/api/servicenow/auto-acknowledge/status').catch(() => null),
        ]);
        if (ackRes?.success) setAutoAckLog(ackRes.data || []);
        if (statusRes?.success) setAutoAckStatus(statusRes.data);
      } catch { /* ignore */ }
    } catch (err) {
      log.error('fetchStats', 'Unexpected error', { error: err.message });
      setError(uiText.common.fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  // StrictMode guard — only run on first mount
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('mount', 'ServiceNow Dashboard mounted');
    fetchStats();

    // Auto-refresh when user returns to this tab (e.g., after creating incident in Test Incidents)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        log.info('visibilitychange', 'Dashboard regained focus — refreshing data');
        fetchStats();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchStats]);

  // ── Manual sync ───────────────────────────────────────────────────────────
  const handleSync = useCallback(async () => {
    log.info('handleSync', 'Manual sync triggered');
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await ApiClient.post(snApi.sync, {});
      if (res?.success) {
        const summary = res.data?.summary;
        const msg = res.message || `Sync completed. Fetched ${summary?.totalFetched || 0} record(s) from ${summary?.tables?.length || 0} table(s) in ${res.data?.durationMs || 0}ms.`;
        log.info('handleSync', msg, { summary });
        setSyncMessage({ type: 'success', text: msg, summary });
        await fetchStats();
      } else {
        const errMsg = res?.error?.message || 'Sync failed.';
        log.warn('handleSync', errMsg);
        setSyncMessage({ type: 'error', text: errMsg });
      }
    } catch (err) {
      log.error('handleSync', 'Sync error', { error: err.message });
      setSyncMessage({ type: 'error', text: `Sync failed: ${err.message}` });
    } finally {
      setSyncing(false);
    }
  }, [fetchStats]);

  // Auto-dismiss sync message after 10s
  useEffect(() => {
    if (syncMessage) {
      const timer = setTimeout(() => setSyncMessage(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [syncMessage]);

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
            <ConnectionBanner status={stats.connectionStatus} lastSync={stats.lastSync} />
          )}
          <button
            onClick={handleSync}
            disabled={syncing || loading}
            title={t.syncTooltip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50 transition-colors border border-brand-200"
          >
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {syncing ? uiText.sync.syncing : t.sync}
          </button>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncMessage && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
          syncMessage.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>
          {syncMessage.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <div className="flex-1">
            <span>{syncMessage.text}</span>
            {syncMessage.summary?.tables?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-3 text-xs opacity-80">
                {syncMessage.summary.tables.map(t => (
                  <span key={t.name} className="inline-flex items-center gap-1">
                    <span className="font-semibold capitalize">{t.name}:</span> {t.recordsFetched} records
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setSyncMessage(null)} className="ml-2 text-xs opacity-60 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <AlertCircle size={15} />
          <span>{error}</span>
          <button onClick={fetchStats} className="ml-auto text-xs underline">{uiText.common.retry}</button>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label={t.stats.total}        value={stats?.total}        icon={Headset}       color="text-brand-600"   bg="bg-brand-50"    loading={loading} />
        <StatCard label={t.stats.open}         value={stats?.open}         icon={Activity}      color="text-rose-600"    bg="bg-rose-50"     loading={loading} />
        <StatCard label={t.stats.inProgress}   value={stats?.inProgress}   icon={Clock}         color="text-amber-600"   bg="bg-amber-50"    loading={loading} />
        <StatCard label={t.stats.critical}     value={stats?.critical}     icon={AlertTriangle} color="text-rose-700"    bg="bg-rose-100"    loading={loading} />
        <StatCard label={t.stats.slaBreached}  value={stats?.slaBreached}  icon={AlertCircle}   color="text-amber-600"   bg="bg-amber-50"    loading={loading} />
        <StatCard label={t.stats.resolvedToday} value={stats?.resolvedToday} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50"  loading={loading} />
      </div>

      {/* Connection Health & Config Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Connection Health */}
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
            <h3 className="text-sm font-bold text-surface-700">Connection Health</h3>
          </div>
          <div className="p-5 space-y-3">
            {[
              { label: 'Instance', value: configData?.connection?.instanceUrl || '—', ok: !!configData?.connection?.instanceUrl },
              { label: 'Auth Method', value: configData?.connection?.authMethod || 'basic', ok: true },
              { label: 'API Version', value: configData?.connection?.apiVersion || 'v2', ok: true },
              { label: 'Status', value: stats?.connectionStatus === 'connected' ? 'Connected' : stats?.connectionStatus === 'error' ? 'Error' : 'Not Configured', ok: stats?.connectionStatus === 'connected' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-xs font-medium text-surface-500">{row.label}</span>
                <span className={`text-xs font-semibold flex items-center gap-1 ${row.ok ? 'text-emerald-600' : 'text-surface-400'}`}>
                  {row.ok ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sync Summary */}
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
            <h3 className="text-sm font-bold text-surface-700">Sync Summary</h3>
          </div>
          <div className="p-5 space-y-3">
            {[
              { label: 'Sync Scheduler', value: syncStatus?.running ? 'Running' : 'Stopped', ok: syncStatus?.running },
              { label: 'Sync Interval', value: syncStatus?.syncIntervalMinutes ? `${syncStatus.syncIntervalMinutes} min` : '—', ok: !!syncStatus?.syncIntervalMinutes },
              { label: 'Last Sync', value: stats?.lastSync ? new Date(stats.lastSync).toLocaleString() : (syncStatus?.lastSyncTime ? new Date(syncStatus.lastSyncTime).toLocaleString() : 'Never'), ok: !!(stats?.lastSync || syncStatus?.lastSyncTime) },
              { label: 'Cached Incidents', value: stats?.total != null ? `${stats.total} record(s)` : '—', ok: stats?.total > 0 },
              { label: 'SLA Config', value: configData?.sla ? 'Configured' : 'Default', ok: !!configData?.sla },
              { label: 'Auto Acknowledge', value: autoAckStatus?.running ? `Running (every ${autoAckStatus.pollFreqMinutes}m)` : 'Stopped', ok: !!autoAckStatus?.running },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-xs font-medium text-surface-500">{row.label}</span>
                <span className={`text-xs font-semibold flex items-center gap-1 ${row.ok ? 'text-emerald-600' : 'text-surface-400'}`}>
                  {row.ok ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent incidents */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-100 bg-surface-50/50">
          <h3 className="text-sm font-bold text-surface-700">{t.recentIncidents}</h3>
          <button
            onClick={() => onNavigate?.('incidents')}
            className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-semibold"
          >
            {t.viewAll} <ArrowRight size={12} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 size={20} className="text-brand-400 animate-spin" />
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-surface-400">{t.noIncidents}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50/30">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">{inc.columns.number}</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">{inc.columns.title}</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">{inc.columns.priority}</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">{inc.columns.state}</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">{inc.columns.assignedTo}</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">{inc.columns.createdAt}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {incidents.map(incident => {
                  // Helper to extract value from ServiceNow's {link, value} objects
                  const getValue = (field) => typeof field === 'object' && field?.value ? field.value : field;
                  const number = getValue(incident.number);
                  const description = getValue(incident.short_description) || getValue(incident.title) || uiText.common.na;
                  const priority = getValue(incident.priority);
                  const state = getValue(incident.state);
                  const assignedTo = getValue(incident.assigned_to) || getValue(incident.assignedTo) || uiText.common.na;
                  const openedAt = getValue(incident.opened_at);
                  
                  return (
                    <tr key={incident.sys_id || number} className="hover:bg-surface-50/50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-brand-600 font-semibold">{number}</td>
                      <td className="px-4 py-2.5 text-surface-700 max-w-[280px] truncate">{description}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${PRIORITY_STYLES[priority] || PRIORITY_STYLES.low}`}>
                          {inc.priority[priority] || priority}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${STATE_STYLES[state] || STATE_STYLES.open}`}>
                          {inc.state[state] || state}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-surface-500 text-xs">{assignedTo}</td>
                      <td className="px-4 py-2.5 text-surface-500 text-xs">{openedAt ? new Date(openedAt).toLocaleDateString() : uiText.common.na}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Auto Acknowledged Incidents Today */}
      <div className="space-y-0">
        <div className="flex items-center justify-between px-5 py-3 bg-brand-50/50 border border-surface-200 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-700">Auto Acknowledged Today</h3>
            {autoAckLog.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold">{autoAckLog.length}</span>}
          </div>
          <button onClick={fetchAutoAckLog} disabled={autoAckLoading}
            className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
            title="Refresh">
            <RefreshCw size={13} className={autoAckLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <DataTable
          columns={[
            { key: 'incident_number', label: 'Incident', sortable: true,
              render: (v) => <span className="font-mono text-xs text-brand-600 font-semibold">{v}</span> },
            { key: 'short_description', label: 'Description', sortable: true,
              render: (v) => <span className="text-xs text-surface-700 max-w-[280px] truncate block">{v || '—'}</span> },
            { key: 'priority', label: 'Priority', sortable: true, align: 'center' },
            { key: 'status', label: 'Status', sortable: true, align: 'center',
              render: (v) => <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                v === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>{v === 'success' ? <><CheckCircle2 size={10} /> Done</> : <><AlertCircle size={10} /> Failed</>}</span> },
            { key: 'acknowledged_at', label: 'Time', sortable: true,
              render: (v) => <span className="text-surface-500 text-xs">{v ? new Date(v).toLocaleTimeString() : '—'}</span> },
          ]}
          data={autoAckLog}
          loading={autoAckLoading}
          pageSize={10}
          emptyMessage={loading || autoAckLoading ? 'Loading…' : 'No incidents auto-acknowledged today.'}
          compact={true}
          className="rounded-t-none border-t-0"
        />
      </div>
    </div>
  );
}
