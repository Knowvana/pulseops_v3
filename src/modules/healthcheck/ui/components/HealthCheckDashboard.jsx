// ============================================================================
// HealthCheckDashboard — Enterprise-Grade App Health Monitoring Dashboard
//
// PURPOSE: Professional real-time monitoring dashboard with:
//   1. Executive summary — KPIs, uptime %, health score
//   2. System health overview — status distribution, trends
//   3. Performance metrics — response times, SLA compliance
//   4. Live application grid — detailed per-app health with filtering
//   5. Poller status & controls — real-time polling management
//   6. Category breakdown — grouped health analysis
//
// USED BY: manifest.jsx → getViews() → dashboard
// ============================================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Activity, Loader2, RefreshCw, Zap, CheckCircle2, XCircle,
  HelpCircle, Play, Pause, Clock, ArrowRight, ExternalLink,
  Wifi, WifiOff, Timer, BarChart3, Globe, AlertCircle, TrendingUp,
  TrendingDown, Eye, Gauge, Layers, Filter, Search, Download,
  ChevronDown, ChevronUp, Info, Target,
} from 'lucide-react';
import { createLogger, TimezoneService } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import urls from '../config/urls.json';

const log = createLogger('HealthCheckDashboard.jsx');
const t = uiText.dashboard;
const tc = uiText.common;
const api = urls.api;

// ── Status icon helper ──────────────────────────────────────────────────────
function StatusIcon({ status, size = 16 }) {
  if (status === 'UP') return <CheckCircle2 size={size} className="text-emerald-500" />;
  if (status === 'DOWN') return <XCircle size={size} className="text-red-500" />;
  return <HelpCircle size={size} className="text-amber-500" />;
}

function StatusBadge({ status }) {
  const colors = {
    UP: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    DOWN: 'bg-red-50 text-red-700 border-red-200',
    UNKNOWN: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${colors[status] || colors.UNKNOWN}`}>
      {status === 'UP' ? tc.up : status === 'DOWN' ? tc.down : tc.unknown}
    </span>
  );
}

// ── Health Score Component ──────────────────────────────────────────────────
function HealthScoreGauge({ upCount, totalCount }) {
  const percentage = totalCount > 0 ? Math.round((upCount / totalCount) * 100) : 0;
  const getColor = (pct) => {
    if (pct >= 95) return 'text-emerald-600';
    if (pct >= 80) return 'text-amber-600';
    return 'text-red-600';
  };
  const getBgColor = (pct) => {
    if (pct >= 95) return 'from-emerald-50 to-emerald-100';
    if (pct >= 80) return 'from-amber-50 to-amber-100';
    return 'from-red-50 to-red-100';
  };
  
  return (
    <div className={`bg-gradient-to-br ${getBgColor(percentage)} rounded-xl border border-surface-200 p-6 shadow-sm`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge size={18} className={getColor(percentage)} />
          <span className="text-sm font-bold text-surface-700">Health Score</span>
        </div>
        <Info size={14} className="text-surface-400" />
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-4xl font-bold ${getColor(percentage)}`}>{percentage}</span>
        <span className="text-sm font-medium text-surface-600">%</span>
      </div>
      <div className="w-full bg-surface-200 rounded-full h-2 overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-300 ${
            percentage >= 95 ? 'bg-emerald-500' : percentage >= 80 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-surface-600 mt-3">{upCount} of {totalCount} apps operational</p>
    </div>
  );
}

// ── Metric Card Component ──────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, unit, trend, color = 'brand' }) {
  const colorClasses = {
    brand: 'text-brand-600 bg-brand-50 border-brand-200',
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    red: 'text-red-600 bg-red-50 border-red-200',
    amber: 'text-amber-600 bg-amber-50 border-amber-200',
    blue: 'text-blue-600 bg-blue-50 border-blue-200',
  };
  
  return (
    <div className={`bg-white rounded-xl border ${colorClasses[color]} border-opacity-50 p-5 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg ${colorClasses[color].split(' ')[1]} flex items-center justify-center`}>
          <Icon size={18} className={colorClasses[color].split(' ')[0]} />
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-xs font-medium text-surface-500 uppercase tracking-wide mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-surface-800">{value}</span>
        {unit && <span className="text-sm text-surface-500">{unit}</span>}
      </div>
    </div>
  );
}

export default function HealthCheckDashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const initRan = useRef(false);
  const sseRef = useRef(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await ApiClient.get(api.dashboard);
      if (res?.success) setData(res.data);
      else setError(res?.error?.message || tc.fetchError);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadDashboard();
  }, [loadDashboard]);

  // Live clock — update current time every second
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Connect to SSE stream for real-time poll completion events
  useEffect(() => {
    // Close existing connection if any
    if (sseRef.current) {
      sseRef.current.close();
    }

    const eventSource = new EventSource(`${api.pollEvents}`);
    sseRef.current = eventSource;

    eventSource.onopen = () => {
      log.debug('SSE connection established for poll events');
    };

    eventSource.onmessage = (event) => {
      try {
        const eventData = JSON.parse(event.data);
        
        if (eventData.type === 'poll_complete') {
          log.debug('Poll completion event received', { timestamp: eventData.timestamp });
          // Refresh dashboard immediately when poll completes
          loadDashboard(false);
        }
      } catch (err) {
        log.error('Failed to parse SSE event', { error: err.message });
      }
    };

    eventSource.onerror = (err) => {
      log.error('SSE connection error', { error: err.message });
      eventSource.close();
    };

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [loadDashboard]);

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

  // Compute filtered applications
  const filteredApps = useMemo(() => {
    if (!data?.applications) return [];
    return data.applications.filter(app => {
      const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           app.url.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || app.latestStatus === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [data?.applications, searchTerm, filterStatus]);

  // Group filtered apps by category
  const groupedByCategory = useMemo(() => {
    if (!filteredApps.length) return [];
    const groups = {};
    for (const app of filteredApps) {
      const catName = app.categoryName || 'Uncategorized';
      if (!groups[catName]) {
        groups[catName] = { name: catName, color: app.categoryColor || '#64748b', apps: [] };
      }
      groups[catName].apps.push(app);
    }
    return Object.values(groups);
  }, [filteredApps]);

  // Compute performance metrics
  const performanceMetrics = useMemo(() => {
    if (!data?.applications) return { avgResponseTime: 0, p95ResponseTime: 0, slaCompliance: 0 };
    const responseTimes = data.applications
      .filter(a => a.latestResponseMs != null)
      .map(a => a.latestResponseMs)
      .sort((a, b) => a - b);
    
    const avgResponseTime = responseTimes.length > 0 
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;
    const p95ResponseTime = responseTimes.length > 0
      ? responseTimes[Math.floor(responseTimes.length * 0.95)]
      : 0;
    const slaCompliance = data.applications.length > 0
      ? Math.round(data.applications.reduce((sum, a) => sum + (a.slaTargetPercent || 0), 0) / data.applications.length)
      : 0;

    return { avgResponseTime, p95ResponseTime, slaCompliance };
  }, [data?.applications]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center mb-4 animate-pulse">
          <Loader2 className="animate-spin text-brand-600" size={24} />
        </div>
        <p className="text-sm font-medium text-surface-600">{tc.loading}</p>
      </div>
    );
  }

  if (!data || data.totalApps === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
          <Activity size={28} className="text-surface-300" />
        </div>
        <h2 className="text-lg font-bold text-surface-700">{t.notConfiguredTitle}</h2>
        <p className="text-sm text-surface-400 mt-2 max-w-md">{t.notConfiguredSubtitle}</p>
        {onNavigate && (
          <button onClick={() => onNavigate('config')}
            className="mt-6 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 flex items-center gap-2 shadow-sm">
            {t.goToConfig} <ArrowRight size={14} />
          </button>
        )}
      </div>
    );
  }

  const poller = data.poller || {};

  return (
    <div className="space-y-6 animate-fade-in">
      <style jsx>{`
        @keyframes heartbeat {
          0% {
            transform: scale(1);
            opacity: 1;
            color: rgb(251, 146, 60);
          }
          25% {
            transform: scale(1.3);
            opacity: 0.8;
            color: rgb(251, 146, 60);
          }
          50% {
            transform: scale(1);
            opacity: 1;
            color: rgb(251, 146, 60);
          }
          75% {
            transform: scale(1.3);
            opacity: 0.8;
            color: rgb(251, 146, 60);
          }
          100% {
            transform: scale(1);
            opacity: 1;
            color: rgb(251, 146, 60);
          }
        }
        
        .animate-heartbeat {
          animation: heartbeat 2s ease-in-out infinite;
          color: rgb(251, 146, 60);
        }
      `}</style>
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* HEADER — Title Only */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
          <Activity size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-surface-900">{t.title}</h1>
          <p className="text-xs text-surface-500">{t.subtitle}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* POLLER STATUS — Monitor poller status, timing, and manual controls */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm">
        <div className="px-5 py-3 border-b border-surface-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-surface-800 flex items-center gap-2">
                <Activity size={16} className="text-orange-500 animate-heartbeat" />
                Poller Status
              </h3>
              <div className={`w-2 h-2 rounded-full ${poller.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-surface-300'}`} />
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${poller.isRunning ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-100 text-surface-500'}`}>
                {poller.isRunning ? t.poller.running : t.poller.stopped}
              </span>
              {poller.intervalSeconds && (
                <div className="flex items-center gap-1 text-xs text-surface-600">
                  <Clock size={12} />
                  <span>Polling Frequency: {poller.intervalSeconds}s</span>
                </div>
              )}
            </div>
            <p className="text-xs text-surface-500">Monitor poller status, timing, and manual controls</p>
          </div>
        </div>
        <div className="p-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Current Time */}
            <div className="flex items-center gap-2 text-sm min-w-[240px]">
              <span className="text-surface-500">Current Time ({TimezoneService.getTimezoneLabel()}):</span>
              <Clock size={14} className="text-surface-600" />
              <span className="font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {TimezoneService.formatTime(currentTime.toISOString())}
              </span>
            </div>

            {/* Gradient Separator */}
            <div className="hidden lg:block w-px h-6 bg-gradient-to-b from-transparent via-surface-200 to-transparent" />

            {/* Last Poll */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-surface-500">{t.poller.lastPoll} ({poller.timezoneLabel || 'IST'}):</span>
              <span className="font-medium text-surface-800">
                {poller.lastPollTimeDisplay || t.poller.notStarted}
              </span>
            </div>

            {/* Poll Now Button */}
            <div className="flex items-center ml-auto">
              <button onClick={handlePollNow} disabled={polling}
                className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-colors">
                {polling ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                {t.pollNow}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* EXECUTIVE SUMMARY — KPIs & HEALTH SCORE */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <HealthScoreGauge upCount={data.appsUp} totalCount={data.totalApps} />
        <MetricCard icon={Globe} label="Total Apps" value={data.totalApps} color="brand" />
        <MetricCard icon={CheckCircle2} label="Apps UP" value={data.appsUp} color="emerald" />
        <MetricCard icon={XCircle} label="Apps DOWN" value={data.appsDown} color="red" />
      </div>

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* PERFORMANCE METRICS */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard 
          icon={Timer} 
          label="Avg Response Time" 
          value={performanceMetrics.avgResponseTime} 
          unit="ms" 
          color="blue"
        />
        <MetricCard 
          icon={Gauge} 
          label="P95 Response Time" 
          value={performanceMetrics.p95ResponseTime} 
          unit="ms" 
          color="amber"
        />
        <MetricCard 
          icon={Target} 
          label="Avg SLA Compliance" 
          value={performanceMetrics.slaCompliance} 
          unit="%" 
          color="emerald"
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* CATEGORY BREAKDOWN — Health by Category */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {data.categories && data.categories.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-surface-800 mb-4 flex items-center gap-2">
            <Layers size={16} className="text-brand-600" />
            Health by Category
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.categories.map(cat => (
              <div 
                key={cat.name} 
                className="p-4 bg-surface-50 rounded-lg border border-surface-200 hover:border-surface-300 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => setExpandedCategory(expandedCategory === cat.name ? null : cat.name)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-3 h-10 rounded-full" style={{ backgroundColor: cat.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-surface-800">{cat.name}</p>
                      <p className="text-xs text-surface-500 mt-0.5">{cat.total} apps</p>
                    </div>
                  </div>
                  {expandedCategory === cat.name ? <ChevronUp size={14} className="text-surface-400" /> : <ChevronDown size={14} className="text-surface-400" />}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 size={12} className="text-emerald-600" />
                    <span className="font-medium text-emerald-700">{cat.up}</span>
                  </div>
                  {cat.down > 0 && (
                    <div className="flex items-center gap-1">
                      <XCircle size={12} className="text-red-600" />
                      <span className="font-medium text-red-700">{cat.down}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* LIVE APPLICATION GRID — Detailed Health Status */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm">
        <div className="px-5 py-4 border-b border-surface-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-surface-800 flex items-center gap-2">
                <Eye size={16} className="text-brand-600" />
                Live Application Status
              </h3>
              <p className="text-xs text-surface-500 mt-1">Real-time health monitoring of all configured applications</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 lg:flex-none">
                <Search size={14} className="absolute left-3 top-2.5 text-surface-400" />
                <input 
                  type="text" 
                  placeholder="Search apps..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 text-xs border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
              >
                <option value="all">All Status</option>
                <option value="UP">UP</option>
                <option value="DOWN">DOWN</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>
          </div>
        </div>

        {groupedByCategory.length > 0 ? (
          <div className="divide-y divide-surface-100">
            {groupedByCategory.map(group => (
              <div key={group.name}>
                {/* Category Header */}
                <div className="flex items-center gap-3 px-5 py-3 bg-surface-50/70">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: group.color }}>{group.name}</span>
                  <span className="text-xs text-surface-400">{group.apps.length} app{group.apps.length !== 1 ? 's' : ''}</span>
                  <div className="flex items-center gap-2 ml-auto text-xs">
                    <span className="text-emerald-600 font-medium">{group.apps.filter(a => a.latestStatus === 'UP').length} UP</span>
                    {group.apps.filter(a => a.latestStatus === 'DOWN').length > 0 && (
                      <span className="text-red-600 font-medium">{group.apps.filter(a => a.latestStatus === 'DOWN').length} DOWN</span>
                    )}
                  </div>
                </div>
                {/* Apps Table for this category */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-100">
                        <th className="px-5 py-2 text-left font-semibold text-surface-500 text-xs">{tc.status}</th>
                        <th className="px-5 py-2 text-left font-semibold text-surface-500 text-xs">{tc.name}</th>
                        <th className="px-5 py-2 text-center font-semibold text-surface-500 text-xs">{t.liveStatus.httpCode}</th>
                        <th className="px-5 py-2 text-center font-semibold text-surface-500 text-xs">{t.liveStatus.responseTime}</th>
                        <th className="px-5 py-2 text-left font-semibold text-surface-500 text-xs">{t.liveStatus.lastChecked}</th>
                        <th className="px-5 py-2 text-left font-semibold text-surface-500 text-xs">{t.liveStatus.error}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.apps.map(app => (
                        <tr key={app.id} className={`border-b border-surface-50 hover:bg-surface-50/50 transition-colors ${app.latestStatus === 'DOWN' ? 'bg-red-50/40' : ''}`}>
                          <td className="px-5 py-3">
                            <StatusBadge status={app.latestStatus} />
                          </td>
                          <td className="px-5 py-3">
                            <div>
                              <p className="font-medium text-surface-800">{app.name}</p>
                              <a href={app.url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 mt-0.5">
                                {app.url} <ExternalLink size={10} />
                              </a>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-center">
                            {app.latestHttpCode ? (
                              <span className={`font-mono font-medium text-sm ${app.latestHttpCode >= 200 && app.latestHttpCode < 300 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {app.latestHttpCode}
                              </span>
                            ) : <span className="text-surface-300">—</span>}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {app.latestResponseMs != null ? (
                              <span className={`font-mono text-sm font-medium ${app.latestResponseMs > 5000 ? 'text-red-600' : app.latestResponseMs > 2000 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {app.latestResponseMs}ms
                              </span>
                            ) : <span className="text-surface-300">—</span>}
                          </td>
                          <td className="px-5 py-3 text-sm text-surface-500">
                            {app.lastPolledAt ? TimezoneService.formatTime(app.lastPolledAt) : '—'}
                          </td>
                          <td className="px-5 py-3 text-sm text-red-600 max-w-xs truncate" title={app.latestError || ''}>
                            {app.latestError || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Eye size={32} className="mx-auto text-surface-300 mb-3" />
            <p className="text-sm text-surface-500">{searchTerm || filterStatus !== 'all' ? 'No applications match your filters' : t.liveStatus.noApps}</p>
          </div>
        )}
      </div>
    </div>
  );
}
