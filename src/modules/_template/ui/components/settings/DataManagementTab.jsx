// ============================================================================
// DataManagementTab — PulseOps V3 Module Template
//
// PURPOSE: Settings tab for managing a module's database tables and seed data.
// Works out-of-the-box with ANY module that has database/Schema.json and
// database/DefaultData.json — no customisation needed.
//
// FEATURES:
//   - Displays live DB table status (exists, row count, columns, indexes)
//   - Shows schema initialization date and version from system_modules
//   - "Load Default Data" button seeds rows from DefaultData.json
//   - "Delete Module Data" button drops all tables defined in Schema.json
//
// HOW IT WORKS:
//   1. On mount, calls GET /api/<moduleId>/schema/info
//   2. Renders a table grid showing each DB table's status
//   3. "Load Default Data" calls POST /api/<moduleId>/data/defaults
//   4. "Delete Module Data" calls DELETE /api/<moduleId>/data/reset
//
// CUSTOMISATION:
//   - Replace '_template' in the API URLs below with your module ID.
//   - All UI text comes from uiText.json → dataManagement section.
//   - Styling uses Tailwind CSS classes consistent with the platform theme.
//
// USED BY: manifest.jsx → getConfigTabs() → data_management
//
// DEPENDENCIES:
//   - lucide-react   → Icons
//   - @shared        → createLogger, ApiClient
//   - @components    → ConfirmDialog (for delete confirmation)
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database, Download, Trash2, Loader2, AlertCircle,
  CheckCircle2, AlertTriangle, Shield, Clock, Table2,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { ConfirmDialog } from '@components';
import uiText from '../../config/uiText.json';

// ── Logger for this component ───────────────────────────────────────────────
// createLogger(<filename>) produces structured log entries tagged with the file.
const log = createLogger('DataManagementTab.jsx');

// ── UI text shorthand ───────────────────────────────────────────────────────
// All user-visible strings live in uiText.json → dataManagement section.
// This keeps the component free of hardcoded strings.
const t = uiText.dataManagement;

// ── API endpoints ───────────────────────────────────────────────────────────
// CHANGE '_template' to your module ID (must match the route prefix in api/index.js).
const moduleApi = {
  schemaInfo:   '/api/_template/schema/info',
  loadDefaults: '/api/_template/data/defaults',
  deleteData:   '/api/_template/data/reset',
};

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function DataManagementTab() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [schema, setSchema]                   = useState(null);   // schema/info response
  const [loading, setLoading]                 = useState(true);   // initial load spinner
  const [loadingDefaults, setLoadingDefaults] = useState(false);  // "Load Default Data" spinner
  const [resetting, setResetting]             = useState(false);  // "Delete Module Data" spinner
  const [error, setError]                     = useState(null);   // error banner text
  const [success, setSuccess]                 = useState(null);   // success banner text
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const initRan = useRef(false); // prevents double-fetch in React strict mode

  // ── Fetch schema info ─────────────────────────────────────────────────────
  // Called on mount and after load-defaults / delete operations to refresh.
  const loadSchema = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      log.info('loadSchema', 'Fetching schema info...');
      const res = await ApiClient.get(moduleApi.schemaInfo);

      if (res?.success) {
        setSchema(res.data);
        log.info('loadSchema', 'Schema info loaded', {
          initialized: res.data.initialized,
          tables: res.data.tables?.length,
        });
      } else {
        const errorMsg = res?.error?.message || uiText.common.fetchError;
        log.error('loadSchema', 'Load failed', { error: errorMsg });
        setError(errorMsg);
      }
    } catch (err) {
      log.error('loadSchema', 'Unexpected error', { error: err.message });
      setError(uiText.common.fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  // Run once on mount
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('mount', 'DataManagementTab mounted');
    loadSchema();
  }, [loadSchema]);

  // ── Load default data ─────────────────────────────────────────────────────
  // Calls POST /data/defaults → inserts rows from DefaultData.json.
  const handleLoadDefaults = useCallback(async () => {
    setLoadingDefaults(true);
    setError(null);
    setSuccess(null);

    try {
      log.info('handleLoadDefaults', 'Loading default data...');
      const res = await ApiClient.post(moduleApi.loadDefaults, {});

      if (res?.success) {
        const message = res.data?.message || 'Default data loaded successfully.';
        setSuccess(message);
        log.info('handleLoadDefaults', 'Default data loaded', {
          tablesSeeded: res.data?.tablesSeeded?.length,
          totalRowsInserted: res.data?.totalRowsInserted,
        });
        // Refresh schema info to show updated row counts
        setTimeout(() => loadSchema(), 500);
        setTimeout(() => setSuccess(null), 5000);
      } else {
        const errorMsg = res?.error?.message || 'Failed to load defaults';
        setError(errorMsg);
        log.error('handleLoadDefaults', 'Load failed', { error: errorMsg });
      }
    } catch (err) {
      setError(err.message || 'Unexpected error');
      log.error('handleLoadDefaults', 'Unexpected error', { error: err.message });
    } finally {
      setLoadingDefaults(false);
    }
  }, [loadSchema]);

  // ── Delete all module data ────────────────────────────────────────────────
  // Calls DELETE /data/reset → drops all tables in Schema.json.
  const handleDeleteData = useCallback(async () => {
    setShowResetConfirm(false);
    setResetting(true);
    setError(null);
    setSuccess(null);

    try {
      log.warn('handleDeleteData', 'Deleting all module database objects...');
      const res = await ApiClient.delete(moduleApi.deleteData);

      if (res?.success) {
        const message = res.data?.message || 'Module data deleted successfully.';
        setSuccess(message);
        setSchema(null);
        log.info('handleDeleteData', 'Delete completed', {
          tablesDropped: res.data?.droppedTables?.length,
          totalRowsDeleted: res.data?.totalRowsDeleted,
        });
        setTimeout(() => loadSchema(), 500);
        setTimeout(() => setSuccess(null), 5000);
      } else {
        const errorMsg = res?.error?.message || 'Delete failed';
        setError(errorMsg);
        log.error('handleDeleteData', 'Delete failed', { error: errorMsg });
      }
    } catch (err) {
      setError(err.message || 'Unexpected error');
      log.error('handleDeleteData', 'Unexpected error', { error: err.message });
    } finally {
      setResetting(false);
    }
  }, [loadSchema]);

  // ── Computed: total row count across all tables ───────────────────────────
  const totalRows = schema?.tables?.reduce((sum, tbl) => sum + (tbl.rowCount || 0), 0) || 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
          <Database size={18} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-surface-800">{t.title}</h2>
          <p className="text-xs text-surface-500">{t.subtitle}</p>
        </div>
      </div>

      {/* ── Status banners ─────────────────────────────────────────────────── */}
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

      {/* ── Loading spinner ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="text-brand-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Schema Status Card ───────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-4">
            {/* Card header with initialized badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={15} className="text-surface-500" />
                <h3 className="text-sm font-bold text-surface-700">{t.schemaStatusTitle}</h3>
              </div>
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
            <p className="text-xs text-surface-400">{t.schemaStatusSubtitle}</p>

            {/* Init date + schema version */}
            {schema?.schemaInitializedAt && (
              <div className="flex items-center gap-4 text-xs text-surface-500">
                <div className="flex items-center gap-1.5">
                  <Clock size={12} />
                  <span>Initialized: <span className="font-semibold text-surface-700">{new Date(schema.schemaInitializedAt).toLocaleString()}</span></span>
                </div>
                {schema?.schemaVersion && (
                  <span className="px-2 py-0.5 rounded bg-surface-100 text-surface-600 font-mono text-[10px]">v{schema.schemaVersion}</span>
                )}
              </div>
            )}

            {/* ── Tables grid ──────────────────────────────────────────── */}
            {schema?.tables?.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-surface-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-50 border-b border-surface-200">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">Table</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">Description</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">Status</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">Rows</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">Columns</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">Indexes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {schema.tables.map(tbl => (
                      <tr key={tbl.name} className="hover:bg-surface-50/50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Table2 size={13} className="text-brand-500 flex-shrink-0" />
                            <span className="font-mono text-xs font-semibold text-surface-800">{tbl.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-surface-500 max-w-[200px] truncate">{tbl.description}</td>
                        <td className="px-4 py-2.5 text-center">
                          {tbl.exists ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={10} /> Exists
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertCircle size={10} /> Missing
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-bold text-surface-700">{tbl.exists ? tbl.rowCount.toLocaleString() : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-surface-500">{tbl.columnCount}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-surface-500">{tbl.indexCount}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-50/50 border-t border-surface-200">
                      <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-surface-600">
                        {schema.tables.length} table(s) defined in Schema.json
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-surface-700">{totalRows.toLocaleString()}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* No Schema.json warning */}
            {!schema?.hasSchema && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                <AlertTriangle size={13} />
                <span>No Schema.json found for this module. Database tables cannot be managed.</span>
              </div>
            )}
          </div>

          {/* ── Default Data Card ────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-surface-700">{t.defaultDataTitle}</h3>
                <p className="text-xs text-surface-400">{t.defaultDataSubtitle}</p>
              </div>
              <div className="flex items-center gap-3">
                {schema?.defaultDataLoaded && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 size={10} /> Loaded
                  </span>
                )}
                <button onClick={handleLoadDefaults} disabled={loadingDefaults || !schema?.initialized}
                  title={!schema?.initialized ? 'Schema must be initialized first' : ''}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {loadingDefaults ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {loadingDefaults ? t.loading : t.loadDefaultsButton}
                </button>
              </div>
            </div>
            {!schema?.initialized && schema?.hasSchema && (
              <div className="flex items-center gap-2 text-xs text-amber-600">
                <AlertTriangle size={12} />
                <span>Schema must be initialized before loading default data.</span>
              </div>
            )}
          </div>

          {/* ── Danger Zone — Delete Module Data ─────────────────────────── */}
          <div className="bg-white rounded-2xl border-2 border-rose-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-rose-500" />
              <h3 className="text-sm font-bold text-rose-700">{t.dangerZoneTitle}</h3>
            </div>
            <p className="text-xs text-surface-500">{t.dangerZoneSubtitle}</p>

            <div className="flex items-center justify-between bg-rose-50/50 rounded-lg px-4 py-3 border border-rose-100">
              <div>
                <p className="text-sm font-semibold text-surface-700">{t.deleteDataButton}</p>
                <p className="text-xs text-surface-500">{t.deleteDataDescription}</p>
              </div>
              <button onClick={() => setShowResetConfirm(true)} disabled={resetting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 transition-colors flex-shrink-0">
                {resetting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {resetting ? 'Deleting...' : t.deleteDataButton}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Delete confirmation dialog ───────────────────────────────────── */}
      {showResetConfirm && (
        <ConfirmDialog
          title={t.confirmDeleteTitle}
          description={t.confirmDeleteDescription}
          target={t.confirmDeleteTarget}
          variant="danger"
          onConfirm={handleDeleteData}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </div>
  );
}
