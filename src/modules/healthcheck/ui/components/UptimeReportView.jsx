// ============================================================================
// UptimeReportView — HealthCheck Module
//
// PURPOSE: Monthly uptime SLA report with:
//   1. Report summary — global SLA, poller start time, current month indicator
//   2. Per-app SLA grid grouped by category — target vs actual uptime, verdict
//   3. Expected vs actual polls per app with coverage %
//   4. Downtime breakdown — actual, planned (from SNOW), unplanned
//   5. Poll verification tab — detailed poll coverage analysis
//
// USED BY: manifest.jsx → getViews() → uptimeReport
// ============================================================================
import React, { useState, useCallback, useMemo } from 'react';
import {
  BarChart3, Loader2, AlertCircle, CheckCircle2,
  XCircle, HelpCircle, TrendingUp, Clock, Target, Shield,
  ShieldCheck, ShieldAlert, AlertTriangle, Calendar, Layers,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import urls from '../config/urls.json';

const log = createLogger('UptimeReportView.jsx');
const t = uiText.uptimeReport;
const tc = uiText.common;
const api = urls.api;

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

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

function SummaryCard({ label, value, icon: Icon, color = 'brand' }) {
  const colors = {
    brand: 'text-brand-600 bg-brand-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
  };
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-surface-100">
      <div className={`w-8 h-8 rounded-lg ${colors[color]} flex items-center justify-center flex-shrink-0`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-surface-400 truncate">{label}</p>
        <p className="text-sm font-bold text-surface-800">{value}</p>
      </div>
    </div>
  );
}

export default function UptimeReportView() {
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState(null);
  const [pollVerification, setPollVerification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('uptime');

  const handleGenerate = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [uptimeRes, pvRes] = await Promise.all([
        ApiClient.get(`${api.reportUptime}?month=${month}`),
        ApiClient.get(`${api.reportPollVerification}?month=${month}`),
      ]);
      if (uptimeRes?.success) setReport(uptimeRes.data);
      else setError(uptimeRes?.error?.message || tc.fetchError);
      if (pvRes?.success) setPollVerification(pvRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

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

  return (
    <div className="space-y-6 animate-fade-in">
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
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-surface-600">{t.monthLabel}</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-3 py-1.5 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none" />
          </div>
          <button onClick={handleGenerate} disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
            {loading ? t.generating : t.generateButton}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {!report && !loading && (
        <div className="text-center py-16 text-sm text-surface-400">
          {tc.noData}
        </div>
      )}

      {report && (
        <>
          {/* Current Month Banner */}
          {report.isCurrentMonth && (
            <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertTriangle size={14} />
              {t.summary.currentMonth} — Data is partial. SLA verdict and expected polls will update as the month progresses.
            </div>
          )}

          {/* Report Summary Cards */}
          <div className="bg-surface-50 rounded-xl border border-surface-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-surface-800 mb-4 flex items-center gap-2">
              <Layers size={14} className="text-brand-600" />
              {t.summary.title}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard label={t.summary.month} value={report.month} icon={Calendar} color="brand" />
              <SummaryCard label={t.summary.globalSla} value={`${report.slaTargetPercent}%`} icon={Shield} color="emerald" />
              <SummaryCard label={t.summary.totalApps} value={report.applications?.length || 0} icon={Target} color="blue" />
              <SummaryCard label={t.summary.intervalSeconds} value={`${report.intervalSeconds}s`} icon={Clock} color="amber" />
              <SummaryCard label={t.summary.pollerStartTime} value={report.pollerStartTime ? new Date(report.pollerStartTime).toLocaleString() : '—'} icon={Clock} color="brand" />
              <SummaryCard label={t.summary.expectedPollsElapsed} value={report.expectedPollsElapsed?.toLocaleString()} icon={TrendingUp} color="blue" />
              <SummaryCard label={t.summary.expectedPollsTotal} value={report.expectedPollsTotal?.toLocaleString()} icon={TrendingUp} color="brand" />
              <SummaryCard label={t.summary.elapsedMinutes} value={`${report.elapsedMinutes?.toLocaleString()} / ${report.totalMinutesInMonth?.toLocaleString()}`} icon={Clock} color="amber" />
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1 border-b border-surface-200">
            <button onClick={() => setActiveTab('uptime')}
              className={`px-4 py-2.5 text-xs font-bold tracking-wide border-b-2 transition-colors ${activeTab === 'uptime' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400 hover:text-surface-600'}`}>
              {t.title}
            </button>
            <button onClick={() => setActiveTab('pollVerification')}
              className={`px-4 py-2.5 text-xs font-bold tracking-wide border-b-2 transition-colors ${activeTab === 'pollVerification' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400 hover:text-surface-600'}`}>
              {t.pollVerification.title}
            </button>
          </div>

          {/* Uptime Grid — Grouped by Category */}
          {activeTab === 'uptime' && groupedApps.length > 0 && (
            <div className="space-y-4">
              {groupedApps.map(group => (
                <div key={group.name} className="border border-surface-200 rounded-xl bg-white shadow-sm overflow-hidden">
                  {/* Category Header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-100" style={{ backgroundColor: `${group.color}10` }}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: group.color }}>{group.name}</span>
                    <span className="text-xs text-surface-400 ml-1">{group.apps.length} app{group.apps.length !== 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-2 ml-auto text-xs">
                      <span className="text-emerald-600 font-medium">{group.apps.filter(a => a.slaVerdict === 'MET').length} Met</span>
                      {group.apps.filter(a => a.slaVerdict === 'NOT_MET').length > 0 && (
                        <span className="text-red-600 font-medium">{group.apps.filter(a => a.slaVerdict === 'NOT_MET').length} Not Met</span>
                      )}
                    </div>
                  </div>
                  {/* Apps Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-surface-50 border-b border-surface-100">
                          <th className="px-3 py-2 text-left font-semibold text-surface-600">{t.grid.application}</th>
                          <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.slaTarget}</th>
                          <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.actualUptime}</th>
                          <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.verdict}</th>
                          <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.expectedPolls}</th>
                          <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.totalPolls}</th>
                          <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.upPolls}</th>
                          <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.downPolls}</th>
                          <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.plannedDowntime}</th>
                          <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.unplannedDowntime}</th>
                          <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.grid.pollStatus}</th>
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
                            <td className="px-3 py-2.5 text-center text-surface-500">{app.expectedPollsElapsed?.toLocaleString()}</td>
                            <td className="px-3 py-2.5 text-center font-medium">
                              <span className={app.pollsMatch ? 'text-surface-700' : 'text-amber-600'}>{app.totalPolls?.toLocaleString()}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center text-emerald-600 font-medium">{app.upPolls?.toLocaleString()}</td>
                            <td className="px-3 py-2.5 text-center text-red-600 font-medium">{app.downPolls?.toLocaleString()}</td>
                            <td className="px-3 py-2.5 text-center text-blue-600">{app.plannedDowntimeMinutes}</td>
                            <td className="px-3 py-2.5 text-center font-bold text-red-600">{app.unplannedDowntimeMinutes}</td>
                            <td className="px-3 py-2.5 text-center"><PollStatusBadge status={app.pollVerificationStatus} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'uptime' && groupedApps.length === 0 && (
            <div className="text-center py-12 text-sm text-surface-400">
              No SLA-enabled applications found. Ensure at least one category has "Used for Uptime SLA" enabled.
            </div>
          )}

          {/* Poll Verification Grid */}
          {activeTab === 'pollVerification' && pollVerification?.applications && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-surface-800">{t.pollVerification.title}</h3>
                <p className="text-xs text-surface-500">{t.pollVerification.subtitle}</p>
                {pollVerification.pollerStartTime && (
                  <p className="text-xs text-surface-400 mt-1">
                    {t.summary.pollerStartTime}: <span className="font-medium text-surface-600">{new Date(pollVerification.pollerStartTime).toLocaleString()}</span>
                  </p>
                )}
              </div>
              <div className="overflow-x-auto border border-surface-200 rounded-xl bg-white shadow-sm">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-50 border-b border-surface-200">
                      <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.pollVerification.application}</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.grid.category}</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.pollVerification.actualPolls}</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.pollVerification.expectedPolls}</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.pollVerification.coverage}</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.pollVerification.status}</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.pollVerification.firstPoll}</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.pollVerification.lastPoll}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pollVerification.applications.map(app => (
                      <tr key={app.applicationId} className="border-b border-surface-50 hover:bg-surface-50/50">
                        <td className="px-3 py-2.5 font-medium text-surface-800">{app.name}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: app.categoryColor || '#64748b' }} />
                            <span className="text-surface-600">{app.categoryName || '—'}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-surface-700">{app.actualPolls?.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center text-surface-500">{app.expectedPollsElapsed?.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`font-bold ${app.coveragePercent >= 95 ? 'text-emerald-600' : app.coveragePercent >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                            {app.coveragePercent}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center"><PollStatusBadge status={app.status} /></td>
                        <td className="px-3 py-2.5 text-surface-500">{app.firstPoll ? new Date(app.firstPoll).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-surface-500">{app.lastPoll ? new Date(app.lastPoll).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
