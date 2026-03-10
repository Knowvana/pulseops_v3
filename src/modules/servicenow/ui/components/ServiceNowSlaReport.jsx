// ============================================================================
// ServiceNowSlaReport — PulseOps V3 ServiceNow Module
//
// PURPOSE: Incident SLA Report with vertical tab layout. Shows:
//   - Period filter (Monthly/Weekly/Daily)
//   - SLA Summary by priority (met/breached/pending)
//   - Incident grid with SLA columns (created, closed, resolution time, target, status)
//
// DATA: Fetches live from GET /api/servicenow/reports/sla/incidents?period=monthly
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck, Loader2, AlertCircle, CheckCircle2, XCircle,
  Clock, Calendar, CalendarDays, CalendarRange, RefreshCw,
  FileText, ClipboardList,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';

const log = createLogger('ServiceNowSlaReport.jsx');

const snApi = {
  slaIncidents: '/api/servicenow/reports/sla/incidents',
};

const PERIOD_OPTIONS = [
  { id: 'daily',   label: 'Daily',   icon: Calendar },
  { id: 'weekly',  label: 'Weekly',  icon: CalendarDays },
  { id: 'monthly', label: 'Monthly', icon: CalendarRange },
];

const PRIORITY_STYLES = {
  '1 - Critical': { badge: 'bg-rose-100 text-rose-700 border-rose-200',   bar: 'bg-rose-500' },
  '2 - High':     { badge: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'bg-amber-400' },
  '3 - Medium':   { badge: 'bg-blue-100 text-blue-700 border-blue-200',   bar: 'bg-blue-400' },
  '4 - Low':      { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-400' },
};

// Vertical tab items — Incident SLA first, RITM SLA placeholder
const REPORT_TABS = [
  { id: 'incident_sla', label: 'Incident SLA Report', icon: ShieldCheck },
  { id: 'ritm_sla',     label: 'RITM SLA Report',     icon: ClipboardList, disabled: true },
];

// ── SLA Summary Card ─────────────────────────────────────────────────────────
function SlaSummaryCard({ priority, data }) {
  const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES['4 - Low'];
  const total = (data.met || 0) + (data.breached || 0) + (data.pending || 0);
  const compliance = total > 0 ? Math.round(((data.met || 0) / (total - (data.pending || 0) || 1)) * 100) : null;
  const compColor = compliance === null ? 'text-surface-400' : compliance >= 90 ? 'text-emerald-600' : compliance >= 70 ? 'text-amber-600' : 'text-rose-600';

  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${style.badge}`}>{priority}</span>
        {compliance !== null && (
          <span className={`text-lg font-black ${compColor}`}>{compliance}%</span>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-surface-500">Total</span>
          <span className="font-bold text-surface-700">{total}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={10} /> Met</span>
          <span className="font-bold text-emerald-600">{data.met || 0}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-rose-600 flex items-center gap-1"><XCircle size={10} /> Breached</span>
          <span className="font-bold text-rose-600">{data.breached || 0}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-surface-400 flex items-center gap-1"><Clock size={10} /> Pending</span>
          <span className="font-bold text-surface-400">{data.pending || 0}</span>
        </div>
        {data.targetMinutes && (
          <div className="flex items-center justify-between text-xs pt-1 border-t border-surface-100">
            <span className="text-surface-500">Target</span>
            <span className="font-semibold text-surface-600">{data.targetMinutes} min</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Format minutes to human-readable ─────────────────────────────────────────
function formatMinutes(mins) {
  if (mins == null) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowSlaReport() {
  const [activeTab, setActiveTab] = useState('incident_sla');
  const [period, setPeriod]       = useState('monthly');
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [message, setMessage]     = useState(null);
  const initRan = useRef(false);

  // ── Fetch SLA report data ──────────────────────────────────────────────
  const fetchSlaReport = useCallback(async (p = period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.get(`${snApi.slaIncidents}?period=${p}`);
      if (res?.success) {
        setData(res.data);
        setMessage({ type: 'success', text: `Loaded ${res.data.totalIncidents} incident(s) for ${p} period.` });
        log.info('fetchSlaReport', 'SLA report loaded', { period: p, total: res.data.totalIncidents });
      } else {
        setError(res?.error?.message || 'Failed to load SLA report.');
        setMessage({ type: 'error', text: res?.error?.message || 'Failed to load SLA report.' });
      }
    } catch (err) {
      setError(`Failed to load SLA report: ${err.message}`);
      setMessage({ type: 'error', text: `Failed to load SLA report: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    fetchSlaReport();
  }, [fetchSlaReport]);

  // Auto-dismiss message
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handlePeriodChange = (p) => {
    setPeriod(p);
    fetchSlaReport(p);
  };

  const summaryEntries = data?.summaryByPriority ? Object.entries(data.summaryByPriority) : [];

  return (
    <div className="flex h-full min-h-[600px]">
      {/* ── Vertical Tab Sidebar ──────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 bg-surface-50 border-r border-surface-200 py-4 px-2 space-y-1">
        {REPORT_TABS.map(tab => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                isActive
                  ? 'bg-brand-50 text-brand-700 border border-brand-200 shadow-sm'
                  : tab.disabled
                    ? 'text-surface-400 cursor-not-allowed'
                    : 'text-surface-600 hover:bg-surface-100 hover:text-surface-800'
              }`}
            >
              <TabIcon size={15} />
              <span className="truncate">{tab.label}</span>
              {tab.disabled && <span className="text-[9px] bg-surface-200 text-surface-500 px-1 rounded ml-auto">Soon</span>}
            </button>
          );
        })}
      </div>

      {/* ── Main Content Area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {activeTab === 'incident_sla' && (
          <>
            {/* Header with period filter */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-surface-800">Incident SLA Report</h2>
                <p className="text-sm text-surface-500">
                  Resolution SLA compliance for {data?.startDate || '...'} to {data?.endDate || '...'} ({period})
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Period toggle */}
                <div className="flex items-center bg-surface-100 rounded-lg p-0.5">
                  {PERIOD_OPTIONS.map(opt => {
                    const PIcon = opt.icon;
                    const isActive = period === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handlePeriodChange(opt.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          isActive ? 'bg-white text-brand-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'
                        }`}
                      >
                        <PIcon size={12} />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => fetchSlaReport()}
                  disabled={loading}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Message banner */}
            {message && (
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${
                message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
              }`}>
                {message.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {message.text}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 size={28} className="text-brand-400 animate-spin mb-3" />
                <p className="text-sm text-surface-500">Loading SLA data from ServiceNow...</p>
              </div>
            )}

            {/* SLA Summary Cards */}
            {!loading && summaryEntries.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {summaryEntries.map(([priority, pData]) => (
                  <SlaSummaryCard key={priority} priority={priority} data={pData} />
                ))}
              </div>
            )}

            {/* No data */}
            {!loading && data && data.totalIncidents === 0 && (
              <div className="bg-white rounded-xl border border-surface-200 p-12 text-center shadow-sm">
                <FileText size={28} className="text-surface-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-surface-700 mb-1">No incidents found</p>
                <p className="text-xs text-surface-400">No incidents match the selected period filter. Try a different period.</p>
              </div>
            )}

            {/* Incident Grid */}
            {!loading && data?.incidents?.length > 0 && (
              <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-surface-700">Incident Details</h3>
                  <span className="text-xs text-surface-400">{data.incidents.length} incident(s)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-50 border-b border-surface-200">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase whitespace-nowrap">Number</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase whitespace-nowrap">Description</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase whitespace-nowrap">Priority</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase whitespace-nowrap">State</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase whitespace-nowrap">Assigned To</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase whitespace-nowrap">
                          {data.incidentConfig?.createdColumn || 'Created'}
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase whitespace-nowrap">
                          {data.incidentConfig?.closedColumn || 'Closed'}
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase whitespace-nowrap">Resolution</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase whitespace-nowrap">Target</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase whitespace-nowrap">SLA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-50">
                      {data.incidents.map((inc, idx) => {
                        const style = PRIORITY_STYLES[inc.priority] || PRIORITY_STYLES['4 - Low'];
                        const stateMap = { '1': 'New', '2': 'In Progress', '3': 'On Hold', '6': 'Resolved', '7': 'Closed', '8': 'Cancelled' };
                        return (
                          <tr key={idx} className="hover:bg-surface-50/50 transition-colors">
                            <td className="px-4 py-2 font-mono text-xs text-brand-600 font-semibold whitespace-nowrap">{inc.number}</td>
                            <td className="px-4 py-2 text-surface-700 max-w-[220px] truncate text-xs">{inc.shortDescription || '—'}</td>
                            <td className="px-4 py-2">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border ${style.badge}`}>
                                {inc.priority}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-surface-600">{stateMap[inc.state] || inc.state}</td>
                            <td className="px-4 py-2 text-xs text-surface-500">{inc.assignedTo || '—'}</td>
                            <td className="px-4 py-2 text-xs text-surface-500 whitespace-nowrap">
                              {inc.createdAt ? new Date(inc.createdAt).toLocaleString() : '—'}
                            </td>
                            <td className="px-4 py-2 text-xs text-surface-500 whitespace-nowrap">
                              {inc.closedAt ? new Date(inc.closedAt).toLocaleString() : '—'}
                            </td>
                            <td className="px-4 py-2 text-right text-xs font-semibold text-surface-700">
                              {formatMinutes(inc.resolutionMinutes)}
                            </td>
                            <td className="px-4 py-2 text-right text-xs text-surface-500">
                              {formatMinutes(inc.targetMinutes)}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {inc.slaMet === true ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 size={10} /> Met
                                </span>
                              ) : inc.slaMet === false ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                                  <XCircle size={10} /> Breached
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-surface-400 bg-surface-50 px-2 py-0.5 rounded-full">
                                  <Clock size={10} /> Pending
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'ritm_sla' && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList size={32} className="text-surface-300 mb-3" />
            <p className="text-sm font-bold text-surface-700 mb-1">RITM SLA Report</p>
            <p className="text-xs text-surface-400">Coming soon — this report will be added in a future release.</p>
          </div>
        )}
      </div>
    </div>
  );
}
