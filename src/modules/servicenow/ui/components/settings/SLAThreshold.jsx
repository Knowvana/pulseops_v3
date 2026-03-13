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
import { createLogger, ConfirmationModal, useConfigLayout } from '@shared';
import { ToggleSwitch, SetupRequiredOverlay } from '@components';
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

  // Column mapping check
  const [columnMappingOk, setColumnMappingOk] = useState(null); // null = checking, true/false
  const [columnMappingLoading, setColumnMappingLoading] = useState(true);

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
    setModalState({ open: true, priority: priorityRow, existing });
  }, [rows]);

  const closeModal = useCallback(() => {
    setModalState({ open: false, priority: null, existing: null });
  }, []);

  const validateForm = useCallback(() => {
    if (Number(formState.responseMinutes) <= 0) {
      throw new Error('Response minutes must be greater than 0.');
    }
    if (Number(formState.resolutionMinutes) <= 0) {
      throw new Error('Resolution minutes must be greater than 0.');
    }
  }, [formState]);

  const handleSavePriority = useCallback(async () => {
    if (!modalState.priority) throw new Error('No priority selected.');
    validateForm();

    const payload = {
      priority: modalState.priority.label || modalState.priority.value,
      priorityValue: modalState.priority.value,
      responseMinutes: Number(formState.responseMinutes),
      resolutionMinutes: Number(formState.resolutionMinutes),
      enabled: Boolean(formState.enabled),
      sortOrder: Number(formState.sortOrder) || modalState.priority.sequence || 99,
    };

    log.debug('handleSavePriority', 'Persisting SLA target', {
      priorityValue: payload.priorityValue,
      hasExisting: Boolean(modalState.existing),
    });

    const request = modalState.existing
      ? ApiClient.put(`${snApi.slaConfig}/${modalState.existing.id}`, payload)
      : ApiClient.post(snApi.slaConfig, payload);

    const res = await request;
    if (!res?.success) {
      throw new Error(res?.error?.message || 'Failed to save SLA target.');
    }

    setStatusBanner({ success: true, message: `SLA updated for priority ${payload.priorityValue}.` });
    await loadSla();
    return payload;
  }, [formState, loadSla, modalState, validateForm]);

  const handleToggleEnabled = useCallback(async (row) => {
    if (!row.id) {
      setStatusBanner({ success: false, message: 'Configure the SLA before changing its enabled state.' });
      return;
    }
    log.debug('handleToggleEnabled', 'Toggling enabled state', { id: row.id, next: !row.enabled });
    try {
      const res = await ApiClient.put(`${snApi.slaConfig}/${row.id}`, { enabled: !row.enabled });
      if (!res?.success) {
        throw new Error(res?.error?.message || 'Failed to update enabled flag.');
      }
      await loadSla();
    } catch (err) {
      log.error('handleToggleEnabled', 'Failed to toggle enabled state', { error: err.message });
      setStatusBanner({ success: false, message: err.message });
    }
  }, [loadSla]);

  const actionDetails = useMemo(() => {
    if (!modalState.priority) return [];
    return [
      { label: 'Priority', value: `${modalState.priority.label} (${modalState.priority.value})` },
      {
        label: 'Response target (minutes)',
        value: (
          <input
            type="number"
            min={1}
            value={formState.responseMinutes}
            onChange={e => setFormState(prev => ({ ...prev, responseMinutes: e.target.value }))}
            className="w-24 px-2.5 py-1.5 rounded border border-surface-200 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        ),
      },
      {
        label: 'Resolution target (minutes)',
        value: (
          <input
            type="number"
            min={1}
            value={formState.resolutionMinutes}
            onChange={e => setFormState(prev => ({ ...prev, resolutionMinutes: e.target.value }))}
            className="w-24 px-2.5 py-1.5 rounded border border-surface-200 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        ),
      },
      {
        label: 'Sort order',
        value: (
          <input
            type="number"
            min={1}
            value={formState.sortOrder}
            onChange={e => setFormState(prev => ({ ...prev, sortOrder: e.target.value }))}
            className="w-24 px-2.5 py-1.5 rounded border border-surface-200 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        ),
      },
      {
        label: 'Enabled',
        value: (
          <div className="flex items-center gap-2">
            <ToggleSwitch
              size="sm"
              enabled={formState.enabled}
              onToggle={() => setFormState(prev => ({ ...prev, enabled: !prev.enabled }))}
            />
            <span className="text-xs text-surface-600">{formState.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
        ),
      },
    ];
  }, [formState, modalState.priority]);

  const buildSummary = useCallback((data) => ([
    { label: 'Priority', value: `${data.priority} (${data.priorityValue})` },
    { label: 'Response (m)', value: data.responseMinutes },
    { label: 'Resolution (m)', value: data.resolutionMinutes },
    { label: 'Enabled', value: data.enabled ? 'Yes' : 'No' },
  ]), []);

  const renderModal = () => {
    if (!modalState.open) return null;
    return (
      <ConfirmationModal
        isOpen
        onClose={closeModal}
        title={`Configure SLA — ${modalState.priority?.label || modalState.priority?.value}`}
        actionDescription={modalState.existing ? 'update the SLA target' : 'create a new SLA target'}
        actionTarget="ServiceNow priority mapping"
        actionDetails={actionDetails}
        confirmLabel={modalState.existing ? 'Update' : 'Create'}
        variant="info"
        action={handleSavePriority}
        onSuccess={closeModal}
        buildSummary={buildSummary}
      />
    );
  };

  if (loading || columnMappingLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 size={22} className="text-brand-400 animate-spin" />
      </div>
    );
  }

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
            <p className="text-xs text-surface-500">Priorities are auto-fetched from ServiceNow. Configure response/resolution targets per priority.</p>
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

      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>Priorities are sourced directly from ServiceNow (sys_choice) and fetched automatically. SLA targets can only be configured for fetched priorities.</span>
      </div>

      {/* Priority fetch status */}
      <div className="flex items-center gap-3 rounded-xl border border-surface-200 bg-white px-4 py-3 text-xs text-surface-600">
        <ShieldCheck size={14} className="text-brand-500" />
        {priorityFetch.loading && <span>Contacting ServiceNow…</span>}
        {!priorityFetch.loading && priorityFetch.error && <span className="text-rose-600">{priorityFetch.error}</span>}
        {!priorityFetch.loading && !priorityFetch.error && priorityFetch.lastFetched && (
          <span>Last fetched: {new Date(priorityFetch.lastFetched).toLocaleString()} — {priorities.length} priorities loaded</span>
        )}
        {!priorityFetch.loading && !priorityFetch.error && !priorityFetch.lastFetched && (
          <span>Priorities not loaded yet. Click "Fetch Priorities" or wait for auto-fetch.</span>
        )}
      </div>

      {/* Status banner */}
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
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-50 text-brand-700 border border-brand-100 hover:bg-brand-100 transition-colors"
                    >
                      {row.configured ? 'Update' : 'Configure'}
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

      {renderModal()}
    </div>
  );
}
