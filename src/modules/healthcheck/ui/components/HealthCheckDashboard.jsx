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
  TrendingDown, BarChart3, Filter, Search, Timer,
} from 'lucide-react';
import { createLogger, TimezoneService } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import urls from '../config/urls.json';

const log = createLogger('HealthCheckDashboard.jsx');
const t = uiText.dashboard;
const api = urls.api;

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
  const healthPercentage = data.totalApps > 0 ? Math.round((data.appsUp / data.totalApps) * 100) : 0;
  const isHealthy = healthPercentage >= 95;
  const isWarning = healthPercentage >= 80 && healthPercentage < 95;
  
  // Calculate additional metrics
  const avgResponseTime = data.applications && data.applications.length > 0
    ? Math.round(data.applications
        .filter(a => a.latestResponseMs != null)
        .reduce((sum, a) => sum + a.latestResponseMs, 0) / 
        data.applications.filter(a => a.latestResponseMs != null).length) || 0
    : 0;
  
  const criticalApps = data.applications ? data.applications.filter(a => a.latestStatus === 'DOWN').length : 0;
  const warningApps = data.applications ? data.applications.filter(a => a.latestResponseMs > 5000).length : 0;
  
  return (
    <div className={`rounded-2xl border-2 p-6 transition-all duration-300 ${
      isHealthy 
        ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200' 
        : isWarning 
          ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200'
          : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
    }`}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Health Status */}
        <div className="text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-4 mb-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ${
              isHealthy 
                ? 'bg-emerald-500' 
                : isWarning 
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`}>
              {isHealthy ? (
                <CheckCircle2 size={28} className="text-white" />
              ) : isWarning ? (
                <AlertCircle size={28} className="text-white" />
              ) : (
                <XCircle size={28} className="text-white" />
              )}
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-1">
                {healthPercentage}%
              </h2>
              <p className="text-lg font-medium">
                {isHealthy ? 'All Systems Operational' : isWarning ? 'Some Issues Detected' : 'Critical Issues'}
              </p>
            </div>
          </div>
          <p className="text-sm opacity-75">
            {data.appsUp} of {data.totalApps} applications healthy
          </p>
        </div>

        {/* Performance Metrics */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-surface-700 uppercase tracking-wider">Performance</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-600 flex items-center gap-2">
                <Clock size={14} />
                Avg Response Time
              </span>
              <span className={`font-semibold ${avgResponseTime > 5000 ? 'text-red-600' : avgResponseTime > 2000 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {avgResponseTime}ms
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-600 flex items-center gap-2">
                <Activity size={14} />
                Total Monitored
              </span>
              <span className="font-semibold text-surface-700">{data.totalApps}</span>
            </div>
          </div>
        </div>

        {/* Issue Breakdown */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-surface-700 uppercase tracking-wider">Issues</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-600 flex items-center gap-2">
                <XCircle size={14} className="text-red-500" />
                Critical (Down)
              </span>
              <span className="font-semibold text-red-600">{criticalApps}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-600 flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-500" />
                Slow (&gt;5s)
              </span>
              <span className="font-semibold text-amber-600">{warningApps}</span>
            </div>
          </div>
          {data.appsDown > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-white/50 rounded-full text-sm">
              <XCircle size={14} />
              {data.appsDown} app{data.appsDown > 1 ? 's' : ''} down
            </div>
          )}
        </div>
      </div>
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
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            placeholder="Search applications..."
            value={searchTerm}
            onChange={e => onSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => onFilter(e.target.value)}
          className="px-4 py-2 border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none bg-white"
        >
          <option value="all">All Status</option>
          <option value="UP">Operational</option>
          <option value="DOWN">Down</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
      </div>

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
                    className={`hover:bg-surface-50 transition-colors ${
                      app.latestStatus === 'DOWN' ? 'bg-red-50/30' : ''
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
                        <span className={`w-2 h-2 rounded-full ${
                          app.latestStatus === 'UP' ? 'bg-emerald-500' : 
                          app.latestStatus === 'DOWN' ? 'bg-red-500' : 'bg-amber-500'
                        }`} />
                        <span>{app.lastPolledAt ? TimezoneService.formatTime(app.lastPolledAt) : 'Never'}</span>
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
export default function HealthCheckDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  const sseRef = useRef(null);
  const initRan = useRef(false);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await ApiClient.get(api.dashboard);
      if (res?.success) {
        setData(res.data);
        setError(null);
      } else {
        setError(res?.error?.message || 'Failed to load dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadDashboard();
  }, [loadDashboard]);

  // Update current time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Setup SSE for real-time updates
  useEffect(() => {
    if (!data?.poller?.isRunning) return;

    const eventSource = new EventSource(`/api/healthcheck/sse/dashboard-updates`);
    sseRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        if (update.type === 'poller_update') {
          setData(prev => prev ? { ...prev, poller: update.poller } : null);
        } else if (update.type === 'applications_update') {
          setData(prev => prev ? { ...prev, applications: update.applications } : null);
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
      const res = await ApiClient.post(api.pollerPollNow);
      if (res?.success) {
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
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center mb-4">
          <Loader2 className="animate-spin text-brand-600" size={32} />
        </div>
        <p className="text-lg font-medium text-surface-600">Loading dashboard...</p>
      </div>
    );
  }

  if (!data || data.totalApps === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="w-20 h-20 rounded-2xl bg-surface-100 flex items-center justify-center mb-6">
          <Activity size={36} className="text-surface-300" />
        </div>
        <h2 className="text-2xl font-bold text-surface-700 mb-3">No Applications Configured</h2>
        <p className="text-surface-400 mb-8 max-w-md">
          Add applications to start monitoring their health status and performance.
        </p>
        <button className="px-6 py-3 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 flex items-center gap-2">
          <Globe size={16} />
          Add Your First Application
        </button>
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
        <div className="text-right">
          <p className="text-xs text-surface-500">Current Time</p>
          <p className="text-sm font-medium">{TimezoneService.formatTime(currentTime.toISOString())}</p>
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
          <div className="flex items-center gap-6">
            {/* Poller Status */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`w-4 h-4 rounded-full ${poller.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-surface-300'}`} />
                {poller.isRunning && (
                  <div className="absolute inset-0 w-4 h-4 rounded-full bg-emerald-500 animate-ping opacity-75" />
                )}
              </div>
              <div>
                <span className="text-sm font-semibold text-surface-800">
                  Poller {poller.isRunning ? 'Running' : 'Stopped'}
                </span>
                <div className="flex items-center gap-1 text-xs text-surface-500">
                  <Activity size={10} />
                  <span>{poller.isRunning ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
            </div>

            {/* Polling Frequency */}
            <div className="flex items-center gap-3">
              <Timer size={16} className="text-surface-400" />
              <div>
                <span className="text-sm font-semibold text-surface-800">
                  {poller.intervalSeconds || 60}s
                </span>
                <div className="text-xs text-surface-500">Interval</div>
              </div>
            </div>

            {/* Last Poll */}
            {poller.isRunning && (
              <div className="flex items-center gap-3">
                <Clock size={16} className="text-surface-400" />
                <div>
                  <span className="text-sm font-semibold text-surface-800">
                    {poller.lastPollTimeDisplay || 'Never'}
                  </span>
                  <div className="text-xs text-surface-500">Last Poll</div>
                </div>
              </div>
            )}
          </div>

          {/* Right Side Info */}
          <div className="flex items-center gap-6">
            {/* Applications Count */}
            <div className="flex items-center gap-3">
              <Globe size={16} className="text-surface-400" />
              <div>
                <span className="text-sm font-semibold text-surface-800">{data.totalApps}</span>
                <div className="text-xs text-surface-500">Applications</div>
              </div>
            </div>

            {/* Manual Poll Button */}
            <button onClick={handlePollNow} disabled={polling}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 shadow-sm transition-all">
              {polling ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {polling ? 'Polling...' : 'Poll Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Applications Data Grid */}
      <div className="bg-white rounded-xl border border-surface-200 p-6">
        <h2 className="text-lg font-semibold text-surface-800 mb-4">Applications</h2>
        <ApplicationDataGrid
          applications={data.applications || []}
          searchTerm={searchTerm}
          filterStatus={filterStatus}
          onSearch={setSearchTerm}
          onFilter={setFilterStatus}
        />
      </div>
    </div>
  );
}
