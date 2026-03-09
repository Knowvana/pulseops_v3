// ============================================================================
// LogManager — PulseOps V2 Core
//
// PURPOSE: Native core view for viewing real-time platform logs, API calls,
// and system diagnostics. This is NOT a dynamic module — it is a hard-routed
// core view.
//
// FEATURES:
//   - Log type selector (UI Logs / API Logs) - toggles between frontend and backend logs
//   - Search bar + level filters (All, Debug, Info, Warn, Error) - filters logs by content and severity
//   - Stats bar showing log source, last sync, entry count - displays current log statistics
//   - Enterprise grid with sorting, column resizing, pagination - interactive log data table
//   - Slide-out detail panel with formatted JSON for request/response - detailed log inspection
//   - Refresh and delete-all actions with confirmation - data management controls
//   - Database setup alerts - guides users when database is not configured
//   - Logging disabled alerts - prompts when logging is turned off globally
//   - No page-level scrollbar — only grid + detail panel scroll - optimized layout
//
// UI INTERACTIONS:
//   - Click UI/API toggle: Switches between frontend (UI) and backend (API) logs
//   - Click level filters: Filters logs by severity level (debug, info, warn, error, all)
//   - Type in search: Client-side search across message, transaction ID, session ID, correlation ID
//   - Click log row: Opens detail panel with full log information and JSON formatting
//   - Click column headers: Sorts logs by that column (ascending/descending)
//   - Drag column edges: Resizes column widths for better readability
//   - Click pagination: Navigates through log pages (configurable page sizes)
//   - Click refresh: Fetches latest logs and updates statistics
//   - Click delete all: Shows confirmation modal, then permanently deletes all logs
//   - Database not setup alert: Appears when database tables don't exist, navigates to setup
//   - Logs disabled alert: Appears when logging is globally disabled, navigates to settings
//
// ROUTE: /logs
//
// ARCHITECTURE: Reads all text from uiElementsText.json. Uses shared components
// exclusively. No inline hardcoded strings.
//
// DEPENDENCIES:
//   - @config/uiElementsText.json → All UI labels
//   - @config/UIMessages.json     → Success/error messages
//   - @config/urls.json           → API endpoints and UI routes
//   - @shared → LogViewer, LogStats, ConfirmationModal, ConfigurationAlertModal
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScrollText, AlertTriangle, Settings as SettingsIcon } from 'lucide-react';
import { LogViewer, LogStats, ConfirmationModal, ConfigurationAlertModal, createLogger } from '@shared';
import uiText from '@config/uiElementsText.json';
import uiMessages from '@config/UIMessages.json';
import urls from '@config/urls.json';

const log = createLogger('LogManager.jsx');

const viewText = uiText.coreViews.logs;
const logTypeText = viewText.logTypes;
// urls.logs.* paths already include /api prefix (e.g. /api/logs/api)
// Vite proxy forwards /api/* to backend - use empty base to avoid double /api/api
const apiBase = '';

export default function LogManager() {
  const navigate = useNavigate();
  // ── StrictMode-safe refs ─────────────────────────────────────────────────
  const mountRan = useRef(false);    // Prevents double-mount fetch in React StrictMode
  const ready = useRef(false);       // True after initial fetch completes — gates Effects 2+

  // ── State ────────────────────────────────────────────────────────────────
  // UI State - Controls what users see and interact with
  const [logType, setLogType] = useState('api');           // 'ui' or 'api' - controls which logs are displayed
  const [logs, setLogs] = useState([]);                   // Array of log entries fetched from API
  const [stats, setStats] = useState({ storage: 'file', count: 0, lastSync: null }); // Log statistics (count, storage type, last sync time)
  const [isLoading, setIsLoading] = useState(false);      // Shows loading spinner while fetching logs
  const [levelFilter, setLevelFilter] = useState('all');  // 'all', 'debug', 'info', 'warn', 'error' - filters by severity
  const [searchTerm, setSearchTerm] = useState('');       // Client-side search across multiple fields
  
  // Modal/Dialog State - Controls popup visibility
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // Shows delete confirmation modal
  const [isDeleting, setIsDeleting] = useState(false);     // Shows loading during delete operation
  const [isRefreshing, setIsRefreshing] = useState(false); // Shows loading during refresh operation
  
  // Configuration State - Determines what alerts to show
  const [logConfig, setLogConfig] = useState(null);        // Logging configuration (enabled/disabled, etc.)
  const [dbNotSetup, setDbNotSetup] = useState(false);     // True when database tables don't exist - shows setup alert
  // Search is pure client-side — LogViewer filters in-memory via useMemo.
  // No debounce or server-side search needed; eliminates per-keystroke API calls.

  // ── Fetch functions (stable refs) ──────────────────────────────────────────
  const fetchLogs = useCallback(async (type, level) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (level !== 'all') params.set('level', level);
      params.set('limit', '500');
      const endpoint = type === 'ui' ? urls.logs.ui : urls.logs.api;
      const res = await fetch(`${apiBase}${endpoint}?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setLogs(json.data.logs || []);
        setDbNotSetup(false);
      } else {
        setLogs([]);
        // Check if error indicates database not setup
        if (json.error?.message?.includes('does not exist') || 
            json.error?.message?.includes('relation') ||
            json.error?.message?.includes('schema')) {
          setDbNotSetup(true);
        }
        log.warn('fetchLogs', 'Logs fetch returned unsuccessful response');
      }
    } catch (err) {
      setLogs([]);
      log.error('fetchLogs', 'Failed to fetch logs', { message: err.message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}${urls.logs.stats}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        const total = (d.ui?.count || 0) + (d.api?.count || 0);
        const storage = d.ui?.storage || d.api?.storage || 'file';
        setStats({
          storage,
          count: total,
          lastSync: d.ui?.lastEntry || d.api?.lastEntry || d.ui?.lastModified || d.api?.lastModified || null,
        });
        // Database Setup Alert Logic:
        // Shows "Database Not Configured" modal when:
        // - Storage is 'database' (configured for database logging)
        // - Total log count is 0 (no logs exist)
        // - No lastEntry timestamps (tables exist but are empty)
        // This indicates database schema exists but no logs have been written yet
        if (storage === 'database' && total === 0 && !d.ui?.lastEntry && !d.api?.lastEntry) {
          setDbNotSetup(true);
        } else {
          setDbNotSetup(false);
        }
      } else if (!json.success) {
        // API Error Alert Logic:
        // Shows setup modal if error indicates database schema issues
        // Checks for common database error messages
        if (json.error?.message?.includes('does not exist') || 
            json.error?.message?.includes('relation') ||
            json.error?.message?.includes('schema') ||
            json.error?.message?.includes('database')) {
          setDbNotSetup(true);
        }
      }
    } catch (err) {
      log.warn('fetchStats', 'Failed to fetch stats', { message: err.message });
      // Network Error Alert Logic:
      // Network failures might indicate database connectivity issues
      setDbNotSetup(true);
    }
  }, []);

  const fetchLogConfig = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}${urls.logs.config}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) setLogConfig(json.data);
    } catch { /* keep null */ }
  }, []);

  // ── Effect 1: Mount once (StrictMode-safe) — log access + initial fetch ──
  useEffect(() => {
    if (mountRan.current) return;
    mountRan.current = true;
    log.info('mount', 'Log Manager page accessed');
    fetchLogConfig();
    fetchLogs('api', 'all');
    fetchStats();
    // Mark ready after a tick so Effects 2+ skip the initial render cycle
    queueMicrotask(() => { ready.current = true; });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2: Re-fetch logs + stats when level filter or logType change ──
  // Search is NOT a dependency — it is handled client-side in LogViewer.
  useEffect(() => {
    if (!ready.current) return;
    fetchLogs(logType, levelFilter);
    fetchStats();
  }, [logType, levelFilter, fetchLogs, fetchStats]);

  // ── Event Handlers ────────────────────────────────────────────────────────
  // handleRefresh - Triggered by clicking the refresh button in stats bar
  // Refetches logs, stats, and config from server, clears search term for fresh data
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setSearchTerm('');             // Clear search to get full fresh dataset
    try {
      await Promise.all([
        fetchLogs(logType, levelFilter),
        fetchStats(),
        fetchLogConfig(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [logType, levelFilter, fetchLogs, fetchStats, fetchLogConfig]);

  // handleDelete - Triggered by confirming delete in the confirmation modal
  // Permanently deletes all logs for current logType, handles backward compatibility
  // Returns count of deleted entries for success feedback
  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`${apiBase}${urls.logs.deleteAll}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      let uiDeleted = 0;
      let apiDeleted = 0;

      // Backward-compat: older API builds may not implement DELETE /logs
      if (res.status === 404) {
        const [uiRes, apiRes] = await Promise.all([
          fetch(`${apiBase}${urls.logs.ui}`, { method: 'DELETE', credentials: 'include' }),
          fetch(`${apiBase}${urls.logs.api}`, { method: 'DELETE', credentials: 'include' }),
        ]);

        const uiJson = await uiRes.json();
        const apiJson = await apiRes.json();
        if (!uiJson.success || !apiJson.success) {
          throw new Error(uiJson?.error?.message || apiJson?.error?.message || uiMessages?.logs?.deleteFailed || 'Failed to delete logs');
        }

        uiDeleted = uiJson?.data?.deleted ?? 0;
        apiDeleted = apiJson?.data?.deleted ?? 0;
      } else {
        const json = await res.json();
        if (!json.success) {
          throw new Error(json?.error?.message || uiMessages?.logs?.deleteFailed || 'Failed to delete logs');
        }

        uiDeleted = json?.data?.ui?.deleted ?? 0;
        apiDeleted = json?.data?.api?.deleted ?? 0;
      }

      const totalDeleted = uiDeleted + apiDeleted;

      setLogs([]);
      fetchStats();
      fetchLogs(logType, levelFilter);
      return { uiDeleted, apiDeleted, totalDeleted };
    } catch (err) {
      log.error('handleDelete', 'Failed to delete logs', { message: err.message });
      throw err;
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [logType, levelFilter, fetchLogs, fetchStats]);

  const logsDisabled = logConfig !== null && logConfig.enabled === false;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-full animate-fade-in overflow-hidden">
      {/* Database Not Setup Alert - HIGHEST PRIORITY OVERLAY */}
      {/* Appears when dbNotSetup is true - covers entire view with modal */}
      {/* Shows when database tables don't exist or are empty after setup */}
      {/* Button navigates to Platform Admin → Database Setup (dedicated view) */}
      <ConfigurationAlertModal
        isOpen={dbNotSetup}
        icon={AlertTriangle}
        header="Database Not Configured"
        messageDetail="The database schema has not been initialized. Please configure the database first from Platform Admin → Settings → Database Setup."
        actionIcon={SettingsIcon}
        actionText="Go to Database Setup"
        onAction={() => navigate(urls.UIRoutes.platformAdmin.databaseSetup)}
        variant="error"
      />

      {/* Logs Disabled Alert - SECOND PRIORITY OVERLAY */}
      {/* Appears when logsDisabled is true AND dbNotSetup is false */}
      {/* Shows when logging is globally disabled in configuration */}
      {/* Button navigates to Platform Admin → Settings → Log Configuration */}
      {!dbNotSetup && logsDisabled && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface-50/90 backdrop-blur-sm rounded-xl">
          <div className="bg-white border border-amber-200 rounded-2xl shadow-xl p-8 max-w-md mx-4 text-center space-y-4">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle size={28} className="text-amber-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-surface-800 mb-1">Logs Not Enabled</h3>
              <p className="text-sm text-surface-500">
                Database logging is currently disabled. Enable it from
                {' '}<strong>Platform Admin → Settings → Log Configuration</strong>.
              </p>
            </div>
            <button
              onClick={() => navigate(urls.UIRoutes.platformAdmin.settings)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-xl hover:bg-brand-600 transition-colors"
            >
              <SettingsIcon size={15} />
              Go to Log Configuration
            </button>
          </div>
        </div>
      )}

      {/* Page Header - ALWAYS VISIBLE */}
      {/* Shows page title and description, positioned at top */}
      <div className="flex items-center gap-3 flex-shrink-0 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center shadow-sm">
          <ScrollText size={20} className="text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-surface-800">{viewText.title}</h1>
          <p className="text-sm text-surface-500 mt-0.5">{viewText.subtitle}</p>
        </div>
      </div>

      {/* Stats Bar - ALWAYS VISIBLE */}
      {/* Shows log count, storage type, last sync time, refresh/delete buttons */}
      {/* Refresh button: Triggers handleRefresh, shows loading spinner */}
      {/* Delete button: Triggers setShowDeleteConfirm(true) to show confirmation modal */}
      <div className="flex-shrink-0 mb-3">
        <LogStats
          storage={stats.storage}
          count={stats.count}
          lastSync={stats.lastSync || stats.lastModified || stats.lastEntry}
          onRefresh={handleRefresh}
          onDelete={() => setShowDeleteConfirm(true)}
          isLoading={isLoading}
          isRefreshing={isRefreshing}
        />
      </div>

      {/* Log Grid + Detail Panel - MAIN CONTENT AREA */}
      {/* Contains LogViewer component with all log display functionality */}
      {/* LogViewer handles: log type selection, level filters, search, grid display, pagination, detail panel */}
      <LogViewer
        logs={logs}
        logType={logType}
        isLoading={isLoading}
        totalCount={stats.count}
        onLogTypeChange={setLogType}
        levelFilter={levelFilter}
        onLevelFilterChange={setLevelFilter}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      {/* Delete Confirmation Modal - TRIGGERED BY DELETE BUTTON */}
      {/* Shows detailed confirmation with log counts and datasource info */}
      {/* Confirm action calls handleDelete, success refreshes data */}
      {(() => {
        const isFile = stats.storage === 'file';
        const dsType = isFile ? 'JSON File' : 'Database';
        const logsTable = logConfig?.database?.logsTable || 'system_logs';
        const dsUiName = isFile
          ? (logConfig?.file?.uiLogsPath || 'logs/ui-logs.json')
          : `${logsTable} (UI)`;
        const dsApiName = isFile
          ? (logConfig?.file?.apiLogsPath || 'logs/api-logs.json')
          : `${logsTable} (API)`;
        const entryCount = stats.count || 0;

        return (
          <ConfirmationModal
            isOpen={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            title={viewText.stats.deleteConfirmTitle}
            actionDescription={`delete all ${logTypeText.ui} and ${logTypeText.api} permanently`}
            actionTarget="Log Datasource"
            actionDetails={[
              { label: 'DataSource (UI)', value: `${dsType} (${dsUiName})` },
              { label: 'DataSource (API)', value: `${dsType} (${dsApiName})` },
              { label: 'Entries to be Deleted', value: String(entryCount) },
            ]}
            confirmLabel={viewText.stats.deleteButton}
            action={handleDelete}
            onSuccess={() => {
              fetchLogs(logType, levelFilter);
              fetchStats();
            }}
            variant="danger"
            buildSummary={(result) => [
              { label: 'Log Type', value: `${logTypeText.ui} + ${logTypeText.api}` },
              { label: 'DataSource (UI)', value: `${dsType} (${dsUiName})` },
              { label: 'DataSource (API)', value: `${dsType} (${dsApiName})` },
              { label: 'Entries Deleted', value: String(result?.totalDeleted ?? entryCount) },
              { label: 'Status', value: 'All logs deleted successfully' },
            ]}
          />
        );
      })()}
    </div>
  );
}
