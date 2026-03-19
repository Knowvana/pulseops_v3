// ============================================================================
// AppManagementTab — HealthCheck Module Config
//
// PURPOSE: CRUD for monitored applications — add, edit, delete, toggle active.
//          Modal popup form for Add/Edit with confirmation before save.
//          Persistent success messages. ConfirmDialog for delete.
//          Per-app SLA removed — global SLA is used instead.
//
// USED BY: manifest.jsx → getConfigTabs()
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Edit3, Trash2, ToggleLeft, ToggleRight, Loader2,
  CheckCircle2, AlertCircle, Save, X, Globe, ExternalLink,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { ConfirmDialog } from '@components';
import uiText from '../../config/uiText.json';
import urls from '../../config/urls.json';

const log = createLogger('AppManagementTab.jsx');
const t = uiText.applications;
const api = urls.api;

const EMPTY_FORM = {
  name: '', url: '', category_id: '', expected_status_code: 200,
  expected_text: '', timeout_ms: 10000, description: '', sort_order: 99,
};

export default function AppManagementTab() {
  const [apps, setApps] = useState([]);
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
      const [appsRes, catsRes] = await Promise.all([
        ApiClient.get(api.applications),
        ApiClient.get(api.categories),
      ]);
      if (appsRes?.success) setApps(appsRes.data || []);
      if (catsRes?.success) setCategories(catsRes.data || []);
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

  const handleEdit = (app) => {
    setForm({
      name: app.name, url: app.url, category_id: app.category_id || '',
      expected_status_code: app.expected_status_code, expected_text: app.expected_text || '',
      timeout_ms: app.timeout_ms, description: app.description || '', sort_order: app.sort_order,
    });
    setEditId(app.id);
    setShowModal(true);
  };

  const handleSaveClick = () => {
    if (!form.name.trim()) { setError(uiText.common.name + ' is required'); return; }
    if (!form.url.trim()) { setError('URL is required'); return; }
    setError(null);
    setSaveConfirm(true);
  };

  const executeSave = useCallback(async () => {
    try {
      const payload = { ...form, category_id: form.category_id || null };
      let res;
      if (editId) {
        res = await ApiClient.put(api.applicationById.replace('{id}', editId), payload);
      } else {
        res = await ApiClient.post(api.applications, payload);
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
      const res = await ApiClient.delete(api.applicationById.replace('{id}', deleteTarget.id));
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

  const handleToggle = useCallback(async (id) => {
    try {
      const res = await ApiClient.patch(api.applicationToggle.replace('{id}', id));
      if (res?.success) await loadData();
    } catch (err) {
      setError(err.message);
    }
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-brand-500" size={24} />
        <span className="ml-2 text-surface-500">{uiText.common.loading}</span>
      </div>
    );
  }

  const getCategoryName = (catId) => {
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.name : '—';
  };

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

      {/* Applications Grid */}
      {apps.length === 0 ? (
        <div className="text-center py-12 text-sm text-surface-400">{t.noApps}</div>
      ) : (
        <div className="overflow-x-auto border border-surface-200 rounded-xl">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.grid.name}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.grid.url}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.grid.category}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.expectedStatus}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.timeout}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.active}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.actions}</th>
              </tr>
            </thead>
            <tbody>
              {apps.map(app => (
                <tr key={app.id} className="border-b border-surface-100 hover:bg-surface-50/50">
                  <td className="px-3 py-2.5 font-medium text-surface-800">{app.name}</td>
                  <td className="px-3 py-2.5 text-surface-500 max-w-[200px] truncate">
                    <a href={app.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 flex items-center gap-1">
                      {app.url} <ExternalLink size={10} />
                    </a>
                  </td>
                  <td className="px-3 py-2.5">
                    {app.category_name ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: app.category_color || '#6366f1' }} />
                        {app.category_name}
                      </span>
                    ) : <span className="text-surface-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">{app.expected_status_code}</td>
                  <td className="px-3 py-2.5 text-center">{app.timeout_ms}ms</td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => handleToggle(app.id)} className="inline-flex">
                      {app.is_active
                        ? <ToggleRight size={18} className="text-emerald-500" />
                        : <ToggleLeft size={18} className="text-surface-300" />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(app)} className="p-1 text-surface-400 hover:text-brand-600 rounded">
                        <Edit3 size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget(app)} className="p-1 text-surface-400 hover:text-red-600 rounded">
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

      {/* ── Modal Form for Add/Edit Application ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => resetForm()}>
          <div className="bg-white rounded-2xl shadow-2xl border border-surface-200 w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 bg-brand-50">
              <h3 className="text-base font-bold text-brand-700">{editId ? t.form.editTitle : t.form.title}</h3>
              <button onClick={resetForm} className="p-1 rounded-lg hover:bg-surface-100"><X size={16} className="text-surface-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.nameLabel}</label>
                  <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                    placeholder={t.form.namePlaceholder} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.urlLabel}</label>
                  <input type="text" value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                    placeholder={t.form.urlPlaceholder} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.categoryLabel}</label>
                  <select value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none bg-white">
                    <option value="">{t.form.noneOption}</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.expectedStatusLabel}</label>
                  <input type="number" value={form.expected_status_code} onChange={e => setForm(p => ({ ...p, expected_status_code: parseInt(e.target.value) || 200 }))}
                    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                    placeholder={t.form.expectedStatusPlaceholder} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.expectedTextLabel}</label>
                  <input type="text" value={form.expected_text} onChange={e => setForm(p => ({ ...p, expected_text: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                    placeholder={t.form.expectedTextPlaceholder} />
                  <p className="text-xs text-surface-400 mt-1">{t.form.expectedTextDesc}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.timeoutLabel}</label>
                  <input type="number" value={form.timeout_ms} onChange={e => setForm(p => ({ ...p, timeout_ms: parseInt(e.target.value) || 10000 }))}
                    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                    placeholder={t.form.timeoutPlaceholder} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.descriptionLabel}</label>
                  <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                    placeholder={t.form.descriptionPlaceholder} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">{t.form.sortOrderLabel}</label>
                  <input type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 99 }))}
                    className="w-40 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                    placeholder={t.form.sortOrderPlaceholder} />
                </div>
              </div>
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
          actionDescription={editId ? 'update this application' : 'create a new monitored application'}
          actionTarget={form.name}
          actionDetails={[
            { label: t.form.nameLabel, value: form.name },
            { label: t.form.urlLabel, value: form.url },
            { label: t.form.categoryLabel, value: form.category_id ? getCategoryName(parseInt(form.category_id)) : 'None' },
            { label: t.form.expectedStatusLabel, value: String(form.expected_status_code) },
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
          actionDescription="permanently delete this application and all its poll history"
          actionTarget={deleteTarget.name}
          actionDetails={[
            { label: t.grid.name, value: deleteTarget.name },
            { label: t.grid.url, value: deleteTarget.url },
          ]}
          confirmLabel={t.deleteConfirm.confirmButton}
          action={executeDelete}
          variant="error"
        />
      )}
    </div>
  );
}
