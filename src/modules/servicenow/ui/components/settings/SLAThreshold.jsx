// ============================================================================
// SLAThresholds — ServiceNow Module (PulseOps V3)
//
// PURPOSE: Dedicated component for managing Incident SLA thresholds using the
// platform's CRUD modal conventions (ConfirmationModal → Confirm/Progress/Summary).
// Supports create, edit, delete, and enable/disable actions with business-level
// debug logging to aid troubleshooting.
//
// ENHANCEMENTS:
//   - Checks SLA column mapping from DB on mount; shows SetupRequiredOverlay
//     if column mapping is not configured, with button to navigate to SLA Column
//     Mapping tab via useConfigLayout.
//   - Auto-fetches all priorities from ServiceNow API on mount (no manual click).
//   - Priorities grid only shows after column mapping check passes.
// ============================================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  RefreshCw,
  ShieldCheck,
  Columns,
} from 'lucide-react';
import { createLogger, useConfigLayout } from '@shared';
import { ToggleSwitch, SetupRequiredOverlay, PageSpinner } from '@components';
import ApiClient from '@shared/services/apiClient';
import uiText from '../../config/uiText.json';

const log = createLogger('SLAThresholds.jsx');
const t = uiText.sla;
const snApi = {
  slaConfig: '/api/servicenow/config/sla',
  slaPriorities: '/api/servicenow/config/sla/priorities',
  incidentConfig: '/api/servicenow/config/incidents',
};

const defaultForm = {
  responseMinutes: 60,
  resolutionMinutes: 480,
  sortOrder: 99,
  enabled: true,
};

const normalizeValue = (value) => String(value ?? '').trim();

export default function SLAThresholds() {
  const { navigateToTab } = useConfigLayout();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusBanner, setStatusBanner] = useState(null);
  const [priorities, setPriorities] = useState([]);
  const [priorityFetch, setPriorityFetch] = useState({ loading: false, error: null, lastFetched: null });
  const [modalState, setModalState] = useState({ open: false, priority: null, existing: null });
  const [formState, setFormState] = useState(defaultForm);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalResult, setModalResult] = useState(null); // { success, message }

  // Column mapping check
  const [columnMappingOk, setColumnMappingOk] = useState(null); // null = checking, true/false
  const [columnMappingLoading, setColumnMappingLoading] = useState(true);
  const [priorityColumnName, setPriorityColumnName] = useState(null);

  const initRan = useRef(false);

  const resetStatusBanner = useCallback(() => setStatusBanner(null), []);

  // ── Check column mapping from DB ──────────────────────────────────────
  const checkColumnMapping = useCallback(async () => {
    setColumnMappingLoading(true);
    try {
      const res = await ApiClient.get(snApi.incidentConfig);
      if (res?.success) {
        const d = res.data;
        const hasMappings = Boolean(d.createdColumn && d.closedColumn && d.priorityColumn);
        setColumnMappingOk(hasMappings);
        setPriorityColumnName(d.priorityColumn || null);
        log.info('checkColumnMapping', 'Column mapping check', {
          createdColumn: d.createdColumn,
          closedColumn: d.closedColumn,
          priorityColumn: d.priorityColumn,
          hasMappings,
        });
      } else {
        setColumnMappingOk(false);
      }
    } catch (err) {
      log.error('checkColumnMapping', 'Failed to check column mapping', { error: err.message });
      setColumnMappingOk(false);
    } finally {
      setColumnMappingLoading(false);
    }
  }, []);

  const loadSla = useCallback(async () => {
    log.debug('loadSla', 'Fetching persisted SLA thresholds');
    setLoading(true);
    try {
      const res = await ApiClient.get(snApi.slaConfig);
      if (res?.success && Array.isArray(res.data)) {
        setRows(res.data);
        log.info('loadSla', 'SLA thresholds loaded', { count: res.data.length });
      } else {
        const message = res?.error?.message || 'Failed to load SLA configuration.';
        log.warn('loadSla', 'API responded with error', { message });
        setStatusBanner({ success: false, message });
      }
    } catch (err) {
      log.error('loadSla', 'Unexpected error while fetching SLA thresholds', { error: err.message });
      setStatusBanner({ success: false, message: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPriorities = useCallback(async () => {
    log.debug('fetchPriorities', 'Requesting ServiceNow incident priorities');
    setPriorityFetch({ loading: true, error: null, lastFetched: null });
    try {
      const res = await ApiClient.get(snApi.slaPriorities);
      if (res?.success) {
        setPriorities(res.data?.choices || []);
        const fetchedAt = new Date().toISOString();
        setPriorityFetch({ loading: false, error: null, lastFetched: fetchedAt });
        log.info('fetchPriorities', 'Fetched priorities from ServiceNow', { count: res.data?.choices?.length || 0 });
      } else {
        const message = res?.error?.message || 'Failed to fetch priorities.';
        log.warn('fetchPriorities', 'ServiceNow returned error', { message });
        setPriorityFetch({ loading: false, error: message, lastFetched: null });
      }
    } catch (err) {
      log.error('fetchPriorities', 'Unexpected error', { error: err.message });
      setPriorityFetch({ loading: false, error: err.message, lastFetched: null });
    }
  }, []);

  // ── Init: check column mapping, load SLA, auto-fetch priorities ───────
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    checkColumnMapping();
    loadSla();
    fetchPriorities();
  }, [checkColumnMapping, loadSla, fetchPriorities]);

  const combinedRows = useMemo(() => {
    if (!priorities.length) return [];
    const byValue = new Map(rows.map(row => [normalizeValue(row.priority_value), row]));
    return priorities.map((priority, idx) => {
      const key = normalizeValue(priority.value);
      const existing = byValue.get(key);
      return {
        key,
        label: priority.label || priority.value,
        value: key,
        sequence: priority.sequence ?? idx + 1,
        dependentValue: priority.dependentValue,
        id: existing?.id,
        responseMinutes: existing ? Number(existing.response_minutes) : null,
        resolutionMinutes: existing ? Number(existing.resolution_minutes) : null,
        enabled: existing ? Boolean(existing.enabled) : true,
        sortOrder: existing?.sort_order ?? priority.sequence ?? (idx + 1) * 10,
        priorityName: existing?.priority || priority.label || `Priority ${key}`,
        configured: Boolean(existing),
      };
    });
  }, [priorities, rows]);

  const legacyRows = useMemo(() => {
    if (!priorities.length) return [];
    const priorityValues = new Set(priorities.map(p => normalizeValue(p.value)));
    return rows.filter(row => !priorityValues.has(normalizeValue(row.priority_value)));
  }, [priorities, rows]);

  const openConfigureModal = useCallback((priorityRow) => {
    const existing = rows.find(row => normalizeValue(row.priority_value) === priorityRow.value);
    log.debug('openConfigureModal', 'Configuring SLA for priority', { priorityValue: priorityRow.value, hasExisting: !!existing });
    setFormState({
      responseMinutes: existing?.response_minutes ?? 60,
      resolutionMinutes: existing?.resolution_minutes ?? 480,
      sortOrder: existing?.sort_order ?? priorityRow.sequence ?? 99,
      enabled: existing?.enabled ?? true,
    });
    setModalSaving(false);
    setModalResult(null);
    setModalState({ open: true, priority: priorityRow, existing });
  }, [rows]);

  const closeModal = useCallback(() => {
    setModalState({ open: false, priority: null, existing: null });
    setModalResult(null);
  }, []);

  const handleSavePriority = useCallback(async () => {
    if (!modalState.priority) return;
    if (Number(formState.responseMinutes) <= 0) {
      setModalResult({ success: false, message: 'Response minutes must be greater than 0.' });
      return;
    }
    if (Number(formState.resolutionMinutes) <= 0) {
      setModalResult({ success: false, message: 'Resolution minutes must be greater than 0.' });
      return;
    }

    setModalSaving(true);
    setModalResult(null);

    const payload = {
      priority: modalState.priority.label || modalState.priority.value,
      priorityValue: modalState.priority.value,
      responseMinutes: Number(formState.responseMinutes),
      resolutionMinutes: Number(formState.resolutionMinutes),
      enabled: Boolean(formState.enabled),
      sortOrder: Number(formState.sortOrder) || modalState.priority.sequence || 99,
    };

    try {
      const request = modalState.existing
        ? ApiClient.put(`${snApi.slaConfig}/${modalState.existing.id}`, payload)
        : ApiClient.post(snApi.slaConfig, payload);

      const res = await request;
      if (res?.success) {
        setModalResult({ success: true, message: `SLA ${modalState.existing ? 'updated' : 'created'} for ${payload.priority} (${payload.priorityValue}).` });
        await loadSla();
      } else {
        setModalResult({ success: false, message: res?.error?.message || 'Failed to save SLA target.' });
      }
    } catch (err) {
      setModalResult({ success: false, message: err.message });
    } finally {
      setModalSaving(false);
    }
  }, [formState, loadSla, modalState]);

  const handleToggleEnabled = useCallback(async (row) => {
    if (!row.id) {
      setStatusBanner({ success: false, message: 'Configure the SLA before changing its enabled state.' });
      return;
    }
    const newEnabled = !row.enabled;
    log.debug('handleToggleEnabled', 'Toggling enabled state', { id: row.id, next: newEnabled });
    
    // Optimistic update: update local state immediately
    setRows(prev => prev.map(r => 
      r.id === row.id ? { ...r, enabled: newEnabled } : r
    ));
    
    try {
      const res = await ApiClient.put(`${snApi.slaConfig}/${row.id}`, { enabled: newEnabled });
      if (!res?.success) {
        // Revert on error
        setRows(prev => prev.map(r => 
          r.id === row.id ? { ...r, enabled: row.enabled } : r
        ));
        throw new Error(res?.error?.message || 'Failed to update enabled flag.');
      }
      // Show success message
      setStatusBanner({ 
        success: true, 
        message: `SLA ${newEnabled ? 'enabled' : 'disabled'} for priority ${row.priority_value}` 
      });
    } catch (err) {
      log.error('handleToggleEnabled', 'Failed to toggle enabled state', { error: err.message });
      setStatusBanner({ success: false, message: err.message });
    }
  }, []);

  const renderModal = () => {
    if (!modalState.open || !modalState.priority) return null;
    const p = modalState.priority;
    const isUpdate = Boolean(modalState.existing);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-surface-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
                <Info size={20} className="text-brand-600" />
              </div>
              <h3 className="text-lg font-bold text-surface-800">Configure SLA — {p.label || p.value}</h3>
            </div>
            <button onClick={closeModal} className="p-1 rounded-lg hover:bg-surface-100 transition-colors">
              <span className="text-surface-400 text-lg">×</span>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-surface-600">
              This will <strong>{isUpdate ? 'update' : 'create'} the SLA target</strong> in ServiceNow priority mapping
            </p>

            {/* Form fields — aligned grid */}
            <div className="bg-surface-50 rounded-lg border border-surface-200 p-4">
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1.5 pr-4 text-xs font-medium text-surface-500 whitespace-nowrap align-middle">Priority:</td>
                    <td className="py-1.5 text-xs font-semibold text-surface-800">{p.label} ({p.value})</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 text-xs font-medium text-surface-500 whitespace-nowrap align-middle">Response target (min):</td>
                    <td className="py-1.5">
                      <input type="number" min={1} value={formState.responseMinutes}
                        onChange={e => setFormState(prev => ({ ...prev, responseMinutes: e.target.value }))}
                        disabled={modalSaving}
                        className="w-28 px-2.5 py-1.5 rounded-lg border border-surface-200 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-50" />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 text-xs font-medium text-surface-500 whitespace-nowrap align-middle">Resolution target (min):</td>
                    <td className="py-1.5">
                      <input type="number" min={1} value={formState.resolutionMinutes}
                        onChange={e => setFormState(prev => ({ ...prev, resolutionMinutes: e.target.value }))}
                        disabled={modalSaving}
                        className="w-28 px-2.5 py-1.5 rounded-lg border border-surface-200 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-50" />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 text-xs font-medium text-surface-500 whitespace-nowrap align-middle">Sort order:</td>
                    <td className="py-1.5">
                      <input type="number" min={1} value={formState.sortOrder}
                        onChange={e => setFormState(prev => ({ ...prev, sortOrder: e.target.value }))}
                        disabled={modalSaving}
                        className="w-28 px-2.5 py-1.5 rounded-lg border border-surface-200 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-50" />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 text-xs font-medium text-surface-500 whitespace-nowrap align-middle">Enabled:</td>
                    <td className="py-1.5">
                      <div className="flex items-center gap-2">
                        <ToggleSwitch size="sm" enabled={formState.enabled}
                          onToggle={() => setFormState(prev => ({ ...prev, enabled: !prev.enabled }))}
                          disabled={modalSaving} />
                        <span className="text-xs text-surface-600">{formState.enabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Result label (shown inline, no second modal) */}
            {modalResult && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                modalResult.success
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border border-rose-200 text-rose-700'
              }`}>
                {modalResult.success ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                {modalResult.message}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-200">
            <button onClick={closeModal}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-surface-600 bg-surface-100 hover:bg-surface-200 transition-colors">
              {modalResult?.success ? 'Close' : 'Cancel'}
            </button>
            {!modalResult?.success && (
              <button onClick={handleSavePriority} disabled={modalSaving}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors">
                {modalSaving && <Loader2 size={12} className="animate-spin" />}
                {modalSaving ? 'Saving...' : (isUpdate ? 'Update' : 'Create')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative space-y-5 animate-fade-in">
      {/* SetupRequiredOverlay when column mapping is not configured */}
      <SetupRequiredOverlay
        isOpen={columnMappingOk === false}
        icon={Columns}
        header="SLA Column Mapping Required"
        messageDetail="SLA column mapping (Created, Closed, and Priority columns) must be configured before you can manage SLA thresholds. Please configure the mapping first."
        actionIcon={Columns}
        actionText="Go to SLA Column Mapping"
        onAction={() => navigateToTab('slaColumnMapping')}
        variant="warning"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
            <Clock size={18} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-surface-800">Incident SLA Thresholds</h2>
            <p className="text-xs text-surface-500">Priorities are fetched from ServiceNow. Configure response/resolution targets per priority.</p>
            {/* Priority fetch status - inline after header */}
            <div className={`flex items-center gap-2 mt-2 text-xs font-medium ${
              priorityFetch.loading 
                ? 'bg-amber-50 text-amber-700 border border-amber-200 px-3 py-2 rounded-lg'
                : priorityFetch.error
                ? 'text-orange-600'
                : priorityFetch.lastFetched
                ? 'text-emerald-600'
                : 'text-surface-500'
            }`}>
              <ShieldCheck size={12} className={
                priorityFetch.loading 
                  ? 'text-amber-600'
                  : priorityFetch.error
                  ? 'text-orange-600'
                  : priorityFetch.lastFetched
                  ? 'text-emerald-600'
                  : 'text-surface-500'
              } />
              {priorityFetch.loading && (
                <>
                  <Loader2 size={10} className="animate-spin" />
                  <span>Contacting ServiceNow…</span>
                </>
              )}
              {!priorityFetch.loading && priorityFetch.error && <span>{priorityFetch.error}</span>}
              {!priorityFetch.loading && !priorityFetch.error && priorityFetch.lastFetched && (
                <span>Last fetched: {new Date(priorityFetch.lastFetched).toLocaleString()} — {priorities.length} priorities loaded</span>
              )}
              {!priorityFetch.loading && !priorityFetch.error && !priorityFetch.lastFetched && (
                <span>Priorities not loaded yet. Click "Fetch Priorities" or wait for auto-fetch.</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={fetchPriorities}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
          disabled={priorityFetch.loading}
        >
          {priorityFetch.loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Fetch Priorities
        </button>
      </div>



      {/* Priority column mapping info */}
      {priorityColumnName && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-violet-200 bg-violet-50 text-xs text-violet-700">
          <Columns size={14} className="text-violet-500 flex-shrink-0" />
          <span>
            Priority column mapped to: <strong className="font-bold">{priorityColumnName}</strong>
          </span>
          <button
            onClick={() => navigateToTab('slaColumnMapping')}
            className="ml-auto text-[11px] font-semibold text-violet-600 hover:text-violet-800 underline underline-offset-2 transition-colors"
          >
            Update Column Mapping
          </button>
        </div>
      )}

      {/* Priority grid */}
      {priorities.length === 0 ? (
        <div className="border border-dashed border-surface-300 rounded-2xl bg-surface-50/60 p-6 text-center">
          <p className="text-sm text-surface-600">
            {priorityFetch.loading ? 'Fetching priorities from ServiceNow…' : 'No priorities loaded. Click "Fetch Priorities" to load from ServiceNow.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Priority</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Response (min)</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Resolution (min)</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Enabled</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Status</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {combinedRows.map(row => (
                <tr key={row.value} className="hover:bg-surface-50/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-surface-800">{row.label}</span>
                      <span className="text-[11px] text-surface-500">Value: {row.value}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs font-semibold text-surface-700">
                    {row.responseMinutes ?? <span className="text-surface-400">Not set</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs font-semibold text-surface-700">
                    {row.resolutionMinutes ?? <span className="text-surface-400">Not set</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <ToggleSwitch
                      size="sm"
                      enabled={row.enabled}
                      disabled={!row.id}
                      onToggle={() => handleToggleEnabled(row)}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      row.configured ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {row.configured ? 'Configured' : 'Not configured'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => openConfigureModal(row)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
                    >
                      {row.configured ? 'Edit SLA' : 'Configure'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legacy rows notice */}
      {legacyRows.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-800">
          <p className="font-semibold mb-2">Heads up</p>
          <p className="mb-2">{legacyRows.length} SLA rows exist for priorities that are no longer returned by ServiceNow. They remain untouched but will not appear in the grid above.</p>
        </div>
      )}

      {/* Status banner - moved to end */}
      {statusBanner && (
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs border ${
          statusBanner.success
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {statusBanner.success ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          <span>{statusBanner.message}</span>
          <button onClick={resetStatusBanner} className="ml-auto text-surface-400 hover:text-surface-600">×</button>
        </div>
      )}

      {renderModal()}
      
      {/* Local modal overlay for fetching priorities */}
      {priorityFetch.loading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center backdrop-blur-sm rounded-2xl">
          <div className="flex flex-col items-center gap-3 bg-white px-6 py-4 rounded-xl shadow-xl border-2 border-brand-200 ring-4 ring-brand-100">
            <Loader2 size={28} className="animate-spin text-brand-600" />
            <span className="text-sm font-medium text-surface-700">Fetching priorities from ServiceNow...</span>
          </div>
        </div>
      )}
    </div>
  );
}
