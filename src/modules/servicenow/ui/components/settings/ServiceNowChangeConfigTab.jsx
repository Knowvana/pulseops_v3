// ============================================================================
// ServiceNowChangeConfigTab — ServiceNow Module Config
//
// PURPOSE: Configure Change Request / Implementation Task settings. Renders
// as a sub-tabbed view within the ServiceNow config panel:
//   Tab 1: "Change Configuration" — Source Table + Downtime Mapping (merged)
//          + Change Columns Selection
//
// UI PATTERNS:
//   - Modal PageSpinner for all loading states
//   - Sample values for mapping dropdowns (identical to SLA Column Mapping)
//   - View Columns modal with recommended columns at top, sorted alphabetically
//   - Each section saves independently
//
// USED BY: manifest.jsx → getConfigTabs()
// ============================================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Loader2, CheckCircle2, AlertCircle, Save, RefreshCw, Search,
  Lock, Info, ChevronUp, CalendarRange, Columns, X, Eye, Clock, Star,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { PageSpinner } from '@components';
import urls from '../../config/urls.json';

const log = createLogger('ServiceNowChangeConfigTab.jsx');
const api = urls.api;

const NOT_CONFIGURED = '__not_configured__';

// Recommended columns for downtime — shown at top of View Columns modal and mapping dropdowns
const RECOMMENDED_DOWNTIME_COLUMNS = [
  'work_start', 'work_end', 'start_date', 'end_date',
  'expected_start', 'planned_end_date', 'number', 'short_description',
  'state', 'assignment_group', 'type', 'priority',
];

// SNOW field type → human-readable label
const TYPE_LABELS = {
  string: 'String', integer: 'Integer', boolean: 'Boolean',
  glide_date_time: 'Date/Time', glide_date: 'Date', reference: 'Reference',
  choice: 'Choice', journal: 'Journal', journal_input: 'Journal Input',
  html: 'HTML', conditions: 'Conditions', url: 'URL', email: 'Email',
  phone_number_e164: 'Phone', currency: 'Currency', decimal: 'Decimal',
  float: 'Float', percent_complete: 'Percent', sys_class_name: 'Class Name',
  document_id: 'Document ID', translated_field: 'Translated',
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

const looksLikeDate = (val) => /^\d{4}-\d{2}-\d{2}/.test(String(val || ''));

function SectionSaveButton({ saving, onClick, label = 'Save', icon: Icon = Save }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors">
      {saving ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      {saving ? 'Saving...' : label}
    </button>
  );
}

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

// ── Sample Values Preview (same UI as SLA Column Mapping) ──────────────────
function SampleValuesPreview({ columnName, sampleData, maxValues = 5, inline = false }) {
  if (!columnName || columnName === NOT_CONFIGURED) return null;
  const { loading, values, error } = sampleData || {};

  if (loading) {
    return (
      <div className={`${inline ? '' : 'mt-2'} flex items-center gap-2 text-xs text-surface-400`}>
        <Loader2 size={11} className="animate-spin" />
        <span>Loading…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className={`${inline ? '' : 'mt-2'} flex items-center gap-1.5 text-xs text-rose-500`}>
        <AlertCircle size={11} />
        <span>{error}</span>
      </div>
    );
  }
  if (!values || values.length === 0) return null;

  const displayValues = values.slice(0, maxValues);
  const hasDateValues = displayValues.some(looksLikeDate);

  return (
    <div className={inline ? '' : 'mt-2.5'}>
      {!inline && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <Eye size={11} className="text-surface-400" />
          <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wide">Sample Values</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {displayValues.map((val, idx) => (
          <span key={idx}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-surface-50 to-surface-100 border border-surface-200 text-xs font-medium text-surface-700 shadow-sm">
            {val}
            {hasDateValues && looksLikeDate(val) && (
              <span className="text-[9px] font-semibold text-surface-400 uppercase">UTC</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Column Select dropdown with recommended defaults at top ─────────────────
function ColumnSelect({ value, onChange, columns, placeholder = '— Not Configured —', disabled = false, recommendedDefault }) {
  const sortedColumns = useMemo(() => {
    if (!recommendedDefault || !columns.length) return columns;
    const defaultCol = columns.find(c => c.name === recommendedDefault);
    const rest = columns.filter(c => c.name !== recommendedDefault);
    return defaultCol ? [defaultCol, ...rest] : columns;
  }, [columns, recommendedDefault]);

  return (
    <select value={value} onChange={onChange} disabled={disabled}
      className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none disabled:opacity-50">
      <option value={NOT_CONFIGURED}>{placeholder}</option>
      {sortedColumns.map(col => (
        <option key={col.name} value={col.name}>
          {col.name === recommendedDefault ? `★ ${col.name}` : col.name}
          {col.label ? ` (${col.label})` : ''}
          {col.type === 'glide_date_time' || col.type === 'glide_date' ? ' ⏱' : ''}
        </option>
      ))}
    </select>
  );
}

// ── View Columns Modal — recommended at top, sorted alphabetically ─────────
function ColumnsModal({ columns, table, onClose }) {
  const [search, setSearch] = useState('');
  const sortedAndFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? columns.filter(c =>
      c.name.toLowerCase().includes(q) || (c.label || '').toLowerCase().includes(q)
    ) : columns;
    // Recommended columns first, then alphabetically
    return [...base].sort((a, b) => {
      const aR = RECOMMENDED_DOWNTIME_COLUMNS.includes(a.name);
      const bR = RECOMMENDED_DOWNTIME_COLUMNS.includes(b.name);
      if (aR !== bR) return aR ? -1 : 1;
      return (a.label || a.name || '').localeCompare(b.label || b.name || '');
    });
  }, [columns, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[750px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-surface-800">Available Columns — {table}</h3>
            <p className="text-xs text-surface-400 mt-0.5">{columns.length} columns found. Recommended downtime columns shown first with <Star size={9} className="inline text-amber-500" /></p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400"><X size={16} /></button>
        </div>
        <div className="px-5 pt-3 pb-2">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search columns..." className="w-full pl-8 pr-3 py-2 rounded-lg border border-surface-200 text-xs focus:ring-2 focus:ring-brand-200 outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-surface-200">
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 text-left font-semibold text-surface-500">Column</th>
                <th className="px-3 py-2 text-left font-semibold text-surface-500">Label</th>
                <th className="px-3 py-2 text-left font-semibold text-surface-500">Type</th>
                <th className="px-3 py-2 text-left font-semibold text-surface-500">Sample Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {sortedAndFiltered.map(col => {
                const isRec = RECOMMENDED_DOWNTIME_COLUMNS.includes(col.name);
                return (
                  <tr key={col.name} className={`hover:bg-surface-50/50 ${isRec ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-2 py-2 text-center">
                      {isRec && <Star size={10} className="text-amber-500 mx-auto" />}
                    </td>
                    <td className="px-3 py-2 font-mono font-medium text-surface-700">{col.name}</td>
                    <td className="px-3 py-2 text-surface-600">{col.label || '—'}</td>
                    <td className="px-3 py-2">{typeBadge(col.type)}</td>
                    <td className="px-3 py-2 text-surface-500 max-w-[200px] truncate">{col.sampleValue || <span className="text-surface-300 italic">empty</span>}</td>
                  </tr>
                );
              })}
              {sortedAndFiltered.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-surface-400">No columns match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ServiceNowChangeConfigTab() {
  // ── Core state ────────────────────────────────────────────────────────────
  const [loading, setLoading]               = useState(true);
  const [config, setConfig]                 = useState({ selectedColumns: [], downtimeMapping: { startDateField: 'work_start', endDateField: 'work_end' } });
  const [snowColumns, setSnowColumns]       = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnSource, setColumnSource]     = useState(null);
  const [columnSearch, setColumnSearch]     = useState('');
  const [expandedCol, setExpandedCol]       = useState(null);
  const [showColumnsModal, setShowColumnsModal] = useState(false);

  // Per-section saving & messages
  const [savingConfig, setSavingConfig]           = useState(false);
  const [savingColumns, setSavingColumns]         = useState(false);
  const [msgConfig, setMsgConfig]                 = useState(null);
  const [msgColumns, setMsgColumns]               = useState(null);

  // Downtime mapping state
  const [startDateField, setStartDateField] = useState('work_start');
  const [endDateField, setEndDateField]     = useState('work_end');

  // Sample values cache: { [columnName]: { loading, values, error } }
  const [sampleCache, setSampleCache] = useState({});
  const fetchedColumnsRef = useRef(new Set());

  const initRan = useRef(false);

  // ── Auto-dismiss messages ─────────────────────────────────────────────────
  const autoDismiss = (setter) => { const t = setTimeout(() => setter(null), 5000); return () => clearTimeout(t); };
  useEffect(() => { if (msgConfig) return autoDismiss(setMsgConfig); }, [msgConfig]);
  useEffect(() => { if (msgColumns) return autoDismiss(setMsgColumns); }, [msgColumns]);

  // ── Fetch sample values for a column (always from change_task) ────────────
  const fetchSampleValues = useCallback(async (columnName, force = false) => {
    if (!columnName || columnName === NOT_CONFIGURED) return;
    if (!force && fetchedColumnsRef.current.has(columnName)) return;
    fetchedColumnsRef.current.add(columnName);

    setSampleCache(prev => ({ ...prev, [columnName]: { loading: true, values: null, error: null } }));
    try {
      const res = await ApiClient.get(`${api.schemaChangeColumns}/${columnName}/values?table=change_task`);
      if (res?.success) {
        setSampleCache(prev => ({ ...prev, [columnName]: { loading: false, values: res.data.values || [], error: null } }));
      } else {
        setSampleCache(prev => ({ ...prev, [columnName]: { loading: false, values: [], error: res?.error?.message || 'Failed' } }));
      }
    } catch (err) {
      setSampleCache(prev => ({ ...prev, [columnName]: { loading: false, values: [], error: err.message } }));
    }
  }, []);

  // ── Handle mapping dropdown change → force-fetch sample values ──────────
  const handleMappingChange = useCallback((setter) => (e) => {
    const val = e.target.value;
    setter(val);
    if (val !== NOT_CONFIGURED) {
      fetchedColumnsRef.current.delete(val);
      fetchSampleValues(val, true);
    }
  }, [fetchSampleValues]);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    try {
      const res = await ApiClient.get(api.configChange);
      if (res?.success) {
        setConfig(res.data);
        const dm = res.data.downtimeMapping || {};
        const sf = dm.startDateField || 'work_start';
        const ef = dm.endDateField || 'work_end';
        setStartDateField(sf);
        setEndDateField(ef);
        // Auto-fetch sample values for configured mapping columns on page load
        if (sf && sf !== NOT_CONFIGURED) fetchSampleValues(sf);
        if (ef && ef !== NOT_CONFIGURED) fetchSampleValues(ef);
      }
    } catch (err) {
      log.error('loadConfig', 'Failed', { error: err.message });
    } finally {
      setLoading(false);
    }
  }, [fetchSampleValues]);

  // Always fetch change_task columns for downtime mapping
  const fetchSnowColumns = useCallback(async () => {
    setColumnsLoading(true);
    try {
      const res = await ApiClient.get(`${api.schemaChangeColumns}?table=change_task`);
      if (res?.success) {
        setSnowColumns(res.data.columns || []);
        setColumnSource(res.data.source || null);
      } else {
        setMsgConfig({ type: 'error', text: res?.error?.message || 'Failed to fetch columns.' });
      }
    } catch (err) {
      setMsgConfig({ type: 'error', text: 'Failed to fetch ServiceNow columns.' });
    } finally {
      setColumnsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadConfig();
  }, [loadConfig]);

  // Fetch columns after config loaded
  const columnsLoadedRef = useRef(false);
  useEffect(() => {
    if (!loading && !columnsLoadedRef.current) {
      columnsLoadedRef.current = true;
      fetchSnowColumns();
    }
  }, [loading, fetchSnowColumns]);

  // Auto-show columns modal if no columns configured
  const autoModalShown = useRef(false);
  useEffect(() => {
    if (!loading && !autoModalShown.current && snowColumns.length > 0) {
      autoModalShown.current = true;
      if (!config.selectedColumns || config.selectedColumns.length === 0) {
        setShowColumnsModal(true);
      }
    }
  }, [loading, snowColumns, config.selectedColumns]);

  // ── Filtered columns (selected first, then alpha) ─────────────────────────
  const selectedColumns = config.selectedColumns || [];
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
      const aS = selectedColumns.includes(a.name);
      const bS = selectedColumns.includes(b.name);
      if (aS !== bS) return aS ? -1 : 1;
      return (a.label || a.name || '').toLowerCase().localeCompare((b.label || b.name || '').toLowerCase());
    });
  }, [snowColumns, columnSearch, selectedColumns]);

  // ── Column toggle ─────────────────────────────────────────────────────────
  // Mandatory columns: change_request (Change Request No) + number (Task Number)
  const MANDATORY_COLUMNS_CONFIG = ['change_request', 'number'];
  const toggleColumn = (colName) => {
    if (MANDATORY_COLUMNS_CONFIG.includes(colName)) return;
    setConfig(prev => {
      const cols = prev.selectedColumns || [];
      return { ...prev, selectedColumns: cols.includes(colName) ? cols.filter(c => c !== colName) : [...cols, colName] };
    });
  };

  // ── Save: Downtime mapping ──────────────────────────────────────────────
  const handleSaveConfig = useCallback(async () => {
    setSavingConfig(true); setMsgConfig(null);
    try {
      const mapRes = await ApiClient.put(api.configChangeDowntimeMapping, { startDateField, endDateField });
      if (mapRes?.success) setMsgConfig({ type: 'success', text: 'Downtime column mapping saved.' });
      else setMsgConfig({ type: 'error', text: mapRes?.error?.message || 'Failed to save mapping.' });
    } catch { setMsgConfig({ type: 'error', text: 'Save failed.' }); }
    finally { setSavingConfig(false); }
  }, [startDateField, endDateField]);

  // ── Save: Selected Columns ────────────────────────────────────────────────
  const handleSaveColumns = useCallback(async () => {
    setSavingColumns(true); setMsgColumns(null);
    try {
      // Ensure mandatory columns are always included
      const cols = config.selectedColumns || [];
      const columnsToSave = [...new Set([...MANDATORY_COLUMNS_CONFIG, ...cols])];
      const res = await ApiClient.put(api.configChangeColumns, { selectedColumns: columnsToSave });
      if (res?.success) {
        setMsgColumns({ type: 'success', text: 'Selected columns saved.' });
        // Update config to reflect saved state
        setConfig(prev => ({ ...prev, selectedColumns: columnsToSave }));
      }
      else setMsgColumns({ type: 'error', text: res?.error?.message || 'Save failed.' });
    } catch { setMsgColumns({ type: 'error', text: 'Save failed.' }); }
    finally { setSavingColumns(false); }
  }, [config.selectedColumns]);

  // ── Date/time columns for mapping dropdowns ───────────────────────────────
  // Show all columns, but prioritize date-type columns and recommended columns at top
  const dateColumns = useMemo(() =>
    snowColumns.sort((a, b) => {
      // Priority 1: Recommended columns
      const aR = RECOMMENDED_DOWNTIME_COLUMNS.includes(a.name);
      const bR = RECOMMENDED_DOWNTIME_COLUMNS.includes(b.name);
      if (aR !== bR) return aR ? -1 : 1;
      
      // Priority 2: Date/time type columns
      const aIsDate = a.type === 'glide_date_time' || a.type === 'glide_date';
      const bIsDate = b.type === 'glide_date_time' || b.type === 'glide_date';
      if (aIsDate !== bIsDate) return aIsDate ? -1 : 1;
      
      // Priority 3: Columns with date-like names
      const aHasDateName = a.name.includes('start') || a.name.includes('end') || a.name.includes('date') || a.name.includes('time');
      const bHasDateName = b.name.includes('start') || b.name.includes('end') || b.name.includes('date') || b.name.includes('time');
      if (aHasDateName !== bHasDateName) return aHasDateName ? -1 : 1;
      
      // Alphabetical
      return (a.label || a.name).localeCompare(b.label || b.name);
    }),
    [snowColumns]
  );

  return (
    <div className="relative space-y-5 animate-fade-in">
      {/* View-level modal spinners */}
      {loading && <PageSpinner modal message="Loading change configuration..." />}
      {columnsLoading && <PageSpinner modal message="Fetching change_task columns from ServiceNow..." />}
      {savingConfig && <PageSpinner modal message="Saving configuration..." />}
      {savingColumns && <PageSpinner modal message="Saving selected columns..." />}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <CalendarRange size={20} className="text-brand-600" />
          <h2 className="text-lg font-bold text-surface-800">Change Configuration</h2>
        </div>
        <p className="text-sm text-surface-500">
          Map downtime columns from <span className="font-mono text-brand-600">change_task</span> and select display columns. Changes are created as <span className="font-mono text-brand-600">change_request</span> + linked <span className="font-mono text-brand-600">change_task</span>.
        </p>
      </div>

      {/* ── Section 1: View Change Table Columns link + Downtime Mapping ── */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-surface-700">Downtime Column Mapping</h3>
            <p className="text-xs text-surface-400 mt-0.5">Map start/end date fields from <span className="font-mono">change_task</span> table for downtime calculations.</p>
          </div>
          <SectionSaveButton saving={savingConfig} onClick={handleSaveConfig} label="Save Mapping" />
        </div>
        <SectionMessage message={msgConfig} />
        <div className="p-5 space-y-5">
          {/* View Change Table Columns link */}
          <div className="flex items-center gap-3">
            <button onClick={() => setShowColumnsModal(true)} disabled={snowColumns.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors disabled:opacity-40 border border-brand-200">
              <Eye size={13} /> View Change Task Table Columns
            </button>
            <button onClick={fetchSnowColumns} disabled={columnsLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-surface-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-40">
              <RefreshCw size={13} className={columnsLoading ? 'animate-spin' : ''} /> Refresh
            </button>
            {snowColumns.length > 0 && (
              <span className="text-[10px] text-surface-400">
                {snowColumns.length} columns loaded from {columnSource === 'sys_dictionary' ? 'sys_dictionary' : 'sample record'}
              </span>
            )}
          </div>

          {/* Downtime Column Mapping */}
          <div className="border-t border-surface-100 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-brand-600" />
              <h4 className="text-xs font-bold text-surface-700 uppercase tracking-wider">Downtime Column Mapping</h4>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs mb-4">
              <Info size={13} className="flex-shrink-0 mt-0.5" />
              <span>
                Columns marked with <Star size={10} className="inline text-blue-600" /> are the recommended defaults.
                Sample values from your ServiceNow instance are shown below each dropdown on page load and when changed.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Start Date Column + Sample Values */}
              <div>
                <div className="px-3 py-2 rounded-lg bg-brand-50 border border-brand-100 mb-3">
                  <p className="text-xs font-semibold text-brand-700">Start Date/Time</p>
                  <p className="text-[11px] text-brand-600 mt-0.5">When the planned downtime begins.</p>
                </div>
                <ColumnSelect
                  value={startDateField}
                  onChange={handleMappingChange(setStartDateField)}
                  columns={dateColumns}
                  placeholder="— Select Start Column —"
                  recommendedDefault="work_start"
                />
                <SampleValuesPreview columnName={startDateField} sampleData={sampleCache[startDateField]} maxValues={3} />
              </div>

              {/* End Date Column + Sample Values */}
              <div>
                <div className="px-3 py-2 rounded-lg bg-teal-50 border border-teal-100 mb-3">
                  <p className="text-xs font-semibold text-teal-700">End Date/Time</p>
                  <p className="text-[11px] text-teal-600 mt-0.5">When the planned downtime ends.</p>
                </div>
                <ColumnSelect
                  value={endDateField}
                  onChange={handleMappingChange(setEndDateField)}
                  columns={dateColumns}
                  placeholder="— Select End Column —"
                  recommendedDefault="work_end"
                />
                <SampleValuesPreview columnName={endDateField} sampleData={sampleCache[endDateField]} maxValues={3} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2: Change Columns Selection ──────────────────────────── */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-surface-700">Change Columns Selection</h3>
            <p className="text-xs text-surface-400 mt-0.5">
              Select which <span className="font-mono">change_task</span> columns to display in the Planned Downtime view.
              {columnSource && <span className="ml-1 text-brand-500">Source: {columnSource === 'sys_dictionary' ? 'sys_dictionary' : 'sample record'}</span>}
              {snowColumns.length > 0 && <span className="ml-1">— {snowColumns.length} available, {selectedColumns.length} selected</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchSnowColumns} disabled={columnsLoading}
              className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40" title="Refresh columns">
              <RefreshCw size={13} className={columnsLoading ? 'animate-spin' : ''} />
            </button>
            <SectionSaveButton saving={savingColumns} onClick={handleSaveColumns} label="Save Columns" icon={Columns} />
          </div>
        </div>
        <SectionMessage message={msgColumns} />

        {snowColumns.length > 0 && (
          <div className="px-5 pt-4 pb-2 space-y-2">
            <div className="text-xs text-surface-600 px-3 py-2 rounded-lg border border-brand-100 bg-gradient-to-r from-brand-50 via-white to-surface-50 shadow-sm">
              <span className="font-semibold text-brand-700">Selected ({selectedColumns.length}): </span>
              {selectedColumns.length > 0
                ? <span className="text-surface-600">{selectedColumns.slice(0, 8).join(', ')}{selectedColumns.length > 8 && '…'}</span>
                : <span className="text-surface-400">No columns selected yet.</span>}
            </div>
            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input type="text" value={columnSearch} onChange={e => setColumnSearch(e.target.value)}
                placeholder="Search columns by name, label, or type..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-surface-200 text-xs text-surface-700 placeholder-surface-400 focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none" />
            </div>
          </div>
        )}

        <div className="p-5 pt-2">
          {snowColumns.length === 0 && !columnsLoading ? (
            <p className="text-xs text-surface-400 text-center py-4">No columns loaded. Click Refresh to fetch columns from ServiceNow.</p>
          ) : snowColumns.length === 0 ? null : (
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
                    const isMandatory = MANDATORY_COLUMNS_CONFIG.includes(col.name);
                    const isExpanded = expandedCol === col.name;
                    return (
                      <React.Fragment key={col.name}>
                        <tr className={`transition-colors cursor-pointer ${isSelected ? 'bg-brand-50/40' : 'hover:bg-surface-50/50'} ${isMandatory ? 'bg-rose-50/30' : ''}`}
                          onClick={() => toggleColumn(col.name)}>
                          <td className="px-3 py-2 text-center">
                            {isMandatory
                              ? <Lock size={12} className="text-rose-400 mx-auto" />
                              : <input type="checkbox" checked={isSelected} onChange={() => toggleColumn(col.name)} onClick={e => e.stopPropagation()}
                                  className="rounded border-surface-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5" />}
                          </td>
                          <td className="px-3 py-2"><span className={`font-mono font-medium ${isSelected ? 'text-brand-700' : 'text-surface-700'}`}>{col.name}</span></td>
                          <td className="px-3 py-2 text-surface-600">{col.label || '—'}</td>
                          <td className="px-3 py-2">{typeBadge(col.type)}</td>
                          <td className="px-3 py-2 text-center text-surface-500">{col.maxLength || '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {col.mandatory && <span className="px-1 py-0.5 rounded bg-rose-100 text-rose-600 text-[8px] font-bold">REQ</span>}
                              {col.readOnly && <span className="px-1 py-0.5 rounded bg-surface-100 text-surface-500 text-[8px] font-bold">RO</span>}
                              {isMandatory && <span className="px-1 py-0.5 rounded bg-rose-100 text-rose-600 text-[8px] font-bold">LOCKED</span>}
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
                                <button onClick={e => { e.stopPropagation(); setExpandedCol(isExpanded ? null : col.name); }}
                                  className="p-0.5 rounded text-surface-400 hover:text-brand-600" title="Show help text">
                                  {isExpanded ? <ChevronUp size={10} /> : <Info size={10} />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && col.helpText && (
                          <tr className="bg-sky-50/50">
                            <td />
                            <td colSpan={6} className="px-3 py-2 text-[10px] text-sky-700"><Info size={10} className="inline mr-1" />{col.helpText}</td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredColumns.length === 0 && columnSearch && snowColumns.length > 0 && (
            <p className="text-xs text-surface-400 text-center py-3">No columns match &quot;{columnSearch}&quot;</p>
          )}
        </div>
      </div>

      {/* View Columns Modal */}
      {showColumnsModal && (
        <ColumnsModal columns={snowColumns} table="change_task" onClose={() => setShowColumnsModal(false)} />
      )}
    </div>
  );
}
