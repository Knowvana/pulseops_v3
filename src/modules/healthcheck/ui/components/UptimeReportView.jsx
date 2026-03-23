// ============================================================================
// UptimeReportView — HealthCheck Module
//
// PURPOSE: Monthly uptime SLA report — single scrollable view (no tabs):
//   1. Report summary — global SLA, poller start time, timezone, formulas
//   2. Reference graphs — SLA compliance, uptime/downtime stats, poll verification
//   3. Per-app SLA grid grouped by category
//   4. Inline poll verification grid
//   5. Missed polls section
//   6. Planned downtime section (from ServiceNow)
//   7. Auto-loads current month on mount with spinner modal
//   8. All times shown in IST with timezone label
//
// USED BY: manifest.jsx → getViews() → uptimeReport
// ============================================================================
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  BarChart3, Loader2, AlertCircle, CheckCircle2,
  XCircle, HelpCircle, TrendingUp, Clock, Target, Shield,
  ShieldCheck, ShieldAlert, AlertTriangle, Calendar, Layers,
  Info, ArrowDown, ArrowUp, FileWarning, Wrench, ArrowLeft,
  ChevronLeft, ChevronRight, Download,
} from 'lucide-react';
import { createLogger, TimezoneService } from '@shared';
import { SetupRequiredOverlay } from '@components';
import ApiClient from '@shared/services/apiClient';
import urls from '../config/urls.json';
import uiText from '../config/uiText.json';

const log = createLogger('UptimeReportView.jsx');
const t = uiText.uptimeReport;
const tc = uiText.common;
const api = urls.api;

// Helper function to format time with timezone
const formatTimeWithTimezone = (timeString) => {
  if (!timeString) return 'Never';
  const formattedTime = TimezoneService.formatTime(timeString);
  const timezone = TimezoneService.getTimezone();
  const timezoneAbbrev = getTimezoneAbbreviation(timezone);
  return `${formattedTime} ${timezoneAbbrev}`;
};

// Helper function to get timezone abbreviation
const getTimezoneAbbreviation = (timezone) => {
  const timezoneMap = {
    'Asia/Kolkata': 'IST',
    'Asia/Karachi': 'PKT',
    'Asia/Dhaka': 'BST',
    'Asia/Riyadh': 'AST',
    'Asia/Dubai': 'GST',
    'Europe/London': 'GMT',
    'Europe/Paris': 'CET',
    'Europe/Berlin': 'CET',
    'America/New_York': 'EST',
    'America/Los_Angeles': 'PST',
    'America/Chicago': 'CST',
    'Asia/Tokyo': 'JST',
    'Asia/Shanghai': 'CST',
    'Asia/Singapore': 'SGT',
    'Australia/Sydney': 'AEST',
    'UTC': 'UTC'
  };
  return timezoneMap[timezone] || timezone;
};

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ── Badge Components ─────────────────────────────────────────────────────────

function VerdictBadge({ verdict }) {
  if (verdict === 'MET') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full">
      <ShieldCheck size={12} /> {t.verdict.MET}
    </span>
  );
  if (verdict === 'NOT_MET') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-full">
      <ShieldAlert size={12} /> {t.verdict.NOT_MET}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-surface-500 bg-surface-50 border border-surface-200 rounded-full">
      <HelpCircle size={12} /> {t.verdict.NO_DATA}
    </span>
  );
}

function PollStatusBadge({ status }) {
  if (status === 'ACCURATE') return (
    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
      {t.pollStatus.ACCURATE}
    </span>
  );
  if (status === 'IN_PROGRESS') return (
    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
      {t.pollStatus.IN_PROGRESS}
    </span>
  );
  return (
    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
      {t.pollStatus.INCOMPLETE}
    </span>
  );
}

// ── Summary Card ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sublabel, icon: Icon, color = 'brand' }) {
  const colors = {
    brand: 'text-brand-600 bg-brand-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
  };
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-surface-100">
      <div className={`w-8 h-8 rounded-lg ${colors[color]} flex items-center justify-center flex-shrink-0`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-surface-400 truncate">{label}</p>
        <p className="text-sm font-bold text-surface-800">{value}</p>
        {sublabel && <p className="text-[10px] text-surface-400 leading-tight mt-0.5">{sublabel}</p>}
      </div>
    </div>
  );
}

// ── Horizontal Bar Graph Component ──────────────────────────────────────────

function HorizBar({ label, value, maxValue, pct, color = 'bg-emerald-500', textColor = 'text-emerald-700' }) {
  const widthPct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-full bg-surface-100 rounded-full h-5 relative overflow-hidden">
        <div className={`h-5 rounded-full ${color} transition-all duration-500`} style={{ width: `${widthPct}%` }} />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">
          {label}: {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value} {pct != null ? `(${pct}%)` : ''}
        </span>
      </div>
    </div>
  );
}

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle, iconColor = 'text-brand-600', badge }) {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-2">
        <Icon size={15} className={iconColor} />
        <div>
          <h3 className="text-sm font-bold text-surface-800">{title}</h3>
          {subtitle && <p className="text-xs text-surface-500">{subtitle}</p>}
        </div>
      </div>
      {badge}
    </div>
  );
}

// ── Spinner Modal ───────────────────────────────────────────────────────────

function SpinnerModal({ visible }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-xs w-full">
        <Loader2 size={36} className="text-brand-600 animate-spin" />
        <div className="text-center">
          <p className="text-sm font-bold text-surface-800">{t.loading}</p>
          <p className="text-xs text-surface-500 mt-1">{t.loadingSubtitle}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function UptimeReportView() {
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState(null);
  const [pollVerification, setPollVerification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showNoDataModal, setShowNoDataModal] = useState(false);
  const [expandedMissedApps, setExpandedMissedApps] = useState({});
  const initialLoadDone = useRef(false);

  const loadReport = useCallback(async (targetMonth) => {
    setLoading(true);
    setError(null);
    setShowNoDataModal(false);
    try {
      // Fetch consolidated report data using RESTful /reports endpoint
      const reportRes = await ApiClient.get(`${api.reports}?month=${targetMonth}`);

      // Check if we got a valid response
      if (!reportRes?.success) {
        setError(reportRes?.error?.message || 'Failed to load report');
        setReport(null);
        setPollVerification(null);
        setLoading(false);
        return;
      }

      // Check if report has applications (data exists for this month)
      const apps = reportRes.data?.uptime?.applications || [];
      const hasPollData = apps.length > 0 && apps.some(app => (app.totalPolls || 0) > 0);
      
      if (apps.length === 0 || !hasPollData) {
        log.warn('loadReport', 'No poll data available for month', { month: targetMonth, appCount: apps.length, hasPollData });
        setShowNoDataModal(true);
        setReport(null);
        setPollVerification(null);
        setLoading(false);
        return;
      }

      // Data exists, set the report
      setReport(reportRes.data.uptime);
      setPollVerification(reportRes.data.pollVerification);
      setShowNoDataModal(false);
    } catch (err) {
      log.error('loadReport', 'Failed', { error: err.message });
      setError(err.message || tc.fetchError);
      setReport(null);
      setPollVerification(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load current month on mount
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadReport(month);
    }
  }, [loadReport, month]);

  const handleGenerate = useCallback(() => loadReport(month), [loadReport, month]);

  const handleDownloadPDF = useCallback(() => {
    if (!report) return;
    
    // Create HTML content matching the report view
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Monthly Uptime Report - ${report.monthDisplay}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; line-height: 1.6; }
          .container { max-width: 1000px; margin: 0 auto; padding: 40px; }
          .header { margin-bottom: 40px; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; }
          .header h1 { font-size: 28px; font-weight: bold; color: #111827; margin-bottom: 5px; }
          .header p { color: #6b7280; font-size: 14px; }
          .meta { display: flex; justify-content: space-between; margin-top: 15px; font-size: 12px; color: #9ca3af; }
          .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
          .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; background: #f9fafb; }
          .card-label { font-size: 12px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; }
          .card-value { font-size: 24px; font-weight: bold; color: #111827; }
          .card-status { font-size: 12px; margin-top: 8px; padding: 4px 8px; border-radius: 4px; display: inline-block; }
          .status-met { background: #d1fae5; color: #065f46; }
          .status-not-met { background: #fee2e2; color: #991b1b; }
          .section { margin-bottom: 40px; }
          .section-title { font-size: 18px; font-weight: bold; color: #111827; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f3f4f6; padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
          td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
          tr:hover { background: #f9fafb; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
          .badge-success { background: #d1fae5; color: #065f46; }
          .badge-danger { background: #fee2e2; color: #991b1b; }
          .badge-warning { background: #fef3c7; color: #92400e; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
          .page-break { page-break-after: always; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Monthly Uptime Report</h1>
            <p>SLA compliance, poll verification, and uptime metrics per application</p>
            <div class="meta">
              <span>Report: ${report.monthDisplay}</span>
              <span>Generated: ${report.generatedAtDisplay} (${report.timezoneLabel})</span>
            </div>
          </div>

          <div class="summary-cards">
            <div class="card">
              <div class="card-label">SLA Compliance - Monthly</div>
              <div class="card-value">${report.actualSlaCompliance || 0}%</div>
              <div class="card-label" style="margin-top: 8px;">Target: ${report.slaTargetPercent}%</div>
              <div class="card-status ${(report.actualSlaCompliance || 0) >= report.slaTargetPercent ? 'status-met' : 'status-not-met'}">
                ${(report.actualSlaCompliance || 0) >= report.slaTargetPercent ? '✓ Met' : '✗ Not Met'}
              </div>
            </div>
            <div class="card">
              <div class="card-label">Applications</div>
              <div class="card-value">${report.applications?.length || 0}</div>
              <div class="card-label" style="margin-top: 8px;">Total Monitored</div>
            </div>
            <div class="card">
              <div class="card-label">Poll Interval</div>
              <div class="card-value">${report.intervalSeconds || 60}s</div>
              <div class="card-label" style="margin-top: 8px;">Expected Polls</div>
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Core System (Uptime Monitoring)</h2>
            <table>
              <thead>
                <tr>
                  <th>Application</th>
                  <th>SLA Target %</th>
                  <th>Actual Uptime %</th>
                  <th>SLA Compliance</th>
                  <th class="text-right">Total Polls</th>
                  <th class="text-right">UP Polls</th>
                  <th class="text-right">DOWN Polls</th>
                </tr>
              </thead>
              <tbody>
                ${report.applications?.map(app => `
                  <tr>
                    <td><strong>${app.applicationName}</strong></td>
                    <td class="text-center">${app.slaTarget}%</td>
                    <td class="text-center">${app.actualUptimePercent || 0}%</td>
                    <td class="text-center">
                      <span class="badge ${app.slaCompliance ? 'badge-success' : 'badge-danger'}">
                        ${app.slaCompliance ? '✓ Met' : '✗ Not Met'}
                      </span>
                    </td>
                    <td class="text-right">${app.totalPolls || 0}</td>
                    <td class="text-right"><span class="badge badge-success">${app.upPolls || 0}</span></td>
                    <td class="text-right"><span class="badge badge-danger">${app.downPolls || 0}</span></td>
                  </tr>
                `).join('') || '<tr><td colspan="7" class="text-center">No applications</td></tr>'}
              </tbody>
            </table>
          </div>

          <div class="footer">
            <p>This report was automatically generated by PulseOps V3 HealthCheck Module.</p>
            <p>For more details, visit the Monthly Uptime Report view in the HealthCheck module.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Create blob and download
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Uptime-Report-${report.month}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    log.info('handleDownloadPDF', 'Report downloaded', { month: report.month });
  }, [report]);

  // ── Derived Data ────────────────────────────────────────────────────────

  // Group report apps by category
  const groupedApps = useMemo(() => {
    if (!report?.applications) return [];
    const groups = {};
    for (const app of report.applications) {
      const cat = app.categoryName || 'Uncategorized';
      if (!groups[cat]) groups[cat] = { name: cat, color: app.categoryColor || '#64748b', apps: [] };
      groups[cat].apps.push(app);
    }
    return Object.values(groups);
  }, [report?.applications]);

  // Aggregate stats for graphs
  const aggregated = useMemo(() => {
    if (!report?.applications?.length) return null;
    const apps = report.applications;
    const totalPolls = apps.reduce((s, a) => s + (a.totalPolls || 0), 0);
    const upPolls = apps.reduce((s, a) => s + (a.upPolls || 0), 0);
    const downPolls = apps.reduce((s, a) => s + (a.downPolls || 0), 0);
    const actualDowntimeMin = apps.reduce((s, a) => s + (a.actualDowntimeMinutes || 0), 0);
    const plannedDowntimeMin = apps.reduce((s, a) => s + (a.plannedDowntimeMinutes || 0), 0);
    const unplannedDowntimeMin = apps.reduce((s, a) => s + (a.unplannedDowntimeMinutes || 0), 0);

    const totalHours = report.totalHoursInMonth || (report.daysInMonth * 24);
    const elapsedHours = report.elapsedHours || (report.elapsedMinutes / 60);
    const sla = report.slaTargetPercent;
    const expectedUptimeHours = report.expectedUptimeHours || (totalHours * sla / 100);
    const expectedDowntimeHours = report.expectedDowntimeHours || (totalHours * (100 - sla) / 100);
    // Use unplanned downtime (actual - planned) for SLA compliance
    const actualUptimeHours = parseFloat(((elapsedHours * 60 - unplannedDowntimeMin) / 60).toFixed(2));
    const actualDowntimeHours = parseFloat((unplannedDowntimeMin / 60).toFixed(2));

    // Uptime percentages for bar
    const actualUptimePct = elapsedHours > 0 ? parseFloat(((actualUptimeHours / elapsedHours) * 100).toFixed(2)) : 0;
    const actualDowntimePct = elapsedHours > 0 ? parseFloat(((actualDowntimeHours / elapsedHours) * 100).toFixed(2)) : 0;
    const expectedUptimePct = sla;
    const expectedDowntimePct = parseFloat((100 - sla).toFixed(2));

    // SLA compliance — use simple average of per-app uptime percentages (matches backend calculation)
    const simpleAverageUptime = apps.length > 0 
      ? apps.reduce((s, a) => s + (a.actualUptimePercent || 0), 0) / apps.length
      : 0;
    const isCompliant = simpleAverageUptime >= sla;

    // Polls match
    const pollsMatch = totalPolls >= (report.expectedPollsElapsed || 0);

    return {
      totalPolls, upPolls, downPolls,
      actualDowntimeMin, plannedDowntimeMin, unplannedDowntimeMin,
      totalHours, elapsedHours, expectedUptimeHours, expectedDowntimeHours,
      actualUptimeHours, actualDowntimeHours,
      actualUptimePct, actualDowntimePct, expectedUptimePct, expectedDowntimePct,
      isCompliant, pollsMatch,
    };
  }, [report]);

  const tzLabel = report?.timezoneLabel || 'IST';

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Spinner Modal */}
      <SpinnerModal visible={loading} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
            <BarChart3 size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800">{t.title}</h1>
            <p className="text-sm text-surface-500 mt-0.5">{t.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Elegant Date Picker */}
          <div className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-1 shadow-sm">
            <button onClick={() => {
              const [year, m] = month.split('-');
              const prevMonth = parseInt(m) === 1 ? `${parseInt(year) - 1}-12` : `${year}-${String(parseInt(m) - 1).padStart(2, '0')}`;
              setMonth(prevMonth);
            }} disabled={loading}
              className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            
            <input type="month" value={month} onChange={e => {
              const currentMonth_ = currentMonth();
              if (e.target.value <= currentMonth_) {
                setMonth(e.target.value);
              }
            }} max={currentMonth()}
              className="px-4 py-2 text-sm font-semibold text-blue-900 bg-white border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent min-w-[150px] cursor-pointer hover:border-blue-300 transition-colors" />
            
            <button onClick={() => {
              const [year, m] = month.split('-');
              const nextMonth = parseInt(m) === 12 ? `${parseInt(year) + 1}-01` : `${year}-${String(parseInt(m) + 1).padStart(2, '0')}`;
              const currentMonth_ = currentMonth();
              if (nextMonth <= currentMonth_) {
                setMonth(nextMonth);
              }
            }} disabled={loading}
              className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={handleGenerate} disabled={loading}
              className="px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-teal-600 to-emerald-600 rounded-lg hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
              {loading ? t.generating : t.generateButton}
            </button>
            
            <button onClick={handleDownloadPDF} disabled={!report || loading}
              className="px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-teal-600 to-emerald-600 rounded-lg hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all">
              <Download size={14} />
              Download PDF
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* No Data Modal Overlay */}
      {showNoDataModal && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-fade-in">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                <Calendar size={32} className="text-amber-600" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-center text-surface-900 mb-3">No Report Data Available</h2>
            <p className="text-sm text-center text-surface-600 mb-6">
              No poll data exists for <span className="font-semibold">{new Date(`${month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span> ({getTimezoneAbbreviation(TimezoneService.getTimezone())}). Please select a different month or ensure the health check poller has collected sufficient data.
            </p>
            <button
              onClick={() => setShowNoDataModal(false)}
              className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all shadow-md"
            >
              Select Different Month
            </button>
          </div>
        </div>
      )}

      {report && report.applications && report.applications.length > 0 ? (
        <>
          {/* Current Month Banner */}
          {report.isCurrentMonth && (
            <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertTriangle size={14} />
              {t.summary.currentMonth} — Data is partial. SLA verdict and expected polls will update as the month progresses.
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
               SECTION 1: Report Summary Cards
             ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-surface-50 rounded-xl border border-surface-200 p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <SectionHeader icon={Layers} title={`${t.summary.title} - ${report.monthDisplay || report.month}`} />
              <div className="text-right">
                <span className="text-[10px] text-surface-400 bg-surface-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {t.summary.generatedOn}: {report.generatedAtDisplay || report.generatedAt} ({tzLabel})
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)' }}>
              {/* LEFT COLUMN: SLA Compliance - Monthly (Target/Actual) */}
              {(() => {
                const target = report.slaTargetPercent || 0;
                const actual = report.actualSlaCompliance || 0;
                const isMet = actual >= target;
                return (
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-surface-100 shadow-sm">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isMet ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                      <Shield size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-surface-400">SLA Compliance - Monthly</p>
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-xs text-surface-500">Target</p>
                          <p className="text-sm font-bold text-surface-800">{target}%</p>
                        </div>
                        <span className="text-surface-300">/</span>
                        <div>
                          <p className="text-xs text-surface-500">Actual</p>
                          <p className={`text-sm font-bold ${isMet ? 'text-emerald-600' : 'text-red-600'}`}>{actual}%</p>
                        </div>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full flex-shrink-0 text-xs" style={{ backgroundColor: isMet ? '#ecfdf5' : '#fef2f2' }}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isMet ? 'bg-emerald-600' : 'bg-red-600'}`} />
                      <span className={`font-bold ${isMet ? 'text-emerald-700' : 'text-red-700'}`}>
                        {isMet ? 'Met' : 'Not Met'}
                      </span>
                    </div>
                  </div>
                );
              })()}
              
              {/* RIGHT COLUMN: Supporting tiles with adjusted widths */}
              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 0.8fr 2fr 1fr' }}>
                <SummaryCard label={t.summary.totalApps} value={report.applications?.length || 0} icon={Target} color="blue" />
                <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-surface-100">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-amber-600 bg-amber-50">
                    <Clock size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-surface-400 truncate">{t.summary.intervalSeconds}</p>
                    <p className="text-sm font-bold text-surface-700">{report.intervalSeconds}s</p>
                  </div>
                </div>
                <SummaryCard
                  label={`${t.summary.pollerStartTime} (${tzLabel})`}
                  value={report.pollerStartTimeDisplay || '—'}
                  icon={Clock}
                  color="brand"
                  className="font-normal"
                />
                {/* Polls (Expected & Actuals) — color coded green if match, red if mismatch */}
                {(() => {
                  const expected = report.expectedPollsElapsed || 0;
                  const actual = report.actualPollsElapsed || 0;
                  const match = actual >= expected;
                  return (
                    <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-surface-100">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${match ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                        <TrendingUp size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-surface-400 truncate">{t.summary.pollsExpectedActuals}</p>
                        <p className={`text-sm font-bold ${match ? 'text-emerald-700' : 'text-red-700'}`}>
                          {expected.toLocaleString()}/{actual.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            {/* Prorated note when pollerStartTime is not month start */}
            {report.pollerStartTime && report.isCurrentMonth && (() => {
              const pollerStart = new Date(report.pollerStartTime);
              const monthStartDate = new Date(`${report.month}-01T00:00:00.000Z`);
              if (pollerStart > monthStartDate) {
                return (
                  <p className="text-[10px] text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                    {t.summary.proratedNote} {formatTimeWithTimezone(report.pollerStartTime)} {t.summary.proratedReason} {formatTimeWithTimezone(report.pollerStartTime)}
                  </p>
                );
              }
              return null;
            })()}
          </div>


          {/* Monthly Report Details */}
            <div className="space-y-4">
              {groupedApps.length > 0 ? groupedApps.map(group => (
              <div key={group.name} className="border border-surface-200 rounded-xl bg-white shadow-sm overflow-hidden">
                {/* Category Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-100" style={{ backgroundColor: `${group.color}10` }}>
                  <BarChart3 size={16} className="text-surface-600" />
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: group.color }}>{group.name}</span>
                    {group.name === 'Core System (Uptime Monitoring)' && (
                      <span className="text-xs text-surface-400">SLA compliance, poll verification, and uptime metrics per application</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-auto text-xs">
                    <span className="text-surface-600 font-medium">{group.apps.length} Apps</span>
                    <span className="text-surface-400">/</span>
                    <span className="text-emerald-600 font-medium">{group.apps.filter(a => a.slaVerdict === 'MET').length} Met</span>
                    {group.apps.filter(a => a.slaVerdict === 'NOT_MET').length > 0 && (
                      <>
                        <span className="text-surface-400">/</span>
                        <span className="text-red-600 font-medium">{group.apps.filter(a => a.slaVerdict === 'NOT_MET').length} Not Met</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface-100 border-b border-surface-200">
                        <th className="px-3 py-2 text-center font-semibold text-emerald-700 border-r border-surface-300" colSpan="4">SLA Compliance</th>
                        <th className="px-3 py-2 text-center font-semibold text-blue-700 border-l border-r border-surface-300" colSpan="6">Verification</th>
                      </tr>
                      <tr className="bg-surface-50 border-b border-surface-100">
                        <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.application}</th>
                        <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.slaTarget}</th>
                        <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.actualUptime}</th>
                        <th className="px-3 py-2 text-center font-semibold text-emerald-700 border-r border-surface-300">SLA Compliance</th>
                        <th className="px-3 py-2 text-center font-semibold text-blue-700 border-r border-surface-300 bg-gradient-to-r from-transparent via-surface-200 to-transparent">Polls (Expected/Actual)</th>
                        <th className="px-3 py-2 text-center font-semibold text-blue-700">Poll Coverage</th>
                        <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.upPolls}</th>
                        <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.downPolls}</th>
                        <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.plannedDowntime}</th>
                        <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.unplannedDowntime}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.apps.map(app => (
                        <tr key={app.applicationId} className={`border-b border-surface-50 hover:bg-surface-50/50 ${app.slaVerdict === 'NOT_MET' ? 'bg-red-50/20' : ''}`}>
                          <td className="px-3 py-2.5 font-medium text-surface-800">{app.name}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-surface-700">{app.slaTargetPercent}%</td>
                          <td className="px-3 py-2.5 text-center">
                            {app.actualUptimePercent != null ? (
                              <span className={`font-bold ${app.actualUptimePercent >= app.slaTargetPercent ? 'text-emerald-600' : 'text-red-600'}`}>
                                {app.actualUptimePercent.toFixed(2)}%
                              </span>
                            ) : <span className="text-surface-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center"><VerdictBadge verdict={app.slaVerdict} /></td>
                          <td className="px-3 py-2.5 text-center font-medium relative">
                            <div className="absolute left-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-surface-300 to-transparent"></div>
                            <span className="text-surface-500">{report.expectedPollsElapsed?.toLocaleString()}</span>
                            <span className="text-surface-400">/</span>
                            <span className={report.actualPollsElapsed >= report.expectedPollsElapsed ? 'text-surface-700' : 'text-amber-600'}>{report.actualPollsElapsed?.toLocaleString()}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`font-bold ${(app.pollCoveragePercent || 0) >= 100 ? 'text-emerald-600' : (app.pollCoveragePercent || 0) >= 95 ? 'text-amber-600' : 'text-red-600'}`}>
                              {app.pollCoveragePercent ?? '—'}%
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-emerald-600 font-medium">{app.upPolls?.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-center text-red-600 font-medium">{app.downPolls?.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-center text-blue-600">{app.plannedDowntimeMinutes ?? 0} <span className="text-surface-400 text-[10px]">({app.plannedDowntimeEntries ?? 0} entries)</span></td>
                          <td className="px-3 py-2.5 text-center font-bold text-red-600">{app.unplannedDowntimeMinutes ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )) : (
              <div className="text-center py-12 text-sm text-surface-400">
                No SLA-enabled applications found. Ensure at least one category has "Used for Uptime SLA" enabled.
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
               SECTION 4: Missed Polls (with expandable rows for scalability)
             ═══════════════════════════════════════════════════════════════════ */}
          {report?.applications && (() => {
            const globalExpected = report.expectedPollsElapsed || 0;
            const globalActual = report.actualPollsElapsed || 0;
            const totalMissed = Math.max(0, globalExpected - globalActual);
            const missedApps = report.applications.filter(app => (app.totalPolls || 0) < globalExpected);

            return (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-100">
                      <FileWarning size={18} className="text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-surface-800">{t.missedPolls.title}</h3>
                      <p className="text-xs text-surface-500 mt-0.5">{t.missedPolls.subtitle}</p>
                    </div>
                  </div>
                  {totalMissed > 0 && (
                    <div className="text-right">
                      <p className="text-2xl font-bold text-amber-600">{totalMissed}</p>
                      <p className="text-xs text-amber-600 font-medium">{t.missedPolls.totalMissed}</p>
                    </div>
                  )}
                </div>

                {/* Content */}
                {totalMissed === 0 ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <CheckCircle2 size={20} className="text-emerald-500 mx-auto mb-2" />
                    <p className="text-xs text-emerald-700 font-medium">{t.missedPolls.noMissedPolls}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-surface-200 rounded-xl bg-white shadow-sm">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-amber-50 border-b border-amber-200">
                          <th className="px-4 py-3 w-6"></th>
                          <th className="px-4 py-3 text-left font-semibold text-amber-700">Application</th>
                          <th className="px-4 py-3 text-center font-semibold text-amber-700">Expected</th>
                          <th className="px-4 py-3 text-center font-semibold text-amber-700">Actual</th>
                          <th className="px-4 py-3 text-center font-semibold text-amber-700">Missed</th>
                          <th className="px-4 py-3 text-center font-semibold text-amber-700">Coverage</th>
                          <th className="px-4 py-3 text-left font-semibold text-amber-700">Missed Times</th>
                        </tr>
                      </thead>
                      <tbody>
                        {missedApps.map(app => {
                          const actual = app.totalPolls || 0;
                          const missed = Math.max(0, globalExpected - actual);
                          const cov = globalExpected > 0 ? ((actual / globalExpected) * 100).toFixed(1) : 0;
                          const missedMinutes = app.missedPollMinutes || [];
                          const isExpanded = expandedMissedApps[app.applicationId];
                          const displayCount = isExpanded ? missedMinutes.length : 1;
                          
                          return (
                            <React.Fragment key={app.applicationId}>
                              <tr className="border-b border-surface-50 hover:bg-amber-50/30">
                                <td className="px-4 py-3 text-center">
                                  {missedMinutes.length > 0 && (
                                    <button
                                      onClick={() => setExpandedMissedApps(p => ({ ...p, [app.applicationId]: !isExpanded }))}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-amber-200 text-amber-600 hover:text-amber-700 font-bold text-sm"
                                      title={isExpanded ? 'Collapse' : 'Expand'}
                                    >
                                      {isExpanded ? '−' : '+'}
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="space-y-0.5">
                                      <div className="font-medium text-surface-800">{app.name}</div>
                                      <div className="text-xs text-surface-500 truncate max-w-xs">{app.url}</div>
                                    </div>
                                  </td>
                                <td className="px-4 py-3 text-center text-surface-600">{globalExpected}</td>
                                <td className="px-4 py-3 text-center font-bold">
                                  <span className={missed === 0 ? 'text-emerald-600' : 'text-red-600'}>
                                    {actual}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-red-600">{missed}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`font-bold ${cov >= 95 ? 'text-emerald-600' : cov >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{cov}%</span>
                                </td>
                                <td className="px-4 py-3">
                                  {missedMinutes.length > 0 ? (
                                    <div className={`max-h-20 overflow-y-auto px-2 py-1 ${isExpanded ? '' : 'scrollbar-thin'}`}>
                                      <div className="space-y-0.5">
                                        {missedMinutes.slice(0, displayCount).map((m, idx) => (
                                          <div key={idx} className="flex items-center justify-between">
                                            <span className="text-xs text-red-600 font-medium">
                                              {m.display}
                                            </span>
                                            {!isExpanded && missedMinutes.length > 1 && idx === 0 && (
                                              <button
                                                onClick={() => setExpandedMissedApps(p => ({ ...p, [app.applicationId]: true }))}
                                                className="text-xs text-amber-600 font-medium hover:text-amber-700 transition-colors ml-2"
                                              >
                                                +{missedMinutes.length - 1} more
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-surface-400">—</span>
                                  )}
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════════════════════════════════
               SECTION 6: Planned Downtime (from ServiceNow)
             ═══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-3">
            <SectionHeader icon={Wrench} title={t.plannedDowntimeSection.title}
              subtitle={t.plannedDowntimeSection.subtitle} iconColor="text-blue-600"
              badge={report.totalPlannedDowntimeMinutes > 0 && (
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  {t.plannedDowntimeSection.totalMinutes}: {report.totalPlannedDowntimeMinutes?.toFixed(0)} min
                </span>
              )} />
            {(!report.plannedDowntimeEntries || report.plannedDowntimeEntries.length === 0) ? (
              <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 text-center">
                <p className="text-xs text-surface-400">{t.plannedDowntimeSection.noEntries}</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-surface-200 rounded-xl bg-white shadow-sm">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-blue-50 border-b border-blue-200">
                      <th className="px-3 py-2.5 text-left font-semibold text-blue-700">{t.plannedDowntimeSection.changeRequest}</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-blue-700">{t.plannedDowntimeSection.taskNumber}</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-blue-700">{t.plannedDowntimeSection.description}</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-blue-700">{t.plannedDowntimeSection.state}</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-blue-700">{t.plannedDowntimeSection.startTime} ({tzLabel})</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-blue-700">{t.plannedDowntimeSection.endTime} ({tzLabel})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.plannedDowntimeEntries.map((entry, idx) => (
                      <tr key={idx} className="border-b border-surface-50 hover:bg-blue-50/30">
                        <td className="px-3 py-2.5 font-medium text-surface-800">{entry.change_request || '—'}</td>
                        <td className="px-3 py-2.5 text-surface-600">{entry.number || '—'}</td>
                        <td className="px-3 py-2.5 text-surface-600 max-w-[200px] truncate">{entry.short_description || '—'}</td>
                        <td className="px-3 py-2.5 text-center text-surface-600">{entry.state || '—'}</td>
                        <td className="px-3 py-2.5 text-surface-600">{entry._start_time || entry.work_start || '—'}</td>
                        <td className="px-3 py-2.5 text-surface-600">{entry._end_time || entry.work_end || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <AlertCircle size={32} className="text-amber-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-surface-700">No data for the selected period.</p>
            <p className="text-xs text-surface-500 mt-1">Try selecting a different month or check if data is available.</p>
          </div>
        </div>
      )}
    </div>
  );
}
