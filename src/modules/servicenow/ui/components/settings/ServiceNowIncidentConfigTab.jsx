// ============================================================================
// ServiceNowIncidentConfigTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Incident configuration tab with one section:
//   1. Column Mapping — rich grid with metadata from sys_dictionary + sample values
//
// NOTE: Assignment Group has been moved to ServiceNowConnectionTab as a connection parameter.
//
// DATA: All config is persisted to database via per-section REST API endpoints.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Columns, Save, Loader2, AlertCircle, CheckCircle2,
  RefreshCw, Search, Lock, Info, ChevronUp,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { PageSpinner } from '@components';

const log = createLogger('ServiceNowIncidentConfigTab.jsx');

const snApi = {
  incidentConfig:       '/api/servicenow/config/incidents',
  incidentColumns:      '/api/servicenow/config/incidents/columns',
  snowColumns:          '/api/servicenow/schema/columns',
};

// Priority badge styles
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

  // Per-section saving & messages
  const [savingColumns, setSavingColumns] = useState(false);
  const [msgColumns, setMsgColumns]       = useState(null);

  const initRan = useRef(false);

  // ── Auto-dismiss messages ─────────────────────────────────────────────────
  const autoDismiss = (setter) => {
    const timer = setTimeout(() => setter(null), 5000);
    return () => clearTimeout(timer);
  };
  useEffect(() => { if (msgColumns) return autoDismiss(setMsgColumns); }, [msgColumns]);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const configRes = await ApiClient.get(snApi.incidentConfig);
      if (configRes?.success) {
        setSelectedColumns(configRes.data.selectedColumns || []);
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
    const trimmed = columnSearch.trim().toLowerCase();
    const baseList = trimmed
      ? snowColumns.filter(col =>
          col.name.toLowerCase().includes(trimmed) ||
          (col.label || '').toLowerCase().includes(trimmed) ||
          (col.type || '').toLowerCase().includes(trimmed)
        )
      : snowColumns;

    return [...baseList].sort((a, b) => {
      const aSelected = selectedColumns.includes(a.name);
      const bSelected = selectedColumns.includes(b.name);
      if (aSelected !== bSelected) {
        return aSelected ? -1 : 1;
      }
      const aLabel = (a.label || a.name || '').toLowerCase();
      const bLabel = (b.label || b.name || '').toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [snowColumns, columnSearch, selectedColumns]);

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

  // ── Column toggle ─────────────────────────────────────────────────────────
  const toggleColumn = (colName) => {
    if (colName === 'number') return; // mandatory
    setSelectedColumns(prev =>
      prev.includes(colName) ? prev.filter(c => c !== colName) : [...prev, colName]
    );
  };

  return (
    <>
      {loading && <PageSpinner modal message="Loading incident configuration..." />}
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
            <h3 className="text-sm font-bold text-surface-700">Select Columns to Display for ServiceNow Incidents</h3>
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

        {/* Selected summary + Search bar */}
        {snowColumns.length > 0 && (
          <div className="px-5 pt-4 pb-2 space-y-2">
            <div className="text-xs text-surface-600 px-3 py-2 rounded-lg border border-brand-100 bg-gradient-to-r from-brand-50 via-white to-surface-50 shadow-sm">
              <span className="font-semibold text-brand-700">Selected ({selectedColumns.length}): </span>
              {selectedColumns.length > 0 ? (
                <span className="text-surface-600">
                  {selectedColumns.slice(0, 8).join(', ')}
                  {selectedColumns.length > 8 && '…'}
                </span>
              ) : (
                <span className="text-surface-400">No columns selected yet.</span>
              )}
            </div>
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
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <Loader2 size={20} className="text-brand-400 animate-spin" />
              <p className="text-xs font-medium text-surface-500">
                Fetching details from ServiceNow, please wait…
              </p>
            </div>
          ) : snowColumns.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-4">
              No columns loaded. Connect to ServiceNow first and click refresh.
            </p>
          ) : (
            <>
              {/* Column grid — scrollable */}
              <div className="max-h-[400px] overflow-y-auto border border-surface-100 rounded-lg scrollbar-thin scrollbar-thumb-brand-500 scrollbar-track-surface-100">
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
      </div>
    </>
  );
}
