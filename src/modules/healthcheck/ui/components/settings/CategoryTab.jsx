// ============================================================================
// CategoryTab — HealthCheck Module Config
//
// PURPOSE: CRUD for user-defined categories to group monitored applications.
//
// USED BY: manifest.jsx → getConfigTabs()
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Edit3, Trash2, Loader2, CheckCircle2, AlertCircle, Save, X, Tag,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { ConfirmDialog } from '@components';
import uiText from '../../config/uiText.json';
import urls from '../../config/urls.json';

const log = createLogger('CategoryTab.jsx');
const t = uiText.categories;
const api = urls.api;

const COLOR_PRESETS = ['#10b981','#f59e0b','#6366f1','#8b5cf6','#ef4444','#3b82f6','#ec4899','#14b8a6','#f97316','#64748b'];

export default function CategoryTab() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', color: '#6366f1', sort_order: 99 });
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
    setForm({ name: '', description: '', color: '#6366f1', sort_order: 99 });
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (cat) => {
    setForm({ name: cat.name, description: cat.description || '', color: cat.color || '#6366f1', sort_order: cat.sort_order });
    setEditId(cat.id);
    setShowForm(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { setError(t.grid.name + ' is required'); return; }
    setSaving(true); setError(null);
    try {
      let res;
      if (editId) {
        res = await ApiClient.put(api.categoryById.replace('{id}', editId), form);
      } else {
        res = await ApiClient.post(api.categories, form);
      }
      if (res?.success) {
        setSuccess(res.message); setTimeout(() => setSuccess(null), 3000);
        resetForm(); await loadData();
      } else {
        setError(res?.error?.message || 'Save failed');
      }
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }, [form, editId, loadData]);

  const handleDelete = useCallback(async (id) => {
    try {
      const res = await ApiClient.delete(api.categoryById.replace('{id}', id));
      if (res?.success) {
        setSuccess(res.message); setTimeout(() => setSuccess(null), 3000);
        await loadData();
      } else {
        setError(res?.error?.message || 'Delete failed');
      }
    } catch (err) { setError(err.message); }
    setDeleteConfirm(null);
  }, [loadData]);

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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-surface-800">{t.title}</h3>
          <p className="text-xs text-surface-500">{t.subtitle}</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors flex items-center gap-1">
          <Plus size={14} /> {t.addButton}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle2 size={14} /> {success}
        </div>
      )}

      {showForm && (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-5 space-y-4">
          <h4 className="text-sm font-bold text-surface-800">{editId ? t.form.editTitle : t.form.title}</h4>
          <div className="grid grid-cols-2 gap-4">
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
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_PRESETS.map(c => (
                  <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                    className={`w-6 h-6 rounded-full border-2 ${form.color === c ? 'border-surface-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
                <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                  className="w-6 h-6 rounded cursor-pointer border-0" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.sortOrderLabel}</label>
              <input type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 99 }))}
                className="w-24 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                placeholder={t.form.sortOrderPlaceholder} />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {saving ? <><Loader2 size={14} className="animate-spin inline mr-1" /> {t.form.savingButton}</> : <><Save size={14} className="inline mr-1" /> {t.form.saveButton}</>}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50">
              {uiText.common.cancel}
            </button>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="text-center py-12 text-sm text-surface-400">{t.noCategories}</div>
      ) : (
        <div className="overflow-x-auto border border-surface-200 rounded-xl">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.grid.color}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.grid.name}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.grid.description}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.appCount}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.sortOrder}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.actions}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id} className="border-b border-surface-100 hover:bg-surface-50/50">
                  <td className="px-3 py-2.5">
                    <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: cat.color || '#6366f1' }} />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-surface-800">{cat.name}</td>
                  <td className="px-3 py-2.5 text-surface-500">{cat.description || '—'}</td>
                  <td className="px-3 py-2.5 text-center">{cat.app_count || 0}</td>
                  <td className="px-3 py-2.5 text-center">{cat.sort_order}</td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(cat)} className="p-1 text-surface-400 hover:text-brand-600 rounded"><Edit3 size={13} /></button>
                      <button onClick={() => setDeleteConfirm(cat)} className="p-1 text-surface-400 hover:text-red-600 rounded"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteConfirm && (
        <ConfirmDialog isOpen={true} title={t.deleteConfirm.title} description={t.deleteConfirm.message}
          confirmLabel={t.deleteConfirm.confirmButton} onConfirm={() => handleDelete(deleteConfirm.id)}
          onCancel={() => setDeleteConfirm(null)} variant="danger" />
      )}
    </div>
  );
}
