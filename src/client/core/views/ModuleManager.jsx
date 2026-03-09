// ============================================================================
// ModuleManager — PulseOps V2 Core
//
// PURPOSE: Native core view for managing platform modules. Allows admins
// to discover, install, enable, disable, and remove hot-drop micro-frontend
// modules. This is NOT a dynamic module — it is a hard-routed core view.
//
// ARCHITECTURE:
//   Tab 1 — Available: Scans dist-modules/ for available modules (not yet installed)
//   Tab 2 — Installed: Lists installed modules with enable/disable/remove actions
//
// ZERO-DOWNTIME FLOW:
//   1. Developer builds module: npm run build:module <name>
//   2. Output goes to dist-modules/<name>/ (constants.json + manifest.js + api/)
//   3. Admin opens Module Manager → Available tab → clicks Install
//   4. Module appears in Installed tab → clicks Enable
//   5. API routes are loaded dynamically (zero restart)
//   6. UI manifest is fetched via hot-drop URL (zero rebuild)
//   7. Module appears in top nav immediately
//
// ROUTE: /modules
//
// DEPENDENCIES:
//   - @config/uiElementsText.json → All UI labels
//   - @config/urls.json           → API endpoint URLs
//   - @shared                     → Design system components + logger
// ============================================================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, Search, Download, Power, PowerOff, Trash2, RefreshCw,
  CheckCircle2, XCircle, AlertCircle, AlertTriangle, Loader2, Server, Monitor,
  ChevronRight, Info, Settings as SettingsIcon
} from 'lucide-react';
import { createLogger, ConfigurationAlertModal } from '@shared';
import ModuleSchemaSetup from '../components/ModuleSchemaSetup';
import uiText from '@config/uiElementsText.json';
import urls from '@config/urls.json';

const viewText = uiText.coreViews.moduleManager;
const log = createLogger('ModuleManager.jsx');

// ── Helper: build URL with :id parameter ────────────────────────────────────
function buildUrl(template, id) {
  return template.replace('{id}', id);
}

// ── Helper: API fetch with credentials ──────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  const json = await res.json();
  return { ok: res.ok, status: res.status, ...json };
}

export default function ModuleManager({ onModulesChanged }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('available');
  const [availableModules, setAvailableModules] = useState([]);
  const [installedModules, setInstalledModules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // moduleId currently being acted on
  const [toast, setToast] = useState(null);
  const [dbNotSetup, setDbNotSetup] = useState(false);
  const [schemaSetup, setSchemaSetup] = useState(null); // { moduleId, moduleName, schemaPreview }
  const initRan = useRef(false);
  const dbCheckRan = useRef(false);

  log.debug('render', 'Module Manager rendered', { activeTab });

  // ── DB availability check on mount ──────────────────────────────────────
  useEffect(() => {
    if (dbCheckRan.current) return;
    dbCheckRan.current = true;
    (async () => {
      try {
        const res = await fetch(urls.database.status, { credentials: 'include' });
        const json = await res.json();
        if (json.success && json.data) {
          setDbNotSetup(!json.data.dbAvailable || !json.data.schemaInitialized);
        }
      } catch {
        log.warn('dbCheck', 'DB status check failed');
        setDbNotSetup(true);
      }
    })();
  }, []);

  // ── Toast auto-dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ── Fetch available modules (scan dist-modules/) ──────────────────────────
  const fetchAvailable = useCallback(async () => {
    log.debug('fetchAvailable', 'Scanning for available modules...');
    setLoading(true);
    try {
      const result = await apiFetch(urls.modules.available);
      if (result.success) {
        setAvailableModules(result.data || []);
        log.info('fetchAvailable', `Found ${(result.data || []).length} available module(s)`);
      }
    } catch (err) {
      log.error('fetchAvailable', 'Failed to scan modules', { error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch installed modules ───────────────────────────────────────────────
  const fetchInstalled = useCallback(async () => {
    log.debug('fetchInstalled', 'Fetching installed modules...');
    setLoading(true);
    try {
      const result = await apiFetch(urls.modules.list);
      if (result.success) {
        setInstalledModules(result.data || []);
        log.info('fetchInstalled', `Found ${(result.data || []).length} installed module(s)`);
      }
    } catch (err) {
      log.error('fetchInstalled', 'Failed to fetch installed modules', { error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    fetchAvailable();
    fetchInstalled();
  }, [fetchAvailable, fetchInstalled]);

  // ── Module actions ────────────────────────────────────────────────────────
  const performAction = useCallback(async (action, moduleId, method = 'POST') => {
    setActionLoading(moduleId);
    log.info('performAction', `${action} module '${moduleId}'`);

    try {
      // ── Install interceptor: check for module schema before installing ────
      if (action === 'install') {
        const schemaUrl = buildUrl(urls.modules.schema, moduleId);
        const schemaRes = await apiFetch(schemaUrl);
        if (schemaRes.success && schemaRes.data?.hasSchema && !schemaRes.data?.schemaInitialized) {
          // Module has un-provisioned schema — show setup dialog before install
          const modMeta = [...availableModules, ...installedModules].find(m => m.id === moduleId);
          setSchemaSetup({
            moduleId,
            moduleName: modMeta?.name || moduleId,
            schemaPreview: schemaRes.data,
            action: 'install', // Flag to indicate this is for install, not enable
          });
          setActionLoading(null);
          log.info('performAction', `install '${moduleId}' — schema required, showing setup dialog`);
          return;
        }
      }

      // ── Remove interceptor: check for module schema before removing ────
      if (action === 'remove') {
        const schemaUrl = buildUrl(urls.modules.schema, moduleId);
        const schemaRes = await apiFetch(schemaUrl);
        if (schemaRes.success && schemaRes.data?.hasSchema && schemaRes.data?.schemaInitialized) {
          // Module has provisioned schema — show deletion dialog before remove
          const modMeta = [...availableModules, ...installedModules].find(m => m.id === moduleId);
          setSchemaSetup({
            moduleId,
            moduleName: modMeta?.name || moduleId,
            schemaPreview: schemaRes.data,
            action: 'remove', // Flag to indicate this is for remove (schema deletion)
          });
          setActionLoading(null);
          log.info('performAction', `remove '${moduleId}' — schema deletion required, showing confirmation dialog`);
          return;
        }
      }

      let url;
      switch (action) {
        case 'install': url = buildUrl(urls.modules.install, moduleId); break;
        case 'enable':  url = buildUrl(urls.modules.enable, moduleId);  break;
        case 'disable': url = buildUrl(urls.modules.disable, moduleId); break;
        case 'remove':  url = buildUrl(urls.modules.remove, moduleId);  break;
        default: return;
      }

      const result = await apiFetch(url, { method });

      if (result.ok !== false && result.success) {
        const toastKey = `${action}Success`;
        setToast({ type: 'success', message: viewText.toast[toastKey] || result.message });
        log.info('performAction', `${action} '${moduleId}' — success`);

        // Refresh both lists
        await Promise.all([fetchAvailable(), fetchInstalled()]);

        // Notify parent (PlatformDashboard) to reload module manifests
        if (typeof onModulesChanged === 'function' && ['enable', 'disable', 'remove'].includes(action)) {
          onModulesChanged();
        }
      } else {
        setToast({ type: 'error', message: result.error?.message || viewText.toast.actionFailed });
        log.error('performAction', `${action} '${moduleId}' — failed`, { error: result.error });
      }
    } catch (err) {
      setToast({ type: 'error', message: viewText.toast.actionFailed });
      log.error('performAction', `${action} '${moduleId}' — exception`, { error: err.message });
    } finally {
      setActionLoading(null);
    }
  }, [fetchAvailable, fetchInstalled, onModulesChanged, availableModules, installedModules]);

  // ── Schema setup/deletion complete handler ────────────────────────────────
  // After schema tables are created/deleted, proceed with the next action.
  const handleSchemaComplete = useCallback(async () => {
    if (!schemaSetup) return;
    const { moduleId, action: schemaAction } = schemaSetup;
    setSchemaSetup(null);
    setActionLoading(moduleId);

    try {
      if (schemaAction === 'install') {
        // Schema was created during install — now proceed to install the module
        log.info('handleSchemaComplete', `Schema created for '${moduleId}' — now installing...`);
        const url = buildUrl(urls.modules.install, moduleId);
        const result = await apiFetch(url, { method: 'POST' });
        if (result.ok !== false && result.success) {
          setToast({ type: 'success', message: viewText.toast.installSuccess || result.message });
          log.info('handleSchemaComplete', `install '${moduleId}' — success`);
          await Promise.all([fetchAvailable(), fetchInstalled()]);
          if (typeof onModulesChanged === 'function') onModulesChanged();
        } else {
          setToast({ type: 'error', message: result.error?.message || viewText.toast.actionFailed });
          log.error('handleSchemaComplete', `install '${moduleId}' — failed`, { error: result.error });
        }
      } else if (schemaAction === 'remove') {
        // Schema was deleted during remove — now proceed to remove the module
        log.info('handleSchemaComplete', `Schema deleted for '${moduleId}' — now removing...`);
        const url = buildUrl(urls.modules.remove, moduleId);
        const result = await apiFetch(url, { method: 'DELETE' });
        if (result.ok !== false && result.success) {
          setToast({ type: 'success', message: viewText.toast.removeSuccess || result.message });
          log.info('handleSchemaComplete', `remove '${moduleId}' — success`);
          await Promise.all([fetchAvailable(), fetchInstalled()]);
          if (typeof onModulesChanged === 'function') onModulesChanged();
        } else {
          setToast({ type: 'error', message: result.error?.message || viewText.toast.actionFailed });
          log.error('handleSchemaComplete', `remove '${moduleId}' — failed`, { error: result.error });
        }
      }
    } catch (err) {
      setToast({ type: 'error', message: viewText.toast.actionFailed });
      log.error('handleSchemaComplete', `${schemaAction} '${moduleId}' — exception`, { error: err.message });
    } finally {
      setActionLoading(null);
    }
  }, [schemaSetup, fetchAvailable, fetchInstalled, onModulesChanged]);

  // ── Module Card Component ─────────────────────────────────────────────────
  const ModuleCard = ({ mod, mode }) => {
    const isActing = actionLoading === mod.id;
    const isInstalled = mod.installed === true;
    const isEnabled = mod.enabled === true;

    return (
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
        {/* Card Header */}
        <div className="p-4 border-b border-surface-100">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isEnabled ? 'bg-emerald-50' : isInstalled ? 'bg-amber-50' : 'bg-surface-100'
              }`}>
                <Package size={20} className={
                  isEnabled ? 'text-emerald-600' : isInstalled ? 'text-amber-600' : 'text-surface-400'
                } />
              </div>
              <div>
                <h3 className="text-sm font-bold text-surface-800">{mod.name || mod.id}</h3>
                <p className="text-xs text-surface-400">v{mod.version || '1.0.0'}</p>
              </div>
            </div>
            {/* Status Badge */}
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              isEnabled
                ? 'bg-emerald-50 text-emerald-700'
                : isInstalled
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-surface-100 text-surface-500'
            }`}>
              {isEnabled ? viewText.status.enabled : isInstalled ? viewText.status.disabled : viewText.status.notInstalled}
            </span>
          </div>
          {mod.description && (
            <p className="text-xs text-surface-500 mt-2 line-clamp-2">{mod.description}</p>
          )}
        </div>

        {/* Card Body — Capabilities */}
        <div className="px-4 py-2 flex items-center gap-3 text-[11px] text-surface-400 border-b border-surface-50">
          {mod.hasManifest && (
            <span className="flex items-center gap-1">
              <Monitor size={12} className="text-blue-400" /> {viewText.status.uiBundle}
            </span>
          )}
          {mod.hasApi && (
            <span className="flex items-center gap-1">
              <Server size={12} className="text-violet-400" /> {viewText.status.apiBundle}
            </span>
          )}
          {mod.apiRoutesLoaded && (
            <span className="flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-500" /> {viewText.status.apiLoaded}
            </span>
          )}
        </div>

        {/* Card Footer — Actions */}
        <div className="px-4 py-3 flex items-center justify-end gap-2">
          {mode === 'available' && !isInstalled && (
            <button
              onClick={() => performAction('install', mod.id)}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {isActing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {viewText.actions.install}
            </button>
          )}

          {mode === 'available' && isInstalled && !isEnabled && (
            <button
              onClick={() => performAction('enable', mod.id)}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {isActing ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
              {viewText.actions.enable}
            </button>
          )}

          {mode === 'available' && isInstalled && isEnabled && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600">
              <CheckCircle2 size={14} /> {viewText.status.enabled}
            </span>
          )}

          {mode === 'installed' && isEnabled && (
            <button
              onClick={() => performAction('disable', mod.id)}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              {isActing ? <Loader2 size={14} className="animate-spin" /> : <PowerOff size={14} />}
              {viewText.actions.disable}
            </button>
          )}

          {mode === 'installed' && !isEnabled && (
            <>
              <button
                onClick={() => performAction('enable', mod.id)}
                disabled={isActing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                  bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {isActing ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                {viewText.actions.enable}
              </button>
              <button
                onClick={() => performAction('remove', mod.id, 'DELETE')}
                disabled={isActing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                  bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                {isActing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {viewText.actions.remove}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative space-y-6 animate-fade-in">
      {/* Database Not Setup Alert */}
      <ConfigurationAlertModal
        isOpen={dbNotSetup}
        icon={AlertTriangle}
        header="Database Not Configured"
        messageDetail="Module management requires a database connection. Please configure the database first from Platform Admin → Settings → Database Setup."
        actionIcon={SettingsIcon}
        actionText="Go to Database Setup"
        onAction={() => navigate(urls.UIRoutes.platformAdmin.databaseSetup)}
        variant="error"
      />

      {/* Module Schema Setup Dialog */}
      <ModuleSchemaSetup
        isOpen={!!schemaSetup}
        moduleId={schemaSetup?.moduleId}
        moduleName={schemaSetup?.moduleName}
        schemaPreview={schemaSetup?.schemaPreview}
        mode={schemaSetup?.action === 'remove' ? 'delete' : 'create'}
        onComplete={handleSchemaComplete}
        onClose={() => setSchemaSetup(null)}
      />

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <Package size={20} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800">{viewText.title}</h1>
            <p className="text-sm text-surface-500 mt-0.5">{viewText.subtitle}</p>
          </div>
        </div>
        <button
          onClick={() => { fetchAvailable(); fetchInstalled(); }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
            border border-surface-200 text-surface-600 hover:bg-surface-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {viewText.actions.refresh}
        </button>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium animate-fade-in ${
          toast.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-surface-200">
        <button
          onClick={() => setActiveTab('available')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'available'
              ? 'text-brand-600 border-brand-600'
              : 'text-surface-500 border-transparent hover:text-surface-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Search size={14} />
            {viewText.tabs.available}
            {availableModules.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-brand-100 text-brand-700">
                {availableModules.length}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('installed')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'installed'
              ? 'text-brand-600 border-brand-600'
              : 'text-surface-500 border-transparent hover:text-surface-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Package size={14} />
            {viewText.tabs.installed}
            {installedModules.filter(m => m.installed).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-brand-100 text-brand-700">
                {installedModules.filter(m => m.installed).length}
              </span>
            )}
          </span>
        </button>
      </div>

      {/* Tab Content */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-brand-500" />
          <span className="ml-2 text-sm text-surface-500">{viewText.available.scanning}</span>
        </div>
      )}

      {!loading && activeTab === 'available' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-surface-700">{viewText.available.title}</h2>
              <p className="text-xs text-surface-400 mt-0.5">{viewText.available.subtitle}</p>
            </div>
            <button
              onClick={fetchAvailable}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors"
            >
              <Search size={14} />
              {viewText.available.scanButton}
            </button>
          </div>

          {availableModules.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 p-8 shadow-sm flex flex-col items-center justify-center">
              <Package size={40} className="text-surface-300 mb-3" />
              <p className="text-xs text-surface-400 text-center max-w-sm">
                {viewText.available.empty}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {availableModules.map(mod => (
                <ModuleCard key={mod.id} mod={mod} mode="available" />
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === 'installed' && (
        <div>
          <div className="mb-4">
            <h2 className="text-sm font-bold text-surface-700">{viewText.installed.title}</h2>
            <p className="text-xs text-surface-400 mt-0.5">{viewText.installed.subtitle}</p>
          </div>

          {installedModules.filter(m => m.installed).length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 p-8 shadow-sm flex flex-col items-center justify-center">
              <Package size={40} className="text-surface-300 mb-3" />
              <p className="text-xs text-surface-400 text-center max-w-sm">
                {viewText.installed.empty}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {installedModules.filter(m => m.installed).map(mod => (
                <ModuleCard key={mod.id} mod={mod} mode="installed" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
        <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-700 space-y-1">
          <p className="font-semibold">Zero-Downtime Module Deployment</p>
          <p>Build a module with <code className="bg-blue-100 px-1 rounded">npm run build:module &lt;name&gt;</code>, then scan for it here. Install and enable — no server restart or UI rebuild needed.</p>
        </div>
      </div>
    </div>
  );
}
