// ============================================================================
// SLAThresholds — ServiceNow Module (PulseOps V3)
//
// PURPOSE: Dedicated component for managing Incident SLA thresholds using the
// platform's CRUD modal conventions (ConfirmationModal → Confirm/Progress/Summary).
// Supports create, edit, delete, and enable/disable actions with business-level
// debug logging to aid troubleshooting.
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  Plus,
  Trash2,
  Edit3,
} from 'lucide-react';
import { createLogger, ConfirmationModal } from '@shared';
import { ToggleSwitch } from '@components';
import ApiClient from '@shared/services/apiClient';
import uiText from '../../config/uiText.json';

const log = createLogger('SLAThresholds.jsx');
const t = uiText.sla;
const snApi = { slaConfig: '/api/servicenow/config/sla' };

const defaultForm = {
  priority: '',
  priorityValue: '',
  responseMinutes: 60,
  resolutionMinutes: 480,
  sortOrder: 99,
  enabled: true,
};

const PRIORITY_COLORS = {
  '1': 'bg-rose-100 text-rose-700 border-rose-200',
  '2': 'bg-amber-100 text-amber-700 border-amber-200',
  '3': 'bg-blue-100 text-blue-700 border-blue-200',
  '4': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  '5': 'bg-purple-100 text-purple-700 border-purple-200',
};

export default function SLAThresholds() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusBanner, setStatusBanner] = useState(null);
  const [modalState, setModalState] = useState({ open: false, type: null, row: null });
  const [formState, setFormState] = useState(defaultForm);
  const initRan = useRef(false);

  const resetStatusBanner = useCallback(() => setStatusBanner(null), []);

  const loadSla = useCallback(async () => {
    log.debug('loadSla', 'Fetching SLA thresholds from API');
    setLoading(true);
    resetStatusBanner();
    try {
      const res = await ApiClient.get(snApi.slaConfig);
      if (res?.success && Array.isArray(res.data)) {
        setRows(res.data);
        log.info('loadSla', 'SLA thresholds loaded', { count: res.data.length });
      } else {
        const errorMessage = res?.error?.message || 'Failed to load SLA configuration.';
        log.warn('loadSla', 'ServiceNow SLA API returned an error', { error: errorMessage });
        setStatusBanner({ success: false, message: errorMessage });
      }
    } catch (err) {
      log.error('loadSla', 'Unexpected error while fetching SLA thresholds', { error: err.message });
      setStatusBanner({ success: false, message: err.message });
    } finally {
      setLoading(false);
    }
  }, [resetStatusBanner]);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadSla();
  }, [loadSla]);

  const openModal = useCallback((type, row = null) => {
    log.debug('openModal', 'Opening modal', { type, rowId: row?.id });
    if (type === 'edit' && row) {
      setFormState({
        priority: row.priority,
        priorityValue: row.priority_value,
        responseMinutes: row.response_minutes,
        resolutionMinutes: row.resolution_minutes,
        sortOrder: row.sort_order,
        enabled: row.enabled,
      });
    } else {
      setFormState({ ...defaultForm });
    }
    setModalState({ open: true, type, row });
  }, []);

  const closeModal = useCallback(() => {
    log.debug('closeModal', 'Closing modal', { type: modalState.type });
    setModalState({ open: false, type: null, row: null });
  }, [modalState.type]);

  const validateForm = useCallback(() => {
    if (!formState.priority.trim()) {
      throw new Error('Priority name is required.');
    }
    if (!formState.priorityValue.trim()) {
      throw new Error('Priority value is required.');
    }
    if (Number(formState.responseMinutes) <= 0) {
      throw new Error('Response minutes must be greater than 0.');
    }
    if (Number(formState.resolutionMinutes) <= 0) {
      throw new Error('Resolution minutes must be greater than 0.');
    }
  }, [formState]);

  const handleCreate = useCallback(async () => {
    validateForm();
    log.debug('handleCreate', 'Creating SLA priority', { ...formState });
    const payload = {
      priority: formState.priority.trim(),
      priorityValue: formState.priorityValue.trim(),
      responseMinutes: Number(formState.responseMinutes),
      resolutionMinutes: Number(formState.resolutionMinutes),
      sortOrder: Number(formState.sortOrder) || 99,
      enabled: formState.enabled,
    };
    const res = await ApiClient.post(snApi.slaConfig, payload);
    if (!res?.success) {
      log.warn('handleCreate', 'API returned failure', { error: res?.error?.message });
      throw new Error(res?.error?.message || 'Failed to create SLA priority.');
    }
    log.info('handleCreate', 'SLA priority created', { priority: payload.priority });
    setStatusBanner({ success: true, message: `SLA "${payload.priority}" created.` });
    await loadSla();
    return payload;
  }, [formState, loadSla, validateForm]);

  const handleEdit = useCallback(async () => {
    if (!modalState.row) throw new Error('No SLA row selected.');
    validateForm();
    log.debug('handleEdit', 'Updating SLA priority', { id: modalState.row.id });
    const payload = {
      priority: formState.priority.trim(),
      priorityValue: formState.priorityValue.trim(),
      responseMinutes: Number(formState.responseMinutes),
      resolutionMinutes: Number(formState.resolutionMinutes),
      enabled: formState.enabled,
      sortOrder: Number(formState.sortOrder) || modalState.row.sort_order,
    };
    const res = await ApiClient.put(`${snApi.slaConfig}/${modalState.row.id}`, payload);
    if (!res?.success) {
      log.warn('handleEdit', 'API returned failure', { error: res?.error?.message });
      throw new Error(res?.error?.message || 'Failed to update SLA priority.');
    }
    log.info('handleEdit', 'SLA priority updated', { id: modalState.row.id });
    setStatusBanner({ success: true, message: `SLA "${payload.priority}" updated.` });
    await loadSla();
    return payload;
  }, [formState, loadSla, modalState.row, validateForm]);

  const handleDelete = useCallback(async () => {
    if (!modalState.row) throw new Error('No SLA row selected.');
    log.debug('handleDelete', 'Deleting SLA priority', { id: modalState.row.id });
    const res = await ApiClient.delete(`${snApi.slaConfig}/${modalState.row.id}`);
    if (!res?.success) {
      log.warn('handleDelete', 'API returned failure', { error: res?.error?.message });
      throw new Error(res?.error?.message || 'Failed to delete SLA priority.');
    }
    log.info('handleDelete', 'SLA priority deleted', { id: modalState.row.id });
    setStatusBanner({ success: true, message: `SLA "${modalState.row.priority}" deleted.` });
    await loadSla();
    return { priority: modalState.row.priority, priorityValue: modalState.row.priority_value };
  }, [loadSla, modalState.row]);

  const handleToggleEnabled = useCallback(async (row) => {
    log.debug('handleToggleEnabled', 'Toggling SLA enabled flag', { id: row.id, enabled: !row.enabled });
    try {
      await ApiClient.put(`${snApi.slaConfig}/${row.id}`, { enabled: !row.enabled });
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, enabled: !r.enabled } : r)));
    } catch (err) {
      log.error('handleToggleEnabled', 'Failed to toggle enabled state', { error: err.message });
      setStatusBanner({ success: false, message: 'Failed to update enabled status.' });
    }
  }, []);

  const actionDetailsForForm = [
    {
      label: 'Priority Name',
      value: (
        <input
          type="text"
          value={formState.priority}
          onChange={e => setFormState(prev => ({ ...prev, priority: e.target.value }))}
          className="w-full px-2.5 py-1.5 rounded border border-surface-200 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      ),
    },
    {
      label: 'Priority Value',
      value: (
        <input
          type="text"
          value={formState.priorityValue}
          onChange={e => setFormState(prev => ({ ...prev, priorityValue: e.target.value }))}
          className="w-32 px-2.5 py-1.5 rounded border border-surface-200 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      ),
    },
    {
      label: 'Response Minutes',
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
      label: 'Resolution Minutes',
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
      label: 'Sort Order',
      value: (
        <input
          type="number"
          min={1}
          value={formState.sortOrder}
          onChange={e => setFormState(prev => ({ ...prev, sortOrder: e.target.value }))}
          className="w-20 px-2.5 py-1.5 rounded border border-surface-200 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      ),
    },
    {
      label: 'Enabled',
      value: (
        <div className="flex items-center gap-2">
          <ToggleSwitch
            size="sm"
            checked={formState.enabled}
            onChange={() => setFormState(prev => ({ ...prev, enabled: !prev.enabled }))}
          />
          <span className="text-xs text-surface-600">{formState.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      ),
    },
  ];

  const buildSummary = (data) => ([
    { label: 'Priority', value: data?.priority },
    { label: 'Value', value: data?.priorityValue },
    { label: 'Response (m)', value: data?.responseMinutes },
    { label: 'Resolution (m)', value: data?.resolutionMinutes },
  ]);

  const renderModal = () => {
    if (!modalState.open) return null;

    if (modalState.type === 'delete') {
      return (
        <ConfirmationModal
          isOpen
          onClose={closeModal}
          title={t.deleteModalTitle || 'Delete SLA Priority'}
          actionDescription="delete this SLA threshold"
          actionTarget="ServiceNow SLA configuration"
          actionDetails={[
            { label: 'Priority', value: modalState.row?.priority },
            { label: 'Value', value: modalState.row?.priority_value },
          ]}
          confirmLabel="Delete"
          variant="danger"
          action={handleDelete}
          onSuccess={closeModal}
          buildSummary={(data) => [
            { label: 'Priority', value: data?.priority },
            { label: 'Status', value: 'Deleted' },
          ]}
        />
      );
    }

    const isEdit = modalState.type === 'edit';
    return (
      <ConfirmationModal
        isOpen
        onClose={closeModal}
        title={isEdit ? 'Edit SLA Priority' : 'Add SLA Priority'}
        actionDescription={isEdit ? 'update this SLA threshold' : 'create a new SLA threshold'}
        actionTarget="ServiceNow SLA configuration"
        actionDetails={actionDetailsForForm}
        confirmLabel={isEdit ? 'Update' : 'Create'}
        variant="info"
        action={isEdit ? handleEdit : handleCreate}
        onSuccess={closeModal}
        buildSummary={buildSummary}
      />
    );
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 size={22} className="text-brand-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
            <Clock size={18} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-surface-800">Incident SLA Thresholds</h2>
            <p className="text-xs text-surface-500">Manage response/resolution targets per priority level.</p>
          </div>
        </div>
        <button
          onClick={() => openModal('create')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          <Plus size={13} />
          Add Priority
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>{t.subtitle}</span>
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
          <button
            onClick={resetStatusBanner}
            className="ml-auto text-surface-400 hover:text-surface-600"
          >
            ×
          </button>
        </div>
      )}

      {/* SLA Table */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-50 border-b border-surface-200">
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Priority</th>
              <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Value</th>
              <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Response (min)</th>
              <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Resolution (min)</th>
              <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Enabled</th>
              <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Order</th>
              <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-50">
            {rows.map(row => {
              const dotColor = PRIORITY_COLORS[row.priority_value] || 'bg-surface-100 text-surface-600 border-surface-200';
              return (
                <tr key={row.id} className="hover:bg-surface-50/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${dotColor}`}>
                      {row.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs font-mono font-bold text-surface-600">{row.priority_value}</td>
                  <td className="px-4 py-2.5 text-center text-xs font-semibold text-surface-700">{row.response_minutes}</td>
                  <td className="px-4 py-2.5 text-center text-xs font-semibold text-surface-700">{row.resolution_minutes}</td>
                  <td className="px-4 py-2.5 text-center">
                    <ToggleSwitch size="sm" checked={row.enabled} onChange={() => handleToggleEnabled(row)} />
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-surface-500">{row.sort_order}</td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openModal('edit', row)}
                        className="p-1 rounded text-brand-600 hover:bg-brand-50 transition-colors"
                        title="Edit SLA"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => openModal('delete', row)}
                        className="p-1 rounded text-rose-500 hover:bg-rose-50 transition-colors"
                        title="Delete SLA"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-surface-400">
                  No SLA configurations found. Click "Add Priority" to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderModal()}
    </div>
  );
}
