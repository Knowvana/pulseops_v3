// ============================================================================
// ServiceNowDataManagementTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Configuration tab for managing the ServiceNow module's data.
// Displays schema status, allows loading default data, and provides
// a danger zone for hard-resetting all module data.
//
// USED BY: manifest.jsx → getConfigTabs() → sn_data_management
//
// DEPENDENCIES:
//   - lucide-react       → Icons
//   - @shared            → createLogger, ApiClient
//   - @components        → ConfirmDialog
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database, Download, Trash2, Loader2, AlertCircle,
  CheckCircle2, AlertTriangle, Shield,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { ConfirmDialog } from '@components';
import uiText from '../../config/uiText.json';

const log = createLogger('ServiceNowDataManagementTab.jsx');
const t = uiText.dataManagement;

const snApi = {
  schemaInfo: '/api/servicenow/schema/info',
  demoData:   '/api/servicenow/data/demo',
  hardReset:  '/api/servicenow/data/reset',
};

export default function ServiceNowDataManagementTab() {
  const [schema, setSchema]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError]         = useState(null);
  const [success, setSuccess]     = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const initRan = useRef(false);

  // ── Load schema status ────────────────────────────────────────────────
  const loadSchema = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.get(snApi.schemaInfo);
      if (res?.success) {
        setSchema(res.data);
        log.info('loadSchema', 'Schema info loaded');
      }
    } catch (err) {
      log.error('loadSchema', 'Load failed', { error: err.message });
      setError(uiText.common.fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadSchema();
  }, [loadSchema]);

  // ── Load default data ─────────────────────────────────────────────────
  const handleLoadDefaults = useCallback(async () => {
    setLoadingDefaults(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await ApiClient.post(snApi.demoData, {});
      if (res?.success) {
        setSuccess(res.data?.message || 'Default data loaded successfully.');
        log.info('handleLoadDefaults', 'Default data loaded');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(res?.error?.message || 'Failed to load defaults');
      }
    } catch (err) {
      setError(err.message);
      log.error('handleLoadDefaults', 'Load failed', { error: err.message });
    } finally {
      setLoadingDefaults(false);
    }
  }, []);

  // ── Hard reset ─────────────────────────────────────────────────────────
  const handleHardReset = useCallback(async () => {
    setShowResetConfirm(false);
    setResetting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await ApiClient.delete(snApi.hardReset);
      if (res?.success) {
        setSuccess(res.data?.message || 'Module data reset successfully.');
        setSchema(null);
        log.info('handleHardReset', 'Module reset complete');
        setTimeout(() => setSuccess(null), 3000);
        loadSchema();
      } else {
        setError(res?.error?.message || 'Reset failed');
      }
    } catch (err) {
      setError(err.message);
      log.error('handleHardReset', 'Reset failed', { error: err.message });
    } finally {
      setResetting(false);
    }
  }, [loadSchema]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
          <Database size={18} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-surface-800">{t.title}</h2>
          <p className="text-xs text-surface-500">{t.subtitle}</p>
        </div>
      </div>

      {/* Status banners */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <AlertCircle size={14} /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <CheckCircle2 size={14} /><span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="text-brand-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Schema Status */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Shield size={15} className="text-surface-500" />
              <h3 className="text-sm font-bold text-surface-700">{t.schemaStatusTitle}</h3>
            </div>
            <p className="text-xs text-surface-400">{t.schemaStatusSubtitle}</p>

            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                schema?.initialized
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {schema?.initialized
                  ? <><CheckCircle2 size={12} /> {t.initialized}</>
                  : <><AlertTriangle size={12} /> {t.notInitialized}</>
                }
              </span>
            </div>

            {schema?.existing?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-surface-600 mb-1">{t.existingTables}</p>
                <div className="flex flex-wrap gap-1.5">
                  {schema.existing.map(tbl => (
                    <span key={tbl} className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {tbl}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {schema?.missing?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-surface-600 mb-1">{t.missingTables}</p>
                <div className="flex flex-wrap gap-1.5">
                  {schema.missing.map(tbl => (
                    <span key={tbl} className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-50 text-rose-700 border border-rose-200">
                      {tbl}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Default Data */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-surface-700">{t.defaultDataTitle}</h3>
                <p className="text-xs text-surface-400">{t.defaultDataSubtitle}</p>
              </div>
              <button onClick={handleLoadDefaults} disabled={loadingDefaults}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors">
                {loadingDefaults ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {loadingDefaults ? t.loading : t.loadDefaultsButton}
              </button>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-2xl border-2 border-rose-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-rose-500" />
              <h3 className="text-sm font-bold text-rose-700">{t.dangerZoneTitle}</h3>
            </div>
            <p className="text-xs text-surface-500">{t.dangerZoneSubtitle}</p>

            <div className="flex items-center justify-between bg-rose-50/50 rounded-lg px-4 py-3 border border-rose-100">
              <div>
                <p className="text-sm font-semibold text-surface-700">{t.hardResetButton}</p>
                <p className="text-xs text-surface-500">{t.hardResetDescription}</p>
              </div>
              <button onClick={() => setShowResetConfirm(true)} disabled={resetting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 transition-colors flex-shrink-0">
                {resetting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {resetting ? 'Resetting...' : t.hardResetButton}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Reset confirm dialog */}
      {showResetConfirm && (
        <ConfirmDialog
          title={t.confirmResetTitle}
          description={t.confirmResetDescription}
          target={t.confirmResetTarget}
          variant="danger"
          onConfirm={handleHardReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </div>
  );
}
