// ============================================================================
// HealthCheckDashboard — HealthCheck Module Main Dashboard
//
// PURPOSE: Live monitoring dashboard showing:
//   1. Summary stats — total apps, UP/DOWN/Unknown counts, polls today/month
//   2. Poller status — running/stopped, last poll, poll count, interval
//   3. Live health probe grid — per-app status with response time, HTTP code
//   4. Category breakdown — grouped health summary
//
// USED BY: manifest.jsx → getViews() → dashboard
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Loader2, RefreshCw, Zap, CheckCircle2, XCircle,
  HelpCircle, Play, Pause, Clock, ArrowRight, ExternalLink,
  Wifi, WifiOff, Timer, BarChart3, Globe, AlertCircle,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import urls from '../config/urls.json';

const log = createLogger('HealthCheckDashboard.jsx');
const t = uiText.dashboard;
const tc = uiText.common;
const api = urls.api;

// ── Status icon helper ──────────────────────────────────────────────────────
function StatusIcon({ status, size = 16 }) {
  if (status === 'UP') return <CheckCircle2 size={size} className="text-emerald-500" />;
  if (status === 'DOWN') return <XCircle size={size} className="text-red-500" />;
  return <HelpCircle size={size} className="text-surface-300" />;
}

function StatusBadge({ status }) {
  const colors = {
    UP: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    DOWN: 'bg-red-50 text-red-700 border-red-200',
    UNKNOWN: 'bg-surface-50 text-surface-500 border-surface-200',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${colors[status] || colors.UNKNOWN}`}>
      {status === 'UP' ? tc.up : status === 'DOWN' ? tc.down : tc.unknown}
    </span>
  );
}

export default function HealthCheckDashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState(null);
  const initRan = useRef(false);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await ApiClient.get(api.dashboard);
      if (res?.success) setData(res.data);
      else setError(res?.error?.message || tc.fetchError);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadDashboard();
  }, [loadDashboard]);

  const handlePollNow = useCallback(async () => {
    setPolling(true);
    try {
      const res = await ApiClient.post(api.pollerPollNow);
      if (res?.success) {
        // Reload dashboard after poll
        await loadDashboard();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPolling(false);
    }
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-brand-500" size={28} />
        <span className="ml-3 text-surface-500">{tc.loading}</span>
      </div>
    );
  }

  if (!data || data.totalApps === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
          <Activity size={28} className="text-surface-300" />
        </div>
        <h2 className="text-lg font-bold text-surface-700">{t.notConfiguredTitle}</h2>
        <p className="text-sm text-surface-400 mt-1 max-w-md">{t.notConfiguredSubtitle}</p>
        {onNavigate && (
          <button onClick={() => onNavigate('config')}
            className="mt-4 px-4 py-2 text-sm font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 flex items-center gap-1">
            {t.goToConfig} <ArrowRight size={14} />
          </button>
        )}
      </div>
    );
  }

  const poller = data.poller || {};

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
            <Activity size={20} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800">{t.title}</h1>
            <p className="text-sm text-surface-500 mt-0.5">{t.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePollNow} disabled={polling}
            className="px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 disabled:opacity-50 flex items-center gap-1">
            {polling ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {t.pollNow}
          </button>
          <button onClick={() => loadDashboard(true)} disabled={refreshing}
            className="px-3 py-1.5 text-xs font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 disabled:opacity-50 flex items-center gap-1">
            {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t.refresh}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Globe size={14} className="text-brand-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-surface-400">{t.summary.totalApps}</span>
          </div>
          <p className="text-2xl font-bold text-surface-800">{data.totalApps}</p>
        </div>
        <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-surface-400">{t.summary.appsUp}</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{data.appsUp}</p>
        </div>
        <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <XCircle size={14} className="text-red-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-surface-400">{t.summary.appsDown}</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{data.appsDown}</p>
        </div>
        <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={14} className="text-blue-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-surface-400">{t.summary.pollsMonth}</span>
          </div>
          <p className="text-2xl font-bold text-surface-800">{data.month?.total_polls_month || 0}</p>
        </div>
      </div>

      {/* Poller Status Bar */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${poller.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-surface-300'}`} />
              <span className="text-sm font-bold text-surface-700">{t.poller.title}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${poller.isRunning ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-100 text-surface-500'}`}>
                {poller.isRunning ? t.poller.running : t.poller.stopped}
              </span>
            </div>
            {poller.intervalSeconds && (
              <div className="flex items-center gap-1 text-xs text-surface-400">
                <Timer size={12} /> {t.poller.interval}: {poller.intervalSeconds}{t.poller.seconds}
              </div>
            )}
          </div>
          <div className="flex items-center gap-6 text-xs text-surface-500">
            <div>
              <span className="text-surface-400">{t.poller.lastPoll}: </span>
              <span className="font-medium text-surface-700">
                {poller.lastPollTime ? new Date(poller.lastPollTime).toLocaleString() : t.poller.notStarted}
              </span>
            </div>
            <div>
              <span className="text-surface-400">{t.poller.pollCount}: </span>
              <span className="font-medium text-surface-700">{poller.pollCount || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      {data.categories && data.categories.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-surface-800 mb-3">{t.categories.title}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {data.categories.map(cat => (
              <div key={cat.name} className="flex items-center gap-3 p-3 bg-surface-50 rounded-lg border border-surface-100">
                <div className="w-3 h-8 rounded-full" style={{ backgroundColor: cat.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-surface-700 truncate">{cat.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-emerald-600 font-medium">{cat.up} UP</span>
                    {cat.down > 0 && <span className="text-xs text-red-600 font-medium">{cat.down} DOWN</span>}
                    <span className="text-xs text-surface-400">/ {cat.total}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Health Status Grid */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm">
        <div className="px-5 py-4 border-b border-surface-100">
          <h3 className="text-sm font-bold text-surface-800">{t.liveStatus.title}</h3>
          <p className="text-xs text-surface-500">{t.liveStatus.subtitle}</p>
        </div>
        {data.applications && data.applications.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  <th className="px-4 py-2.5 text-left font-semibold text-surface-600">{tc.status}</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-surface-600">{tc.name}</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-surface-600">{tc.url}</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-surface-600">{tc.category}</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-surface-600">{t.liveStatus.httpCode}</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-surface-600">{t.liveStatus.responseTime}</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-surface-600">SLA %</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-surface-600">{t.liveStatus.lastChecked}</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-surface-600">{t.liveStatus.error}</th>
                </tr>
              </thead>
              <tbody>
                {data.applications.map(app => (
                  <tr key={app.id} className={`border-b border-surface-50 hover:bg-surface-50/50 ${app.latestStatus === 'DOWN' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={app.latestStatus} />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-surface-800">{app.name}</td>
                    <td className="px-4 py-2.5 text-surface-500 max-w-[220px] truncate">
                      <a href={app.url} target="_blank" rel="noopener noreferrer"
                        className="hover:text-brand-600 flex items-center gap-1">
                        {app.url} <ExternalLink size={10} />
                      </a>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: app.categoryColor || '#6366f1' }} />
                        <span className="text-surface-600">{app.categoryName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {app.latestHttpCode ? (
                        <span className={`font-mono font-medium ${app.latestHttpCode >= 200 && app.latestHttpCode < 300 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {app.latestHttpCode}
                        </span>
                      ) : <span className="text-surface-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {app.latestResponseMs != null ? (
                        <span className={`font-mono ${app.latestResponseMs > 5000 ? 'text-red-600' : app.latestResponseMs > 2000 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {app.latestResponseMs}{t.liveStatus.ms}
                        </span>
                      ) : <span className="text-surface-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center font-medium text-surface-700">
                      {app.slaTargetPercent}%
                    </td>
                    <td className="px-4 py-2.5 text-surface-500">
                      {app.lastPolledAt ? new Date(app.lastPolledAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-red-500 max-w-[180px] truncate">
                      {app.latestError || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-surface-400">{t.liveStatus.noApps}</div>
        )}
      </div>
    </div>
  );
}
