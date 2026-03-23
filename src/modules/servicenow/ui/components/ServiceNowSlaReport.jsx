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
  Download, Globe,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';

import DataTable from './DataTable';

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
      <div className="px-4 py-2 border-b border-surface-100 bg-surface-50/50">
        <h3 className="text-[10px] font-bold text-surface-600 uppercase tracking-wide">SLA Summary by Priority</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-surface-50/80 border-b border-surface-200">
              <th className="text-left px-2 py-1.5 text-[9px] font-bold text-surface-500 uppercase tracking-wider">Priority</th>
              <th className="text-right px-2 py-1.5 text-[9px] font-bold text-surface-500 uppercase tracking-wider">Total</th>
              <th className="text-right px-2 py-1.5 text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Met</th>
              <th className="text-right px-2 py-1.5 text-[9px] font-bold text-rose-600 uppercase tracking-wider">Breached</th>
              <th className="text-right px-2 py-1.5 text-[9px] font-bold text-surface-400 uppercase tracking-wider">Pending</th>
              <th className="text-right px-2 py-1.5 text-[9px] font-bold text-surface-500 uppercase tracking-wider">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-50">
            {entries.map(([priority, d]) => {
              const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG['4 - Low'];
              const total = (d.met || 0) + (d.breached || 0) + (d.pending || 0);
              const resolved = total - (d.pending || 0);
              const compliance = resolved > 0 ? Math.round(((d.met || 0) / resolved) * 100) : null;
              return (
                <tr key={priority} className="hover:bg-surface-50/50 transition-colors">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      <span className="text-[10px] font-semibold text-surface-700">{priority}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right text-[10px] font-bold text-surface-700">{total}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] font-bold text-emerald-600">{d.met || 0}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] font-bold text-rose-600">{d.breached || 0}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] font-medium text-surface-400">{d.pending || 0}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] text-surface-500">
                    {d.targetMinutes ? formatMinutes(d.targetMinutes) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-surface-50 border-t-2 border-surface-200">
              <td className="px-2 py-1.5 text-[10px] font-black text-surface-700 uppercase">Total</td>
              <td className="px-2 py-1.5 text-right text-[10px] font-black text-surface-700">{totals.total}</td>
              <td className="px-2 py-1.5 text-right text-[10px] font-black text-emerald-600">{totals.met}</td>
              <td className="px-2 py-1.5 text-right text-[10px] font-black text-rose-600">{totals.breached}</td>
              <td className="px-2 py-1.5 text-right text-[10px] font-bold text-surface-400">{totals.pending}</td>
              <td className="px-2 py-1.5 text-right text-[10px] text-surface-500">—</td>
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('monthly');
  const [customFrom, setCustomFrom] = useState(getIsoDate(30));
  const [customTo, setCustomTo] = useState(getIsoDate(0));
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

  // ── Download PDF ──────────────────────────────────────────────────────
  const handleDownloadPdf = useCallback(() => {
    if (!data) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Build Configuration section
    const businessDaysHtml = (data.businessHours || [])
      .filter(day => day.isBusinessDay)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map(day => {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return `<tr><td style="padding:4px 8px;font-size:10px">${dayNames[day.dayOfWeek]}</td><td style="padding:4px 8px;font-size:10px">${day.startTime} - ${day.endTime}</td></tr>`;
      }).join('');

    const slaTargetsHtml = (data.slaThresholds || [])
      .sort((a, b) => (a.priorityValue || a.priority) - (b.priorityValue || b.priority))
      .map(sla => `<tr><td style="padding:4px 8px;font-size:10px">${sla.priority}</td><td style="padding:4px 8px;font-size:10px">${formatMinutes(sla.resolutionMinutes)}</td></tr>`)
      .join('');

    // Build Breached Incidents section
    const breachedIncidents = (data.incidents || []).filter(inc => inc.slaStatus === 'breached');
    const breachedHtml = breachedIncidents.map(inc => `
      <tr>
        <td style="padding:4px 8px;font-size:10px;font-weight:bold;color:#dc2626">${inc.number}</td>
        <td style="padding:4px 8px;font-size:10px">${inc.createdAt ? formatDate(inc.createdAt) : '—'}</td>
        <td style="padding:4px 8px;font-size:10px">${inc.closedAt ? formatDate(inc.closedAt) : '—'}</td>
        <td style="padding:4px 8px;font-size:10px">${STATE_MAP[inc.state] || inc.state}</td>
        <td style="padding:4px 8px;font-size:10px;font-weight:bold;color:#dc2626;text-align:right">${inc.slaVariance !== null && inc.slaVariance !== undefined ? (inc.slaVariance >= 0 ? '+' : '') + formatMinutes(inc.slaVariance) : '—'}</td>
      </tr>
    `).join('');

    // Build Priority Summary section
    const prioritySummaryHtml = Object.entries(data.summaryByPriority || {})
      .sort((a, b) => (a[1].priorityValue || 0) - (b[1].priorityValue || 0))
      .map(([priority, d]) => `
        <tr>
          <td style="padding:4px 8px;font-size:10px">${priority}</td>
          <td style="padding:4px 8px;font-size:10px;text-align:right">${(d.met || 0) + (d.breached || 0) + (d.pending || 0)}</td>
          <td style="padding:4px 8px;font-size:10px;text-align:right;color:#059669">${d.met || 0}</td>
          <td style="padding:4px 8px;font-size:10px;text-align:right;color:#dc2626">${d.breached || 0}</td>
          <td style="padding:4px 8px;font-size:10px;text-align:right">${d.pending || 0}</td>
          <td style="padding:4px 8px;font-size:10px;text-align:right">${d.targetMinutes ? formatMinutes(d.targetMinutes) : '—'}</td>
        </tr>
      `).join('');

    // Build Incident Details Grid
    const incidentRows = (data.incidents || []).map(inc => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:10px">${inc.number}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:10px;max-width:150px;overflow:hidden;text-overflow:ellipsis">${inc.shortDescription || ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:10px">${inc.priority || ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:10px">${STATE_MAP[inc.state] || inc.state}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:10px">${inc.createdAt ? formatDate(inc.createdAt) : ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:10px">${inc.expectedClosure ? formatDate(inc.expectedClosure) : '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:10px">${inc.closedAt ? formatDate(inc.closedAt) : '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:10px;font-weight:bold">${inc.resolutionMinutes ? formatMinutes(inc.resolutionMinutes) : '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:10px;font-weight:bold">${inc.targetMinutes ? formatMinutes(inc.targetMinutes) : '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:10px;font-weight:bold;color:${inc.slaVariance && inc.slaVariance < 0 ? '#dc2626' : '#059669'}">${inc.slaVariance !== null && inc.slaVariance !== undefined ? (inc.slaVariance >= 0 ? '+' : '') + formatMinutes(inc.slaVariance) : '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:10px;font-weight:bold;color:${inc.slaStatus === 'met' ? '#059669' : inc.slaStatus === 'breached' ? '#dc2626' : '#f59e0b'}">${inc.slaStatus === 'met' ? 'Met' : inc.slaStatus === 'breached' ? 'Breached' : 'Pending'}</td>
      </tr>
    `).join('');

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Incident Resolution SLA Report</title><style>body{font-family:system-ui,sans-serif;padding:16px;color:#1e293b;line-height:1.4}h1{font-size:18px;margin:0 0 2px;font-weight:bold}p{font-size:10px;color:#64748b;margin:0 0 12px}.box{border:1px solid #e2e8f0;padding:10px;border-radius:3px;background:#fafbfc}.box-title{font-size:11px;font-weight:bold;color:#1e293b;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:3px}.row-5col{display:grid;grid-template-columns:1fr 1fr 1fr 2fr 2fr;gap:8px;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:9px}th{background-color:#f1f5f9;padding:4px 6px;text-align:left;font-weight:bold;border-bottom:1px solid #cbd5e1;font-size:9px}td{padding:4px 6px;border-bottom:1px solid #f0f0f0}.section-title{font-size:11px;font-weight:bold;color:#1e293b;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:3px}</style></head><body>
      <h1>Incident Resolution SLA Report</h1>
      <p><strong>Generated:</strong> ${new Date().toLocaleString()} | <strong>Period:</strong> ${data.startDate} to ${data.endDate} | <strong>Timezone:</strong> ${data.timezone || 'N/A'}</p>

      <div class="row-5col">
        <div class="box">
          <div class="box-title">Configuration - Business Days</div>
          <table><tbody>${businessDaysHtml}</tbody></table>
        </div>
        <div class="box">
          <div class="box-title">Configuration - SLA Targets</div>
          <table><tbody>${slaTargetsHtml}</tbody></table>
        </div>
        <div class="box">
          <div class="box-title">SLA Summary</div>
          <table><tbody>
            <tr><td>Total Incidents</td><td style="text-align:right;font-weight:bold">${stats.total}</td></tr>
            <tr><td>SLA Met</td><td style="text-align:right;font-weight:bold;color:#059669">${stats.met}</td></tr>
            <tr><td>SLA Breached</td><td style="text-align:right;font-weight:bold;color:#dc2626">${stats.breached}</td></tr>
            <tr><td>Pending</td><td style="text-align:right;font-weight:bold">${stats.pending}</td></tr>
            <tr style="background-color:#f1f5f9"><td><strong>Overall Compliance</strong></td><td style="text-align:right;font-weight:bold;color:${stats.compliance >= 90 ? '#059669' : stats.compliance >= 70 ? '#f59e0b' : '#dc2626'}">${stats.compliance !== null ? stats.compliance + '%' : '—'}</td></tr>
          </tbody></table>
        </div>
        <div class="box">
          <div class="box-title">Incidents - SLA Breached</div>
          ${breachedIncidents.length > 0 ? `
            <table style="white-space:nowrap">
              <thead><tr><th>INC Number</th><th>Created</th><th>Closed</th><th>Status</th><th style="text-align:right">SLA Variance</th></tr></thead>
              <tbody>${breachedHtml}</tbody>
            </table>
          ` : '<p style="color:#64748b;font-style:italic;font-size:9px">No breached incidents</p>'}
        </div>
        <div class="box">
          <div class="box-title">SLA Summary by Priority</div>
          <table>
            <thead><tr><th>Priority</th><th style="text-align:right">Total</th><th style="text-align:right;color:#059669">Met</th><th style="text-align:right;color:#dc2626">Breached</th><th style="text-align:right">Pending</th><th style="text-align:right">Target</th></tr></thead>
            <tbody>${prioritySummaryHtml}</tbody>
          </table>
        </div>
      </div>

      <div style="margin-top:12px">
        <div class="section-title">Resolution SLA Details - All Incidents</div>
        <table>
          <thead>
            <tr><th>Number</th><th>Description</th><th>Priority</th><th>State</th><th>Created</th><th>Expected</th><th>Closed</th><th>Resolution</th><th>Target</th><th>Variance</th><th>Status</th></tr>
          </thead>
          <tbody>${incidentRows}</tbody>
        </table>
      </div>
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  }, [data, period, stats]);

  // ── SLA Detail grid columns (with custom renderers) ──────────────────
  const slaColumns = useMemo(() => [
    { key: 'number', label: 'Number', sortable: true, width: '80px',
      render: (v) => <span className="font-mono text-xs text-brand-600 font-semibold truncate">{v}</span> },
    { key: 'shortDescription', label: 'Description', sortable: true, width: '140px',
      render: (v) => <span className="block truncate text-xs text-surface-600" title={v}>{v || '—'}</span> },
    { key: 'priority', label: 'Priority', sortable: true, width: '60px',
      render: (v) => {
        const cfg = PRIORITY_CONFIG[v] || PRIORITY_CONFIG['4 - Low'];
        return <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold border ${cfg.badge}`}>
          <span className={`w-1 h-1 rounded-full ${cfg.dot}`} /><span className="truncate">{cfg.short}</span>
        </span>;
      } },
    { key: 'state', label: 'State', sortable: true, width: '80px',
      render: (v) => <span className="text-xs text-surface-600 truncate">{STATE_MAP[v] || v}</span> },
    { key: 'assignedTo', label: 'Assigned To', sortable: true, width: '90px',
      render: (v) => <span className="text-xs text-surface-500 truncate block" title={v}>{v || '—'}</span> },
    { key: 'createdAt', label: 'Created', sortable: true, width: '110px',
      render: (v) => <span className="text-xs text-surface-500 whitespace-nowrap">{formatDate(v)}</span> },
    { key: 'expectedClosure', label: 'Expected', sortable: true, width: '110px',
      render: (v) => <span className="text-xs font-semibold text-brand-700 whitespace-nowrap">{v ? formatDate(v) : '—'}</span> },
    { key: 'closedAt', label: 'Actual', sortable: true, width: '110px',
      render: (v) => <span className="text-xs text-surface-500 whitespace-nowrap">{formatDate(v)}</span> },
    { key: 'resolutionMinutes', label: 'Resolution', sortable: true, align: 'right', width: '80px',
      render: (v) => <span className="text-xs font-semibold text-surface-700">{formatMinutes(v)}</span> },
    { key: 'targetMinutes', label: 'Target', sortable: true, align: 'right', width: '70px',
      render: (v) => <span className="text-xs text-surface-500">{formatMinutes(v)}</span> },
    { key: 'slaVariance', label: 'Variance', sortable: true, align: 'right', width: '75px',
      render: (variance) => {
        return variance !== null && variance !== undefined
          ? <span className={`text-xs font-semibold ${variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {variance >= 0 ? '+' : ''}{formatMinutes(variance)}
            </span>
          : <span className="text-xs text-surface-400">—</span>;
      } },
    { key: 'slaStatus', label: 'Status', sortable: true, align: 'center', width: '85px',
      render: (status) => {
        if (status === 'met') {
          return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 whitespace-nowrap"><CheckCircle2 size={9} /> Met</span>;
        }
        if (status === 'breached') {
          return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 whitespace-nowrap"><XCircle size={9} /> Breached</span>;
        }
        return <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 whitespace-nowrap"><Clock size={9} /> Pending</span>;
      }
    },
  ], []);


  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="px-1 py-6 space-y-5 animate-fade-in">
      {/* ── Report Header ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
                <ShieldCheck size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-surface-800">Incident Resolution SLA Report</h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-[11px] text-surface-500">
                    <span className="font-semibold text-surface-600">Generated:</span> {data?.generatedAt ? formatDate(data.generatedAt) : new Date().toLocaleString()}
                    {data?.timezone && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100">
                        <Globe size={10} /> {data.timezone}
                      </span>
                    )}
                  </span>
                  <span className="w-px h-3 bg-surface-200" />
                  <span className="text-[11px] text-surface-500">
                    <span className="font-semibold text-surface-600">Period:</span> <span className="font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-amber-900">{data?.startDate || '...'} to {data?.endDate || '...'}</span> <span className="text-surface-400">({period.charAt(0).toUpperCase() + period.slice(1)})</span>
                  </span>
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
              className="p-2 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={loading || !data}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-brand-300 text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Download Report as PDF"
            >
              <Download size={13} />
              Download PDF
            </button>
          </div>
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
          {/* ── First Row: Config Reference (Compact) + Stats Grid + Priority Summary ──────────────────────────────── */}
          <div className="grid lg:grid-cols-6 gap-3">
            {/* First Column: Compact Reference Information */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-4">
              <h2 className="text-xs font-bold text-surface-800 mb-3 flex items-center gap-2">
                <Clock size={14} className="text-brand-500" />
                Configuration
              </h2>
              
              {/* Business Hours - Compact */}
              <div className="mb-3 pb-3 border-b border-surface-100">
                <h3 className="text-[10px] font-semibold text-surface-700 uppercase tracking-wider mb-2">Business Days</h3>
                <div className="space-y-0.5">
                  {data.businessHours && data.businessHours.length > 0 ? (
                    data.businessHours
                      .filter(day => day.isBusinessDay)
                      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                      .map(day => {
                        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        return (
                          <div key={day.dayOfWeek} className="flex items-center justify-between text-[10px] py-0.5">
                            <span className="text-surface-600 font-medium">{dayNames[day.dayOfWeek]}</span>
                            <span className="text-surface-500">{day.startTime.slice(0, 5)} - {day.endTime.slice(0, 5)}</span>
                          </div>
                        );
                      })
                  ) : (
                    <p className="text-[10px] text-surface-400 italic">24/7</p>
                  )}
                </div>
              </div>
              
              {/* SLA Thresholds - Compact */}
              <div>
                <h3 className="text-[10px] font-semibold text-surface-700 uppercase tracking-wider mb-2">SLA Targets</h3>
                <div className="space-y-0.5">
                  {data.slaThresholds && data.slaThresholds.length > 0 ? (
                    data.slaThresholds
                      .sort((a, b) => (a.priorityValue || a.priority) - (b.priorityValue || b.priority))
                      .map(sla => (
                        <div key={sla.priority} className="flex items-center justify-between text-[10px] py-0.5">
                          <span className="text-surface-600 font-medium">{sla.priority}</span>
                          <span className="text-surface-500">{formatMinutes(sla.resolutionMinutes)}</span>
                        </div>
                      ))
                  ) : (
                    <p className="text-[10px] text-surface-400 italic">Not configured</p>
                  )}
                </div>
              </div>
            </div>

            {/* Second Column: Stats as Table */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-4">
              <h2 className="text-xs font-bold text-surface-800 mb-3">SLA Summary</h2>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="text-left font-semibold text-surface-700 py-2 px-2">Metric</th>
                    <th className="text-right font-semibold text-surface-700 py-2 px-2">Count</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="py-2 px-2 text-surface-600 font-medium">Total Incidents</td>
                    <td className="text-right py-2 px-2 font-bold text-brand-600">{stats.total}</td>
                  </tr>
                  <tr className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="py-2 px-2 text-surface-600 font-medium">SLA Met</td>
                    <td className="text-right py-2 px-2 font-bold text-emerald-600">{stats.met}</td>
                  </tr>
                  <tr className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="py-2 px-2 text-surface-600 font-medium">SLA Breached</td>
                    <td className="text-right py-2 px-2 font-bold text-rose-600">{stats.breached}</td>
                  </tr>
                  <tr className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="py-2 px-2 text-surface-600 font-medium">Pending</td>
                    <td className="text-right py-2 px-2 font-bold text-surface-500">{stats.pending}</td>
                  </tr>
                  <tr className="bg-surface-50 hover:bg-surface-100">
                    <td className="py-2 px-2 text-surface-700 font-semibold">Overall Compliance</td>
                    <td className="text-right py-2 px-2 font-bold text-lg" style={{color: stats.compliance >= 90 ? '#059669' : stats.compliance >= 70 ? '#d97706' : '#dc2626'}}>
                      {stats.compliance !== null ? `${stats.compliance}%` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Third Column: Breached Incidents Table */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-surface-200 shadow-sm p-4">
              <h2 className="text-xs font-bold text-surface-800 mb-3 flex items-center gap-2">
                <XCircle size={14} className="text-rose-600" />
                Incidents - SLA Breached
              </h2>
              {data?.incidents && data.incidents.filter(inc => inc.slaStatus === 'breached').length > 0 ? (
                <div className="overflow-y-auto max-h-[280px]">
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0 bg-surface-50/50 border-b border-surface-200">
                      <tr>
                        <th className="text-left font-semibold text-surface-700 py-2 px-2 whitespace-nowrap">INC Number</th>
                        <th className="text-left font-semibold text-surface-700 py-2 px-2 whitespace-nowrap">Created</th>
                        <th className="text-left font-semibold text-surface-700 py-2 px-2 whitespace-nowrap">Closed</th>
                        <th className="text-left font-semibold text-surface-700 py-2 px-2 whitespace-nowrap">Status</th>
                        <th className="text-right font-semibold text-rose-600 py-2 px-2 whitespace-nowrap">SLA Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-50">
                      {data.incidents.filter(inc => inc.slaStatus === 'breached').map(inc => (
                        <tr key={inc.number} className="hover:bg-rose-50/30 transition-colors">
                          <td className="py-2 px-2 font-bold text-rose-700 whitespace-nowrap">{inc.number}</td>
                          <td className="py-2 px-2 text-surface-500 whitespace-nowrap text-[9px]">
                            {inc.createdAt ? formatDate(inc.createdAt) : '—'}
                          </td>
                          <td className="py-2 px-2 text-surface-500 whitespace-nowrap text-[9px]">
                            {inc.closedAt ? formatDate(inc.closedAt) : '—'}
                          </td>
                          <td className="py-2 px-2 text-surface-600 truncate" title={STATE_MAP[inc.state] || inc.state}>
                            {STATE_MAP[inc.state] || inc.state}
                          </td>
                          <td className="text-right py-2 px-2 font-semibold text-rose-600 whitespace-nowrap">
                            {inc.slaVariance !== null && inc.slaVariance !== undefined ? (
                              <>
                                {inc.slaVariance >= 0 ? '+' : ''}{formatMinutes(inc.slaVariance)}
                              </>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-[10px] text-surface-400 italic">No breached incidents</p>
                </div>
              )}
            </div>

            {/* Fourth Column: Priority Summary Table */}
            <div className="lg:col-span-2">
              <PrioritySummaryTable summaryByPriority={data.summaryByPriority} />
            </div>
          </div>

          {/* ── No data ────────────────────────────────────────────────────── */}
          {data.totalIncidents === 0 && (
            <div className="bg-white rounded-xl border border-surface-200 p-12 text-center shadow-sm">
              <FileText size={28} className="text-surface-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-surface-700 mb-1">No incidents found</p>
              <p className="text-xs text-surface-400">No incidents match the selected period. Try a different date range.</p>
            </div>
          )}

          {/* ── Incident Detail Grid ───────────────────────────────────────── */}
          {data?.incidents && data.incidents.length > 0 && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-4">
                <h2 className="text-sm font-bold text-surface-800 flex items-center gap-2">
                  <FileText size={16} className="text-brand-500" />
                  Resolution SLA Details
                </h2>
                <p className="text-xs text-surface-500 mt-1">
                  Provides the Resolution SLA details for all incidents within the selected period: <span className="font-semibold text-surface-700">{data?.startDate || '...'} to {data?.endDate || '...'}</span>
                </p>
              </div>
              <DataTable
                columns={slaColumns}
                data={data.incidents}
                loading={loading}
                pageSize={20}
                searchable={true}
                searchPlaceholder="Search incidents..."
                emptyMessage="No incidents found for this period."
                compact={true}
                defaultSort={{ key: 'number', order: 'desc' }}
                rowKeyField="number"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
