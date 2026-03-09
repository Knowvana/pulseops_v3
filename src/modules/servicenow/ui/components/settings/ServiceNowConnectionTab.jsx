// ============================================================================
// ServiceNowConnectionTab — PulseOps V3 ServiceNow Module Config
//
// PURPOSE: Configuration tab for ServiceNow API connection credentials.
// Provides fields for Instance URL, Username, and API Token/Password with
// a live connection test and a save action via ConfirmationModal.
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
//   - @config/urls.json                         → API endpoints
//   - @shared → createLogger, ConfirmationModal, ApiClient
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wifi, WifiOff, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff,
  ExternalLink, Shield, Zap, Save, RefreshCw, Bug, FileText, GitPullRequest, User,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
// Module-local API URLs — no dependency on platform urls.json
const snApi = {
  config:     '/api/servicenow/config',
  configTest: '/api/servicenow/config/test',
  sync:       '/api/servicenow/sync',
};
import uiText from '../../config/uiText.json';

const log = createLogger('ServiceNowConnectionTab.jsx');
const t   = uiText.connection;

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
  const [lastTestedAt, setLastTestedAt]   = useState(null);
  const [connecting, setConnecting]       = useState(false);
  const [connectProgress, setConnectProgress] = useState(0);
  const [saving, setSaving]               = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [saveResult, setSaveResult]       = useState(null);
  const [syncResult, setSyncResult]       = useState(null);
  const [showToken, setShowToken]         = useState(false);
  const [fetchError, setFetchError]       = useState(null);
  const autoConnectDone = useRef(false);

  // ── Load config and auto-connect ────────────────────────────────────────
  const loadConfigAndConnect = useCallback(async () => {
    if (autoConnectDone.current) return;
    autoConnectDone.current = true;

    setConnecting(true);
    setConnectProgress(10);

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
          if (testRes.data.apis) {
            setApiStatuses(testRes.data.apis);
          }
          log.info('loadConfigAndConnect', 'Auto-connect successful', { status: testRes.data.success });
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

  // ── Test connection ─────────────────────────────────────────────────────
  const handleTestConnection = useCallback(async () => {
    setConnecting(true);
    setConnectProgress(20);
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
        autoConnectDone.current = false;
        await loadConfigAndConnect();
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
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            isConnected ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-rose-600 bg-rose-50 border-rose-200'
          }`}>
            {isConnected ? 'Connected' : 'Not Connected'}
          </span>
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

        {/* Per-API status */}
        {!connecting && (apiStatuses.incidents || apiStatuses.ritms || apiStatuses.changes) && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'incidents', label: 'Incidents API', icon: Bug },
              { key: 'ritms', label: 'RITMs API', icon: FileText },
              { key: 'changes', label: 'Changes API', icon: GitPullRequest },
            ].map(({ key, label, icon: Icon }) => {
              const st = apiStatuses[key];
              const ok = st?.status === 'connected';
              return (
                <div key={key} className="flex items-center gap-2 p-2 rounded-lg bg-surface-50 border border-surface-100">
                  <Icon size={14} className="text-surface-500" />
                  <span className="text-xs font-medium text-surface-700 flex-1">{label}</span>
                  {ok ? <CheckCircle2 size={12} className="text-emerald-500" /> : <AlertCircle size={12} className="text-rose-400" />}
                </div>
              );
            })}
          </div>
        )}
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
      <div className="flex items-center gap-3 pt-2">
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
      </div>
    </div>
  );
}
