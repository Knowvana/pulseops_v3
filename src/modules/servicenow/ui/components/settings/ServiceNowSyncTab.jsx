// ============================================================================
// ServiceNowSyncTab — PulseOps V3 ServiceNow Module Config
//
// PURPOSE: Configuration tab for ServiceNow data synchronization settings.
// Controls auto-sync enabled/disabled, sync interval (minutes), max incidents
// per sync, and provides a manual sync trigger with live feedback.
//
// ARCHITECTURE:
//   - Loads config from GET /api/servicenow/config on mount (StrictMode-guarded)
//   - Manual sync button calls POST /api/servicenow/sync (clears server cache)
//   - Save uses ConfirmationModal (3-phase: Confirm → Progress → Summary)
//   - Only updates the sync section; connection + SLA sections are preserved
//   - All text from uiText.json — zero hardcoded strings
//
// USED BY: src/modules/servicenow/manifest.jsx → getConfigTabs()
//
// DEPENDENCIES:
//   - lucide-react                              → Icons
//   - @modules/servicenow/uiText.json           → All UI labels
//   - @config/urls.json                         → API endpoints
//   - @shared                                   → createLogger, ConfirmationModal
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, AlertCircle, Loader2, CheckCircle2, Clock, Info, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { createLogger, ConfirmationModal } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { PageSpinner } from '@components';
// Module-local API URLs — no dependency on platform urls.json
const snApi = {
  config: '/api/servicenow/config',
  sync:   '/api/servicenow/sync',
};
import uiText from '../../config/uiText.json';

const log = createLogger('ServiceNowSyncTab.jsx');
const t   = uiText.sync;

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowSyncTab() {
  const [sync,        setSync]        = useState({ enabled: false, intervalMinutes: 30, maxIncidents: 500 });
  const [fullConfig,  setFullConfig]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [syncResult,  setSyncResult]  = useState(null); // { success, count, error }
  const [fetchError,  setFetchError]  = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const initRan = useRef(false);

  // ── Load config ─────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    log.debug('loadConfig', 'Loading sync config');
    setLoading(true);
    setFetchError(null);
    try {
      const res = await ApiClient.get(snApi.config);
      if (res?.success) {
        log.info('loadConfig', 'Sync config loaded', { sync: res.data.sync });
        setFullConfig(res.data);
        setSync({ ...res.data.sync });
      } else {
        log.warn('loadConfig', 'Failed', { error: res?.error?.message });
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
    log.info('mount', 'ServiceNowSyncTab mounted');
    loadConfig();
  }, [loadConfig]);

  const handleChange = useCallback((key, value) => {
    setSync(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Manual sync trigger ─────────────────────────────────────────────────
  const handleManualSync = useCallback(async () => {
    log.info('handleManualSync', 'Manual sync triggered');
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await ApiClient.post(snApi.sync, {});
      if (res?.success) {
        log.info('handleManualSync', 'Sync complete', { count: res.data?.count });
        setSyncResult({ success: true, count: res.data?.count });
        await loadConfig(); // Refresh to show new lastSync time
      } else {
        log.warn('handleManualSync', 'Sync failed', { error: res?.error?.message });
        setSyncResult({ success: false, error: res?.error?.message || t.syncFailed });
      }
    } catch (err) {
      log.error('handleManualSync', 'Unexpected error', { error: err.message });
      setSyncResult({ success: false, error: uiText.common.fetchError });
    } finally {
      setSyncing(false);
    }
  }, [loadConfig]);

  // ── Save sync config ────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    log.info('handleSave', 'Saving sync settings', { sync });
    const res = await ApiClient.put(snApi.config, {
      connection: fullConfig?.connection,
      sla:        fullConfig?.sla,
      sync: {
        enabled:         sync.enabled,
        intervalMinutes: Number(sync.intervalMinutes),
        maxIncidents:    Number(sync.maxIncidents),
        lastSync:        fullConfig?.sync?.lastSync,
      },
    });
    if (!res?.success) {
      throw new Error(res?.error?.message || uiText.common.fetchError);
    }
    log.info('handleSave', 'Sync settings saved');
    await loadConfig();
    return { sync };
  }, [sync, fullConfig, loadConfig]);

  // ── Render ──────────────────────────────────────────────────────────────
  const lastSync = fullConfig?.sync?.lastSync;

  return (
    <div className="p-5 space-y-5 max-w-xl">
      {loading && <PageSpinner modal message="Loading sync settings..." />}
      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>{t.subtitle}</span>
      </div>

      {/* Fetch error */}
      {fetchError && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          <AlertCircle size={13} />{fetchError}
        </div>
      )}

      {/* Sync settings */}
      <div className="space-y-4">
        {/* Auto-sync toggle */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-surface-200 px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-surface-700">{t.enabledLabel}</p>
            <p className="text-xs text-surface-400 mt-0.5">{t.enabledDescription}</p>
          </div>
          <button
            onClick={() => handleChange('enabled', !sync.enabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              sync.enabled
                ? 'bg-brand-100 text-brand-700 hover:bg-brand-200'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
            }`}
          >
            {sync.enabled
              ? <><ToggleRight size={16} className="text-brand-600" />{uiText.common.enabled}</>
              : <><ToggleLeft  size={16} className="text-surface-400" />{uiText.common.disabled}</>
            }
          </button>
        </div>

        {/* Interval */}
        <div className="bg-white rounded-xl border border-surface-200 px-4 py-3 shadow-sm">
          <label className="block text-sm font-semibold text-surface-700 mb-0.5">{t.intervalLabel}</label>
          <p className="text-xs text-surface-400 mb-2">{t.intervalHint}</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={1440}
              value={sync.intervalMinutes}
              onChange={e => handleChange('intervalMinutes', parseInt(e.target.value, 10) || 30)}
              disabled={!sync.enabled}
              placeholder={t.intervalPlaceholder}
              className="w-24 px-3 py-1.5 text-sm rounded-lg border border-surface-300 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent disabled:opacity-50 disabled:bg-surface-50 transition-all"
            />
            <span className="text-xs text-surface-500 font-medium">minutes</span>
          </div>
        </div>

        {/* Max incidents */}
        <div className="bg-white rounded-xl border border-surface-200 px-4 py-3 shadow-sm">
          <label className="block text-sm font-semibold text-surface-700 mb-0.5">{t.maxIncidentsLabel}</label>
          <p className="text-xs text-surface-400 mb-2">{t.maxIncidentsHint}</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={1000}
              value={sync.maxIncidents}
              onChange={e => handleChange('maxIncidents', parseInt(e.target.value, 10) || 500)}
              placeholder={t.maxIncidentsPlaceholder}
              className="w-24 px-3 py-1.5 text-sm rounded-lg border border-surface-300 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
            />
            <span className="text-xs text-surface-500 font-medium">incidents</span>
          </div>
        </div>

        {/* Last sync info */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-50 border border-surface-200">
          <Clock size={13} className="text-surface-400 flex-shrink-0" />
          <span className="text-xs text-surface-600">
            <span className="font-semibold">{t.lastSyncLabel}:</span>{' '}
            {lastSync ? new Date(lastSync).toLocaleString() : t.never}
          </span>
        </div>
      </div>

      {/* Sync result feedback */}
      {syncResult && (
        <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs ${
          syncResult.success
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {syncResult.success
            ? <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" />
            : <AlertCircle  size={13} className="flex-shrink-0 mt-0.5" />
          }
          <span>
            {syncResult.success
              ? `${t.syncSuccess}: ${syncResult.count} incidents synchronized.`
              : syncResult.error || t.syncFailed
            }
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleManualSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100 disabled:opacity-40 transition-colors"
        >
          {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {syncing ? t.syncing : t.manualSyncButton}
        </button>
        <button
          onClick={() => setShowConfirm(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          {t.saveButton}
        </button>
      </div>

      {/* Confirmation modal */}
      <ConfirmationModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title={t.confirmTitle}
        actionDescription={t.confirmDescription}
        actionTarget={t.confirmTarget}
        actionDetails={[
          { label: t.enabledLabel,      value: sync.enabled ? uiText.common.enabled : uiText.common.disabled },
          { label: t.intervalLabel,     value: `${sync.intervalMinutes} minutes` },
          { label: t.maxIncidentsLabel, value: `${sync.maxIncidents} incidents` },
        ]}
        confirmLabel={uiText.common.save}
        variant="info"
        action={handleSave}
        onSuccess={() => setShowConfirm(false)}
        buildSummary={() => [
          { label: t.confirmSummaryStatus, value: t.confirmSummarySuccess },
          { label: t.enabledLabel,         value: sync.enabled ? uiText.common.enabled : uiText.common.disabled },
          { label: t.intervalLabel,        value: `${sync.intervalMinutes} minutes` },
        ]}
      />
    </div>
  );
}
