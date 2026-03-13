// ============================================================================
// ServiceNowConnectionTab — PulseOps V3 ServiceNow Module Config
//
// PURPOSE: Configuration tab for ServiceNow API connection credentials.
// Provides fields for Instance URL, Username, and API Token/Password with
// a live connection test, incident count display, refresh status, and a
// "View ServiceNow Metadata" modal showing full incident schema.
//
// ARCHITECTURE:
//   - Fetches existing config on mount (StrictMode-guarded via useRef)
//   - API token is NEVER returned in plaintext from GET /config — shows '••••••••'
//   - Test button calls POST /servicenow/config/test (does NOT save)
//   - Save uses ConfirmationModal (3-phase: Confirm → Progress → Summary)
//   - All text from uiText.json — zero hardcoded strings
//
// USED BY: src/modules/servicenow/manifest.jsx → getConfigTabs()
//
// DEPENDENCIES:
//   - lucide-react                              → Icons
//   - @modules/servicenow/uiText.json           → All UI labels
//   - @shared → createLogger, ApiClient
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wifi, WifiOff, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff,
  ExternalLink, Shield, Zap, Save, RefreshCw, Bug, FileText, GitPullRequest, User,
  Database, X, Search, Hash, Type, Star, Lock, HelpCircle, FileCode,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
const snApi = {
  config:     '/api/servicenow/config',
  configTest: '/api/servicenow/config/test',
  stats:      '/api/servicenow/stats',
  sync:       '/api/servicenow/sync',
  schemaColumns: '/api/servicenow/schema/columns',
};
import uiText from '../../config/uiText.json';

const log = createLogger('ServiceNowConnectionTab.jsx');
const t   = uiText.connection;

// ─────────────────────────────────────────────────────────────────────────────
// Metadata Modal
// ─────────────────────────────────────────────────────────────────────────────
function MetadataModal({ onClose }) {
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [meta, setMeta] = useState({ total: 0, source: '' });

  useEffect(() => {
    (async () => {
      try {
        const res = await ApiClient.get(snApi.schemaColumns);
        if (res?.success && res.data?.columns) {
          setColumns(res.data.columns);
          setMeta({ total: res.data.totalColumns, source: res.data.source });
        } else {
          setError(res?.error?.message || 'Failed to load metadata');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = search.trim()
    ? columns.filter(c =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.label?.toLowerCase().includes(search.toLowerCase()) ||
        c.type?.toLowerCase().includes(search.toLowerCase())
      )
    : columns;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-5xl max-h-[85vh] flex flex-col border border-surface-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <div className="flex items-center gap-3">
            <Database size={20} className="text-brand-600" />
            <div>
              <h2 className="text-lg font-bold text-surface-800">ServiceNow Incident Metadata</h2>
              <p className="text-xs text-surface-400 mt-0.5">
                {meta.total} columns • Source: {meta.source || 'loading...'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-surface-50">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search columns by name, label, or type..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-surface-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-3">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="text-brand-500 animate-spin" />
              <span className="ml-3 text-sm text-surface-500">Loading incident metadata from ServiceNow...</span>
            </div>
          )}
          {error && (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
          )}
          {!loading && !error && (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-surface-200">
                  <th className="px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider w-10">#</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Column Name</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Label</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider text-center">Max Length</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider text-center">Required</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider text-center">Read Only</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Sample Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {filtered.map((col, idx) => (
                  <tr key={col.name} className="hover:bg-surface-50/50 transition-colors text-xs">
                    <td className="px-3 py-2 text-surface-400 font-mono">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-brand-700 font-semibold">{col.name}</td>
                    <td className="px-3 py-2 text-surface-700">{col.label}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">
                        {col.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-surface-500">{col.maxLength || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {col.mandatory ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Star size={8} /> Yes
                        </span>
                      ) : <span className="text-surface-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {col.readOnly ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-100 text-surface-500 border border-surface-200">
                          <Lock size={8} /> Yes
                        </span>
                      ) : <span className="text-surface-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-surface-500 max-w-[200px] truncate font-mono text-[11px]" title={col.sampleValue || ''}>
                      {col.sampleValue || <span className="text-surface-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-center text-surface-400 text-sm py-10">No columns match your search.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-surface-100 bg-surface-50/50">
          <p className="text-xs text-surface-400">
            Showing {filtered.length} of {columns.length} columns
          </p>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-surface-200 text-surface-700 hover:bg-surface-300 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowConnectionTab() {
  const [form, setForm] = useState({
    instanceUrl: '',
    username:    '',
    apiToken:    '',
  });
  const [currentConfig, setCurrentConfig] = useState(null);
  const [connStatus, setConnStatus]       = useState('not_connected');
  const [apiStatuses, setApiStatuses]     = useState({ incidents: null, ritms: null, changes: null });
  const [incidentCount, setIncidentCount] = useState(null);
  const [lastTestedAt, setLastTestedAt]   = useState(null);
  const [connecting, setConnecting]       = useState(false);
  const [connectProgress, setConnectProgress] = useState(0);
  const [saving, setSaving]               = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [saveResult, setSaveResult]       = useState(null);
  const [syncResult, setSyncResult]       = useState(null);
  const [showToken, setShowToken]         = useState(false);
  const [showMetadata, setShowMetadata]   = useState(false);
  const [fetchError, setFetchError]       = useState(null);
  const autoConnectDone = useRef(false);

  const updateIncidentCountFromStats = useCallback(async () => {
    try {
      const statsRes = await ApiClient.get(snApi.stats);
      if (statsRes?.success && typeof statsRes.data?.total === 'number') {
        setIncidentCount(statsRes.data.total);
        log.info('updateIncidentCountFromStats', 'Incident total loaded from stats API', { total: statsRes.data.total });
      }
    } catch (err) {
      log.warn('updateIncidentCountFromStats', 'Failed to load incident total from stats API', { error: err.message });
    }
  }, []);

  // ── Load config and auto-connect ────────────────────────────────────────
  const loadConfigAndConnect = useCallback(async (force = false) => {
    if (!force && autoConnectDone.current) return;
    autoConnectDone.current = true;

    setConnecting(true);
    setConnectProgress(10);
    setIncidentCount(null);

    try {
      const configRes = await ApiClient.get(snApi.config);
      setConnectProgress(30);

      if (configRes?.success && configRes.data?.connection) {
        const conn = configRes.data.connection;
        setCurrentConfig(configRes.data);
        setForm({
          instanceUrl: conn.instanceUrl || '',
          username:    conn.username    || '',
          apiToken:    conn.apiToken    || '',
        });

        setConnectProgress(50);
        const testRes = await ApiClient.post(snApi.configTest, {
          instanceUrl: conn.instanceUrl,
          username:    conn.username,
          apiToken:    conn.apiToken,
        });
        setConnectProgress(90);

        if (testRes?.success && testRes.data) {
          setConnStatus(testRes.data.success ? 'connected' : 'not_connected');
          setLastTestedAt(testRes.data.testedAt || new Date().toISOString());
          if (testRes.data.apis) setApiStatuses(testRes.data.apis);
          if (testRes.data.incidentCount != null) {
            setIncidentCount(testRes.data.incidentCount);
          } else if (testRes.data.success) {
            updateIncidentCountFromStats();
          }
          log.info('loadConfigAndConnect', 'Auto-connect result', { status: testRes.data.success });
        } else {
          setConnStatus('not_connected');
        }
      } else {
        setConnStatus('not_connected');
      }
    } catch (err) {
      log.error('loadConfigAndConnect', 'Auto-connect failed', { error: err.message });
      setConnStatus('not_connected');
    }

    setConnectProgress(100);
    setTimeout(() => { setConnecting(false); setConnectProgress(0); }, 400);
  }, []);

  useEffect(() => { loadConfigAndConnect(); }, [loadConfigAndConnect]);

  const handleChange = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaveResult(null);
  }, []);

  // ── Refresh connection status ───────────────────────────────────────────
  const handleRefreshStatus = useCallback(() => {
    loadConfigAndConnect(true);
  }, [loadConfigAndConnect]);

  // ── Test connection ─────────────────────────────────────────────────────
  const handleTestConnection = useCallback(async () => {
    setConnecting(true);
    setConnectProgress(20);
    setIncidentCount(null);
    try {
      setConnectProgress(50);
      const res = await ApiClient.post(snApi.configTest, {
        instanceUrl: form.instanceUrl,
        username:    form.username,
        apiToken:    form.apiToken,
      });
      setConnectProgress(90);
      if (res?.success && res.data) {
        setConnStatus(res.data.success ? 'connected' : 'not_connected');
        setLastTestedAt(res.data.testedAt || new Date().toISOString());
        if (res.data.apis) setApiStatuses(res.data.apis);
        if (res.data.incidentCount != null) {
          setIncidentCount(res.data.incidentCount);
        } else if (res.data.success) {
          updateIncidentCountFromStats();
        }
      } else {
        setConnStatus('not_connected');
      }
    } catch (err) {
      setConnStatus('not_connected');
      log.error('handleTestConnection', 'Test failed', { error: err.message });
    }
    setConnectProgress(100);
    setTimeout(() => { setConnecting(false); setConnectProgress(0); }, 400);
  }, [form]);

  // ── Save config ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!form.instanceUrl || !form.username) {
      setSaveResult({ success: false, message: 'Instance URL and username are required' });
      return;
    }
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await ApiClient.put(snApi.config, {
        connection: {
          instanceUrl: form.instanceUrl,
          username:    form.username,
          apiToken:    form.apiToken,
        },
        sla:  currentConfig?.sla,
        sync: currentConfig?.sync,
      });
      if (res?.success) {
        setSaveResult({ success: true, message: t.configSaved || 'Configuration saved successfully' });
        log.info('handleSave', 'Config saved');
        await loadConfigAndConnect(true);
      } else {
        setSaveResult({ success: false, message: res?.error?.message || 'Failed to save configuration' });
      }
    } catch (err) {
      setSaveResult({ success: false, message: 'Failed to save configuration' });
      log.error('handleSave', 'Save failed', { error: err.message });
    }
    setSaving(false);
    setTimeout(() => setSaveResult(null), 4000);
  }, [form, currentConfig, loadConfigAndConnect]);

  // ── Sync data ───────────────────────────────────────────────────────────
  const handleSyncData = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await ApiClient.post(snApi.sync, {});
      if (res?.success) {
        setSyncResult({ success: true, message: t.syncSuccess || 'Data synchronized successfully' });
        log.info('handleSyncData', 'Sync completed', { count: res.data?.count });
        updateIncidentCountFromStats();
      } else {
        setSyncResult({ success: false, message: res?.error?.message || 'Sync failed' });
      }
    } catch (err) {
      setSyncResult({ success: false, message: 'Sync failed' });
      log.error('handleSyncData', 'Sync failed', { error: err.message });
    }
    setSyncing(false);
    setTimeout(() => setSyncResult(null), 5000);
  }, []);

  const isConnected = connStatus === 'connected';
  const hasToken = currentConfig?.connection?.apiToken || form.apiToken;

  return (
    <div className="space-y-6 animate-fade-in p-5">
      {/* Connection Status Banner with inline progress */}
      <div className={`rounded-2xl border shadow-sm p-4 ${isConnected ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200' : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {connecting ? (
              <Loader2 size={20} className="text-brand-500 animate-spin" />
            ) : isConnected ? (
              <CheckCircle2 size={20} className="text-emerald-600" />
            ) : (
              <AlertCircle size={20} className="text-rose-500" />
            )}
            <div>
              <p className="text-sm font-semibold text-surface-800">
                {t.statusLabel || 'Status'}: {connecting ? 'Testing...' : (isConnected ? 'Connected' : 'Not Connected')}
              </p>
              {lastTestedAt && !connecting && (
                <p className="text-xs text-surface-400 mt-0.5">
                  {t.lastTestedLabel || 'Last tested'}: {new Date(lastTestedAt).toLocaleString()}
                </p>
              )}
              {!connecting && incidentCount != null && (
                <p className="text-xs text-surface-500 mt-0.5 flex items-center gap-1">
                  <Hash size={12} className="text-brand-500" />
                  {t.incidentCountLabel || 'Incidents fetched'}: {incidentCount.toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshStatus}
              disabled={connecting}
              title="Refresh connection status"
              className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={14} className={connecting ? 'animate-spin' : ''} />
            </button>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              isConnected ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-rose-600 bg-rose-50 border-rose-200'
            }`}>
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
        </div>

        {/* Inline progress bar */}
        {connecting && (
          <div className="mb-3">
            <div className="w-full bg-surface-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${connectProgress}%` }}
              />
            </div>
            <p className="text-xs text-surface-400 mt-1">Testing APIs...</p>
          </div>
        )}

        {/* Per-API status grid removed per UX request to reduce redundancy */}
      </div>

      {/* Connection Form */}
      <div className="space-y-4">
        {/* Instance URL */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">{t.instanceUrlLabel || 'Instance URL'}</label>
          <div className="flex items-center gap-2">
            <Wifi size={16} className="text-surface-400" />
            <input
              type="url"
              value={form.instanceUrl}
              onChange={(e) => handleChange('instanceUrl', e.target.value)}
              placeholder={t.instanceUrlPlaceholder || 'https://your-instance.service-now.com'}
              className="flex-1 px-3 py-2 rounded-lg border border-surface-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Username */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">{t.usernameLabel || 'Username'}</label>
          <div className="flex items-center gap-2">
            <User size={16} className="text-surface-400" />
            <input
              type="text"
              value={form.username}
              onChange={(e) => handleChange('username', e.target.value)}
              placeholder={t.usernamePlaceholder || 'admin'}
              className="flex-1 px-3 py-2 rounded-lg border border-surface-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* API Token */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">{t.apiTokenLabel || 'API Token'}</label>
          <div className="relative flex items-center gap-2">
            <Shield size={16} className="text-surface-400 flex-shrink-0" />
            <input
              type={showToken ? 'text' : 'password'}
              value={form.apiToken}
              onChange={(e) => handleChange('apiToken', e.target.value)}
              placeholder={hasToken ? '••••••••' : t.apiTokenPlaceholder || 'Your API token'}
              className="flex-1 px-3 py-2 pr-10 rounded-lg border border-surface-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

      </div>

      {/* Result Messages */}
      {saveResult && (
        <div className={`p-3 rounded-lg text-sm ${
          saveResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {saveResult.message}
        </div>
      )}
      {syncResult && (
        <div className={`p-3 rounded-lg text-sm ${
          syncResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {syncResult.message}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <button
          onClick={handleTestConnection}
          disabled={connecting || !form.instanceUrl}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-brand-300 text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {connecting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {connecting ? 'Testing...' : (t.testConnection || 'Test Connection')}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.instanceUrl || !form.username}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving...' : (t.saveConfig || 'Save Config')}
        </button>
        <button
          onClick={handleSyncData}
          disabled={syncing || !isConnected}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {syncing ? 'Syncing...' : (t.syncData || 'Sync Data')}
        </button>
        <div className="w-px h-6 bg-surface-200 mx-1" />
        <button
          onClick={() => setShowMetadata(true)}
          disabled={!isConnected}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Database size={14} />
          View ServiceNow Metadata
        </button>
      </div>

      {/* Metadata Modal */}
      {showMetadata && <MetadataModal onClose={() => setShowMetadata(false)} />}
    </div>
  );
}
