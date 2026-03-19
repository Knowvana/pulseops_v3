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
  Loader2, ClipboardList, Clock, Trash2, Search, RefreshCw, Users, MessageSquare, CalendarRange, Globe,
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
  autoAckTest: '/api/servicenow/auto-acknowledge/test',
  autoAckConfig: '/api/servicenow/config/auto-acknowledge',
  closeCodes: '/api/servicenow/schema/close-codes',
  changes: '/api/servicenow/changes',
  changesOpen: '/api/servicenow/changes/open',
  changeClose: (sysId) => `/api/servicenow/changes/${sysId}/close`,
  configChange: '/api/servicenow/config/change',
  configIncidents: '/api/servicenow/config/incidents',
  configTimezone: '/api/servicenow/config/timezone',
};

// Format a Date in a given IANA timezone as YYYY-MM-DD HH:MM:SS
function formatInTz(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(date);
    const get = (type) => (parts.find(p => p.type === type) || {}).value || '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
  } catch {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }
}

// Live clock string for a timezone
function useTimezoneClock(tz) {
  const [now, setNow] = useState(() => formatInTz(new Date(), tz || 'UTC'));
  useEffect(() => {
    if (!tz) return;
    const id = setInterval(() => setNow(formatInTz(new Date(), tz)), 1000);
    return () => clearInterval(id);
  }, [tz]);
  return now;
}

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
  const [closeCode, setCloseCode]         = useState('');
  const [closing, setClosing]             = useState(false);

  // Close codes fetched from SNOW sys_choice
  const [closeCodes, setCloseCodes]             = useState([]);
  const [closeCodesLoading, setCloseCodesLoading] = useState(false);

  // Open incidents for close dropdown
  const [openIncidents, setOpenIncidents]       = useState([]);
  const [openIncidentsLoading, setOpenIncidentsLoading] = useState(false);

  // Auto Acknowledge test state
  const [ackIncident, setAckIncident] = useState('');
  const [ackMessage, setAckMessage] = useState('');
  const [acknowledging, setAcknowledging] = useState(false);

  // Config state — fetched on mount
  const [configuredGroup, setConfiguredGroup] = useState('');
  const [effectiveTimezone, setEffectiveTimezone] = useState('UTC');
  const [changeConfig, setChangeConfig]   = useState(null);

  // Create Change state
  const [changeDesc, setChangeDesc]       = useState('');
  const [changeStart, setChangeStart]     = useState('');
  const [changeEnd, setChangeEnd]         = useState('');
  const [changeGroup, setChangeGroup]     = useState('');
  const [creatingChange, setCreatingChange] = useState(false);

  // Close Change state
  const [changeCloseSysId, setChangeCloseSysId] = useState('');
  const [changeCloseNotes, setChangeCloseNotes] = useState('');
  const [closingChange, setClosingChange]       = useState(false);
  // Open changes from ServiceNow for close dropdown
  const [openChanges, setOpenChanges]           = useState([]);
  const [openChangesLoading, setOpenChangesLoading] = useState(false);

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

  // ── Fetch close codes from SNOW ─────────────────────────────────────────
  const fetchCloseCodes = useCallback(async () => {
    setCloseCodesLoading(true);
    try {
      const res = await ApiClient.get(snApi.closeCodes);
      if (res?.success && res.data?.choices?.length) {
        setCloseCodes(res.data.choices);
        setCloseCode(prev => prev || res.data.choices[0].value);
      }
    } catch (err) {
      log.error('fetchCloseCodes', 'Failed', { error: err.message });
    } finally {
      setCloseCodesLoading(false);
    }
  }, []);

  // ── Fetch open changes for close dropdown ──────────────────────────────
  const fetchOpenChanges = useCallback(async () => {
    setOpenChangesLoading(true);
    try {
      const res = await ApiClient.get(snApi.changesOpen);
      if (res?.success) setOpenChanges(res.data.changes || []);
    } catch (err) {
      log.error('fetchOpenChanges', 'Failed', { error: err.message });
    } finally {
      setOpenChangesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    fetchOpenIncidents();
    fetchCloseCodes();
    fetchOpenChanges();

    // Load auto acknowledge default message
    (async () => {
      try {
        const res = await ApiClient.get(snApi.autoAckConfig);
        if (res?.success && res.data?.message) setAckMessage(res.data.message);
      } catch { /* ignore */ }
    })();

    // Load incident config → assignment group
    (async () => {
      try {
        const res = await ApiClient.get(snApi.configIncidents);
        if (res?.success && res.data?.assignmentGroup) {
          const ag = res.data.assignmentGroup;
          setConfiguredGroup(ag);
          setCreateGroup(ag);
          setChangeGroup(ag);
        }
      } catch { /* ignore */ }
    })();

    // Load timezone config
    (async () => {
      try {
        const res = await ApiClient.get(snApi.configTimezone);
        if (res?.success && res.data?.effectiveTimezone) {
          setEffectiveTimezone(res.data.effectiveTimezone);
        }
      } catch { /* ignore */ }
    })();

    // Load change config for downtime field mapping info
    (async () => {
      try {
        const res = await ApiClient.get(snApi.configChange);
        if (res?.success) setChangeConfig(res.data);
      } catch { /* ignore */ }
    })();
  }, [fetchOpenIncidents, fetchCloseCodes, fetchOpenChanges]);

  // Pre-fill start/end dates in the configured timezone once loaded
  useEffect(() => {
    if (!effectiveTimezone) return;
    const now = new Date();
    const later = new Date(now.getTime() + 60 * 60 * 1000);
    setChangeStart(formatInTz(now, effectiveTimezone));
    setChangeEnd(formatInTz(later, effectiveTimezone));
    setChangeDesc(`Test Change - ${formatInTz(now, effectiveTimezone).substring(0, 16)}`);
  }, [effectiveTimezone]);

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

  // ── Create Change ────────────────────────────────────────────────────
  const handleCreateChange = useCallback(async () => {
    if (!changeDesc.trim()) return;
    log.info('handleCreateChange', 'Creating change', { desc: changeDesc.substring(0, 60) });
    setCreatingChange(true);
    try {
      const body = {
        shortDescription: changeDesc,
        startDate: changeStart || undefined,
        endDate: changeEnd || undefined,
      };
      if (changeGroup) body.assignmentGroup = changeGroup;
      const res = await ApiClient.post(snApi.changes, body);
      if (res?.success) {
        const taskInfo = res.data?.task ? ` + Task ${res.data.task.number}` : '';
        addOp('CREATE CHANGE', true, res.message || `Change ${res.data?.number}${taskInfo} created`, res.data);
        // Reset desc with new timestamp
        setChangeDesc(`Test Change - ${formatInTz(new Date(), effectiveTimezone).substring(0, 16)}`);
        fetchOpenChanges();
        log.info('handleCreateChange', 'Change created', { number: res.data?.number, task: res.data?.task?.number });
      } else {
        addOp('CREATE CHANGE', false, res?.error?.message || 'Create change failed');
      }
    } catch (err) {
      addOp('CREATE CHANGE', false, err.message);
    } finally {
      setCreatingChange(false);
    }
  }, [changeDesc, changeStart, changeEnd, changeGroup, addOp, effectiveTimezone, fetchOpenChanges]);

  // ── Close Change ─────────────────────────────────────────────────────────
  const handleCloseChange = useCallback(async () => {
    if (!changeCloseSysId) return;
    log.info('handleCloseChange', 'Closing change', { sysId: changeCloseSysId });
    setClosingChange(true);
    try {
      const res = await ApiClient.post(snApi.changeClose(changeCloseSysId), {
        closeNotes: changeCloseNotes || 'Closed via PulseOps Test Page',
        state: '3',
      });
      if (res?.success) {
        addOp('CLOSE CHANGE', true, res.message || 'Change closed', res.data);
        setChangeCloseSysId('');
        fetchOpenChanges();
        log.info('handleCloseChange', 'Change closed');
      } else {
        addOp('CLOSE CHANGE', false, res?.error?.message || 'Close change failed');
      }
    } catch (err) {
      addOp('CLOSE CHANGE', false, err.message);
    } finally {
      setClosingChange(false);
    }
  }, [changeCloseSysId, changeCloseNotes, addOp, fetchOpenChanges]);

  // ── Select styling helpers ─────────────────────────────────────────────
  const selectCls = 'w-full px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400';
  const inputCls = selectCls;
  const btnPrimary = 'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50';

  // Live clock in configured timezone
  const clockNow = useTimezoneClock(effectiveTimezone);

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <ClipboardList size={20} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800">{t.title}</h1>
            <p className="text-sm text-surface-500">{t.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-surface-600">
              <Globe size={12} className="text-brand-500" />
              {effectiveTimezone}
            </div>
            <span className="text-sm font-mono text-surface-700">{clockNow}</span>
          </div>
          {configuredGroup && (
            <div className="flex flex-col items-end border-l border-surface-200 pl-3">
              <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Assignment Group</span>
              <span className="text-xs font-semibold text-brand-600">{configuredGroup}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
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
                    <option key={inc.sysId || inc.number} value={inc.sysId || ''}>
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
              {closeCodesLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-surface-400">
                  <Loader2 size={12} className="animate-spin" /> Loading close codes from ServiceNow...
                </div>
              ) : (
                <select value={closeCode} onChange={e => setCloseCode(e.target.value)} className={selectCls}>
                  {closeCodes.length > 0
                    ? closeCodes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                    : t.closeCodes.map(c => <option key={c} value={c}>{c}</option>)
                  }
                </select>
              )}
              <p className="text-[10px] text-surface-400 mt-0.5">
                {closeCodes.length > 0 ? `${closeCodes.length} resolution code(s) from ServiceNow` : 'Using default resolution codes'}
              </p>
            </div>
            <button onClick={handleClose} disabled={closing || !closeIncident}
              className={`${btnPrimary} bg-rose-600 text-white hover:bg-rose-700 w-full justify-center`}>
              {closing ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              {closing ? t.closing : t.closeButton}
            </button>
          </div>
        </div>
        {/* ── Auto Acknowledge Panel ────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100 bg-brand-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} className="text-brand-600" />
              <h3 className="text-sm font-bold text-surface-700">Auto Acknowledge</h3>
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
                <select value={ackIncident} onChange={e => setAckIncident(e.target.value)} className={selectCls}>
                  <option value="">— Select an incident —</option>
                  {openIncidents.map(inc => (
                    <option key={inc.number} value={inc.sysId || inc.sys_id || ''}>
                      {inc.number} — P{inc.priority} — {(inc.shortDescription || '').slice(0, 50)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1 block">Acknowledge Message</label>
              <textarea value={ackMessage} onChange={e => setAckMessage(e.target.value)}
                placeholder="Enter acknowledge message..." rows={2}
                className={`${inputCls} resize-none`} />
              <p className="text-[10px] text-surface-400 mt-0.5">Pre-filled from Auto Acknowledge configuration.</p>
            </div>
            <button onClick={async () => {
              if (!ackIncident || !ackMessage.trim()) return;
              setAcknowledging(true);
              try {
                const res = await ApiClient.post(snApi.autoAckTest, { incidentSysId: ackIncident, message: ackMessage });
                if (res?.success) {
                  addOp('AUTO ACK', true, res.message || 'Auto acknowledge comment posted.', { number: ackIncident });
                } else {
                  addOp('AUTO ACK', false, res?.error?.message || 'Failed.');
                }
              } catch (err) {
                addOp('AUTO ACK', false, err.message);
              } finally {
                setAcknowledging(false);
              }
            }} disabled={acknowledging || !ackIncident || !ackMessage.trim()}
              className={`${btnPrimary} bg-brand-600 text-white hover:bg-brand-700 w-full justify-center`}>
              {acknowledging ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
              {acknowledging ? 'Acknowledging...' : 'Test Auto Acknowledge'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Create & Close Change (end-to-end downtime test) ─────────── */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-indigo-50/50 flex items-center gap-2">
          <CalendarRange size={15} className="text-indigo-600" />
          <h3 className="text-sm font-bold text-surface-700">Create & Close Change</h3>
          <span className="ml-auto text-[10px] text-surface-400 font-mono">
            change_request + change_task
          </span>
        </div>
        <div className="p-5 space-y-4">
          {/* Info */}
          <div className="text-xs text-surface-400 bg-surface-50 rounded-lg px-3 py-2 space-y-1">
            <p>Creates a <strong>change_request</strong> + linked <strong>change_task</strong> (implementation task). Downtime dates are set on the task columns
              (<span className="font-mono">{changeConfig?.downtimeMapping?.startDateField || 'work_start'}</span> / <span className="font-mono">{changeConfig?.downtimeMapping?.endDateField || 'work_end'}</span>).</p>
            <p className="flex items-center gap-1"><Globe size={10} /> Times shown in <strong>{effectiveTimezone}</strong></p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Create Change */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Create Change</p>
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">Short Description</label>
                <input type="text" value={changeDesc} onChange={e => setChangeDesc(e.target.value)}
                  placeholder="Test Change - ..." className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">
                  Start Date/Time <span className="font-normal text-surface-400">({effectiveTimezone})</span>
                </label>
                <input type="text" value={changeStart} onChange={e => setChangeStart(e.target.value)}
                  placeholder="YYYY-MM-DD HH:MM:SS" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">
                  End Date/Time <span className="font-normal text-surface-400">({effectiveTimezone})</span>
                </label>
                <input type="text" value={changeEnd} onChange={e => setChangeEnd(e.target.value)}
                  placeholder="YYYY-MM-DD HH:MM:SS" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">
                  <Users size={11} className="inline mr-1" />Assignment Group
                </label>
                <input type="text" value={changeGroup} onChange={e => setChangeGroup(e.target.value)}
                  placeholder="From config..." className={inputCls} />
                {changeGroup && (
                  <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
                    <CheckCircle2 size={10} /> {changeGroup}
                  </p>
                )}
              </div>
              <button onClick={handleCreateChange} disabled={creatingChange || !changeDesc.trim()}
                className={`${btnPrimary} bg-indigo-600 text-white hover:bg-indigo-700 w-full justify-center`}>
                {creatingChange ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creatingChange ? 'Creating...' : 'Create Change + Task'}
              </button>
            </div>

            {/* Close Change */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-rose-700 uppercase tracking-wider">Close Change</p>
                <button onClick={fetchOpenChanges} disabled={openChangesLoading}
                  className="p-1 rounded text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
                  title="Refresh open changes">
                  <RefreshCw size={12} className={openChangesLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">Select Open Change</label>
                {openChangesLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-surface-400">
                    <Loader2 size={12} className="animate-spin" /> Loading open changes...
                  </div>
                ) : (
                  <select value={changeCloseSysId} onChange={e => setChangeCloseSysId(e.target.value)} className={selectCls}>
                    <option value="">— Select an open change —</option>
                    {openChanges.map(c => (
                      <option key={c.sysId} value={c.sysId}>
                        {c.number} — {(c.shortDescription || '').slice(0, 50)}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-surface-400 mt-0.5">
                  {openChanges.length} open change(s) for {configuredGroup || 'all groups'}
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">Close Notes</label>
                <textarea value={changeCloseNotes} onChange={e => setChangeCloseNotes(e.target.value)}
                  placeholder="Maintenance completed successfully." rows={2}
                  className={`${inputCls} resize-none`} />
              </div>
              <button onClick={handleCloseChange} disabled={closingChange || !changeCloseSysId}
                className={`${btnPrimary} bg-rose-600 text-white hover:bg-rose-700 w-full justify-center`}>
                {closingChange ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                {closingChange ? 'Closing...' : 'Close Change'}
              </button>
            </div>
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
