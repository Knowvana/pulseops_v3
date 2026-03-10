// ============================================================================
// ServiceNowTestIncidents — PulseOps V3 ServiceNow Module
//
// PURPOSE: Test page for creating, updating, and closing ServiceNow incidents.
// Provides a UI for exercising the CRUD API endpoints against a live
// ServiceNow instance. Displays operation results with status feedback.
//
// ARCHITECTURE:
//   - Three action panels: Create, Update, Close
//   - Create panel uses Impact + Urgency (SNOW calculates Priority)
//   - Create panel has searchable assignment group dropdown
//   - Close panel uses open incident dropdown instead of manual sys_id
//   - Recent operations log with status badges
//   - All text from uiText.json — zero hardcoded strings
//
// USED BY: src/modules/servicenow/manifest.jsx → getViews().testIncidents
//
// DEPENDENCIES:
//   - lucide-react       → Icons
//   - @shared            → createLogger, ApiClient
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Edit3, XCircle, CheckCircle2, AlertCircle,
  Loader2, ClipboardList, Clock, Trash2, Search, RefreshCw, Users,
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
  openIncidents: '/api/servicenow/incidents/open',
  searchGroups: '/api/servicenow/search/assignment-groups',
};

// ServiceNow Impact/Urgency values (3-level)
const IMPACT_OPTIONS = [
  { value: '1', label: '1 - High' },
  { value: '2', label: '2 - Medium' },
  { value: '3', label: '3 - Low' },
];

const URGENCY_OPTIONS = [
  { value: '1', label: '1 - High' },
  { value: '2', label: '2 - Medium' },
  { value: '3', label: '3 - Low' },
];

const PRIORITY_LABELS = {
  '1': '1 - Critical', '2': '2 - High', '3': '3 - Medium', '4': '4 - Low', '5': '5 - Planning',
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
  const [createCategory, setCreateCategory] = useState('General');
  const [createImpact, setCreateImpact]   = useState('2');
  const [createUrgency, setCreateUrgency] = useState('2');
  const [createGroup, setCreateGroup]     = useState('');
  const [creating, setCreating]           = useState(false);

  // Assignment group search state
  const [groupSearch, setGroupSearch]       = useState('');
  const [groupResults, setGroupResults]     = useState([]);
  const [groupSearching, setGroupSearching] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const groupSearchRef = useRef(null);
  const groupDropdownRef = useRef(null);

  // Update form state
  const [updateSysId, setUpdateSysId]       = useState('');
  const [updatePriority, setUpdatePriority] = useState('');
  const [updateState, setUpdateState]       = useState('');
  const [updateComment, setUpdateComment]   = useState('');
  const [updating, setUpdating]             = useState(false);

  // Close form state
  const [closeIncident, setCloseIncident] = useState('');
  const [closeNotes, setCloseNotes]       = useState('');
  const [closeCode, setCloseCode]         = useState('Solved (Permanently)');
  const [closing, setClosing]             = useState(false);

  // Open incidents for close dropdown
  const [openIncidents, setOpenIncidents]       = useState([]);
  const [openIncidentsLoading, setOpenIncidentsLoading] = useState(false);

  // Operations log
  const [operations, setOperations] = useState([]);

  const initRan = useRef(false);

  const addOp = useCallback((action, success, message, data = null) => {
    setOperations(prev => [{ action, success, message, data, timestamp: Date.now() }, ...prev].slice(0, 20));
  }, []);

  // ── Fetch open incidents for close dropdown ─────────────────────────────
  const fetchOpenIncidents = useCallback(async () => {
    setOpenIncidentsLoading(true);
    try {
      const res = await ApiClient.get(snApi.openIncidents);
      if (res?.success) {
        setOpenIncidents(res.data.incidents || []);
      }
    } catch (err) {
      log.error('fetchOpenIncidents', 'Failed', { error: err.message });
    } finally {
      setOpenIncidentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    fetchOpenIncidents();
  }, [fetchOpenIncidents]);

  // ── Assignment group search (debounced) ─────────────────────────────────
  useEffect(() => {
    if (!groupSearch.trim()) {
      setGroupResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setGroupSearching(true);
      try {
        const res = await ApiClient.get(`${snApi.searchGroups}?q=${encodeURIComponent(groupSearch)}`);
        if (res?.success) setGroupResults(res.data.groups || []);
      } catch { /* ignore */ }
      finally { setGroupSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [groupSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target)) {
        setShowGroupDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Create ──────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!createDesc.trim()) return;
    log.info('handleCreate', 'Creating incident', { impact: createImpact, urgency: createUrgency });
    setCreating(true);
    try {
      const body = {
        shortDescription: createDesc,
        category: createCategory,
        impact: createImpact,
        urgency: createUrgency,
      };
      if (createGroup) body.assignmentGroup = createGroup;
      const res = await ApiClient.post(snApi.incidents, body);
      if (res?.success) {
        addOp('CREATE', true, res.message || 'Incident created', res.data);
        setCreateDesc('');
        fetchOpenIncidents();
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
  }, [createDesc, createCategory, createImpact, createUrgency, createGroup, addOp, fetchOpenIncidents]);

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
    if (!closeIncident) return;
    log.info('handleClose', 'Closing incident', { incident: closeIncident });
    setClosing(true);
    try {
      const res = await ApiClient.post(snApi.incidentClose(closeIncident), {
        closeNotes: closeNotes || 'Closed via PulseOps Test Page',
        closeCode,
        resolutionCode: closeCode,
      });
      if (res?.success) {
        addOp('CLOSE', true, res.message || 'Incident closed', res.data);
        setCloseIncident('');
        fetchOpenIncidents();
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
  }, [closeIncident, closeNotes, closeCode, addOp, fetchOpenIncidents]);

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
                <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.impactLabel}</label>
                <select value={createImpact} onChange={e => setCreateImpact(e.target.value)} className={selectCls}>
                  {IMPACT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.urgencyLabel}</label>
                <select value={createUrgency} onChange={e => setCreateUrgency(e.target.value)} className={selectCls}>
                  {URGENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.categoryLabel}</label>
              <input type="text" value={createCategory} onChange={e => setCreateCategory(e.target.value)} className={inputCls} />
            </div>
            {/* Assignment Group — searchable dropdown */}
            <div className="relative" ref={groupDropdownRef}>
              <label className="text-xs font-semibold text-surface-600 mb-1 block">
                <Users size={11} className="inline mr-1" />Assignment Group
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  ref={groupSearchRef}
                  type="text"
                  value={createGroup || groupSearch}
                  onChange={e => {
                    setGroupSearch(e.target.value);
                    setCreateGroup('');
                    setShowGroupDropdown(true);
                  }}
                  onFocus={() => setShowGroupDropdown(true)}
                  placeholder="Search assignment groups..."
                  className={`${inputCls} pl-8 pr-8`}
                />
                {groupSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-500 animate-spin" />}
                {createGroup && !groupSearching && (
                  <button onClick={() => { setCreateGroup(''); setGroupSearch(''); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-rose-500">
                    <XCircle size={13} />
                  </button>
                )}
              </div>
              {showGroupDropdown && groupResults.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white rounded-lg border border-surface-200 shadow-lg max-h-[160px] overflow-y-auto">
                  {groupResults.map(g => (
                    <button key={g.sysId} onClick={() => {
                      setCreateGroup(g.name);
                      setGroupSearch('');
                      setShowGroupDropdown(false);
                    }}
                      className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors border-b border-surface-50 last:border-b-0">
                      <span className="text-xs font-medium text-surface-700">{g.name}</span>
                      {g.description && (
                        <span className="block text-[10px] text-surface-400 truncate">{g.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {createGroup && (
                <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
                  <CheckCircle2 size={10} /> {createGroup}
                </p>
              )}
            </div>
            <div className="pt-1">
              <p className="text-[10px] text-surface-400 bg-surface-50 rounded-lg px-3 py-1.5 mb-2">
                ServiceNow auto-calculates Priority from Impact + Urgency
              </p>
              <button onClick={handleCreate} disabled={creating || !createDesc.trim()}
                className={`${btnPrimary} bg-emerald-600 text-white hover:bg-emerald-700 w-full justify-center`}>
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? t.creating : t.createButton}
              </button>
            </div>
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
                <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.impactLabel}</label>
                <select value={updatePriority} onChange={e => setUpdatePriority(e.target.value)} className={selectCls}>
                  <option value="">— No change —</option>
                  {IMPACT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
          <div className="px-5 py-3 border-b border-surface-100 bg-rose-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <XCircle size={15} className="text-rose-600" />
              <h3 className="text-sm font-bold text-surface-700">{t.closeTitle}</h3>
            </div>
            <button onClick={fetchOpenIncidents} disabled={openIncidentsLoading}
              className="p-1 rounded text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
              title="Refresh open incidents">
              <RefreshCw size={12} className={openIncidentsLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1 block">Select Incident</label>
              {openIncidentsLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-surface-400">
                  <Loader2 size={12} className="animate-spin" /> Loading open incidents...
                </div>
              ) : (
                <select value={closeIncident} onChange={e => setCloseIncident(e.target.value)} className={selectCls}>
                  <option value="">— Select an open incident —</option>
                  {openIncidents.map(inc => (
                    <option key={inc.number} value={inc.number}>
                      {inc.number} — P{inc.priority} — {(inc.shortDescription || '').slice(0, 50)}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[10px] text-surface-400 mt-0.5">
                {openIncidents.length} open incident(s) available
              </p>
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
            <button onClick={handleClose} disabled={closing || !closeIncident}
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
