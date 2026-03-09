// ============================================================================
// ServiceNowTestIncidents — PulseOps V3 ServiceNow Module
//
// PURPOSE: Test page for creating, updating, and closing ServiceNow incidents.
// Provides a UI for exercising the CRUD API endpoints against a live
// ServiceNow instance. Displays operation results with status feedback.
//
// ARCHITECTURE:
//   - Three action panels: Create, Update, Close
//   - Recent operations log with status badges
//   - All text from uiText.json — zero hardcoded strings
//
// USED BY: src/modules/servicenow/manifest.jsx → getViews().testIncidents
//
// DEPENDENCIES:
//   - lucide-react       → Icons
//   - @shared            → createLogger, ApiClient
// ============================================================================

import React, { useState, useCallback } from 'react';
import {
  Plus, Edit3, XCircle, CheckCircle2, AlertCircle,
  Loader2, ClipboardList, Clock, Trash2,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';

const log = createLogger('ServiceNowTestIncidents.jsx');
const t = uiText.testIncidents;

const snApi = {
  incidents: '/api/servicenow/incidents',
  incidentClose: (id) => `/api/servicenow/incidents/${id}/close`,
  incidentUpdate: (id) => `/api/servicenow/incidents/${id}`,
};

// ── Operation result component ───────────────────────────────────────────────
function OpResult({ op }) {
  const isSuccess = op.success;
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-sm ${
      isSuccess ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
    }`}>
      {isSuccess
        ? <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" />
        : <AlertCircle size={16} className="text-rose-600 mt-0.5 flex-shrink-0" />
      }
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase ${isSuccess ? 'text-emerald-700' : 'text-rose-700'}`}>
            {op.action}
          </span>
          <span className="text-xs text-surface-400">
            {new Date(op.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <p className={`text-xs mt-0.5 ${isSuccess ? 'text-emerald-700' : 'text-rose-700'}`}>
          {op.message}
        </p>
        {op.data?.number && (
          <p className="text-xs text-surface-500 font-mono mt-0.5">{op.data.number}</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowTestIncidents() {
  // Create form state
  const [createDesc, setCreateDesc]       = useState('');
  const [createPriority, setCreatePriority] = useState('3 - Medium');
  const [createCategory, setCreateCategory] = useState('General');
  const [createImpact, setCreateImpact]   = useState('3 - Low');
  const [createUrgency, setCreateUrgency] = useState('3 - Low');
  const [creating, setCreating]           = useState(false);

  // Update form state
  const [updateSysId, setUpdateSysId]       = useState('');
  const [updatePriority, setUpdatePriority] = useState('');
  const [updateState, setUpdateState]       = useState('');
  const [updateComment, setUpdateComment]   = useState('');
  const [updating, setUpdating]             = useState(false);

  // Close form state
  const [closeSysId, setCloseSysId]       = useState('');
  const [closeNotes, setCloseNotes]       = useState('');
  const [closeCode, setCloseCode]         = useState('Solved (Permanently)');
  const [closing, setClosing]             = useState(false);

  // Operations log
  const [operations, setOperations] = useState([]);

  const addOp = useCallback((action, success, message, data = null) => {
    setOperations(prev => [{ action, success, message, data, timestamp: Date.now() }, ...prev].slice(0, 20));
  }, []);

  // ── Create ──────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!createDesc.trim()) return;
    log.info('handleCreate', 'Creating incident', { priority: createPriority });
    setCreating(true);
    try {
      const res = await ApiClient.post(snApi.incidents, {
        shortDescription: createDesc,
        priority: createPriority,
        category: createCategory,
        impact: createImpact,
        urgency: createUrgency,
      });
      if (res?.success) {
        addOp('CREATE', true, res.message || 'Incident created', res.data);
        setCreateDesc('');
        log.info('handleCreate', 'Incident created', { number: res.data?.number });
      } else {
        addOp('CREATE', false, res?.error?.message || 'Create failed');
        log.warn('handleCreate', 'Create failed', { error: res?.error?.message });
      }
    } catch (err) {
      addOp('CREATE', false, err.message);
      log.error('handleCreate', 'Unexpected error', { error: err.message });
    } finally {
      setCreating(false);
    }
  }, [createDesc, createPriority, createCategory, createImpact, createUrgency, addOp]);

  // ── Update ──────────────────────────────────────────────────────────────
  const handleUpdate = useCallback(async () => {
    if (!updateSysId.trim()) return;
    log.info('handleUpdate', 'Updating incident', { sysId: updateSysId });
    setUpdating(true);
    try {
      const body = {};
      if (updatePriority) body.priority = updatePriority;
      if (updateState) body.state = updateState;
      if (updateComment) body.comment = updateComment;
      const res = await ApiClient.put(snApi.incidentUpdate(updateSysId), body);
      if (res?.success) {
        addOp('UPDATE', true, res.message || 'Incident updated', res.data);
        log.info('handleUpdate', 'Incident updated');
      } else {
        addOp('UPDATE', false, res?.error?.message || 'Update failed');
        log.warn('handleUpdate', 'Update failed', { error: res?.error?.message });
      }
    } catch (err) {
      addOp('UPDATE', false, err.message);
      log.error('handleUpdate', 'Unexpected error', { error: err.message });
    } finally {
      setUpdating(false);
    }
  }, [updateSysId, updatePriority, updateState, updateComment, addOp]);

  // ── Close ───────────────────────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    if (!closeSysId.trim()) return;
    log.info('handleClose', 'Closing incident', { sysId: closeSysId });
    setClosing(true);
    try {
      const res = await ApiClient.post(snApi.incidentClose(closeSysId), {
        closeNotes: closeNotes || 'Closed via PulseOps Test Page',
        closeCode,
      });
      if (res?.success) {
        addOp('CLOSE', true, res.message || 'Incident closed', res.data);
        log.info('handleClose', 'Incident closed');
      } else {
        addOp('CLOSE', false, res?.error?.message || 'Close failed');
        log.warn('handleClose', 'Close failed', { error: res?.error?.message });
      }
    } catch (err) {
      addOp('CLOSE', false, err.message);
      log.error('handleClose', 'Unexpected error', { error: err.message });
    } finally {
      setClosing(false);
    }
  }, [closeSysId, closeNotes, closeCode, addOp]);

  // ── Select styling helpers ─────────────────────────────────────────────
  const selectCls = 'w-full px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400';
  const inputCls = selectCls;
  const btnPrimary = 'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50';

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
          <ClipboardList size={20} className="text-brand-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-surface-800">{t.title}</h1>
          <p className="text-sm text-surface-500">{t.subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Create Panel ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100 bg-emerald-50/50 flex items-center gap-2">
            <Plus size={15} className="text-emerald-600" />
            <h3 className="text-sm font-bold text-surface-700">{t.createTitle}</h3>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.shortDescLabel}</label>
              <input type="text" value={createDesc} onChange={e => setCreateDesc(e.target.value)}
                placeholder={t.shortDescPlaceholder} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.priorityLabel}</label>
                <select value={createPriority} onChange={e => setCreatePriority(e.target.value)} className={selectCls}>
                  {t.priorities.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.categoryLabel}</label>
                <input type="text" value={createCategory} onChange={e => setCreateCategory(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.impactLabel}</label>
                <select value={createImpact} onChange={e => setCreateImpact(e.target.value)} className={selectCls}>
                  {t.priorities.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.urgencyLabel}</label>
                <select value={createUrgency} onChange={e => setCreateUrgency(e.target.value)} className={selectCls}>
                  {t.priorities.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <button onClick={handleCreate} disabled={creating || !createDesc.trim()}
              className={`${btnPrimary} bg-emerald-600 text-white hover:bg-emerald-700 w-full justify-center`}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {creating ? t.creating : t.createButton}
            </button>
          </div>
        </div>

        {/* ── Update Panel ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100 bg-amber-50/50 flex items-center gap-2">
            <Edit3 size={15} className="text-amber-600" />
            <h3 className="text-sm font-bold text-surface-700">{t.updateTitle}</h3>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.sysIdLabel}</label>
              <input type="text" value={updateSysId} onChange={e => setUpdateSysId(e.target.value)}
                placeholder={t.sysIdPlaceholder} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.priorityLabel}</label>
                <select value={updatePriority} onChange={e => setUpdatePriority(e.target.value)} className={selectCls}>
                  <option value="">— No change —</option>
                  {t.priorities.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.stateLabel}</label>
                <select value={updateState} onChange={e => setUpdateState(e.target.value)} className={selectCls}>
                  <option value="">— No change —</option>
                  {t.states.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.commentLabel}</label>
              <textarea value={updateComment} onChange={e => setUpdateComment(e.target.value)}
                placeholder={t.commentPlaceholder} rows={2}
                className={`${inputCls} resize-none`} />
            </div>
            <button onClick={handleUpdate} disabled={updating || !updateSysId.trim()}
              className={`${btnPrimary} bg-amber-600 text-white hover:bg-amber-700 w-full justify-center`}>
              {updating ? <Loader2 size={14} className="animate-spin" /> : <Edit3 size={14} />}
              {updating ? t.updating : t.updateButton}
            </button>
          </div>
        </div>

        {/* ── Close Panel ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100 bg-rose-50/50 flex items-center gap-2">
            <XCircle size={15} className="text-rose-600" />
            <h3 className="text-sm font-bold text-surface-700">{t.closeTitle}</h3>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.sysIdLabel}</label>
              <input type="text" value={closeSysId} onChange={e => setCloseSysId(e.target.value)}
                placeholder={t.sysIdPlaceholder} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.closeNotesLabel}</label>
              <textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)}
                placeholder={t.closeNotesPlaceholder} rows={2}
                className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.closeCodeLabel}</label>
              <select value={closeCode} onChange={e => setCloseCode(e.target.value)} className={selectCls}>
                {t.closeCodes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={handleClose} disabled={closing || !closeSysId.trim()}
              className={`${btnPrimary} bg-rose-600 text-white hover:bg-rose-700 w-full justify-center`}>
              {closing ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              {closing ? t.closing : t.closeButton}
            </button>
          </div>
        </div>
      </div>

      {/* ── Operations Log ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-100 bg-surface-50/50">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-surface-500" />
            <h3 className="text-sm font-bold text-surface-700">{t.recentOps}</h3>
          </div>
          {operations.length > 0 && (
            <button onClick={() => setOperations([])}
              className="flex items-center gap-1 text-xs text-surface-400 hover:text-rose-500 transition-colors">
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>
        <div className="p-5">
          {operations.length === 0 ? (
            <p className="text-sm text-surface-400 text-center py-4">{t.noResults}</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {operations.map((op, i) => <OpResult key={i} op={op} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
