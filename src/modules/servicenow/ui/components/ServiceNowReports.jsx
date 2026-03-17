// ============================================================================
// ServiceNowReports — PulseOps V3 ServiceNow Module
//
// PURPOSE: Vertical tab layout reports view for the ServiceNow module. Includes:
//   Tab 1 — Incident SLA Report (with Monthly/Weekly/Daily filter)
//   Tab 2 — Incident Analytics: volume by priority/state, data grid
//   Tab 3 — RITM Reports: volume by priority, catalog item breakdown
//   Tab 4 — SLA Compliance: per-priority compliance tables, gauge
//
// ARCHITECTURE:
//   - Vertical tab navigation on the left
//   - Incident SLA Report fetches live data from SNOW API
//   - All charts are pure CSS — no chart library dependency
//   - All text from uiText.json — zero hardcoded strings
//
// USED BY: src/modules/servicenow/manifest.jsx → getViews().reports
//
// DEPENDENCIES:
//   - lucide-react       → Icons
//   - @shared            → createLogger, ApiClient
//   - ServiceNowSlaReport → Incident SLA Report sub-component
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart3, RefreshCw, WifiOff, ArrowRight, Loader2,
  AlertCircle, CheckCircle2, Clock, TrendingUp,
  FileText, ShieldCheck, ListChecks,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import ServiceNowSlaReport from './ServiceNowSlaReport';
import DataTable from './DataTable';
const snApi = {
  reports:          '/api/servicenow/reports',
  reportIncidents:  '/api/servicenow/reports/incidents',
  reportRitms:      '/api/servicenow/reports/ritms',
  reportSla:        '/api/servicenow/reports/sla',
};
import uiText from '../config/uiText.json';

const log = createLogger('ServiceNowReports.jsx');
const t   = uiText.reports;
const inc = uiText.incidents;

// ── Priority visual config ────────────────────────────────────────────────────
const PRIORITY_BAR_COLORS = {
  critical: { bar: 'bg-rose-500',   text: 'text-rose-700',   label: 'bg-rose-100 text-rose-700'   },
  high:     { bar: 'bg-amber-400',  text: 'text-amber-700',  label: 'bg-amber-100 text-amber-700'  },
  medium:   { bar: 'bg-blue-400',   text: 'text-blue-700',   label: 'bg-blue-100 text-blue-700'    },
  low:      { bar: 'bg-surface-300', text: 'text-surface-600', label: 'bg-surface-100 text-surface-600' },
};

// ── SLA gauge color thresholds ────────────────────────────────────────────────
const slaColor = (pct) => {
  if (pct >= 90) return { ring: 'text-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' };
  if (pct >= 70) return { ring: 'text-amber-500',   text: 'text-amber-600',   bg: 'bg-amber-50'   };
  return           { ring: 'text-rose-500',    text: 'text-rose-600',    bg: 'bg-rose-50'    };
};

// ── SLA Gauge sub-component ───────────────────────────────────────────────────
/**
 * Circular SVG gauge showing SLA compliance percentage.
 * @param {{ pct: number, loading: boolean }} props
 */
function SlaGauge({ pct, loading }) {
  const radius   = 54;
  const circ     = 2 * Math.PI * radius;
  const offset   = circ - (pct / 100) * circ;
  const colors   = slaColor(pct);

  return (
    <div className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border ${colors.bg} border-surface-200 shadow-sm`}>
      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">{t.slaCompliance}</p>
      {loading ? (
        <div className="w-32 h-32 flex items-center justify-center">
          <Loader2 size={28} className="text-brand-400 animate-spin" />
        </div>
      ) : (
        <div className="relative w-32 h-32">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            {/* Track */}
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
            {/* Progress */}
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              className={`${colors.ring} transition-all duration-700`}
            />
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

// ── Horizontal bar chart sub-component ───────────────────────────────────────
/**
 * Pure-CSS horizontal bar chart for incident volume by priority.
 * @param {{ counts: Object, total: number, loading: boolean }} props
 */
function PriorityChart({ counts, total, loading }) {
  const maxVal = Math.max(...Object.values(counts || {}), 1);

  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-1">{t.incidentsByPriority}</p>
      <p className="text-xs text-surface-400 mb-4">{t.incidentsByPrioritySubtitle}</p>
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 bg-surface-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {['critical', 'high', 'medium', 'low'].map(priority => {
            const count = counts?.[priority] || 0;
            const pct   = maxVal > 0 ? (count / maxVal) * 100 : 0;
            const cfg   = PRIORITY_BAR_COLORS[priority];
            return (
              <div key={priority} className="flex items-center gap-3">
                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold w-16 text-center ${cfg.label}`}>
                  {inc.priority[priority]}
                </span>
                <div className="flex-1 h-5 bg-surface-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${cfg.bar} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
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

// ── Resolution time table sub-component ──────────────────────────────────────
/**
 * Table showing average resolution time per priority with SLA threshold comparison.
 * @param {{ resolutionByPriority: Object, slaThresholds: Object, loading: boolean }} props
 */
function ResolutionTable({ resolutionByPriority, slaThresholds, loading }) {
  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
        <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">{t.resolutionTime}</p>
        <p className="text-xs text-surface-400 mt-0.5">{t.resolutionTimeSubtitle}</p>
      </div>
      {loading ? (
        <div className="p-6 space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-6 bg-surface-100 rounded animate-pulse" />)}
        </div>
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
                  <td className="px-5 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.label}`}>
                      {inc.priority[priority]}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right text-sm font-semibold text-surface-700">
                    {avgHrs != null ? `${avgHrs} ${t.hours}` : <span className="text-surface-300">{uiText.common.na}</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right text-xs text-surface-500">
                    {limit != null ? `${limit} ${t.hours}` : uiText.common.na}
                  </td>
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

// ── Breakdown table sub-component ────────────────────────────────────────────
function BreakdownTable({ title, data, loading }) {
  const entries = data ? Object.entries(data) : [];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
        <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">{title}</p>
      </div>
      {loading ? (
        <div className="p-6 space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-5 bg-surface-100 rounded animate-pulse" />)}
        </div>
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

// DataGrid replaced by imported DataTable component with sorting/pagination/column reorder

// ── SLA compliance table sub-component ──────────────────────────────────────
function SlaComplianceGrid({ slaData, loading }) {
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 size={20} className="text-brand-400 animate-spin" />
      </div>
    );
  }
  const entries = slaData?.byPriority ? Object.entries(slaData.byPriority) : [];
  if (entries.length === 0) {
    return <div className="p-8 text-center text-sm text-surface-400">{t.noData}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-50 border-b border-surface-200">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase">Priority</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase">Met</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase">Breached</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase">Compliance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-50">
          {entries.map(([priority, data]) => (
            <tr key={priority} className="hover:bg-surface-50/50">
              <td className="px-4 py-2.5 font-medium text-surface-700">{priority}</td>
              <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold">{data.resolutionMet}</td>
              <td className="px-4 py-2.5 text-right text-rose-600 font-semibold">{data.resolutionBreached}</td>
              <td className="px-4 py-2.5 text-right">
                {data.resolutionCompliance != null ? (
                  <span className={`inline-flex items-center gap-1 text-xs font-bold ${data.resolutionCompliance >= 90 ? 'text-emerald-600' : data.resolutionCompliance >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {data.resolutionCompliance}%
                    {data.resolutionCompliance >= 90 ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  </span>
                ) : uiText.common.na}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Report tab definitions (vertical layout) ────────────────────────────────
const REPORT_TABS = [
  { id: 'incident_sla', label: 'Incident SLA Report', icon: ShieldCheck },
  { id: 'incidents',    label: 'Incident Analytics',   icon: FileText },
  { id: 'ritms',        label: 'RITMs',                icon: ListChecks },
  { id: 'sla',          label: 'SLA Compliance',       icon: ShieldCheck },
];

const INCIDENT_GRID_COLS = [
  { key: 'number', label: 'Number' },
  { key: 'shortDescription', label: 'Description' },
  { key: 'priority', label: 'Priority' },
  { key: 'state', label: 'State' },
  { key: 'category', label: 'Category' },
  { key: 'openedAt', label: 'Opened' },
];

const RITM_GRID_COLS = [
  { key: 'number', label: 'Number' },
  { key: 'shortDescription', label: 'Description' },
  { key: 'priority', label: 'Priority' },
  { key: 'state', label: 'State' },
  { key: 'catalogItem', label: 'Catalog Item' },
  { key: 'openedAt', label: 'Opened' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowReports({ onNavigate }) {
  const [activeTab, setActiveTab] = useState('incident_sla');
  const [data,      setData]      = useState(null);
  const [incData,   setIncData]   = useState(null);
  const [ritmData,  setRitmData]  = useState(null);
  const [slaData,   setSlaData]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const initRan = useRef(false);

  // ── Fetch summary reports ─────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    log.debug('fetchReports', 'Fetching reports data');
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.get(snApi.reports);
      if (res?.success) {
        log.info('fetchReports', 'Reports loaded', { slaCompliance: res.data.slaCompliance });
        setData(res.data);
      } else {
        log.warn('fetchReports', 'Reports fetch failed', { error: res?.error?.message });
        setError(res?.error?.message || uiText.common.fetchError);
      }
    } catch (err) {
      log.error('fetchReports', 'Unexpected error', { error: err.message });
      setError(uiText.common.fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch tab-specific data ────────────────────────────────────────────
  const fetchTabData = useCallback(async (tab) => {
    try {
      const url = tab === 'incidents' ? snApi.reportIncidents
                : tab === 'ritms'     ? snApi.reportRitms
                :                       snApi.reportSla;
      const res = await ApiClient.get(url);
      if (res?.success) {
        if (tab === 'incidents') setIncData(res.data);
        else if (tab === 'ritms') setRitmData(res.data);
        else setSlaData(res.data);
        log.info('fetchTabData', `${tab} report loaded`);
      }
    } catch (err) {
      log.error('fetchTabData', `${tab} report failed`, { error: err.message });
    }
  }, []);

  // StrictMode-safe initial load
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('mount', 'ServiceNow Reports mounted');
    fetchReports();
    fetchTabData('incidents');
  }, [fetchReports, fetchTabData]);

  // Fetch tab data on tab change
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    const dataMap = { incidents: incData, ritms: ritmData, sla: slaData };
    if (!dataMap[tab]) fetchTabData(tab);
  }, [incData, ritmData, slaData, fetchTabData]);

  // ── Not configured ─────────────────────────────────────────────────────
  if (!loading && data?.notConfigured) {
    return (
      <div className="p-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <BarChart3 size={20} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800">{t.title}</h1>
            <p className="text-sm text-surface-500">{t.subtitle}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-surface-200 p-12 flex flex-col items-center text-center shadow-sm">
          <WifiOff size={28} className="text-surface-300 mb-3" />
          <h2 className="text-sm font-bold text-surface-700 mb-1">{t.notConfigured}</h2>
          <p className="text-xs text-surface-400 max-w-sm mb-5">{t.notConfiguredHint}</p>
          <button
            onClick={() => onNavigate?.('config')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
          >
            Configure Now <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in flex h-full" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* ── Vertical Tab Sidebar ──────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 bg-surface-50 border-r border-surface-200 py-4 px-2 space-y-1">
        <div className="px-3 pb-3 mb-2 border-b border-surface-200">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-600" />
            <h2 className="text-sm font-bold text-surface-800">{t.title}</h2>
          </div>
          <p className="text-[10px] text-surface-400 mt-0.5">{t.subtitle}</p>
        </div>
        {REPORT_TABS.map(tab => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left ${
                isActive
                  ? 'bg-brand-50 text-brand-700 border border-brand-200 shadow-sm'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-800'
              }`}
            >
              <TabIcon size={14} />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Main Content Area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Incident SLA Report (full sub-component) */}
        {activeTab === 'incident_sla' && (
          <ServiceNowSlaReport />
        )}

        {/* Incident Analytics */}
        {activeTab === 'incidents' && (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-surface-800">Incident Analytics</h2>
              <button
                onClick={() => { fetchReports(); fetchTabData('incidents'); }}
                disabled={loading}
                className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                <AlertCircle size={14} /><span>{error}</span>
                <button onClick={fetchReports} className="ml-auto text-xs underline">{uiText.common.retry}</button>
              </div>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t.totalIncidents, value: data?.totalIncidents ?? 0, icon: TrendingUp, color: 'text-brand-600', bg: 'bg-brand-50' },
                { label: t.totalResolved, value: data?.totalResolved ?? 0, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: t.lastSync,
                  value: data?.lastSync ? new Date(data.lastSync).toLocaleString() : uiText.sync.never,
                  icon: Clock, color: 'text-teal-600', bg: 'bg-teal-50', isText: true },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-xl border border-surface-200 p-4 flex items-center gap-3 shadow-sm">
                  <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center flex-shrink-0`}>
                    <card.icon size={18} className={card.color} />
                  </div>
                  <div>
                    <p className="text-xs text-surface-500 font-medium">{card.label}</p>
                    {loading
                      ? <div className="h-5 w-16 bg-surface-100 rounded animate-pulse mt-0.5" />
                      : <p className={`font-bold ${card.isText ? 'text-sm text-surface-700' : 'text-xl text-surface-800'}`}>{card.value}</p>
                    }
                  </div>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <SlaGauge pct={data?.slaCompliance ?? 0} loading={loading} />
              <div className="lg:col-span-2">
                <PriorityChart counts={data?.priorityCounts} total={data?.totalIncidents || 0} loading={loading} />
              </div>
            </div>

            <ResolutionTable resolutionByPriority={data?.resolutionByPriority} slaThresholds={data?.slaThresholds} loading={loading} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BreakdownTable title="By Priority" data={incData?.byPriority} loading={!incData} />
              <BreakdownTable title="By State" data={incData?.byState} loading={!incData} />
            </div>

            <DataTable
              columns={INCIDENT_GRID_COLS.map(c => ({ ...c, sortable: true }))}
              data={incData?.incidents || []}
              loading={!incData}
              pageSize={20}
              searchable={true}
              searchPlaceholder="Search incidents..."
              emptyMessage={t.noData}
              compact={true}
            />
          </div>
        )}

        {/* RITMs */}
        {activeTab === 'ritms' && (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-surface-800">RITM Reports</h2>
              <button onClick={() => fetchTabData('ritms')} className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BreakdownTable title="By Priority" data={ritmData?.byPriority} loading={!ritmData} />
              <BreakdownTable title="By Catalog Item" data={ritmData?.byCatalogItem} loading={!ritmData} />
            </div>
            <DataTable
              columns={RITM_GRID_COLS.map(c => ({ ...c, sortable: true }))}
              data={ritmData?.ritms || []}
              loading={!ritmData}
              pageSize={20}
              searchable={true}
              searchPlaceholder="Search RITMs..."
              emptyMessage={t.noData}
              compact={true}
            />
          </div>
        )}

        {/* SLA Compliance */}
        {activeTab === 'sla' && (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-surface-800">SLA Compliance</h2>
              <button onClick={() => fetchTabData('sla')} className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">Incident SLA Compliance</p>
              </div>
              <SlaComplianceGrid slaData={slaData?.incidentSla} loading={!slaData} />
            </div>
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">RITM SLA Compliance</p>
              </div>
              <SlaComplianceGrid slaData={slaData?.ritmSla} loading={!slaData} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
