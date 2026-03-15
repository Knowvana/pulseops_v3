// ============================================================================
// IncidentAnalyticsView — PulseOps V3 ServiceNow Module
//
// PURPOSE: Standalone view for Incident Analytics (volume by priority/state,
// resolution time, SLA gauge, data grid). Extracted from ServiceNowReports.
//
// USED BY: manifest.jsx → getViews().incidentAnalytics
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart3, RefreshCw, Loader2, AlertCircle, CheckCircle2,
  Clock, TrendingUp, WifiOff, ArrowRight, Globe,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';

const log = createLogger('IncidentAnalyticsView');
const t   = uiText.reports;
const inc = uiText.incidents;

const snApi = {
  reports:         '/api/servicenow/reports',
  reportIncidents: '/api/servicenow/reports/incidents',
};

// ── Priority visual config ────────────────────────────────────────────────────
const PRIORITY_BAR_COLORS = {
  critical: { bar: 'bg-rose-500',   text: 'text-rose-700',   label: 'bg-rose-100 text-rose-700'   },
  high:     { bar: 'bg-amber-400',  text: 'text-amber-700',  label: 'bg-amber-100 text-amber-700'  },
  medium:   { bar: 'bg-blue-400',   text: 'text-blue-700',   label: 'bg-blue-100 text-blue-700'    },
  low:      { bar: 'bg-surface-300', text: 'text-surface-600', label: 'bg-surface-100 text-surface-600' },
};

const slaColor = (pct) => {
  if (pct >= 90) return { ring: 'text-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' };
  if (pct >= 70) return { ring: 'text-amber-500',   text: 'text-amber-600',   bg: 'bg-amber-50'   };
  return           { ring: 'text-rose-500',    text: 'text-rose-600',    bg: 'bg-rose-50'    };
};

function SlaGauge({ pct, loading }) {
  const radius = 54;
  const circ   = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  const colors = slaColor(pct);
  return (
    <div className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border ${colors.bg} border-surface-200 shadow-sm`}>
      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">{t.slaCompliance}</p>
      {loading ? (
        <div className="w-32 h-32 flex items-center justify-center"><Loader2 size={28} className="text-brand-400 animate-spin" /></div>
      ) : (
        <div className="relative w-32 h-32">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
            <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={offset} className={`${colors.ring} transition-all duration-700`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-black ${colors.text}`}>{pct}%</span>
          </div>
        </div>
      )}
      <p className="text-xs text-surface-400 mt-2">{t.slaComplianceSubtitle}</p>
    </div>
  );
}

function PriorityChart({ counts, total, loading }) {
  const maxVal = Math.max(...Object.values(counts || {}), 1);
  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-1">{t.incidentsByPriority}</p>
      <p className="text-xs text-surface-400 mb-4">{t.incidentsByPrioritySubtitle}</p>
      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-surface-100 rounded animate-pulse" />)}</div>
      ) : (
        <div className="space-y-3">
          {['critical', 'high', 'medium', 'low'].map(priority => {
            const count = counts?.[priority] || 0;
            const pct   = maxVal > 0 ? (count / maxVal) * 100 : 0;
            const cfg   = PRIORITY_BAR_COLORS[priority];
            return (
              <div key={priority} className="flex items-center gap-3">
                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold w-16 text-center ${cfg.label}`}>{inc.priority[priority]}</span>
                <div className="flex-1 h-5 bg-surface-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${cfg.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
                <span className={`text-xs font-bold w-8 text-right ${cfg.text}`}>{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResolutionTable({ resolutionByPriority, slaThresholds, loading }) {
  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
        <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">{t.resolutionTime}</p>
        <p className="text-xs text-surface-400 mt-0.5">{t.resolutionTimeSubtitle}</p>
      </div>
      {loading ? (
        <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-6 bg-surface-100 rounded animate-pulse" />)}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-100">
              <th className="text-left px-5 py-2 text-xs font-semibold text-surface-500">Priority</th>
              <th className="text-right px-5 py-2 text-xs font-semibold text-surface-500">Avg Time</th>
              <th className="text-right px-5 py-2 text-xs font-semibold text-surface-500">SLA Limit</th>
              <th className="text-right px-5 py-2 text-xs font-semibold text-surface-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-50">
            {['critical', 'high', 'medium', 'low'].map(priority => {
              const avgHrs  = resolutionByPriority?.[priority];
              const limit   = slaThresholds?.[priority];
              const cfg     = PRIORITY_BAR_COLORS[priority];
              const withinSla = avgHrs != null && limit != null && avgHrs <= limit;
              return (
                <tr key={priority} className="hover:bg-surface-50/50">
                  <td className="px-5 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.label}`}>{inc.priority[priority]}</span></td>
                  <td className="px-5 py-2.5 text-right text-sm font-semibold text-surface-700">
                    {avgHrs != null ? `${avgHrs} ${t.hours}` : <span className="text-surface-300">{uiText.common.na}</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right text-xs text-surface-500">{limit != null ? `${limit} ${t.hours}` : uiText.common.na}</td>
                  <td className="px-5 py-2.5 text-right">
                    {avgHrs != null
                      ? withinSla
                        ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold"><CheckCircle2 size={12} /> Met</span>
                        : <span className="inline-flex items-center gap-1 text-rose-600 text-xs font-semibold"><AlertCircle size={12} /> Breached</span>
                      : <span className="text-surface-300 text-xs">{uiText.common.na}</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BreakdownTable({ title, data, loading }) {
  const entries = data ? Object.entries(data) : [];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
        <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">{title}</p>
      </div>
      {loading ? (
        <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-5 bg-surface-100 rounded animate-pulse" />)}</div>
      ) : entries.length === 0 ? (
        <div className="p-6 text-center text-sm text-surface-400">{t.noData}</div>
      ) : (
        <div className="divide-y divide-surface-50">
          {entries.map(([key, count]) => (
            <div key={key} className="flex items-center justify-between px-5 py-2.5">
              <span className="text-sm text-surface-700">{key}</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-400 rounded-full" style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
                </div>
                <span className="text-xs font-bold text-surface-600 w-8 text-right">{count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataGrid({ columns, rows, loading }) {
  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 size={20} className="text-brand-400 animate-spin" /></div>;
  if (!rows || rows.length === 0) return <div className="p-8 text-center text-sm text-surface-400">{t.noData}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-50 border-b border-surface-200">
            {columns.map(col => (
              <th key={col.key} className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide whitespace-nowrap">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface-50/50 transition-colors">
              {columns.map(col => (
                <td key={col.key} className="px-4 py-2.5 text-surface-700 text-xs whitespace-nowrap">{row[col.key] ?? uiText.common.na}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INCIDENT_GRID_COLS = [
  { key: 'number', label: 'Number' },
  { key: 'shortDescription', label: 'Description' },
  { key: 'priority', label: 'Priority' },
  { key: 'state', label: 'State' },
  { key: 'category', label: 'Category' },
  { key: 'openedAt', label: 'Opened' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function IncidentAnalyticsView({ onNavigate }) {
  const [data,    setData]    = useState(null);
  const [incData, setIncData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const initRan = useRef(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.get(snApi.reports);
      if (res?.success) setData(res.data);
      else setError(res?.error?.message || uiText.common.fetchError);
    } catch (err) {
      setError(uiText.common.fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await ApiClient.get(snApi.reportIncidents);
      if (res?.success) setIncData(res.data);
    } catch (err) {
      log.error('fetchIncidents', 'Failed', { error: err.message });
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    fetchReports();
    fetchIncidents();
  }, [fetchReports, fetchIncidents]);

  if (!loading && data?.notConfigured) {
    return (
      <div className="p-6 animate-fade-in">
        <div className="bg-white rounded-2xl border border-surface-200 p-12 flex flex-col items-center text-center shadow-sm">
          <WifiOff size={28} className="text-surface-300 mb-3" />
          <h2 className="text-sm font-bold text-surface-700 mb-1">{t.notConfigured}</h2>
          <p className="text-xs text-surface-400 max-w-sm mb-5">{t.notConfiguredHint}</p>
          <button onClick={() => onNavigate?.('config')} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors">
            Configure Now <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-surface-800">Incident Analytics</h2>
          {incData?.timezone && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100">
              <Globe size={10} /> {incData.timezone}
            </span>
          )}
        </div>
        <button onClick={() => { fetchReports(); fetchIncidents(); }} disabled={loading}
          className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <AlertCircle size={14} /><span>{error}</span>
          <button onClick={fetchReports} className="ml-auto text-xs underline">{uiText.common.retry}</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t.totalIncidents, value: data?.totalIncidents ?? 0, icon: TrendingUp, color: 'text-brand-600', bg: 'bg-brand-50' },
          { label: t.totalResolved, value: data?.totalResolved ?? 0, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: t.lastSync, value: data?.lastSync ? new Date(data.lastSync).toLocaleString() : uiText.sync.never, icon: Clock, color: 'text-teal-600', bg: 'bg-teal-50', isText: true },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-surface-200 p-4 flex items-center gap-3 shadow-sm">
            <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center flex-shrink-0`}><card.icon size={18} className={card.color} /></div>
            <div>
              <p className="text-xs text-surface-500 font-medium">{card.label}</p>
              {loading ? <div className="h-5 w-16 bg-surface-100 rounded animate-pulse mt-0.5" />
                : <p className={`font-bold ${card.isText ? 'text-sm text-surface-700' : 'text-xl text-surface-800'}`}>{card.value}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SlaGauge pct={data?.slaCompliance ?? 0} loading={loading} />
        <div className="lg:col-span-2"><PriorityChart counts={data?.priorityCounts} total={data?.totalIncidents || 0} loading={loading} /></div>
      </div>

      <ResolutionTable resolutionByPriority={data?.resolutionByPriority} slaThresholds={data?.slaThresholds} loading={loading} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BreakdownTable title="By Priority" data={incData?.byPriority} loading={!incData} />
        <BreakdownTable title="By State" data={incData?.byState} loading={!incData} />
      </div>

      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">Incident Details</p>
          <span className="text-xs text-surface-400">{incData?.totalCount ?? 0} records</span>
        </div>
        <DataGrid columns={INCIDENT_GRID_COLS} rows={incData?.incidents} loading={!incData} />
      </div>
    </div>
  );
}
