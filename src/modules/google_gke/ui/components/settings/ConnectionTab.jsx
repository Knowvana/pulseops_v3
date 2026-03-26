// ============================================================================
// Google GKE Module — Unified Connection Configuration Tab
//
// PURPOSE: React component for configuring Kubernetes cluster connection.
// Unified UI for both local (Kind/Podman) and production (GCP GKE).
// Same configuration parameters work for both environments.
//
// FEATURES:
//   - Load current config on mount
//   - Form inputs for API server URL and service account token
//   - Test button: POST /api/google_gke/config/test (doesn't save)
//   - Save button: PUT /api/google_gke/config (saves to file + DB)
//   - Connection status display with cluster info (version, nodes, namespaces)
//   - Token masking (*** chars, no cleartext toggle)
//   - Current time display with timezone from ServiceNow module
//   - Optional reference fields: Project ID, Region, Cluster Name
//
// DEPENDENCIES:
//   - lucide-react                              → Icons
//   - @shared → createLogger, ApiClient
//   - @modules/google_gke/ui/config/uiText.json → All UI labels
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle2, AlertCircle, Loader2, Shield,
  Save, RefreshCw, Server, Clock,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../../config/uiText.json';

const log = createLogger('ConnectionTab');
const t = uiText.clusterConfig || {};
const tStatus = t.connectionStatus || {};
const tForm = t.connectionForm || {};

// ── Timezone helpers ─────────────────────────────────────────────────────────

/**
 * Get timezone abbreviation from IANA name (e.g., "Asia/Kolkata" → "IST").
 */
function getTimezoneAbbreviation(iana) {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: iana, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value || '';
  } catch {
    log.warn('Failed to resolve timezone abbreviation', { iana });
    return '';
  }
}

/**
 * Format a date in the given IANA timezone.
 */
function formatInTimezone(date, iana) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: iana,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export default function ConnectionTab() {
  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    apiServerUrl: '',
    serviceAccountToken: '',
    projectId: '',
    region: '',
    clusterName: '',
  });

  // ── UI state ──────────────────────────────────────────────────────────────
  const [connStatus, setConnStatus] = useState('not_tested');
  const [clusterInfo, setClusterInfo] = useState(null);
  const [lastTestedAt, setLastTestedAt] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [hasToken, setHasToken] = useState(false);
  const [currentConfig, setCurrentConfig] = useState(null);
  const [testError, setTestError] = useState(null);

  // ── Timezone state (from ServiceNow module) ───────────────────────────────
  const [timezone, setTimezone] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // ── Guard against StrictMode double-mount ────────────────────────────────
  const autoConnectDone = useRef(false);

  // ── Load timezone from ServiceNow module ──────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        log.debug('Fetching timezone config from ServiceNow module');
        const res = await ApiClient.get('/api/servicenow/config/timezone');
        if (res?.success && res.data?.effectiveTimezone) {
          const iana = res.data.effectiveTimezone;
          const abbr = getTimezoneAbbreviation(iana);
          setTimezone({ iana, abbr });
          log.info('Timezone loaded from ServiceNow', { iana, abbr });
        } else {
          log.debug('ServiceNow timezone not available, using browser default');
        }
      } catch (err) {
        log.debug('Could not fetch timezone from ServiceNow', { error: err.message });
      }
    })();
  }, []);

  // ── Update current time every second ──────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Load config on mount ──────────────────────────────────────────────────
  const loadConfig = useCallback(async (force = false) => {
    if (!force && autoConnectDone.current) return;
    autoConnectDone.current = true;

    log.debug('Loading cluster configuration');
    try {
      const res = await ApiClient.get('/api/google_gke/config');
      if (res?.success && res.data) {
        setCurrentConfig(res.data);

        const clusterConfig = res.data.cluster || {};
        const connection = clusterConfig.connection || {};
        const connStatusData = clusterConfig.connectionStatus || {};

        setForm({
          apiServerUrl: connection.apiServerUrl || '',
          serviceAccountToken: '',
          projectId: connection.projectId || '',
          region: connection.region || '',
          clusterName: connection.clusterName || '',
        });

        setHasToken(!!connection.hasToken);

        // Restore connection status from saved config
        if (connStatusData.testStatus === 'success' && connStatusData.clusterInfo) {
          setConnStatus('connected');
          setClusterInfo(connStatusData.clusterInfo);
          setLastTestedAt(connStatusData.lastTested);
          log.debug('Restored saved connection status', { status: 'connected' });
        } else if (connStatusData.testStatus === 'failed') {
          setConnStatus('failed');
          setLastTestedAt(connStatusData.lastTested);
          log.debug('Restored saved connection status', { status: 'failed' });
        } else {
          setConnStatus('not_tested');
        }

        log.info('Configuration loaded', { isConfigured: connStatusData.isConfigured, hasToken: !!connection.hasToken });
      } else {
        log.warn('Config response missing success or data', { responseKeys: res ? Object.keys(res) : [] });
        setConnStatus('not_tested');
      }
    } catch (err) {
      log.error('Failed to load config', { error: err.message });
      setConnStatus('not_tested');
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ── Test cluster connection ───────────────────────────────────────────────
  const handleTestConnection = useCallback(async () => {
    setConnecting(true);
    setTestError(null);
    log.info('Testing cluster connectivity');
    try {
      const res = await ApiClient.post('/api/google_gke/config/test', {});

      if (res?.success && res.data?.success) {
        setConnStatus('connected');
        setClusterInfo(res.data.clusterInfo);
        setLastTestedAt(res.data.testedAt);
        setTestError(null);
        log.info('Cluster connection test passed', {
          clusterName: res.data.clusterInfo?.clusterName,
          serverVersion: res.data.clusterInfo?.serverVersion,
          nodeCount: res.data.clusterInfo?.nodeCount,
        });
      } else {
        setConnStatus('failed');
        setClusterInfo(null);
        const errorMsg = res?.error?.message || 'Connection test failed';
        setTestError(errorMsg);
        log.warn('Cluster connection test failed', { error: errorMsg });
      }
    } catch (err) {
      setConnStatus('failed');
      setClusterInfo(null);
      const errorMsg = err?.response?.data?.error?.message || err.message || 'Connection test failed';
      setTestError(errorMsg);
      log.error('Cluster connection test error', { error: err.message, status: err?.response?.status });
    }
    setConnecting(false);
  }, []);

  // ── Save configuration ────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!form.apiServerUrl) {
      setSaveResult({ success: false, message: 'API Server URL is required' });
      log.warn('Save blocked: API Server URL is required');
      return;
    }
    if (!form.serviceAccountToken && !hasToken) {
      setSaveResult({ success: false, message: 'Service Account Token is required' });
      log.warn('Save blocked: Service Account Token is required');
      return;
    }

    setSaving(true);
    setSaveResult(null);
    log.info('Saving cluster configuration');

    try {
      const connectionPayload = {
        apiServerUrl: form.apiServerUrl,
        projectId: form.projectId,
        region: form.region,
        clusterName: form.clusterName,
      };

      // Only include token if user entered a new one
      if (form.serviceAccountToken) {
        connectionPayload.serviceAccountToken = form.serviceAccountToken;
      }

      const updatedCluster = {
        ...currentConfig.cluster,
        connection: {
          ...currentConfig.cluster?.connection,
          ...connectionPayload,
        },
      };

      const res = await ApiClient.put('/api/google_gke/config', {
        cluster: updatedCluster,
        poller: currentConfig.poller,
        alerts: currentConfig.alerts,
      });

      if (res?.success) {
        setSaveResult({ success: true, message: 'Cluster configuration saved successfully' });
        log.info('Configuration saved successfully');
        await loadConfig(true);
      } else {
        const errorMsg = res?.error?.message || 'Failed to save configuration';
        setSaveResult({ success: false, message: errorMsg });
        log.error('Save failed', { error: errorMsg });
      }
    } catch (err) {
      setSaveResult({ success: false, message: 'Failed to save configuration' });
      log.error('Save error', { error: err.message });
    }

    setSaving(false);
    setTimeout(() => setSaveResult(null), 4000);
  }, [form, hasToken, currentConfig, loadConfig]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isConnected = connStatus === 'connected';
  const isFailed = connStatus === 'failed';

  // Format current time with timezone
  const formattedCurrentTime = timezone
    ? `${formatInTimezone(currentTime, timezone.iana)} ${timezone.abbr} (${timezone.iana})`
    : currentTime.toLocaleString();

  // Format last tested time with timezone
  const formattedLastTested = lastTestedAt
    ? timezone
      ? `${formatInTimezone(new Date(lastTestedAt), timezone.iana)} ${timezone.abbr} (${timezone.iana})`
      : new Date(lastTestedAt).toLocaleString()
    : null;

  // Show loading state while fetching config
  if (!currentConfig) {
    return (
      <div className="space-y-6 animate-fade-in p-5">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="text-brand-500 animate-spin mr-3" />
          <span className="text-sm text-surface-500">{uiText.common?.loading || 'Loading...'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in p-5">

      {/* ── Connection Status Banner ─────────────────────────────────────── */}
      <div
        className={`rounded-2xl border shadow-sm p-5 ${
          isConnected
            ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200'
            : isFailed
              ? 'bg-gradient-to-r from-rose-50 to-red-50 border-rose-200'
              : 'bg-gradient-to-r from-slate-50 to-gray-50 border-surface-200'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            {connecting ? (
              <Loader2 size={22} className="text-brand-500 animate-spin mt-0.5" />
            ) : isConnected ? (
              <CheckCircle2 size={22} className="text-emerald-600 mt-0.5" />
            ) : isFailed ? (
              <AlertCircle size={22} className="text-rose-500 mt-0.5" />
            ) : (
              <Server size={22} className="text-surface-400 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-surface-800">
                {tStatus.title || 'Connection Status'}:{' '}
                {connecting
                  ? tStatus.testing || 'Testing...'
                  : isConnected
                    ? tStatus.connected || 'Connected'
                    : isFailed
                      ? tStatus.disconnected || 'Disconnected'
                      : tStatus.notTested || 'Not Tested'}
              </p>

              {/* Cluster details when connected */}
              {clusterInfo && isConnected && !connecting && (
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">{tStatus.clusterName || 'Cluster Name'}:</span>{' '}
                    {clusterInfo.clusterName || 'N/A'}
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">{tStatus.serverVersion || 'Server Version'}:</span>{' '}
                    {clusterInfo.serverVersion || 'N/A'}
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">{tStatus.platform || 'Platform'}:</span>{' '}
                    {clusterInfo.platform || 'N/A'}
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">{tStatus.apiServer || 'API Server'}:</span>{' '}
                    {clusterInfo.apiServerUrl || 'N/A'}
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">{tStatus.nodes || 'Nodes'}:</span>{' '}
                    {clusterInfo.nodeCount ?? 0} ({tStatus.nodesReady || 'Ready'}: {clusterInfo.nodesReady ?? 0})
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">{tStatus.namespaces || 'Namespaces'}:</span>{' '}
                    {clusterInfo.namespaceCount ?? 0}
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">{tStatus.pods || 'Pods'}:</span>{' '}
                    {clusterInfo.podCount ?? 0} ({tStatus.podsRunning || 'Running'}: {clusterInfo.podsRunning ?? 0})
                  </p>
                </div>
              )}

              {/* Error message when failed */}
              {isFailed && testError && !connecting && (
                <p className="text-xs text-rose-600 mt-1.5">{testError}</p>
              )}

              {/* Current Time */}
              <div className="mt-2 flex items-center gap-1.5 text-xs text-surface-400">
                <Clock size={12} />
                <span>{tStatus.currentTime || 'Current Time'}: {formattedCurrentTime}</span>
              </div>

              {/* Last Tested — at the bottom */}
              {formattedLastTested && !connecting && (
                <p className="text-xs text-surface-400 mt-1">
                  {tStatus.lastTested || 'Last Tested'}: {formattedLastTested}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={connecting}
            title="Test connection"
            className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={14} className={connecting ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Inline progress bar */}
      {connecting && (
        <div className="mb-3">
          <div className="w-full bg-surface-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full animate-pulse w-2/3" />
          </div>
          <p className="text-xs text-surface-400 mt-1">{tStatus.testing || 'Testing cluster connectivity...'}</p>
        </div>
      )}

      {/* ── Configuration Form ───────────────────────────────────────────── */}
      <div className="space-y-4">

        {/* API Server URL */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            {tForm.apiServerUrlLabel || 'API Server URL'}
          </label>
          <input
            type="text"
            value={form.apiServerUrl}
            onChange={(e) => setForm({ ...form, apiServerUrl: e.target.value })}
            placeholder={tForm.apiServerUrlPlaceholder || 'https://kubernetes.default.svc.cluster.local'}
            className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
          />
          <p className="text-xs text-surface-400 mt-1">
            {tForm.apiServerUrlDesc || 'Kubernetes API server endpoint'}
          </p>
        </div>

        {/* Service Account Token — masked, no cleartext toggle */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1 flex items-center gap-1.5">
            <Shield size={14} className="text-surface-500" />
            {tForm.tokenLabel || 'Service Account Token'}
          </label>
          <textarea
            value={form.serviceAccountToken}
            onChange={(e) => setForm({ ...form, serviceAccountToken: e.target.value })}
            placeholder={hasToken
              ? (tForm.tokenMask || '••••••••••••••••••••••••••••••••')
              : (tForm.tokenPlaceholder || 'Paste your service account token here')}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none font-mono text-xs"
            style={{ WebkitTextSecurity: form.serviceAccountToken ? 'disc' : 'none' }}
          />
          <p className="text-xs text-surface-400 mt-1">
            {hasToken && !form.serviceAccountToken
              ? (tForm.tokenStoredHint || 'Token is stored securely on the server. Enter a new token to replace it.')
              : (tForm.tokenDesc || 'Bearer token for Kubernetes API authentication.')}
          </p>
        </div>

        {/* Project ID */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            {tForm.projectIdLabel || 'Project ID (Optional)'}
          </label>
          <input
            type="text"
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            placeholder={tForm.projectIdPlaceholder || 'my-gcp-project-123456'}
            className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
          />
          <p className="text-xs text-surface-400 mt-1">
            {tForm.projectIdDesc || 'GCP project ID for reference'}
          </p>
        </div>

        {/* Region */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            {tForm.regionLabel || 'Region (Optional)'}
          </label>
          <input
            type="text"
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
            placeholder={tForm.regionPlaceholder || 'us-central1'}
            className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
          />
          <p className="text-xs text-surface-400 mt-1">
            {tForm.regionDesc || 'Cluster region for reference'}
          </p>
        </div>

        {/* Cluster Name */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            {tForm.clusterNameLabel || 'Cluster Name (Optional)'}
          </label>
          <input
            type="text"
            value={form.clusterName}
            onChange={(e) => setForm({ ...form, clusterName: e.target.value })}
            placeholder={tForm.clusterNamePlaceholder || 'prod-gke-cluster'}
            className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
          />
          <p className="text-xs text-surface-400 mt-1">
            {tForm.clusterNameDesc || 'Cluster name for reference'}
          </p>
        </div>

        {/* Result Messages */}
        {saveResult && (
          <div
            className={`p-3 rounded-lg text-sm ${
              saveResult.success
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {saveResult.message}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <button
            onClick={handleTestConnection}
            disabled={connecting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-brand-300 text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {connecting ? (t.testingButton || 'Testing...') : (t.testConnection || 'Test Connection')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? (t.savingButton || 'Saving...') : (t.saveConfig || 'Save Configuration')}
          </button>
        </div>

      </div>
    </div>
  );
}
