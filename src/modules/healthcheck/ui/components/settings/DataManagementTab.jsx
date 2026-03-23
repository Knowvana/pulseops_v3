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
    log.debug('loadSchema', 'Starting schema and data status fetch');
    
    try {
      // Fetch schema info
      log.debug('loadSchema', 'Fetching schema info', { endpoint: api.schemaInfo });
      const schemaRes = await ApiClient.get(api.schemaInfo);
      
      if (!schemaRes) {
        const errMsg = 'Schema info response is null or undefined';
        log.error('loadSchema', 'Schema info fetch returned empty response', { endpoint: api.schemaInfo });
        setError(errMsg);
        return;
      }

      if (schemaRes?.success) {
        log.info('loadSchema', 'Schema info loaded successfully', { 
          tables: schemaRes.data?.tables?.length || 0,
          initialized: schemaRes.data?.initialized 
        });
        setSchema(schemaRes.data);
      } else {
        const errMsg = schemaRes?.error?.message || tc.fetchError;
        log.error('loadSchema', 'Schema info fetch failed', { 
          error: schemaRes?.error,
          endpoint: api.schemaInfo 
        });
        setError(errMsg);
        return;
      }

      // Fetch data status
      log.debug('loadSchema', 'Fetching data status', { endpoint: api.schemaStatus });
      try {
        const statusRes = await ApiClient.get(api.schemaStatus);
        
        if (!statusRes) {
          log.warn('loadSchema', 'Data status response is null or undefined', { endpoint: api.schemaStatus });
          return;
        }

        if (statusRes?.success) {
          log.info('loadSchema', 'Data status loaded successfully', { 
            schemaInitialized: statusRes.data?.schemaInitialized,
            defaultDataLoaded: statusRes.data?.defaultDataLoaded,
            message: statusRes.data?.message,
            details: statusRes.data?.details
          });
          setDataStatus(statusRes.data);
        } else {
          log.warn('loadSchema', 'Data status fetch returned error', { 
            error: statusRes?.error,
            endpoint: api.schemaStatus 
          });
          // Don't set error state for this — it's secondary to schema info
        }
      } catch (statusErr) {
        log.error('loadSchema', 'Data status fetch threw exception', { 
          message: statusErr?.message,
          code: statusErr?.code,
          endpoint: api.schemaStatus,
          stack: statusErr?.stack
        });
        // Don't set error state for this — it's secondary to schema info
      }
    } catch (err) {
      const errMsg = err?.message || tc.fetchError;
      log.error('loadSchema', 'Failed with exception', { 
        message: errMsg,
        code: err?.code,
        stack: err?.stack
      });
      setError(errMsg);
    } finally {
      setLoading(false);
      log.debug('loadSchema', 'Fetch complete');
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
    log.debug('handleLoadDefaults', 'Starting default data load', { endpoint: api.loadDefaults });
    
    try {
      log.debug('handleLoadDefaults', 'Posting to load defaults endpoint', { endpoint: api.loadDefaults });
      const res = await ApiClient.post(api.loadDefaults);
      
      if (!res) {
        const errMsg = 'Load defaults response is null or undefined';
        log.error('handleLoadDefaults', 'Load defaults returned empty response', { endpoint: api.loadDefaults });
        setError(errMsg);
        return;
      }

      if (res?.success) {
        const successMsg = res.message || 'Default data loaded successfully';
        log.info('handleLoadDefaults', 'Default data loaded successfully', { 
          message: successMsg,
          tables: res.data?.tables,
          rows: res.data?.rows
        });
        setSuccess(successMsg);
        setTimeout(() => setSuccess(null), 4000);
        
        // Refresh schema and data status
        log.debug('handleLoadDefaults', 'Refreshing schema after loading defaults');
        await loadSchema();
      } else {
        const errMsg = res?.error?.message || 'Failed to load default data';
        log.error('handleLoadDefaults', 'Load defaults failed', { 
          error: res?.error,
          endpoint: api.loadDefaults 
        });
        setError(errMsg);
      }
    } catch (err) {
      const errMsg = err?.message || 'Exception occurred while loading defaults';
      log.error('handleLoadDefaults', 'Threw exception', { 
        message: errMsg,
        code: err?.code,
        endpoint: api.loadDefaults,
        stack: err?.stack
      });
      setError(errMsg);
    } finally {
      setLoadingDefaults(false);
      log.debug('handleLoadDefaults', 'Operation complete');
    }
  }, [loadSchema]);

  const handleReset = useCallback(async () => {
    setResetting(true);
    setError(null);
    setSuccess(null);
    setShowResetConfirm(false);
    log.debug('handleReset', 'Starting data reset', { endpoint: api.resetData });
    
    try {
      log.debug('handleReset', 'Deleting all module data', { endpoint: api.resetData });
      const res = await ApiClient.delete(api.resetData);
      
      if (!res) {
        const errMsg = 'Reset response is null or undefined';
        log.error('handleReset', 'Reset returned empty response', { endpoint: api.resetData });
        setError(errMsg);
        return;
      }

      if (res?.success) {
        const successMsg = res.message || 'All data reset successfully';
        log.info('handleReset', 'Data reset successfully', { 
          message: successMsg,
          dropped: res.data?.dropped,
          skipped: res.data?.skipped,
          errors: res.data?.errors,
          totalRows: res.data?.totalRows
        });
        setSuccess(successMsg);
        setTimeout(() => setSuccess(null), 4000);
        
        // Refresh schema and data status
        log.debug('handleReset', 'Refreshing schema after reset');
        await loadSchema();
      } else {
        const errMsg = res?.error?.message || 'Failed to reset data';
        log.error('handleReset', 'Reset failed', { 
          error: res?.error,
          endpoint: api.resetData 
        });
        setError(errMsg);
      }
    } catch (err) {
      const errMsg = err?.message || 'Exception occurred while resetting data';
      log.error('handleReset', 'Threw exception', { 
        message: errMsg,
        code: err?.code,
        endpoint: api.resetData,
        stack: err?.stack
      });
      setError(errMsg);
    } finally {
      setResetting(false);
      log.debug('handleReset', 'Operation complete');
    }
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

      {/* Data Status Message */}
      {dataStatus && (
        <div className={`px-4 py-3 rounded-lg border flex items-start gap-2.5 ${
          dataStatus.defaultDataLoaded
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {dataStatus.defaultDataLoaded ? (
            <>
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Default Data Already Loaded</p>
                <p className="text-xs text-emerald-700 mt-0.5">All default categories and applications are already configured in the database. Click "Reset All Data" if you want to reload from scratch.</p>
              </div>
            </>
          ) : dataStatus.schemaInitialized ? (
            <>
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Schema Initialized - Data Not Loaded</p>
                <p className="text-xs text-amber-700 mt-0.5">Database tables exist but default data has not been loaded. Click "Load Default Data" to populate the database with sample categories and applications.</p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Schema Not Initialized</p>
                <p className="text-xs text-amber-700 mt-0.5">Database tables have not been created yet. Please initialize the schema first.</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button 
          onClick={handleLoadDefaults} 
          disabled={loadingDefaults || dataStatus?.defaultDataLoaded}
          title={dataStatus?.defaultDataLoaded ? 'Default data is already loaded' : ''}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
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
