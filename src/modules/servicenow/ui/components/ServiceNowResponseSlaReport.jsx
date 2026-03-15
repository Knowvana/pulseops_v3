// ============================================================================
// ServiceNowResponseSlaReport — PulseOps V3 ServiceNow Module
//
// PURPOSE: Incident Response SLA Operational Report. Shows:
//   - Comprehensive stats summary (total, by priority, SLA met/breached/pending)
//   - Date range filter: Daily / Weekly / Monthly / Custom date range
//   - Detailed SLA calculation columns per incident:
//     Created, Expected Response, Actual Response, Response Time,
//     SLA Target, Variance, SLA Status
//
// DATA: Fetches live from GET /api/servicenow/reports/sla/incidents/response
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ShieldCheck, Loader2, AlertCircle, CheckCircle2, XCircle,
  Clock, Calendar, CalendarDays, CalendarRange, RefreshCw,
  FileText, TrendingUp, ArrowUpRight, ArrowDownRight, Filter,
  Download, Search, ArrowRight, Settings, Globe,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';

const log = createLogger('ServiceNowResponseSlaReport');

const snApi = { slaIncidents: '/api/servicenow/reports/sla/incidents/response' };

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
  '5 - Planning': { badge: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500', short: 'P5' },
  '1': { badge: 'bg-rose-100 text-rose-700 border-rose-200',   dot: 'bg-rose-500',    short: 'P1' },
  '2': { badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500',   short: 'P2' },
  '3': { badge: 'bg-blue-100 text-blue-700 border-blue-200',   dot: 'bg-blue-500',    short: 'P3' },
  '4': { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', short: 'P4' },
  '5': { badge: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500', short: 'P5' },
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
  // API returns timezone-converted dates as 'YYYY-MM-DDTHH:MM:SS' (no Z suffix).
  // Parse components directly to avoid browser re-conversion.
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const [, y, m, d, hh, mm] = match;
    const hour = parseInt(hh, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}, ${String(h12).padStart(2, '0')}:${mm} ${ampm}`;
  }
  // Fallback for other formats
  const dt = new Date(dateStr);
  if (isNaN(dt.getTime())) return dateStr;
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function getIsoDate(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

// ── Stats Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, bgColor, subtext }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0`}>
          <Icon size={16} className={color} />
        </div>
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
        <h3 className="text-xs font-bold text-surface-600 uppercase tracking-wide">Response SLA Summary by Priority</h3>
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
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-surface-400">{d.pending || 0}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold text-surface-500">{formatMinutes(d.targetMinutes)}</td>
                  <td className={`px-4 py-2.5 text-right text-xs font-bold ${compColor}`}>{compliance !== null ? `${compliance}%` : '—'}</td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr className="bg-surface-50 font-bold">
              <td className="px-4 py-2.5 text-xs text-surface-700 uppercase">Total</td>
              <td className="px-4 py-2.5 text-right text-xs text-surface-800">{totals.total}</td>
              <td className="px-4 py-2.5 text-right text-xs text-emerald-700">{totals.met}</td>
              <td className="px-4 py-2.5 text-right text-xs text-rose-700">{totals.breached}</td>
              <td className="px-4 py-2.5 text-right text-xs text-surface-500">{totals.pending}</td>
              <td className="px-4 py-2.5 text-right text-xs text-surface-500">—</td>
              <td className={`px-4 py-2.5 text-right text-xs ${overallCompliance !== null ? (overallCompliance >= 90 ? 'text-emerald-700' : overallCompliance >= 70 ? 'text-amber-700' : 'text-rose-700') : 'text-surface-500'}`}>
                {overallCompliance !== null ? `${overallCompliance}%` : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowResponseSlaReport({ onNavigate }) {
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [period, setPeriod]         = useState('monthly');
  const [customFrom, setCustomFrom] = useState(getIsoDate(30));
  const [customTo, setCustomTo]     = useState(getIsoDate(0));
  const [searchQuery, setSearchQuery] = useState('');
  const initRan = useRef(false);

  // ── Fetch report data ───────────────────────────────────────────────────
  const fetchSlaReport = useCallback(async (p = period, from, to) => {
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    try {
      let url = `${snApi.slaIncidents}?period=${p}`;
      if (p === 'custom' && from && to) url += `&from=${from}&to=${to}`;
      const res = await ApiClient.get(url);
      if (res?.success) {
        setData(res.data);
        log.info('fetchSlaReport', 'Response SLA report loaded', { total: res.data.totalIncidents, period: p });
      } else {
        const msg = res?.error?.message || '';
        if (msg.toLowerCase().includes('column is not configured') || msg.toLowerCase().includes('sla column mapping')) {
          setNotConfigured(true);
        } else {
          setError(msg || 'Failed to load Response SLA report.');
        }
      }
    } catch (err) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('column is not configured') || msg.toLowerCase().includes('sla column mapping')) {
        setNotConfigured(true);
      } else {
        setError(msg || 'Failed to load Response SLA report.');
        log.error('fetchSlaReport', 'Fetch failed', { error: err.message });
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    fetchSlaReport();
  }, [fetchSlaReport]);

  const handlePeriodChange = useCallback((newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') fetchSlaReport(newPeriod);
  }, [fetchSlaReport]);

  const handleCustomApply = useCallback(() => {
    fetchSlaReport('custom', customFrom, customTo);
  }, [fetchSlaReport, customFrom, customTo]);

  // ── Stats summary ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!data) return { total: 0, met: 0, breached: 0, pending: 0, compliance: null };
    const s = data.summaryByPriority || {};
    let total = 0, met = 0, breached = 0, pending = 0;
    Object.values(s).forEach(d => {
      met += d.met || 0; breached += d.breached || 0; pending += d.pending || 0;
      total += (d.met || 0) + (d.breached || 0) + (d.pending || 0);
    });
    const resolved = total - pending;
    const compliance = resolved > 0 ? Math.round((met / resolved) * 100) : null;
    return { total, met, breached, pending, compliance };
  }, [data]);

  // ── Download PDF ──────────────────────────────────────────────────────
  const handleDownloadPdf = useCallback(() => {
    if (!data) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const rows = (data.incidents || []).map(inc => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px">${inc.number}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${inc.shortDescription || ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px">${inc.priority}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px">${inc.createdAt ? new Date(inc.createdAt).toLocaleString() : '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px">${inc.expectedResponse ? new Date(inc.expectedResponse).toLocaleString() : '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px">${inc.respondedAt ? new Date(inc.respondedAt).toLocaleString() : '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:right">${inc.responseMinutes != null ? formatMinutes(inc.responseMinutes) : '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:right">${formatMinutes(inc.targetMinutes)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;font-weight:bold;color:${inc.slaMet === true ? '#059669' : inc.slaMet === false ? '#dc2626' : '#6b7280'}">${inc.slaMet === true ? 'Met' : inc.slaMet === false ? 'Breached' : 'Pending'}</td>
      </tr>
    `).join('');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Incident Response SLA Report</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#1e293b">
      <h1 style="font-size:18px;margin:0">Incident Response SLA Report</h1>
      <p style="font-size:12px;color:#64748b;margin:4px 0 16px">Generated: ${new Date().toLocaleString()} | Period: ${data.startDate} to ${data.endDate} (${period})</p>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Number</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Description</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Priority</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Created</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Expected Response</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Actual Response</th>
          <th style="padding:8px;text-align:right;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Response Time</th>
          <th style="padding:8px;text-align:right;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Target</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">SLA Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  }, [data, period]);

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
    <div className="p-6 space-y-5 animate-fade-in relative">
      {/* ── Configuration Alert Modal (centered view-modal) ───────────────── */}
      {notConfigured && !loading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-surface-50/90 backdrop-blur-sm rounded-xl min-h-[60vh]">
          <div className="bg-white border border-amber-200 rounded-2xl shadow-xl p-8 max-w-md mx-4 text-center space-y-4 animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto">
              <Settings size={28} className="text-amber-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-surface-800 mb-1">Response SLA Column Not Configured</h3>
              <p className="text-sm text-surface-500">
                The Response SLA column mapping has not been set up yet. Please configure the Response Column in the SLA Column Mapping settings to enable this report.
              </p>
            </div>
            <button
              onClick={() => onNavigate?.('config?tab=slaColumnMapping')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Clock size={15} />
              Go to SLA Column Mapping
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Report Header ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center">
                <Clock size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-surface-800">Incident Response SLA Report</h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-[11px] text-surface-500">
                    <span className="font-semibold text-surface-600">Generated:</span> {data?.generatedAt ? formatDate(data.generatedAt) : new Date().toLocaleString()}
                  </span>
                  <span className="w-px h-3 bg-surface-200" />
                  <span className="text-[11px] text-surface-500">
                    <span className="font-semibold text-surface-600">Period:</span> {data?.startDate || '...'} to {data?.endDate || '...'} ({period.charAt(0).toUpperCase() + period.slice(1)})
                  </span>
                  {data?.timezone && (
                    <>
                      <span className="w-px h-3 bg-surface-200" />
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100">
                        <Globe size={10} /> {data.timezone}
                      </span>
                    </>
                  )}
                </div>
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={!data || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 text-surface-600 text-xs font-semibold hover:bg-surface-50 transition-colors disabled:opacity-50"
            >
              <Download size={12} />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Custom Date Range ──────────────────────────────────────────────── */}
      {period === 'custom' && (
        <div className="flex items-end gap-3 bg-white rounded-xl border border-surface-200 shadow-sm px-5 py-4">
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
          <p className="text-sm text-surface-500">Loading Response SLA data from ServiceNow...</p>
        </div>
      )}

      {!loading && data && (
        <>
          {/* ── First Row: Reference Information and Stats ──────────────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* First Column: Reference Information */}
            <div className="bg-white rounded-xl border-2 border-surface-300 shadow-sm p-5">
              <h2 className="text-sm font-bold text-surface-800 mb-4 flex items-center gap-2">
                <Clock size={16} className="text-teal-500" />
                Report Configuration Reference
              </h2>
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Business Hours */}
                <div className="border border-surface-200 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-surface-700 uppercase tracking-wider mb-3">Business Days</h3>
                  <div className="space-y-1.5">
                    {data.businessHours && data.businessHours.length > 0 ? (
                      data.businessHours
                        .filter(day => day.isBusinessDay)
                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                        .map(day => {
                          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                          return (
                            <div key={day.dayOfWeek} className="flex items-center justify-between text-xs py-1 border-b border-surface-100">
                              <span className="text-surface-600 font-medium">{dayNames[day.dayOfWeek]}</span>
                              <span className="text-surface-500">{day.startTime} - {day.endTime}</span>
                            </div>
                          );
                        })
                    ) : (
                      <p className="text-xs text-surface-400 italic">No business hours configured (24/7)</p>
                    )}
                  </div>
                </div>
                
                {/* SLA Thresholds — Response */}
                <div className="border border-surface-200 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-surface-700 uppercase tracking-wider mb-3">SLA Targets (Response)</h3>
                  <div className="space-y-1.5">
                    {data.slaThresholds && data.slaThresholds.length > 0 ? (
                      data.slaThresholds
                        .sort((a, b) => (a.priorityValue || a.priority) - (b.priorityValue || b.priority))
                        .map(sla => (
                          <div key={sla.priority} className="flex items-center justify-between text-xs py-1 border-b border-surface-100">
                            <span className="text-surface-600 font-medium">
                              {sla.priority}
                              {sla.priorityValue && sla.priorityValue !== sla.priority && ` (${sla.priorityValue})`}
                            </span>
                            <span className="text-surface-500">{formatMinutes(sla.responseMinutes)}</span>
                          </div>
                        ))
                    ) : (
                      <p className="text-xs text-surface-400 italic">No SLA thresholds configured</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Second Column: Stats Cards */}
            <div className="grid grid-cols-3 gap-2">
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
                subtext="Awaiting response"
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
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-teal-600 uppercase tracking-wider whitespace-nowrap bg-teal-50/50">Expected Response</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">Actual Response</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">Response Time</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">SLA Target</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">Variance</th>
                      <th className="text-center px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">SLA Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {filteredIncidents.map((inc, idx) => {
                      const cfg = PRIORITY_CONFIG[inc.priority] || PRIORITY_CONFIG['4 - Low'];
                      const variance = (inc.targetMinutes != null && inc.responseMinutes != null)
                        ? inc.targetMinutes - inc.responseMinutes
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
                          <td className="px-3 py-2 text-xs font-semibold text-teal-700 whitespace-nowrap bg-teal-50/30">
                            {inc.expectedResponse ? formatDate(inc.expectedResponse) : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-surface-500 whitespace-nowrap">{formatDate(inc.respondedAt)}</td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-surface-700">{formatMinutes(inc.responseMinutes)}</td>
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
