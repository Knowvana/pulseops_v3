// ============================================================================
// ServiceNowConnectionTab — PulseOps V2 ServiceNow Module Config
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
  ExternalLink, Shield,
} from 'lucide-react';
import { createLogger, ConfirmationModal } from '@shared';
import ApiClient from '@shared/services/apiClient';
// Module-local API URLs — no dependency on platform urls.json
const snApi = {
  config:     '/api/servicenow/config',
  configTest: '/api/servicenow/config/test',
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
  const [loading,       setLoading]       = useState(true);
  const [testing,       setTesting]       = useState(false);
  const [testResult,    setTestResult]    = useState(null); // { success, error, latencyMs }
  const [showToken,     setShowToken]     = useState(false);
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [fetchError,    setFetchError]    = useState(null);
  const initRan = useRef(false);

  // ── Load existing config ────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    log.debug('loadConfig', 'Loading ServiceNow connection config');
    setLoading(true);
    setFetchError(null);
    try {
      const res = await ApiClient.get(snApi.config);
      if (res?.success) {
        const conn = res.data.connection || {};
        log.info('loadConfig', 'Config loaded', { isConfigured: conn.isConfigured });
        setCurrentConfig(res.data);
        setForm({
          instanceUrl: conn.instanceUrl || '',
          username:    conn.username    || '',
          apiToken:    conn.apiToken    || '', // Will be '••••••••' if token exists
        });
      } else {
        log.warn('loadConfig', 'Failed to load config', { error: res?.error?.message });
        setFetchError(res?.error?.message || uiText.common.fetchError);
      }
    } catch (err) {
      log.error('loadConfig', 'Unexpected error', { error: err.message });
      setFetchError(uiText.common.fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  // StrictMode guard
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('mount', 'ServiceNowConnectionTab mounted');
    loadConfig();
  }, [loadConfig]);

  const handleChange = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    // Clear test result when user edits credentials
    setTestResult(null);
  }, []);

  // ── Test connection ─────────────────────────────────────────────────────
  const handleTest = useCallback(async () => {
    log.info('handleTest', 'Testing ServiceNow connection', { instanceUrl: form.instanceUrl });
    setTesting(true);
    setTestResult(null);
    try {
      const res = await ApiClient.post(snApi.configTest, {
        instanceUrl: form.instanceUrl,
        username:    form.username,
        apiToken:    form.apiToken,
      });
      if (res?.success) {
        const result = res.data;
        log.info('handleTest', `Test ${result.success ? 'passed' : 'failed'}`, { latencyMs: result.latencyMs });
        setTestResult(result);
      } else {
        log.warn('handleTest', 'Test request failed', { error: res?.error?.message });
        setTestResult({ success: false, error: res?.error?.message || uiText.common.fetchError });
      }
    } catch (err) {
      log.error('handleTest', 'Unexpected error', { error: err.message });
      setTestResult({ success: false, error: uiText.common.fetchError });
    } finally {
      setTesting(false);
    }
  }, [form]);

  // ── Save config (via ConfirmationModal) ────────────────────────────────
  const handleSave = useCallback(async () => {
    log.info('handleSave', 'Saving ServiceNow connection config');
    const currentConn = currentConfig?.connection || {};
    const res = await ApiClient.put(snApi.config, {
      connection: {
        instanceUrl: form.instanceUrl,
        username:    form.username,
        apiToken:    form.apiToken,
      },
      sla:  currentConfig?.sla,
      sync: currentConfig?.sync,
    });
    if (!res?.success) {
      throw new Error(res?.error?.message || uiText.common.fetchError);
    }
    log.info('handleSave', 'Config saved');
    await loadConfig(); // Refresh from server
    return { instanceUrl: form.instanceUrl };
  }, [form, currentConfig, loadConfig]);

  // ── Derived state ───────────────────────────────────────────────────────
  const isConfigured   = currentConfig?.connection?.isConfigured;
  const lastTested     = currentConfig?.connection?.lastTested;
  const hasToken       = currentConfig?.connection?.hasToken;
  const canTest        = !testing && form.instanceUrl && form.username && (form.apiToken || hasToken);
  const canSave        = form.instanceUrl && form.username;

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 size={20} className="text-brand-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5 max-w-xl">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        {isConfigured
          ? <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Wifi size={11} />{t.configuredBadge}
            </span>
          : <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-surface-100 text-surface-600 border border-surface-200">
              <WifiOff size={11} />{t.notConfiguredBadge}
            </span>
        }
        {lastTested && (
          <span className="text-xs text-surface-400">{t.lastTested}: {new Date(lastTested).toLocaleString()}</span>
        )}
      </div>

      {/* Fetch error */}
      {fetchError && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          <AlertCircle size={13} />{fetchError}
        </div>
      )}

      {/* Security note */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 text-xs">
        <Shield size={13} className="flex-shrink-0 mt-0.5" />
        <span>{t.apiTokenHint}</span>
      </div>

      {/* Form */}
      <div className="space-y-4">
        {/* Instance URL */}
        <div>
          <label className="block text-xs font-semibold text-surface-700 mb-1">{t.instanceUrlLabel}</label>
          <div className="relative">
            <input
              type="url"
              value={form.instanceUrl}
              onChange={e => handleChange('instanceUrl', e.target.value)}
              placeholder={t.instanceUrlPlaceholder}
              className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 bg-white text-surface-700 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
            />
            {form.instanceUrl && (
              <a
                href={form.instanceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-brand-600"
                title="Open in browser"
              >
                <ExternalLink size={13} />
              </a>
            )}
          </div>
          <p className="text-[10px] text-surface-400 mt-1">{t.instanceUrlHint}</p>
        </div>

        {/* Username */}
        <div>
          <label className="block text-xs font-semibold text-surface-700 mb-1">{t.usernameLabel}</label>
          <input
            type="text"
            value={form.username}
            onChange={e => handleChange('username', e.target.value)}
            placeholder={t.usernamePlaceholder}
            autoComplete="username"
            className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 bg-white text-surface-700 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
          />
          <p className="text-[10px] text-surface-400 mt-1">{t.usernameHint}</p>
        </div>

        {/* API Token */}
        <div>
          <label className="block text-xs font-semibold text-surface-700 mb-1">{t.apiTokenLabel}</label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={form.apiToken}
              onChange={e => handleChange('apiToken', e.target.value)}
              placeholder={hasToken ? '••••••••' : t.apiTokenPlaceholder}
              autoComplete="current-password"
              className="w-full px-3 py-2 pr-9 text-sm rounded-lg border border-surface-300 bg-white text-surface-700 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
            />
            <button
              type="button"
              onClick={() => setShowToken(s => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
            >
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs ${
          testResult.success
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {testResult.success
            ? <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" />
            : <AlertCircle  size={13} className="flex-shrink-0 mt-0.5" />
          }
          <div>
            <span className="font-semibold">{testResult.success ? t.testSuccess : t.testFailed}</span>
            {testResult.latencyMs != null && (
              <span className="ml-2 text-[10px] opacity-70">{t.latency}: {testResult.latencyMs}ms</span>
            )}
            {testResult.error && <p className="mt-0.5 opacity-80">{testResult.error}</p>}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleTest}
          disabled={!canTest}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-brand-300 text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {testing ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
          {testing ? t.testing : t.testButton}
        </button>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!canSave}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t.saveButton}
        </button>
      </div>

      {/* Save confirmation modal */}
      <ConfirmationModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title={t.confirmTitle}
        actionDescription={t.confirmDescription}
        actionTarget={t.confirmTarget}
        actionDetails={[
          { label: t.instanceUrlLabel, value: form.instanceUrl || uiText.common.na },
          { label: t.usernameLabel,    value: form.username    || uiText.common.na },
          { label: t.statusLabel,      value: isConfigured ? t.configuredBadge : t.notConfiguredBadge },
        ]}
        confirmLabel={uiText.common.save}
        variant="info"
        action={handleSave}
        onSuccess={() => setShowConfirm(false)}
        buildSummary={() => [
          { label: t.instanceUrlLabel,   value: form.instanceUrl },
          { label: t.confirmSummaryStatus, value: t.confirmSummarySuccess },
        ]}
      />
    </div>
  );
}
