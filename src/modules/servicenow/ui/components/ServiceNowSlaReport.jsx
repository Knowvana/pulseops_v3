// ============================================================================
// ServiceNowSlaReport — PulseOps V3 ServiceNow Module
//
// PURPOSE: Industry-grade Incident SLA Operational Report. Shows:
//   - Comprehensive stats summary (total, by priority, SLA met/breached/pending)
//   - Date range filter: Daily / Weekly / Monthly / Custom date range
//   - Detailed SLA calculation columns per incident:
//     Created, Expected Closure, Actual Closure, Resolution Time,
//     SLA Target, Time Remaining / Overdue, SLA Status
//
// DATA: Fetches live from GET /api/servicenow/reports/sla/incidents
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ShieldCheck, Loader2, AlertCircle, CheckCircle2, XCircle,
  Clock, Calendar, CalendarDays, CalendarRange, RefreshCw,
  FileText, TrendingUp, ArrowUpRight, ArrowDownRight, Filter,
  Download, Search,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';

const log = createLogger('ServiceNowSlaReport');

const snApi = { slaIncidents: '/api/servicenow/reports/sla/incidents' };

// ── Constants ────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { id: 'daily',   label: 'Daily',   icon: Calendar },
  { id: 'weekly',  label: 'Weekly',  icon: CalendarDays },
  { id: 'monthly', label: 'Monthly', icon: CalendarRange },
  { id: 'custom',  label: 'Custom',  icon: Filter },
];

const PRIORITY_CONFIG = {
  '1 - Critical': { badge: 'bg-rose-100 text-rose-700 border-rose-200',   dot: 'bg-rose-500',    short: 'P1' },
  '2 - High':     { badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500',   short: 'P2' },
  '3 - Medium':   { badge: 'bg-blue-100 text-blue-700 border-blue-200',   dot: 'bg-blue-500',    short: 'P3' },
  '4 - Low':      { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', short: 'P4' },
};

const STATE_MAP = { '1': 'New', '2': 'In Progress', '3': 'On Hold', '6': 'Resolved', '7': 'Closed', '8': 'Cancelled' };

// ── Utility functions ────────────────────────────────────────────────────────
function formatMinutes(mins) {
  if (mins == null) return '—';
  const abs = Math.abs(mins);
  if (abs < 60) return `${mins}m`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = mins < 0 ? '-' : '';
  return m > 0 ? `${sign}${h}h ${m}m` : `${sign}${h}h`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function getIsoDate(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

// ── Stats Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, bgColor, subtext, trend }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0`}>
          <Icon size={16} className={color} />
        </div>
        {trend && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${trend > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {trend > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-black text-surface-800 mt-2">{value}</p>
      <p className="text-xs text-surface-500 font-medium mt-0.5">{label}</p>
      {subtext && <p className="text-[10px] text-surface-400 mt-0.5">{subtext}</p>}
    </div>
  );
}

// ── Priority Summary Table ───────────────────────────────────────────────────
function PrioritySummaryTable({ summaryByPriority }) {
  const entries = summaryByPriority ? Object.entries(summaryByPriority) : [];
  if (entries.length === 0) return null;

  // Totals row
  const totals = entries.reduce((acc, [, d]) => ({
    total: acc.total + (d.met || 0) + (d.breached || 0) + (d.pending || 0),
    met: acc.met + (d.met || 0),
    breached: acc.breached + (d.breached || 0),
    pending: acc.pending + (d.pending || 0),
  }), { total: 0, met: 0, breached: 0, pending: 0 });
  const overallCompliance = (totals.total - totals.pending) > 0
    ? Math.round((totals.met / (totals.total - totals.pending)) * 100)
    : null;

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
        <h3 className="text-xs font-bold text-surface-600 uppercase tracking-wide">SLA Summary by Priority</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-50/80 border-b border-surface-200">
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Priority</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Total</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Met</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-rose-600 uppercase tracking-wider">Breached</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Pending</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Target</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Compliance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-50">
            {entries.map(([priority, d]) => {
              const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG['4 - Low'];
              const total = (d.met || 0) + (d.breached || 0) + (d.pending || 0);
              const resolved = total - (d.pending || 0);
              const compliance = resolved > 0 ? Math.round(((d.met || 0) / resolved) * 100) : null;
              const compColor = compliance === null ? 'text-surface-400' : compliance >= 90 ? 'text-emerald-600' : compliance >= 70 ? 'text-amber-600' : 'text-rose-600';
              return (
                <tr key={priority} className="hover:bg-surface-50/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <span className="text-xs font-semibold text-surface-700">{priority}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-surface-700">{total}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-600">{d.met || 0}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-rose-600">{d.breached || 0}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-medium text-surface-400">{d.pending || 0}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-surface-500">
                    {d.targetMinutes ? formatMinutes(d.targetMinutes) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {compliance !== null ? (
                      <span className={`text-xs font-black ${compColor}`}>{compliance}%</span>
                    ) : (
                      <span className="text-xs text-surface-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-surface-50 border-t-2 border-surface-200">
              <td className="px-4 py-2.5 text-xs font-black text-surface-700 uppercase">Total</td>
              <td className="px-4 py-2.5 text-right text-xs font-black text-surface-700">{totals.total}</td>
              <td className="px-4 py-2.5 text-right text-xs font-black text-emerald-600">{totals.met}</td>
              <td className="px-4 py-2.5 text-right text-xs font-black text-rose-600">{totals.breached}</td>
              <td className="px-4 py-2.5 text-right text-xs font-bold text-surface-400">{totals.pending}</td>
              <td className="px-4 py-2.5 text-right text-xs text-surface-500">—</td>
              <td className="px-4 py-2.5 text-right">
                {overallCompliance !== null ? (
                  <span className={`text-xs font-black ${overallCompliance >= 90 ? 'text-emerald-600' : overallCompliance >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {overallCompliance}%
                  </span>
                ) : <span className="text-xs text-surface-400">—</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowSlaReport() {
  const [period, setPeriod]           = useState('monthly');
  const [customFrom, setCustomFrom]   = useState(getIsoDate(30));
  const [customTo, setCustomTo]       = useState(getIsoDate(0));
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const initRan = useRef(false);

  // ── Fetch SLA report data ──────────────────────────────────────────────
  const fetchSlaReport = useCallback(async (p = period, from = customFrom, to = customTo) => {
    setLoading(true);
    setError(null);
    try {
      let url = `${snApi.slaIncidents}?period=${p}`;
      if (p === 'custom' && from && to) {
        url += `&from=${from}&to=${to}`;
      }
      const res = await ApiClient.get(url);
      if (res?.success) {
        setData(res.data);
        log.info('fetchSlaReport', 'SLA report loaded', { period: p, total: res.data.totalIncidents });
      } else {
        setError(res?.error?.message || 'Failed to load SLA report.');
      }
    } catch (err) {
      setError(`Failed to load SLA report: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    fetchSlaReport();
  }, [fetchSlaReport]);

  const handlePeriodChange = (p) => {
    setPeriod(p);
    if (p !== 'custom') fetchSlaReport(p);
  };

  const handleCustomApply = () => {
    fetchSlaReport('custom', customFrom, customTo);
  };

  // ── Computed stats ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!data) return { total: 0, met: 0, breached: 0, pending: 0, compliance: null };
    const entries = data.summaryByPriority ? Object.values(data.summaryByPriority) : [];
    const met = entries.reduce((s, d) => s + (d.met || 0), 0);
    const breached = entries.reduce((s, d) => s + (d.breached || 0), 0);
    const pending = entries.reduce((s, d) => s + (d.pending || 0), 0);
    const total = met + breached + pending;
    const resolved = total - pending;
    const compliance = resolved > 0 ? Math.round((met / resolved) * 100) : null;
    return { total, met, breached, pending, compliance };
  }, [data]);

  // ── Filtered incidents (search) ────────────────────────────────────────
  const filteredIncidents = useMemo(() => {
    if (!data?.incidents) return [];
    if (!searchQuery.trim()) return data.incidents;
    const q = searchQuery.toLowerCase();
    return data.incidents.filter(inc =>
      (inc.number || '').toLowerCase().includes(q) ||
      (inc.shortDescription || '').toLowerCase().includes(q) ||
      (inc.assignedTo || '').toLowerCase().includes(q) ||
      (inc.priority || '').toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
              <ShieldCheck size={18} className="text-brand-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-surface-800">Incident SLA Report</h1>
              <p className="text-xs text-surface-500">
                Resolution SLA compliance &bull; {data?.startDate || '...'} to {data?.endDate || '...'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
            className="p-2 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Custom Date Range Picker ──────────────────────────────────────── */}
      {period === 'custom' && (
        <div className="flex items-end gap-3 bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
          <div>
            <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-surface-200 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">To</label>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-surface-200 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
            />
          </div>
          <button
            onClick={handleCustomApply}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <AlertCircle size={14} /><span>{error}</span>
          <button onClick={() => fetchSlaReport()} className="ml-auto text-xs underline font-semibold">Retry</button>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={28} className="text-brand-400 animate-spin mb-3" />
          <p className="text-sm text-surface-500">Loading SLA data from ServiceNow...</p>
        </div>
      )}

      {!loading && data && (
        <>
          {/* ── Stats Cards ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard
              label="Total Incidents"
              value={stats.total}
              icon={FileText}
              color="text-brand-600"
              bgColor="bg-brand-50"
              subtext={`${data?.startDate || ''} — ${data?.endDate || ''}`}
            />
            <StatCard
              label="SLA Met"
              value={stats.met}
              icon={CheckCircle2}
              color="text-emerald-600"
              bgColor="bg-emerald-50"
              subtext="Within target"
            />
            <StatCard
              label="SLA Breached"
              value={stats.breached}
              icon={XCircle}
              color="text-rose-600"
              bgColor="bg-rose-50"
              subtext="Exceeded target"
            />
            <StatCard
              label="Pending"
              value={stats.pending}
              icon={Clock}
              color="text-surface-500"
              bgColor="bg-surface-100"
              subtext="Awaiting resolution"
            />
            <StatCard
              label="Overall Compliance"
              value={stats.compliance !== null ? `${stats.compliance}%` : '—'}
              icon={TrendingUp}
              color={stats.compliance >= 90 ? 'text-emerald-600' : stats.compliance >= 70 ? 'text-amber-600' : 'text-rose-600'}
              bgColor={stats.compliance >= 90 ? 'bg-emerald-50' : stats.compliance >= 70 ? 'bg-amber-50' : 'bg-rose-50'}
              subtext="Met / (Met + Breached)"
            />
          </div>

          {/* ── Priority Summary Table ──────────────────────────────────────── */}
          <PrioritySummaryTable summaryByPriority={data.summaryByPriority} />

          {/* ── No data ────────────────────────────────────────────────────── */}
          {data.totalIncidents === 0 && (
            <div className="bg-white rounded-xl border border-surface-200 p-12 text-center shadow-sm">
              <FileText size={28} className="text-surface-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-surface-700 mb-1">No incidents found</p>
              <p className="text-xs text-surface-400">No incidents match the selected period. Try a different date range.</p>
            </div>
          )}

          {/* ── Incident Detail Grid ───────────────────────────────────────── */}
          {data.incidents?.length > 0 && (
            <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
              {/* Grid header with search */}
              <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-surface-600 uppercase tracking-wide">Incident Details</h3>
                  <span className="text-[10px] bg-surface-200 text-surface-500 px-1.5 py-0.5 rounded-full font-bold">
                    {filteredIncidents.length} of {data.incidents.length}
                  </span>
                </div>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search incidents..."
                    className="pl-7 pr-3 py-1.5 rounded-lg border border-surface-200 text-xs text-surface-700 w-56
                      focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 placeholder:text-surface-400"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-50 border-b border-surface-200">
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">Number</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">Description</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">Priority</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">State</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">Assigned To</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">Created</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-brand-600 uppercase tracking-wider whitespace-nowrap bg-brand-50/50">Expected Closure</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">Actual Closure</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">Resolution</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">SLA Target</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">Variance</th>
                      <th className="text-center px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">SLA Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {filteredIncidents.map((inc, idx) => {
                      const cfg = PRIORITY_CONFIG[inc.priority] || PRIORITY_CONFIG['4 - Low'];
                      const variance = (inc.targetMinutes != null && inc.resolutionMinutes != null)
                        ? inc.targetMinutes - inc.resolutionMinutes
                        : null;
                      // Expected closure = created + target (business hours)
                      const expectedClosure = (inc.createdAt && inc.targetMinutes)
                        ? new Date(new Date(inc.createdAt).getTime() + inc.targetMinutes * 60000)
                        : null;

                      return (
                        <tr key={idx} className="hover:bg-surface-50/50 transition-colors group">
                          <td className="px-3 py-2 font-mono text-xs text-brand-600 font-semibold whitespace-nowrap">{inc.number}</td>
                          <td className="px-3 py-2 text-surface-700 max-w-[200px] truncate text-xs" title={inc.shortDescription}>
                            {inc.shortDescription || '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${cfg.badge}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.short}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-surface-600">{STATE_MAP[inc.state] || inc.state}</td>
                          <td className="px-3 py-2 text-xs text-surface-500 max-w-[120px] truncate">{inc.assignedTo || '—'}</td>
                          <td className="px-3 py-2 text-xs text-surface-500 whitespace-nowrap">{formatDate(inc.createdAt)}</td>
                          <td className="px-3 py-2 text-xs font-semibold text-brand-700 whitespace-nowrap bg-brand-50/30">
                            {expectedClosure ? formatDate(expectedClosure.toISOString()) : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-surface-500 whitespace-nowrap">{formatDate(inc.closedAt)}</td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-surface-700">{formatMinutes(inc.resolutionMinutes)}</td>
                          <td className="px-3 py-2 text-right text-xs text-surface-500">{formatMinutes(inc.targetMinutes)}</td>
                          <td className="px-3 py-2 text-right text-xs font-semibold whitespace-nowrap">
                            {variance !== null ? (
                              <span className={variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                {variance >= 0 ? '+' : ''}{formatMinutes(variance)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {inc.slaMet === true ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle2 size={10} /> Met
                              </span>
                            ) : inc.slaMet === false ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                <XCircle size={10} /> Breached
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-surface-400 bg-surface-50 px-2 py-0.5 rounded-full border border-surface-200">
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

              {/* Grid footer */}
              {filteredIncidents.length === 0 && searchQuery && (
                <div className="p-8 text-center text-sm text-surface-400">
                  No incidents match "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
