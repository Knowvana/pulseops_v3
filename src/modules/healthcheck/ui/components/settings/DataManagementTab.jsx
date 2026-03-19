// ============================================================================
// DataManagementTab — HealthCheck Module Config
//
// PURPOSE: Schema status, load default data, reset all module data.
// Follows the same pattern as ServiceNow DataManagementTab.
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
  const [loading, setLoading] = useState(true);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const initRan = useRef(false);

  const loadSchema = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await ApiClient.get(api.schemaInfo);
      if (res?.success) setSchema(res.data);
      else setError(res?.error?.message || tc.fetchError);
    } catch (err) { setError(tc.fetchError); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadSchema();
  }, [loadSchema]);

  const handleLoadDefaults = useCallback(async () => {
    setLoadingDefaults(true); setError(null); setSuccess(null);
    try {
      const res = await ApiClient.post(api.loadDefaults);
      if (res?.success) {
        setSuccess(res.message);
        setTimeout(() => setSuccess(null), 4000);
        await loadSchema();
      } else { setError(res?.error?.message || 'Failed'); }
    } catch (err) { setError(err.message); }
    finally { setLoadingDefaults(false); }
  }, [loadSchema]);

  const handleReset = useCallback(async () => {
    setResetting(true); setError(null); setSuccess(null);
    setShowResetConfirm(false);
    try {
      const res = await ApiClient.delete(api.resetData);
      if (res?.success) {
        setSuccess(res.message);
        setTimeout(() => setSuccess(null), 4000);
        await loadSchema();
      } else { setError(res?.error?.message || 'Failed'); }
    } catch (err) { setError(err.message); }
    finally { setResetting(false); }
  }, [loadSchema]);

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-surface-800">{t.title}</h3>
        <p className="text-xs text-surface-500">{t.subtitle}</p>
      </div>

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

      {/* Schema Status */}
      <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Database size={16} className="text-brand-600" />
          <h4 className="text-sm font-bold text-surface-800">{t.schemaStatus}</h4>
          {schema?.initialized ? (
            <span className="ml-auto text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Initialized</span>
          ) : (
            <span className="ml-auto text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Not Initialized</span>
          )}
        </div>

        {schema?.tables && schema.tables.length > 0 && (
          <div className="overflow-x-auto border border-surface-100 rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  <th className="px-3 py-2 text-left font-semibold text-surface-600">{t.tableColumns.name}</th>
                  <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.tableColumns.exists}</th>
                  <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.tableColumns.rowCount}</th>
                  <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.tableColumns.columns}</th>
                  <th className="px-3 py-2 text-center font-semibold text-surface-600">{t.tableColumns.indexes}</th>
                </tr>
              </thead>
              <tbody>
                {schema.tables.map(tbl => (
                  <tr key={tbl.name} className="border-b border-surface-50">
                    <td className="px-3 py-2 font-medium text-surface-700 flex items-center gap-1.5">
                      <Table2 size={12} className="text-surface-400" /> {tbl.name}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {tbl.exists
                        ? <CheckCircle2 size={14} className="text-emerald-500 inline" />
                        : <AlertTriangle size={14} className="text-amber-500 inline" />}
                    </td>
                    <td className="px-3 py-2 text-center font-medium">{tbl.exists ? tbl.rowCount : '—'}</td>
                    <td className="px-3 py-2 text-center">{tbl.definedColumns}</td>
                    <td className="px-3 py-2 text-center">{tbl.indexes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button onClick={handleLoadDefaults} disabled={loadingDefaults}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1.5">
          {loadingDefaults ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {loadingDefaults ? t.loadingDefaultsButton : t.loadDefaultsButton}
        </button>
        <button onClick={() => setShowResetConfirm(true)} disabled={resetting}
          className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 flex items-center gap-1.5">
          {resetting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          {resetting ? t.resettingButton : t.resetButton}
        </button>
      </div>

      {showResetConfirm && (
        <ConfirmDialog isOpen={true} title={t.resetConfirm.title} description={t.resetConfirm.message}
          confirmLabel={t.resetConfirm.confirmButton} onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)} variant="danger" />
      )}
    </div>
  );
}
