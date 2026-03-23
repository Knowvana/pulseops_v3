// ============================================================================
// HealthCheckDashboard — Enterprise Eyes-on-Glass Monitoring Dashboard
//
// PURPOSE: Clean, professional real-time monitoring dashboard for enterprise
//          operations teams. At-a-glance health status with minimal cognitive load.
//
// DESIGN PRINCIPLES:
//   1. Immediate visual status recognition (color-coded, large indicators)
//   2. Minimal information density - focus on what matters most
//   3. Clean visual hierarchy with clear separation of concerns
//   4. Real-time updates without overwhelming the user
//   5. Professional enterprise aesthetics with subtle animations
//
// USED BY: manifest.jsx → getViews() → dashboard
// ============================================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Activity, Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Play, Pause, Clock, Zap, Globe, Wifi, WifiOff, Eye, TrendingUp,
  TrendingDown, BarChart3, Filter, Search, Timer, AlertTriangle,
} from 'lucide-react';
import { createLogger, TimezoneService } from '@shared';
import { SetupRequiredOverlay } from '@components';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import urls from '../config/urls.json';

const log = createLogger('HealthCheckDashboard.jsx');
const t = uiText.dashboard;
const api = urls.api;

// Helper function to format time with timezone
const formatTimeWithTimezone = (timeString) => {
  if (!timeString) return 'Never';
  const formattedTime = TimezoneService.formatTime(timeString);
  const timezone = TimezoneService.getTimezone();
  const timezoneAbbrev = getTimezoneAbbreviation(timezone);
  return `${formattedTime} ${timezoneAbbrev}`;
};

// Helper function to format time without seconds
const formatTimeWithoutSeconds = (timeString) => {
  if (!timeString) return 'Never';
  const formattedTime = TimezoneService.formatTime(timeString);
  const timezone = TimezoneService.getTimezone();
  const timezoneAbbrev = getTimezoneAbbreviation(timezone);
  // Remove seconds from formatted time (HH:MM:SS → HH:MM)
  const timeWithoutSeconds = formattedTime.replace(/:\d{2}(?=\s|$)/, '');
  return `${timeWithoutSeconds} ${timezoneAbbrev}`;
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

// ── Status Badge Component ─────────────────────────────────────────────────────
function StatusBadge({ status, size = 'md' }) {
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const colors = {
    UP: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    DOWN: 'bg-red-100 text-red-800 border-red-200',
    UNKNOWN: 'bg-amber-100 text-amber-800 border-amber-200',
  };

  const icons = {
    UP: <CheckCircle2 size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} className="inline mr-1" />,
    DOWN: <XCircle size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} className="inline mr-1" />,
    UNKNOWN: <AlertCircle size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} className="inline mr-1" />,
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${sizes[size]} ${colors[status] || colors.UNKNOWN}`}>
      {icons[status]}
      {status === 'UP' ? 'Operational' : status === 'DOWN' ? 'Down' : 'Unknown'}
    </span>
  );
}

// ── Health Overview Card ─────────────────────────────────────────────────────
function HealthOverviewCard({ data }) {
  // Core System apps metrics
  const coreSystemApps = data.applications ? data.applications.filter(a => a.categoryName === 'Core System (Uptime Monitoring)') : [];
  const coreSystemUp = coreSystemApps.filter(a => a.latestStatus === 'UP').length;
  const coreSystemTotal = coreSystemApps.length;
  const coreHealthPercentage = coreSystemTotal > 0 ? Math.round((coreSystemUp / coreSystemTotal) * 100) : 0;
  const coreIsHealthy = coreHealthPercentage >= 95;
  const coreIsWarning = coreHealthPercentage >= 80 && coreHealthPercentage < 95;
  const coreAvgResponseTime = coreSystemApps && coreSystemApps.length > 0
    ? Math.round(coreSystemApps
      .filter(a => a.latestResponseMs != null)
      .reduce((sum, a) => sum + a.latestResponseMs, 0) /
      coreSystemApps.filter(a => a.latestResponseMs != null).length) || 0
    : 0;
  const coreCriticalApps = coreSystemApps.filter(a => a.latestStatus === 'DOWN').length;
  const coreWarningApps = coreSystemApps.filter(a => a.latestResponseMs > 5000).length;
  const coreDownApps = coreSystemApps.filter(a => a.latestStatus === 'DOWN');

  // Other apps metrics
  const otherApps = data.applications ? data.applications.filter(a => a.categoryName !== 'Core System (Uptime Monitoring)') : [];
  const otherUp = otherApps.filter(a => a.latestStatus === 'UP').length;
  const otherTotal = otherApps.length;
  const otherHealthPercentage = otherTotal > 0 ? Math.round((otherUp / otherTotal) * 100) : 0;
  const otherIsHealthy = otherHealthPercentage >= 95;
  const otherIsWarning = otherHealthPercentage >= 80 && otherHealthPercentage < 95;
  const otherAvgResponseTime = otherApps && otherApps.length > 0
    ? Math.round(otherApps
      .filter(a => a.latestResponseMs != null)
      .reduce((sum, a) => sum + a.latestResponseMs, 0) /
      otherApps.filter(a => a.latestResponseMs != null).length) || 0
    : 0;
  const otherCriticalApps = otherApps.filter(a => a.latestStatus === 'DOWN').length;
  const otherWarningApps = otherApps.filter(a => a.latestResponseMs > 5000).length;
  const otherDownApps = otherApps.filter(a => a.latestStatus === 'DOWN');

  // Helper function to render status card
  const StatusCard = ({ title, healthPercentage, isHealthy, isWarning, avgResponseTime, criticalApps, warningApps, totalApps, upApps, downApps = [] }) => (
    <div className={`rounded-xl border-2 p-4 transition-all duration-300 ${isHealthy
        ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200'
        : isWarning
          ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200'
          : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
      }`}>
      <div className="space-y-2">
        {/* Header with title */}
        <h3 className="text-xs font-semibold text-surface-700 uppercase tracking-wider">{title}</h3>

        {/* Main Status - Logical Grouping Layout */}
        <div className="flex items-center justify-between">
          {/* Health Status Section */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              isHealthy 
                ? 'bg-emerald-500' 
                : isWarning 
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`}>
              {isHealthy ? (
                <CheckCircle2 size={20} className="text-white" />
              ) : isWarning ? (
                <AlertCircle size={20} className="text-white" />
              ) : (
                <XCircle size={20} className="text-white" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight">{healthPercentage}%</h2>
              <p className="text-xs font-medium opacity-75">{upApps} of {totalApps} healthy</p>
            </div>
          </div>

          {/* Logical Metrics Groups */}
          <div className="flex gap-8">
            {/* Performance Group */}
            <div className="flex gap-4">
              {/* Average Response */}
              <div className="text-center">
                <p className="text-[10px] text-surface-600 uppercase font-semibold">Avg Response</p>
                <p className={`text-xs font-semibold ${avgResponseTime > 5000 ? 'text-red-600' : avgResponseTime > 2000 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {avgResponseTime}ms
                </p>
              </div>

              {/* Slow Applications */}
              <div className="text-center">
                <p className="text-[10px] text-surface-600 uppercase font-semibold">Slow (&gt;5s)</p>
                <p className="text-xs font-semibold text-amber-600">{warningApps}</p>
              </div>
            </div>

            {/* Issues Group */}
            <div className="flex gap-4">
              {/* Critical/Down Applications */}
              <div className="text-center">
                <p className="text-[10px] text-surface-600 uppercase font-semibold">Critical Issues</p>
                <div className="flex flex-wrap justify-center gap-1 min-h-[20px]">
                  {downApps.length > 0 ? (
                    downApps.map(app => (
                      <span key={app.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                        <XCircle size={8} />
                        {app.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-semibold text-emerald-600">None</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Core System Status */}
      <StatusCard
        title="Core System (Uptime Monitoring)"
        healthPercentage={coreHealthPercentage}
        isHealthy={coreIsHealthy}
        isWarning={coreIsWarning}
        avgResponseTime={coreAvgResponseTime}
        criticalApps={coreCriticalApps}
        warningApps={coreWarningApps}
        totalApps={coreSystemTotal}
        upApps={coreSystemUp}
        downApps={coreDownApps}
      />

      {/* Other Apps Status */}
      {otherTotal > 0 && (
        <StatusCard
          title="Other Applications"
          healthPercentage={otherHealthPercentage}
          isHealthy={otherIsHealthy}
          isWarning={otherIsWarning}
          avgResponseTime={otherAvgResponseTime}
          criticalApps={otherCriticalApps}
          warningApps={otherWarningApps}
          totalApps={otherTotal}
          upApps={otherUp}
          downApps={otherDownApps}
        />
      )}
    </div>
  );
}

// ── Application Data Grid Component ─────────────────────────────────────────────
function ApplicationDataGrid({ applications, searchTerm, filterStatus, onSearch, onFilter }) {
  const filteredApps = useMemo(() => {
    return applications.filter(app => {
      const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.url.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || app.latestStatus === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [applications, searchTerm, filterStatus]);

  const getResponseTimeColor = (responseTime) => {
    if (responseTime == null) return 'text-surface-300';
    if (responseTime > 5000) return 'text-red-600 font-medium';
    if (responseTime > 2000) return 'text-amber-600 font-medium';
    return 'text-emerald-600 font-medium';
  };

  const getHttpCodeColor = (httpCode) => {
    if (httpCode == null) return 'text-surface-300';
    if (httpCode >= 200 && httpCode < 300) return 'text-emerald-600 font-medium';
    return 'text-red-600 font-medium';
  };

  return (
    <div className="space-y-4">

      {/* Applications Data Grid */}
      {filteredApps.length === 0 ? (
        <div className="text-center py-12 text-surface-400">
          <Activity size={48} className="mx-auto mb-4 opacity-50" />
          <p>No applications match your criteria</p>
        </div>
      ) : (
        <div className="bg-white border border-surface-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              {/* Table Header */}
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-700 uppercase tracking-wider">
                    Application
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-surface-700 uppercase tracking-wider">
                    HTTP Code
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-surface-700 uppercase tracking-wider">
                    Response Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-700 uppercase tracking-wider">
                    Last Checked
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-700 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-700 uppercase tracking-wider">
                    Error Details
                  </th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-surface-100">
                {filteredApps.map(app => (
                  <tr
                    key={app.id}
                    className={`hover:bg-surface-50 transition-colors ${app.latestStatus === 'DOWN' ? 'bg-red-50/30' : ''
                      }`}
                  >
                    {/* Status Column */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={app.latestStatus} size="sm" />
                    </td>

                    {/* Application Column */}
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-surface-900 truncate">
                          {app.name}
                        </div>
                        <a
                          href={app.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-surface-500 hover:text-brand-600 truncate flex items-center gap-1 mt-0.5"
                        >
                          {app.url}
                          <Eye size={10} />
                        </a>
                      </div>
                    </td>

                    {/* HTTP Code Column */}
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      {app.latestHttpCode ? (
                        <span className={`font-mono text-sm ${getHttpCodeColor(app.latestHttpCode)}`}>
                          {app.latestHttpCode}
                        </span>
                      ) : (
                        <span className="text-surface-300">—</span>
                      )}
                    </td>

                    {/* Response Time Column */}
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      {app.latestResponseMs != null ? (
                        <span className={`font-mono text-sm ${getResponseTimeColor(app.latestResponseMs)}`}>
                          {app.latestResponseMs}ms
                        </span>
                      ) : (
                        <span className="text-surface-300">—</span>
                      )}
                    </td>

                    {/* Last Checked Column */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-surface-600">
                      <div className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${app.latestStatus === 'UP' ? 'bg-emerald-500' :
                            app.latestStatus === 'DOWN' ? 'bg-red-500' : 'bg-amber-500'
                          }`} />
                        <span>{formatTimeWithTimezone(app.lastPolledAt)}</span>
                      </div>
                    </td>

                    {/* Category Column */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {app.categoryName ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: app.categoryColor || '#64748b' }}
                          />
                          <span className="text-sm text-surface-700">{app.categoryName}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-surface-400">Uncategorized</span>
                      )}
                    </td>

                    {/* Error Details Column */}
                    <td className="px-4 py-3 text-sm">
                      {app.latestError ? (
                        <div className="max-w-xs truncate text-red-600" title={app.latestError}>
                          {app.latestError}
                        </div>
                      ) : (
                        <span className="text-surface-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Footer */}
          <div className="bg-surface-50 px-4 py-3 border-t border-surface-200">
            <div className="flex items-center justify-between text-sm text-surface-600">
              <span>
                Showing {filteredApps.length} of {applications.length} applications
              </span>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  {filteredApps.filter(a => a.latestStatus === 'UP').length} UP
                </span>
                <span className="flex items-center gap-1">
                  <XCircle size={14} className="text-red-500" />
                  {filteredApps.filter(a => a.latestStatus === 'DOWN').length} DOWN
                </span>
                <span className="flex items-center gap-1">
                  <AlertCircle size={14} className="text-amber-500" />
                  {filteredApps.filter(a => a.latestStatus === 'UNKNOWN').length} UNKNOWN
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard Component ───────────────────────────────────────────────────
export default function HealthCheckDashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(false);
  const [coreSearchTerm, setCoreSearchTerm] = useState('');
  const [coreFilterStatus, setCoreFilterStatus] = useState('all');
  const [otherSearchTerm, setOtherSearchTerm] = useState('');
  const [otherFilterStatus, setOtherFilterStatus] = useState('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showNoAppsModal, setShowNoAppsModal] = useState(false);
  const sseRef = useRef(null);
  const initRan = useRef(false);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await ApiClient.get(api.dashboard);
      if (res?.success) {
        log.info('Dashboard data loaded', { 
          hasData: !!res.data,
          dataKeys: res.data ? Object.keys(res.data) : [],
          coreAppsCount: res.data?.coreApplications?.length || 0,
          otherAppsCount: res.data?.otherApplications?.length || 0,
          applicationsCount: res.data?.applications?.length || 0
        });
        setData(res.data);
        setError(null);
      } else {
        log.error('Dashboard load failed', { error: res?.error?.message });
        setError(res?.error?.message || 'Failed to load dashboard');
      }
    } catch (err) {
      log.error('Dashboard load error', { message: err.message });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('HealthCheckDashboard mounted, loading dashboard');
    loadDashboard();
  }, [loadDashboard]);

  // Update current time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [currentTime]);

  // Setup SSE for real-time updates
  useEffect(() => {
    if (!data?.poller?.isRunning) return;

    const eventSource = new EventSource(`/api/healthcheck/events/poll`);
    sseRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        if (update.type === 'poll_complete') {
          // Reload dashboard data when poll completes
          loadDashboard();
        }
      } catch (err) {
        log.error('Failed to parse SSE message', err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      sseRef.current = null;
    };

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [data?.poller?.isRunning]);

  const handlePollNow = useCallback(async () => {
    setPolling(true);
    try {
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setPolling(false);
    }
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center mb-4">
          <Loader2 className="animate-spin text-brand-600" size={32} />
        </div>
        <p className="text-lg font-medium text-surface-600">Loading dashboard...</p>
      </div>
    );
  }

  if (!data || !data.applications || data.applications.length === 0) {
    return (
      <div className="relative min-h-[600px]">
        <SetupRequiredOverlay
          isOpen={true}
          icon={AlertTriangle}
          header="No Applications Configured"
          messageDetail="Add applications to start monitoring their health status and performance."
          actionIcon={Globe}
          actionText="Add Your First Application"
          onAction={() => onNavigate && onNavigate('applications')}
          variant="info"
        />
      </div>
    );
  }

  const poller = data.poller || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">System Health</h1>
          <p className="text-surface-500">Real-time monitoring dashboard</p>
        </div>
        {/* Current Time */}
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-surface-400" />
          <span className="text-sm font-semibold text-surface-800">
            {formatTimeWithTimezone(currentTime.toISOString())}
          </span>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Health Overview */}
      <HealthOverviewCard data={data} />

      {/* Poller Status Bar */}
      <div className="bg-white rounded-xl border border-surface-200 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            {/* Poller Status */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="relative">
                  <div className={`w-3 h-3 rounded-full ${poller.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-surface-300'}`} />
                  {poller.isRunning && (
                    <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-75" />
                  )}
                </div>
                <Activity size={12} className={poller.isRunning ? 'animate-pulse text-emerald-600' : 'text-surface-400'} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-surface-500 font-medium">Poller Status</span>
                <span className="text-sm font-semibold text-surface-800">
                  {poller.isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
            </div>

            {/* Polling Frequency */}
            <div className="flex items-center gap-2">
              <Timer size={16} className="text-surface-400" />
              <div className="flex flex-col">
                <span className="text-xs text-surface-500 font-medium">Interval</span>
                <span className="text-sm font-semibold text-surface-800">
                  {poller.intervalSeconds || 60}s
                </span>
              </div>
            </div>

            {/* Last Poll */}
            {poller.isRunning && (
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-surface-400" />
                <div className="flex flex-col">
                  <span className="text-xs text-surface-500 font-medium">Last Poll</span>
                  <span className="text-sm font-semibold text-surface-800">
                    {poller.lastPollTimeDisplay ? formatTimeWithoutSeconds(poller.lastPollTimeDisplay) : 'Never'}
                  </span>
                </div>
              </div>
            )}


            {/* Applications Count */}
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-surface-400" />
              <div className="flex flex-col">
                <span className="text-xs text-surface-500 font-medium">Applications</span>
                <span className="text-sm font-semibold text-surface-800">
                  {(() => {
                    // Try coreApplications/otherApplications first, fallback to applications array
                    const coreCount = data.coreApplications ? data.coreApplications.length : 0;
                    const otherCount = data.otherApplications ? data.otherApplications.length : 0;
                    const totalCount = data.applications ? data.applications.length : 0;
                    
                    log.debug('Applications count', { coreCount, otherCount, totalCount, hasCore: !!data.coreApplications, hasOther: !!data.otherApplications, hasApps: !!data.applications });
                    
                    // If we have core/other counts, use them; otherwise show total
                    if (coreCount > 0 || otherCount > 0) {
                      return `${coreCount}/${otherCount}`;
                    }
                    return totalCount > 0 ? `${totalCount}` : '0/0';
                  })()}
                </span>
              </div>
            </div>
          </div>

          {/* Refresh Dashboard Button */}
          <button onClick={handlePollNow} disabled={polling}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-teal-600 to-emerald-600 rounded-lg hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 flex items-center gap-2 shadow-md hover:shadow-lg transition-all whitespace-nowrap">
            {polling ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {polling ? 'Refreshing...' : 'Refresh Dashboard'}
          </button>
        </div>
      </div>

      {/* Core System Applications Section */}
      <div className="bg-white rounded-xl border border-surface-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-3 h-3 rounded-full ${poller.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-surface-300'}`} />
              {poller.isRunning && (
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-75" />
              )}
            </div>
            <h2 className="text-lg font-semibold text-surface-800">Core System Applications</h2>
            <span className="text-lg font-semibold text-surface-800">
              ({data.applications ? data.applications.filter(a => a.categoryName === 'Core System (Uptime Monitoring)').length : 0})
            </span>
            <span className="text-xs text-surface-500 ml-2">- Monitored for uptime and SLA compliance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search applications..."
                value={coreSearchTerm}
                onChange={e => setCoreSearchTerm(e.target.value)}
                className="w-64 pl-10 pr-3 py-1.5 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
              />
            </div>
            <select
              value={coreFilterStatus}
              onChange={e => setCoreFilterStatus(e.target.value)}
              className="px-3 py-1.5 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none bg-white"
            >
              <option value="all">All Status</option>
              <option value="UP">Operational</option>
              <option value="DOWN">Down</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </div>
        </div>
        <ApplicationDataGrid
          applications={data.applications ? data.applications.filter(a => a.categoryName === 'Core System (Uptime Monitoring)') : []}
          searchTerm={coreSearchTerm}
          filterStatus={coreFilterStatus}
          onSearch={setCoreSearchTerm}
          onFilter={setCoreFilterStatus}
        />
      </div>

      {/* Other Applications Section */}
      {data.applications && data.applications.filter(a => a.categoryName !== 'Core System (Uptime Monitoring)').length > 0 && (
        <div className="bg-white rounded-xl border border-surface-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
              </div>
              <h2 className="text-lg font-semibold text-surface-800">Other Applications</h2>
              <span className="text-lg font-semibold text-surface-800">
                ({data.applications.filter(a => a.categoryName !== 'Core System (Uptime Monitoring)').length})
              </span>
              <span className="text-xs text-surface-500 ml-2">- Monitored for status, not included in SLA calculations</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  placeholder="Search applications..."
                  value={otherSearchTerm}
                  onChange={e => setOtherSearchTerm(e.target.value)}
                  className="w-64 pl-10 pr-3 py-1.5 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                />
              </div>
              <select
                value={otherFilterStatus}
                onChange={e => setOtherFilterStatus(e.target.value)}
                className="px-3 py-1.5 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none bg-white"
              >
                <option value="all">All Status</option>
                <option value="UP">Operational</option>
                <option value="DOWN">Down</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>
          </div>
          <ApplicationDataGrid
            applications={data.applications.filter(a => a.categoryName !== 'Core System (Uptime Monitoring)')}
            searchTerm={otherSearchTerm}
            filterStatus={otherFilterStatus}
            onSearch={setOtherSearchTerm}
            onFilter={setOtherFilterStatus}
          />
        </div>
      )}
    </div>
  );
}
