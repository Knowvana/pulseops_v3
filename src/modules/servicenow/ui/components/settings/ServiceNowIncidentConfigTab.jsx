// ============================================================================
// ServiceNowIncidentConfigTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Incident configuration tab with four sections, each with its own
//   save button for independent persistence:
//   1. Column Mapping — rich grid with metadata from sys_dictionary + sample values
//   2. SLA Column Mapping — map created/closed columns for SLA calculation
//   3. Assignment Group — filter incidents by assignment group
//   4. SLA Configuration — CRUD for SLA thresholds per priority
//
// DATA: All config is persisted to database via per-section REST API endpoints.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Columns, Save, Loader2, AlertCircle, CheckCircle2, Plus, Trash2,
  RefreshCw, Shield, Users, Clock, Search, Lock, Info, ChevronUp,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';

const log = createLogger('ServiceNowIncidentConfigTab.jsx');

const snApi = {
  incidentConfig:       '/api/servicenow/config/incidents',
  incidentColumns:      '/api/servicenow/config/incidents/columns',
  incidentSlaMapping:   '/api/servicenow/config/incidents/sla-mapping',
  incidentAssignGroup:  '/api/servicenow/config/incidents/assignment-group',
  snowColumns:          '/api/servicenow/schema/columns',
  slaConfig:            '/api/servicenow/config/sla',
};

// Priority badge styles
const PRIORITY_STYLES = {
  '1 - Critical': 'bg-rose-100 text-rose-700 border-rose-200',
  '2 - High':     'bg-amber-100 text-amber-700 border-amber-200',
  '3 - Medium':   'bg-blue-100 text-blue-700 border-blue-200',
  '4 - Low':      'bg-emerald-100 text-emerald-700 border-emerald-200',
};

// SNOW field type → human-readable label
const TYPE_LABELS = {
  string:             'String',
  integer:            'Integer',
  boolean:            'Boolean',
  glide_date_time:    'Date/Time',
  glide_date:         'Date',
  reference:          'Reference',
  choice:             'Choice',
  journal:            'Journal',
  journal_input:      'Journal Input',
  html:               'HTML',
  conditions:         'Conditions',
  url:                'URL',
  email:              'Email',
  phone_number_e164:  'Phone',
  currency:           'Currency',
  decimal:            'Decimal',
  float:              'Float',
  percent_complete:   'Percent',
  sys_class_name:     'Class Name',
  document_id:        'Document ID',
  translated_field:   'Translated',
};

function typeBadge(type) {
  const label = TYPE_LABELS[type] || type || 'String';
  const colors =
    type === 'integer' || type === 'decimal' || type === 'float'
      ? 'bg-violet-50 text-violet-600 border-violet-200'
      : type === 'boolean'
        ? 'bg-amber-50 text-amber-600 border-amber-200'
        : type === 'glide_date_time' || type === 'glide_date'
          ? 'bg-sky-50 text-sky-600 border-sky-200'
          : type === 'reference'
            ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
            : type === 'choice'
              ? 'bg-teal-50 text-teal-600 border-teal-200'
              : 'bg-surface-50 text-surface-500 border-surface-200';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${colors}`}>
      {label}
    </span>
  );
}

// ── Per-section save button ────────────────────────────────────────────────
function SectionSaveButton({ saving, onClick, label = 'Save' }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
    >
      {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
      {saving ? 'Saving...' : label}
    </button>
  );
}

// ── Section message banner ─────────────────────────────────────────────────
function SectionMessage({ message }) {
  if (!message) return null;
  return (
    <div className={`mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
      message.type === 'success'
        ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
        : 'bg-rose-50 border border-rose-200 text-rose-700'
    }`}>
      {message.type === 'success' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
      {message.text}
    </div>
  );
}

export default function ServiceNowIncidentConfigTab() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading]               = useState(true);
  const [snowColumns, setSnowColumns]       = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnSource, setColumnSource]     = useState(null);
  const [columnSearch, setColumnSearch]     = useState('');
  const [expandedCol, setExpandedCol]       = useState(null);

  // Incident config
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [createdColumn, setCreatedColumn]     = useState('opened_at');
  const [closedColumn, setClosedColumn]       = useState('closed_at');
  const [assignmentGroup, setAssignmentGroup] = useState('');

  // Per-section saving & messages
  const [savingColumns, setSavingColumns] = useState(false);
  const [savingSlaMap, setSavingSlaMap]   = useState(false);
  const [savingGroup, setSavingGroup]     = useState(false);
  const [msgColumns, setMsgColumns]       = useState(null);
  const [msgSlaMap, setMsgSlaMap]         = useState(null);
  const [msgGroup, setMsgGroup]           = useState(null);
  const [msgSla, setMsgSla]               = useState(null);

  // SLA config
  const [slaRows, setSlaRows]       = useState([]);
  const [slaLoading, setSlaLoading] = useState(false);
  const [editingSla, setEditingSla] = useState(null);
  const [newSla, setNewSla]         = useState({ priority: '', responseMinutes: 60, resolutionMinutes: 480 });

  const initRan = useRef(false);

  // ── Auto-dismiss messages ─────────────────────────────────────────────────
  const autoDismiss = (setter) => {
    const timer = setTimeout(() => setter(null), 5000);
    return () => clearTimeout(timer);
  };
  useEffect(() => { if (msgColumns) return autoDismiss(setMsgColumns); }, [msgColumns]);
  useEffect(() => { if (msgSlaMap) return autoDismiss(setMsgSlaMap); }, [msgSlaMap]);
  useEffect(() => { if (msgGroup) return autoDismiss(setMsgGroup); }, [msgGroup]);
  useEffect(() => { if (msgSla) return autoDismiss(setMsgSla); }, [msgSla]);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, slaRes] = await Promise.all([
        ApiClient.get(snApi.incidentConfig),
        ApiClient.get(snApi.slaConfig),
      ]);
      if (configRes?.success) {
        setSelectedColumns(configRes.data.selectedColumns || []);
        setCreatedColumn(configRes.data.createdColumn || 'opened_at');
        setClosedColumn(configRes.data.closedColumn || 'closed_at');
        setAssignmentGroup(configRes.data.assignmentGroup || '');
      }
      if (slaRes?.success) {
        setSlaRows(slaRes.data || []);
      }
    } catch (err) {
      log.error('loadData', 'Failed to load config', { error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSnowColumns = useCallback(async () => {
    setColumnsLoading(true);
    try {
      const res = await ApiClient.get(snApi.snowColumns);
      if (res?.success) {
        setSnowColumns(res.data.columns || []);
        setColumnSource(res.data.source || null);
      } else {
        setMsgColumns({ type: 'error', text: res?.error?.message || 'Failed to fetch SNOW columns.' });
      }
    } catch (err) {
      setMsgColumns({ type: 'error', text: 'Failed to fetch ServiceNow columns.' });
    } finally {
      setColumnsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadData();
    fetchSnowColumns();
  }, [loadData, fetchSnowColumns]);

  // ── Filtered columns ──────────────────────────────────────────────────────
  const filteredColumns = useMemo(() => {
    if (!columnSearch.trim()) return snowColumns;
    const q = columnSearch.toLowerCase();
    return snowColumns.filter(col =>
      col.name.toLowerCase().includes(q) ||
      (col.label || '').toLowerCase().includes(q) ||
      (col.type || '').toLowerCase().includes(q)
    );
  }, [snowColumns, columnSearch]);

  // ── Save: Selected Columns ────────────────────────────────────────────────
  const handleSaveColumns = useCallback(async () => {
    setSavingColumns(true);
    setMsgColumns(null);
    try {
      const res = await ApiClient.put(snApi.incidentColumns, { selectedColumns });
      if (res?.success) {
        setMsgColumns({ type: 'success', text: 'Selected columns saved successfully.' });
      } else {
        setMsgColumns({ type: 'error', text: res?.error?.message || 'Failed to save columns.' });
      }
    } catch {
      setMsgColumns({ type: 'error', text: 'Failed to save columns.' });
    } finally {
      setSavingColumns(false);
    }
  }, [selectedColumns]);

  // ── Save: SLA Column Mapping ──────────────────────────────────────────────
  const handleSaveSlaMapping = useCallback(async () => {
    setSavingSlaMap(true);
    setMsgSlaMap(null);
    try {
      const res = await ApiClient.put(snApi.incidentSlaMapping, { createdColumn, closedColumn });
      if (res?.success) {
        setMsgSlaMap({ type: 'success', text: 'SLA column mapping saved successfully.' });
      } else {
        setMsgSlaMap({ type: 'error', text: res?.error?.message || 'Failed to save SLA mapping.' });
      }
    } catch {
      setMsgSlaMap({ type: 'error', text: 'Failed to save SLA mapping.' });
    } finally {
      setSavingSlaMap(false);
    }
  }, [createdColumn, closedColumn]);

  // ── Save: Assignment Group ────────────────────────────────────────────────
  const handleSaveGroup = useCallback(async () => {
    setSavingGroup(true);
    setMsgGroup(null);
    try {
      const res = await ApiClient.put(snApi.incidentAssignGroup, { assignmentGroup });
      if (res?.success) {
        setMsgGroup({ type: 'success', text: 'Assignment group saved successfully.' });
      } else {
        setMsgGroup({ type: 'error', text: res?.error?.message || 'Failed to save assignment group.' });
      }
    } catch {
      setMsgGroup({ type: 'error', text: 'Failed to save assignment group.' });
    } finally {
      setSavingGroup(false);
    }
  }, [assignmentGroup]);

  // ── Column toggle ─────────────────────────────────────────────────────────
  const toggleColumn = (colName) => {
    if (colName === 'number') return; // mandatory
    setSelectedColumns(prev =>
      prev.includes(colName) ? prev.filter(c => c !== colName) : [...prev, colName]
    );
  };

  // ── SLA CRUD ──────────────────────────────────────────────────────────────
  const handleSaveSla = useCallback(async (slaData, isNew = false) => {
    setSlaLoading(true);
    setMsgSla(null);
    try {
      let res;
      if (isNew) {
        res = await ApiClient.post(snApi.slaConfig, {
          priority: slaData.priority,
          responseMinutes: Number(slaData.responseMinutes),
          resolutionMinutes: Number(slaData.resolutionMinutes),
        });
      } else {
        res = await ApiClient.put(`${snApi.slaConfig}/${slaData.id}`, {
          priority: slaData.priority,
          responseMinutes: Number(slaData.responseMinutes),
          resolutionMinutes: Number(slaData.resolutionMinutes),
          enabled: slaData.enabled,
        });
      }
      if (res?.success) {
        setMsgSla({ type: 'success', text: isNew ? 'SLA created.' : 'SLA updated.' });
        setEditingSla(null);
        setNewSla({ priority: '', responseMinutes: 60, resolutionMinutes: 480 });
        const slaRes = await ApiClient.get(snApi.slaConfig);
        if (slaRes?.success) setSlaRows(slaRes.data || []);
      } else {
        setMsgSla({ type: 'error', text: res?.error?.message || 'SLA save failed.' });
      }
    } catch {
      setMsgSla({ type: 'error', text: 'SLA save failed.' });
    } finally {
      setSlaLoading(false);
    }
  }, []);

  const handleDeleteSla = useCallback(async (id) => {
    setSlaLoading(true);
    try {
      const res = await ApiClient.delete(`${snApi.slaConfig}/${id}`);
      if (res?.success) {
        setSlaRows(prev => prev.filter(r => r.id !== id));
        setMsgSla({ type: 'success', text: 'SLA deleted.' });
      }
    } catch {
      setMsgSla({ type: 'error', text: 'Failed to delete SLA.' });
    } finally {
      setSlaLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 size={22} className="text-brand-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Columns size={20} className="text-brand-600" />
          <h2 className="text-lg font-bold text-surface-800">Incident Configuration</h2>
        </div>
        <p className="text-sm text-surface-500">
          Configure incident column mapping, assignment group, and SLA thresholds. Each section saves independently.
        </p>
      </div>

      {/* ═══ Section 1: Column Mapping — Rich Grid ═══════════════════════════ */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-surface-700">Incident Column Mapping</h3>
            <p className="text-xs text-surface-400 mt-0.5">
              Select which ServiceNow columns to display.
              {columnSource && (
                <span className="ml-1 text-brand-500">
                  Source: {columnSource === 'sys_dictionary' ? 'sys_dictionary (rich metadata)' : 'sample record'}
                </span>
              )}
              {snowColumns.length > 0 && (
                <span className="ml-1">
                  — {snowColumns.length} columns available, {selectedColumns.length} selected
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSnowColumns}
              disabled={columnsLoading}
              className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
              title="Refresh columns from ServiceNow"
            >
              <RefreshCw size={13} className={columnsLoading ? 'animate-spin' : ''} />
            </button>
            <SectionSaveButton saving={savingColumns} onClick={handleSaveColumns} label="Save Columns" />
          </div>
        </div>

        <SectionMessage message={msgColumns} />

        {/* Search bar */}
        {snowColumns.length > 0 && (
          <div className="px-5 pt-4 pb-2">
            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                value={columnSearch}
                onChange={e => setColumnSearch(e.target.value)}
                placeholder="Search columns by name, label, or type..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-surface-200 text-xs text-surface-700 placeholder-surface-400 focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
              />
            </div>
          </div>
        )}

        <div className="p-5 pt-2">
          {columnsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="text-brand-400 animate-spin" />
            </div>
          ) : snowColumns.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-4">
              No columns loaded. Connect to ServiceNow first and click refresh.
            </p>
          ) : (
            <>
              {/* Column grid — scrollable */}
              <div className="max-h-[280px] overflow-y-auto border border-surface-100 rounded-lg scrollbar-thin scrollbar-thumb-brand-500 scrollbar-track-surface-100">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-50 z-10">
                    <tr className="border-b border-surface-200">
                      <th className="w-10 px-3 py-2 text-center" />
                      <th className="px-3 py-2 text-left font-semibold text-surface-500 uppercase tracking-wide">Column</th>
                      <th className="px-3 py-2 text-left font-semibold text-surface-500 uppercase tracking-wide">Label</th>
                      <th className="px-3 py-2 text-left font-semibold text-surface-500 uppercase tracking-wide">Type</th>
                      <th className="px-3 py-2 text-center font-semibold text-surface-500 uppercase tracking-wide">Max Len</th>
                      <th className="px-3 py-2 text-center font-semibold text-surface-500 uppercase tracking-wide">Flags</th>
                      <th className="px-3 py-2 text-left font-semibold text-surface-500 uppercase tracking-wide">Sample Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {filteredColumns.map(col => {
                      const isSelected = selectedColumns.includes(col.name);
                      const isMandatory = col.name === 'number';
                      const isExpanded = expandedCol === col.name;

                      return (
                        <React.Fragment key={col.name}>
                          <tr
                            className={`transition-colors cursor-pointer ${
                              isSelected ? 'bg-brand-50/40' : 'hover:bg-surface-50/50'
                            } ${isMandatory ? 'bg-rose-50/30' : ''}`}
                            onClick={() => toggleColumn(col.name)}
                          >
                            <td className="px-3 py-2 text-center">
                              {isMandatory ? (
                                <Lock size={12} className="text-rose-400 mx-auto" />
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleColumn(col.name)}
                                  onClick={e => e.stopPropagation()}
                                  className="rounded border-surface-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
                                />
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`font-mono font-medium ${isSelected ? 'text-brand-700' : 'text-surface-700'}`}>
                                {col.name}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-surface-600">{col.label || '—'}</td>
                            <td className="px-3 py-2">{typeBadge(col.type)}</td>
                            <td className="px-3 py-2 text-center text-surface-500">{col.maxLength || '—'}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {col.mandatory && (
                                  <span className="px-1 py-0.5 rounded bg-rose-100 text-rose-600 text-[8px] font-bold">REQ</span>
                                )}
                                {col.readOnly && (
                                  <span className="px-1 py-0.5 rounded bg-surface-100 text-surface-500 text-[8px] font-bold">RO</span>
                                )}
                                {isMandatory && (
                                  <span className="px-1 py-0.5 rounded bg-rose-100 text-rose-600 text-[8px] font-bold">LOCKED</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <span className="text-surface-500 truncate max-w-[200px]" title={col.sampleValue || ''}>
                                  {col.sampleValue
                                    ? (col.sampleValue.length > 40 ? col.sampleValue.slice(0, 40) + '...' : col.sampleValue)
                                    : <span className="text-surface-300 italic">empty</span>}
                                </span>
                                {col.helpText && (
                                  <button
                                    onClick={e => { e.stopPropagation(); setExpandedCol(isExpanded ? null : col.name); }}
                                    className="p-0.5 rounded text-surface-400 hover:text-brand-600"
                                    title="Show help text"
                                  >
                                    {isExpanded ? <ChevronUp size={10} /> : <Info size={10} />}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {/* Help text expansion */}
                          {isExpanded && col.helpText && (
                            <tr className="bg-sky-50/50">
                              <td />
                              <td colSpan={6} className="px-3 py-2 text-[10px] text-sky-700">
                                <Info size={10} className="inline mr-1" />{col.helpText}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredColumns.length === 0 && columnSearch && (
                <p className="text-xs text-surface-400 text-center py-3">
                  No columns match &quot;{columnSearch}&quot;
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══ Section 2: SLA Column Mapping ════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-brand-600" />
              <h3 className="text-sm font-bold text-surface-700">SLA Column Mapping</h3>
            </div>
            <p className="text-xs text-surface-400 mt-0.5">Map the columns used for Resolution SLA calculation.</p>
          </div>
          <SectionSaveButton saving={savingSlaMap} onClick={handleSaveSlaMapping} label="Save Mapping" />
        </div>
        <SectionMessage message={msgSlaMap} />
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1">Created Column</label>
            <select
              value={createdColumn}
              onChange={e => setCreatedColumn(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
            >
              {snowColumns.length > 0 ? snowColumns.map(col => (
                <option key={col.name} value={col.name}>
                  {col.label ? `${col.name} (${col.label})` : col.name}
                </option>
              )) : (
                <>
                  <option value="opened_at">opened_at</option>
                  <option value="sys_created_on">sys_created_on</option>
                </>
              )}
            </select>
            <p className="text-[10px] text-surface-400 mt-1">Column representing when the incident was created.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1">Closed Column</label>
            <select
              value={closedColumn}
              onChange={e => setClosedColumn(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
            >
              {snowColumns.length > 0 ? snowColumns.map(col => (
                <option key={col.name} value={col.name}>
                  {col.label ? `${col.name} (${col.label})` : col.name}
                </option>
              )) : (
                <>
                  <option value="closed_at">closed_at</option>
                  <option value="resolved_at">resolved_at</option>
                </>
              )}
            </select>
            <p className="text-[10px] text-surface-400 mt-1">Column representing when the incident was resolved/closed.</p>
          </div>
        </div>
      </div>

      {/* ═══ Section 3: Assignment Group ══════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users size={14} className="text-brand-600" />
              <h3 className="text-sm font-bold text-surface-700">Assignment Group</h3>
            </div>
            <p className="text-xs text-surface-400 mt-0.5">Filter all incident API calls to only fetch incidents from this group.</p>
          </div>
          <SectionSaveButton saving={savingGroup} onClick={handleSaveGroup} label="Save Group" />
        </div>
        <SectionMessage message={msgGroup} />
        <div className="p-5">
          <input
            type="text"
            value={assignmentGroup}
            onChange={e => setAssignmentGroup(e.target.value)}
            placeholder="e.g. Service Desk, IT Operations"
            className="w-full max-w-md px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 placeholder-surface-400 focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
          />
          <p className="text-[10px] text-surface-400 mt-1">Leave empty to fetch incidents from all groups.</p>
        </div>
      </div>

      {/* ═══ Section 4: SLA Configuration (CRUD) ═════════════════════════════ */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-700">Incident SLAs</h3>
          </div>
          <p className="text-xs text-surface-400 mt-0.5">
            Define contract-level SLA targets for incident response and resolution times.
          </p>
        </div>
        <SectionMessage message={msgSla} />
        <div className="p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100">
                <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500 uppercase">Priority</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500 uppercase">Response Time (min)</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500 uppercase">Resolution Time (min)</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-surface-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {slaRows.map(row => {
                const isEditing = editingSla === row.id;
                return (
                  <tr key={row.id} className="hover:bg-surface-50/50">
                    <td className="px-3 py-2.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        PRIORITY_STYLES[row.priority] || 'bg-surface-100 text-surface-600 border-surface-200'
                      }`}>
                        {row.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={row.response_minutes}
                          onChange={e => { row._editResponse = e.target.value; }}
                          className="w-24 px-2 py-1 rounded border border-surface-200 text-sm focus:ring-2 focus:ring-brand-200 outline-none"
                        />
                      ) : (
                        <span className="text-surface-700 font-medium">{row.response_minutes}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={row.resolution_minutes}
                          onChange={e => { row._editResolution = e.target.value; }}
                          className="w-24 px-2 py-1 rounded border border-surface-200 text-sm focus:ring-2 focus:ring-brand-200 outline-none"
                        />
                      ) : (
                        <span className="text-surface-700 font-medium">{row.resolution_minutes}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleSaveSla({
                              id: row.id,
                              priority: row.priority,
                              responseMinutes: row._editResponse || row.response_minutes,
                              resolutionMinutes: row._editResolution || row.resolution_minutes,
                              enabled: row.enabled,
                            })}
                            className="px-2 py-1 rounded text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
                          >Save</button>
                          <button
                            onClick={() => setEditingSla(null)}
                            className="px-2 py-1 rounded text-xs text-surface-500 hover:bg-surface-100"
                          >Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingSla(row.id)}
                            className="px-2 py-1 rounded text-xs text-brand-600 hover:bg-brand-50 font-semibold"
                          >Edit</button>
                          <button
                            onClick={() => handleDeleteSla(row.id)}
                            className="p-1 rounded text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Add new row */}
              <tr className="bg-surface-50/30">
                <td className="px-3 py-2.5">
                  <input
                    type="text"
                    value={newSla.priority}
                    onChange={e => setNewSla(prev => ({ ...prev, priority: e.target.value }))}
                    placeholder="e.g. 5 - Planning"
                    className="w-full px-2 py-1 rounded border border-surface-200 text-xs focus:ring-2 focus:ring-brand-200 outline-none"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="number"
                    value={newSla.responseMinutes}
                    onChange={e => setNewSla(prev => ({ ...prev, responseMinutes: e.target.value }))}
                    className="w-24 px-2 py-1 rounded border border-surface-200 text-xs focus:ring-2 focus:ring-brand-200 outline-none"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="number"
                    value={newSla.resolutionMinutes}
                    onChange={e => setNewSla(prev => ({ ...prev, resolutionMinutes: e.target.value }))}
                    className="w-24 px-2 py-1 rounded border border-surface-200 text-xs focus:ring-2 focus:ring-brand-200 outline-none"
                  />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() => newSla.priority && handleSaveSla(newSla, true)}
                    disabled={!newSla.priority || slaLoading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 ml-auto"
                  >
                    <Plus size={11} /> Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
