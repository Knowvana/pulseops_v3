// ============================================================================
// CategoriesView — HealthCheck Module Categories Management
//
// PURPOSE: Full CRUD management for application categories — add, edit, delete,
//          toggle used for SLA. Modal popup form for Add/Edit with confirmation.
//          Persistent success messages. ConfirmDialog for delete.
//          Includes color picker and "Used for Uptime SLA" toggle.
//
// USED BY: manifest.jsx → getViews() → sidebar navigation (categories)
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Edit3, Trash2, Loader2, CheckCircle2, AlertCircle, Save, X, Tag,
  ToggleLeft, ToggleRight,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { ConfirmDialog } from '@components';
import uiText from '../config/uiText.json';
import urls from '../config/urls.json';

const log = createLogger('CategoriesView.jsx');
const t = uiText.categories;
const api = urls.api;

const COLOR_PRESETS = ['#10b981','#f59e0b','#6366f1','#8b5cf6','#ef4444','#3b82f6','#ec4899','#14b8a6','#f97316','#64748b'];

const EMPTY_FORM = { name: '', description: '', color: '#6366f1', sort_order: 99, used_for_sla: false };

export default function CategoriesView() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const initRan = useRef(false);

  const loadData = useCallback(async () => {
    try {
      const res = await ApiClient.get(api.categories);
      if (res?.success) setCategories(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    setShowModal(false);
    setSaveConfirm(false);
  };

  const handleAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const handleEdit = (cat) => {
    setForm({
      name: cat.name, description: cat.description || '', color: cat.color,
      sort_order: cat.sort_order, used_for_sla: cat.used_for_sla,
    });
    setEditId(cat.id);
    setShowModal(true);
  };

  const handleSaveClick = () => {
    if (!form.name.trim()) { setError(uiText.common.name + ' is required'); return; }
    setError(null);
    setSaveConfirm(true);
  };

  const executeSave = useCallback(async () => {
    try {
      const payload = { ...form };
      let res;
      if (editId) {
        res = await ApiClient.put(api.categoryById.replace('{id}', editId), payload);
      } else {
        res = await ApiClient.post(api.categories, payload);
      }
      if (res?.success) {
        setSuccess(res.message);
        resetForm();
        await loadData();
      } else {
        setError(res?.error?.message || 'Save failed');
      }
      return res;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [form, editId, loadData]);

  const executeDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const res = await ApiClient.delete(api.categoryById.replace('{id}', deleteTarget.id));
      if (res?.success) {
        setSuccess(res.message);
        await loadData();
      } else {
        setError(res?.error?.message || 'Delete failed');
      }
      return res;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [deleteTarget, loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-brand-500" size={24} />
        <span className="ml-2 text-surface-500">{uiText.common.loading}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-surface-800">{t.title}</h3>
          <p className="text-xs text-surface-500">{t.subtitle}</p>
        </div>
        <button onClick={handleAdd}
          className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors flex items-center gap-1">
          <Plus size={14} /> {t.addButton}
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle2 size={14} /> {success}
          <button onClick={() => setSuccess(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* Categories Grid */}
      {categories.length === 0 ? (
        <div className="text-center py-12 text-sm text-surface-400">{t.noCategories}</div>
      ) : (
        <div className="overflow-x-auto border border-surface-200 rounded-xl">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.grid.name}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.grid.description}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.color}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.usedForSla}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.appCount}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.sortOrder}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.actions}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id} className="border-b border-surface-100 hover:bg-surface-50/50">
                  <td className="px-3 py-2.5 font-medium text-surface-800">{cat.name}</td>
                  <td className="px-3 py-2.5 text-surface-500 text-xs">{cat.description || '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-6 h-6 rounded border border-surface-200" style={{ backgroundColor: cat.color }} />
                      <span className="text-surface-400 text-xs">{cat.color}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={async () => {
                      try {
                        const res = await ApiClient.patch(api.categoryToggle.replace('{id}', cat.id));
                        if (res?.success) await loadData();
                      } catch (err) {
                        setError(err.message);
                      }
                    }} className="inline-flex">
                      {cat.used_for_sla
                        ? <ToggleRight size={18} className="text-emerald-500" />
                        : <ToggleLeft size={18} className="text-surface-300" />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="px-2 py-1 bg-surface-100 rounded text-surface-600 text-xs font-medium">
                      {cat.app_count || 0}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-surface-400">{cat.sort_order}</td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(cat)} className="p-1 text-surface-400 hover:text-brand-600 rounded">
                        <Edit3 size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget(cat)} className="p-1 text-surface-400 hover:text-red-600 rounded">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal Form for Add/Edit Category ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => resetForm()}>
          <div className="bg-white rounded-2xl shadow-2xl border border-surface-200 w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 bg-brand-50">
              <h3 className="text-base font-bold text-brand-700">{editId ? t.form.editTitle : t.form.title}</h3>
              <button onClick={resetForm} className="p-1 rounded-lg hover:bg-surface-100"><X size={16} className="text-surface-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.nameLabel}</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                  placeholder={t.form.namePlaceholder} />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.descriptionLabel}</label>
                <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                  placeholder={t.form.descriptionPlaceholder} />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.colorLabel}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                    className="w-12 h-12 border border-surface-200 rounded-lg cursor-pointer" />
                  <div className="flex flex-wrap gap-1">
                    {COLOR_PRESETS.map(c => (
                      <button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))}
                        className="w-8 h-8 rounded border-2 border-surface-200 hover:border-brand-400 transition-colors"
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.sortOrderLabel}</label>
                  <input type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 99 }))}
                    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                    placeholder={t.form.sortOrderPlaceholder} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-surface-600">{t.form.usedForSlaLabel}</label>
                  <button onClick={() => setForm(p => ({ ...p, used_for_sla: !p.used_for_sla }))}
                    className="inline-flex">
                    {form.used_for_sla
                      ? <ToggleRight size={18} className="text-emerald-500" />
                      : <ToggleLeft size={18} className="text-surface-300" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-surface-400">{t.form.usedForSlaDesc}</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-surface-100 bg-surface-50">
              <button onClick={resetForm} className="px-4 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50">
                {uiText.common.cancel}
              </button>
              <button onClick={handleSaveClick}
                className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
                <Save size={14} className="inline mr-1" /> {t.form.saveButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save Confirmation ── */}
      {saveConfirm && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setSaveConfirm(false)}
          title={editId ? t.form.editTitle : t.form.title}
          actionDescription={editId ? 'update this category' : 'create a new category'}
          actionTarget={form.name}
          actionDetails={[
            { label: t.form.nameLabel, value: form.name },
            { label: t.form.descriptionLabel, value: form.description || 'None' },
            { label: t.form.colorLabel, value: form.color },
            { label: t.form.usedForSlaLabel, value: form.used_for_sla ? 'Yes' : 'No' },
          ]}
          confirmLabel={t.form.saveButton}
          action={executeSave}
          variant="info"
        />
      )}

      {/* ── Delete Confirmation ── */}
      {deleteTarget && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          title={t.deleteConfirm.title}
          actionDescription="delete this category"
          actionTarget={deleteTarget.name}
          actionDetails={[
            { label: t.grid.name, value: deleteTarget.name },
            { label: t.grid.appCount, value: String(deleteTarget.app_count || 0) },
          ]}
          confirmLabel={t.deleteConfirm.confirmButton}
          action={executeDelete}
          variant="error"
        />
      )}
    </div>
  );
}
