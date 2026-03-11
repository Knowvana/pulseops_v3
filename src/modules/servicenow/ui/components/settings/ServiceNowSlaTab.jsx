// ============================================================================
// ServiceNowSlaTab — PulseOps V3 ServiceNow Module Config
//
// PURPOSE: Full CRUD interface for Incident SLA configuration (sn_sla_config).
// Displays all SLA priority levels with response/resolution times in minutes,
// priority values for ServiceNow mapping, and enabled/disabled toggle.
// Supports Add, Edit (inline), Delete with confirmation.
//
// DATA: All config stored in DB table sn_sla_config (not JSON files).
//
// USED BY: src/modules/servicenow/manifest.jsx → getConfigTabs()
//
// DEPENDENCIES:
//   - lucide-react                              → Icons
//   - @shared                                   → createLogger, ApiClient
//   - @components                               → ToggleSwitch
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, AlertCircle, CheckCircle2, Loader2, Info, Plus, Trash2, Save, X, Edit3 } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { ToggleSwitch } from '@components';
import uiText from '../../config/uiText.json';

const log = createLogger('ServiceNowSlaTab.jsx');
const t   = uiText.sla;

const snApi = { slaConfig: '/api/servicenow/config/sla' };

const PRIORITY_COLORS = {
  '1': 'bg-rose-100 text-rose-700 border-rose-200',
  '2': 'bg-amber-100 text-amber-700 border-amber-200',
  '3': 'bg-blue-100 text-blue-700 border-blue-200',
  '4': 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const inputCls = 'px-2.5 py-1.5 text-sm text-center rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400';

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowSlaTab() {
  const [rows, setRows]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [resultBanner, setResultBanner] = useState(null);
  const [editRow, setEditRow]           = useState(null); // row being inline-edited
  const [showAdd, setShowAdd]           = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // id to confirm delete
  const [newRow, setNewRow] = useState({ priority: '', priority_value: '', response_minutes: 60, resolution_minutes: 480, sort_order: 99 });
  const initRan = useRef(false);

  // ── Load ──────────────────────────────────────────────────────────────
  const loadSla = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ApiClient.get(snApi.slaConfig);
      if (res?.success && Array.isArray(res.data)) {
        setRows(res.data);
        log.info('loadSla', 'Loaded SLA config', { count: res.data.length });
      }
    } catch (err) {
      setResultBanner({ success: false, message: `Failed to load: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadSla();
  }, [loadSla]);

  // ── Add ───────────────────────────────────────────────────────────────
  const handleAdd = useCallback(async () => {
    if (!newRow.priority || !newRow.priority_value) {
      setResultBanner({ success: false, message: 'Priority name and value are required.' });
      return;
    }
    setSaving(true);
    setResultBanner(null);
    try {
      const res = await ApiClient.post(snApi.slaConfig, {
        priority: newRow.priority,
        priorityValue: newRow.priority_value,
        responseMinutes: Number(newRow.response_minutes) || 60,
        resolutionMinutes: Number(newRow.resolution_minutes) || 480,
        sortOrder: Number(newRow.sort_order) || 99,
      });
      if (res?.success) {
        setResultBanner({ success: true, message: `SLA "${newRow.priority}" created.` });
        setShowAdd(false);
        setNewRow({ priority: '', priority_value: '', response_minutes: 60, resolution_minutes: 480, sort_order: 99 });
        await loadSla();
      } else {
        setResultBanner({ success: false, message: res?.error?.message || 'Create failed.' });
      }
    } catch (err) {
      setResultBanner({ success: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }, [newRow, loadSla]);

  // ── Update ────────────────────────────────────────────────────────────
  const handleUpdate = useCallback(async (row) => {
    setSaving(true);
    setResultBanner(null);
    try {
      const res = await ApiClient.put(`${snApi.slaConfig}/${row.id}`, {
        priority: row.priority,
        priorityValue: row.priority_value,
        responseMinutes: Number(row.response_minutes),
        resolutionMinutes: Number(row.resolution_minutes),
        enabled: row.enabled,
        sortOrder: Number(row.sort_order),
      });
      if (res?.success) {
        setResultBanner({ success: true, message: `SLA "${row.priority}" updated.` });
        setEditRow(null);
        await loadSla();
      } else {
        setResultBanner({ success: false, message: res?.error?.message || 'Update failed.' });
      }
    } catch (err) {
      setResultBanner({ success: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }, [loadSla]);

  // ── Delete ────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    setSaving(true);
    setResultBanner(null);
    setDeleteConfirm(null);
    try {
      const res = await ApiClient.delete(`${snApi.slaConfig}/${id}`);
      if (res?.success) {
        setResultBanner({ success: true, message: 'SLA configuration deleted.' });
        await loadSla();
      } else {
        setResultBanner({ success: false, message: res?.error?.message || 'Delete failed.' });
      }
    } catch (err) {
      setResultBanner({ success: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }, [loadSla]);

  // ── Toggle enabled ─────────────────────────────────────────────────────
  const handleToggleEnabled = useCallback(async (row) => {
    try {
      await ApiClient.put(`${snApi.slaConfig}/${row.id}`, { enabled: !row.enabled });
      await loadSla();
    } catch { /* silent */ }
  }, [loadSla]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 size={20} className="text-brand-400 animate-spin" />
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
            <h2 className="text-base font-bold text-surface-800">Incident SLA Configuration</h2>
            <p className="text-xs text-surface-500">Response and resolution time targets per priority level (in minutes).</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          <Plus size={13} />
          Add Priority
        </button>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>SLA targets are stored in the database. Priority Value must match the ServiceNow priority field value (e.g., "1" for Critical). Resolution times are used for SLA report calculations.</span>
      </div>

      {/* Result banner (persistent) */}
      {resultBanner && (
        <div className={`flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg text-sm border ${
          resultBanner.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          <div className="flex items-center gap-2">
            {resultBanner.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{resultBanner.message}</span>
          </div>
          <button onClick={() => setResultBanner(null)} className="p-0.5 rounded hover:bg-black/5"><X size={14} /></button>
        </div>
      )}

      {/* Add new row form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-brand-200 shadow-sm p-4 space-y-3">
          <p className="text-xs font-bold text-surface-600 uppercase tracking-wide">New SLA Priority</p>
          <div className="grid grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase mb-1">Priority Name</label>
              <input value={newRow.priority} onChange={e => setNewRow(p => ({ ...p, priority: e.target.value }))}
                placeholder="e.g. 1 - Critical" className={`${inputCls} w-full text-left`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase mb-1">Priority Value</label>
              <input value={newRow.priority_value} onChange={e => setNewRow(p => ({ ...p, priority_value: e.target.value }))}
                placeholder="e.g. 1" className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase mb-1">Response (min)</label>
              <input type="number" min={1} value={newRow.response_minutes} onChange={e => setNewRow(p => ({ ...p, response_minutes: e.target.value }))}
                className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase mb-1">Resolution (min)</label>
              <input type="number" min={1} value={newRow.resolution_minutes} onChange={e => setNewRow(p => ({ ...p, resolution_minutes: e.target.value }))}
                className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase mb-1">Sort Order</label>
              <input type="number" min={1} value={newRow.sort_order} onChange={e => setNewRow(p => ({ ...p, sort_order: e.target.value }))}
                className={`${inputCls} w-full`} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-surface-600 bg-surface-100 hover:bg-surface-200 transition-colors">Cancel</button>
            <button onClick={handleAdd} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Create
            </button>
          </div>
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
              <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-50">
            {rows.map(row => {
              const isEditing = editRow?.id === row.id;
              const pColor = PRIORITY_COLORS[row.priority_value] || 'bg-surface-100 text-surface-600 border-surface-200';
              return (
                <tr key={row.id} className="hover:bg-surface-50/50 transition-colors">
                  <td className="px-4 py-2.5">
                    {isEditing ? (
                      <input value={editRow.priority} onChange={e => setEditRow(p => ({ ...p, priority: e.target.value }))}
                        className={`${inputCls} w-full text-left`} />
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${pColor}`}>
                        {row.priority}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {isEditing ? (
                      <input value={editRow.priority_value} onChange={e => setEditRow(p => ({ ...p, priority_value: e.target.value }))}
                        className={`${inputCls} w-16`} />
                    ) : (
                      <span className="text-xs font-mono font-bold text-surface-600">{row.priority_value}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {isEditing ? (
                      <input type="number" min={1} value={editRow.response_minutes} onChange={e => setEditRow(p => ({ ...p, response_minutes: e.target.value }))}
                        className={`${inputCls} w-20`} />
                    ) : (
                      <span className="text-xs font-semibold text-surface-700">{row.response_minutes}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {isEditing ? (
                      <input type="number" min={1} value={editRow.resolution_minutes} onChange={e => setEditRow(p => ({ ...p, resolution_minutes: e.target.value }))}
                        className={`${inputCls} w-20`} />
                    ) : (
                      <span className="text-xs font-semibold text-surface-700">{row.resolution_minutes}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <ToggleSwitch checked={row.enabled} onChange={() => handleToggleEnabled(row)} size="sm" />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {isEditing ? (
                      <input type="number" min={1} value={editRow.sort_order} onChange={e => setEditRow(p => ({ ...p, sort_order: e.target.value }))}
                        className={`${inputCls} w-14`} />
                    ) : (
                      <span className="text-xs text-surface-500">{row.sort_order}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleUpdate(editRow)} disabled={saving}
                          className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40">
                          <Save size={13} />
                        </button>
                        <button onClick={() => setEditRow(null)} className="p-1 rounded text-surface-400 hover:bg-surface-100 transition-colors">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setEditRow({ ...row })} className="p-1 rounded text-brand-600 hover:bg-brand-50 transition-colors">
                          <Edit3 size={13} />
                        </button>
                        <button onClick={() => setDeleteConfirm(row.id)} className="p-1 rounded text-rose-500 hover:bg-rose-50 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
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

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-surface-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
                <Trash2 size={18} className="text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-surface-800">Delete SLA Configuration</h3>
                <p className="text-xs text-surface-500 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-lg text-xs font-semibold text-surface-600 bg-surface-100 hover:bg-surface-200 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 size={12} className="animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
