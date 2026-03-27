// ============================================================================
// DataManagementTab — Accessio Operations Module Config
//
// PURPOSE: Schema status, load default data, reset all module data.
// Follows the same pattern as HealthCheck module's DataManagementTab.
//
// USED BY: manifest.jsx → getConfigTabs()
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database, Download, Trash2, Loader2, AlertCircle,
  CheckCircle2, AlertTriangle, Table2, Shield,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { ConfirmDialog, PageSpinner } from '@components';
import uiText from '../../config/uiText.json';
import urls from '../../config/urls.json';

const log = createLogger('DataManagementTab.jsx');
const t = uiText.dataManagement;
const tc = uiText.common;
const api = urls.api;

export default function DataManagementTab() {
  const [schema, setSchema] = useState(null);
  const [dataStatus, setDataStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const initRan = useRef(false);

  const loadSchema = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [schemaRes, statusRes] = await Promise.all([
        ApiClient.get(api.schemaInfo),
        ApiClient.get(api.schemaStatus),
      ]);
      if (schemaRes?.success) setSchema(schemaRes.data);
      if (statusRes?.success) setDataStatus(statusRes.data);
    } catch (err) {
      log.error('loadSchema failed', { message: err.message });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadSchema();
  }, [loadSchema]);

  const handleLoadDefaults = useCallback(async () => {
    setLoadingDefaults(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await ApiClient.post(api.loadDefaults);
      if (res?.success) {
        setSuccess(res.message || 'Default data loaded.');
        setTimeout(() => setSuccess(null), 3000);
        await loadSchema();
      } else {
        setError(res?.error?.message || 'Failed to load defaults.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDefaults(false);
    }
  }, [loadSchema]);

  const handleReset = useCallback(async () => {
    setResetting(true);
    setError(null);
    setSuccess(null);
    setShowResetConfirm(false);
    try {
      const res = await ApiClient.delete(api.resetData);
      if (res?.success) {
        setSuccess(res.message || 'Module data reset.');
        setTimeout(() => setSuccess(null), 3000);
        await loadSchema();
      } else {
        setError(res?.error?.message || 'Failed to reset data.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
  }, [loadSchema]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-brand-500" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-surface-800">{t.title}</h3>
        <p className="text-xs text-surface-500 -mt-3">{t.subtitle}</p>

        {/* Schema Status */}
        {dataStatus && (
          <div className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg border ${
            dataStatus.schemaInitialized
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-amber-700 bg-amber-50 border-amber-200'
          }`}>
            {dataStatus.schemaInitialized ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {dataStatus.message}
          </div>
        )}

        {/* Table Grid */}
        {schema?.tables && schema.tables.length > 0 && (
          <div className="border border-surface-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-surface-600">{t.tableColumns.name}</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-surface-600">{t.tableColumns.exists}</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-surface-600">{t.tableColumns.rowCount}</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-surface-600">{t.tableColumns.columns}</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-surface-600">{t.tableColumns.indexes}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {schema.tables.map(tbl => (
                  <tr key={tbl.name} className="hover:bg-surface-50">
                    <td className="px-3 py-2 font-mono text-xs">{tbl.name}</td>
                    <td className="px-3 py-2 text-center">
                      {tbl.exists
                        ? <CheckCircle2 size={14} className="inline text-emerald-500" />
                        : <AlertCircle size={14} className="inline text-red-400" />}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">{tbl.rowCount}</td>
                    <td className="px-3 py-2 text-center text-xs">{tbl.exists ? tbl.columns?.length : tbl.definedColumns}</td>
                    <td className="px-3 py-2 text-center text-xs">{tbl.indexes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Error / Success Messages */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle2 size={14} /> {success}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleLoadDefaults} disabled={loadingDefaults}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2">
            {loadingDefaults ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {loadingDefaults ? t.loadingDefaultsButton : t.loadDefaultsButton}
          </button>

          <button onClick={() => setShowResetConfirm(true)} disabled={resetting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
            {resetting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {resetting ? t.resettingButton : t.resetButton}
          </button>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title={t.resetConfirm.title}
        message={t.resetConfirm.message}
        confirmLabel={t.resetConfirm.confirmButton}
        onConfirm={handleReset}
        onCancel={() => setShowResetConfirm(false)}
        variant="danger"
      />
    </div>
  );
}
