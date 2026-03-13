// ============================================================================
// ServiceNowSLAColumnMappingTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Configuration tab for mapping ServiceNow incident columns to SLA
// calculation fields. Captures Resolution SLA (created + closed columns),
// Response SLA (response column), and Priority Column mappings.
//
// ARCHITECTURE:
//   - Fetches incident config from DB on mount (StrictMode-guarded via useRef)
//   - Loads available columns from ServiceNow schema
//   - Shows "Not Configured" in dropdowns when no DB value is set
//   - Puts expected default columns (e.g. "priority") at top of dropdown
//   - On column selection, fetches top 5 sample values from SNOW API
//   - Shows sample values in a beautiful inline preview grid
//   - Allows independent mapping of Resolution, Response, and Priority columns
//   - Saves via PUT /api/servicenow/config/incidents/sla-mapping
//   - Shows success/error messages with auto-dismiss
//
// USED BY: src/modules/servicenow/ui/manifest.jsx → getConfigTabs()
//
// DEPENDENCIES:
//   - lucide-react                              → Icons
//   - @shared → createLogger, ApiClient
//   - @modules/servicenow/config/uiText.json    → All UI labels
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, RefreshCw, Loader2, AlertCircle, CheckCircle2, Info, Eye, Star } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../../config/uiText.json';

const log = createLogger('ServiceNowSLAColumnMappingTab.jsx');

const snApi = {
  incidentConfig:       '/api/servicenow/config/incidents',
  incidentSlaMapping:   '/api/servicenow/config/incidents/sla-mapping',
  snowColumns:          '/api/servicenow/schema/columns',
  columnValues:         '/api/servicenow/schema/columns', // + /:name/values
};

const NOT_CONFIGURED = '__not_configured__';

// Expected default column names for each section — shown first in dropdown
const EXPECTED_DEFAULTS = {
  createdColumn:  'opened_at',
  closedColumn:   'closed_at',
  priorityColumn: 'priority',
  responseColumn: 'sys_updated_on',
};

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

// ── Per-section save button ────────────────────────────────────────────────
function SectionSaveButton({ saving, onClick, label = 'Save' }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
    >
      {saving ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
      {saving ? 'Saving...' : label}
    </button>
  );
}

// ── Column dropdown with expected default at top ───────────────────────────
function ColumnSelect({ value, onChange, columns, placeholder = '— Not Configured —', disabled = false, expectedDefault }) {
  // Put expected default column at the top of the list
  const sortedColumns = React.useMemo(() => {
    if (!expectedDefault || !columns.length) return columns;
    const defaultCol = columns.find(c => c.name === expectedDefault);
    const rest = columns.filter(c => c.name !== expectedDefault);
    return defaultCol ? [defaultCol, ...rest] : columns;
  }, [columns, expectedDefault]);

  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none disabled:opacity-50"
    >
      <option value={NOT_CONFIGURED}>{placeholder}</option>
      {sortedColumns.map(col => (
        <option key={col.name} value={col.name}>
          {col.name === expectedDefault ? `★ ${col.name}` : col.name}
          {col.label ? ` (${col.label})` : ''}
        </option>
      ))}
    </select>
  );
}

// ── Sample Values Preview ──────────────────────────────────────────────────
function SampleValuesPreview({ columnName, sampleData }) {
  if (!columnName || columnName === NOT_CONFIGURED) return null;

  const { loading, values, error } = sampleData || {};

  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-surface-400">
        <Loader2 size={11} className="animate-spin" />
        <span>Loading sample values…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-500">
        <AlertCircle size={11} />
        <span>{error}</span>
      </div>
    );
  }

  if (!values || values.length === 0) return null;

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Eye size={11} className="text-surface-400" />
        <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wide">Sample Values</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((val, idx) => (
          <span
            key={idx}
            className="inline-flex items-center px-2.5 py-1 rounded-lg bg-gradient-to-r from-surface-50 to-surface-100 border border-surface-200 text-xs font-medium text-surface-700 shadow-sm"
          >
            {val}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ServiceNowSLAColumnMappingTab() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [snowColumns, setSnowColumns]       = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [configLoading, setConfigLoading]   = useState(true);
  const [dbConfigLoaded, setDbConfigLoaded] = useState(false);
  
  // Resolution SLA mapping — default to NOT_CONFIGURED until DB loads
  const [createdColumn, setCreatedColumn]   = useState(NOT_CONFIGURED);
  const [closedColumn, setClosedColumn]     = useState(NOT_CONFIGURED);
  
  // Priority Column mapping
  const [priorityColumn, setPriorityColumn] = useState(NOT_CONFIGURED);

  // Response SLA mapping
  const [responseColumn, setResponseColumn] = useState(NOT_CONFIGURED);
  
  // Saving state
  const [savingResolution, setSavingResolution] = useState(false);
  const [savingPriority, setSavingPriority]     = useState(false);
  const [savingResponse, setSavingResponse]     = useState(false);
  const [msgResolution, setMsgResolution]       = useState(null);
  const [msgPriority, setMsgPriority]           = useState(null);
  const [msgResponse, setMsgResponse]           = useState(null);

  // Sample values cache: { [columnName]: { loading, values, error } }
  const [sampleCache, setSampleCache] = useState({});
  const fetchedColumnsRef = useRef(new Set());
  
  const initRan = useRef(false);

  // ── Auto-dismiss messages ─────────────────────────────────────────────────
  useEffect(() => { if (msgResolution) { const t = setTimeout(() => setMsgResolution(null), 5000); return () => clearTimeout(t); } }, [msgResolution]);
  useEffect(() => { if (msgPriority) { const t = setTimeout(() => setMsgPriority(null), 5000); return () => clearTimeout(t); } }, [msgPriority]);
  useEffect(() => { if (msgResponse) { const t = setTimeout(() => setMsgResponse(null), 5000); return () => clearTimeout(t); } }, [msgResponse]);

  // ── Fetch sample values for a column ────────────────────────────────────
  const fetchSampleValues = useCallback(async (columnName) => {
    if (!columnName || columnName === NOT_CONFIGURED) return;
    // Skip if already requested (use ref to avoid stale closure on sampleCache)
    if (fetchedColumnsRef.current.has(columnName)) return;
    fetchedColumnsRef.current.add(columnName);

    setSampleCache(prev => ({ ...prev, [columnName]: { loading: true, values: null, error: null } }));
    try {
      const res = await ApiClient.get(`${snApi.columnValues}/${columnName}/values`);
      if (res?.success) {
        setSampleCache(prev => ({ ...prev, [columnName]: { loading: false, values: res.data.values || [], error: null } }));
        log.info('fetchSampleValues', `Sample values for ${columnName}`, { count: res.data.values?.length || 0 });
      } else {
        setSampleCache(prev => ({ ...prev, [columnName]: { loading: false, values: [], error: res?.error?.message || 'Failed to fetch' } }));
      }
    } catch (err) {
      setSampleCache(prev => ({ ...prev, [columnName]: { loading: false, values: [], error: err.message } }));
    }
  }, []);

  // ── Fetch sample values on column change ────────────────────────────────
  const handleColumnChange = useCallback((setter) => (e) => {
    const val = e.target.value;
    setter(val);
    if (val !== NOT_CONFIGURED) {
      fetchSampleValues(val);
    }
  }, [fetchSampleValues]);

  // ── Load config from DB ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setConfigLoading(true);
    try {
      const configRes = await ApiClient.get(snApi.incidentConfig);
      if (configRes?.success) {
        const d = configRes.data;
        setCreatedColumn(d.createdColumn || NOT_CONFIGURED);
        setClosedColumn(d.closedColumn || NOT_CONFIGURED);
        setPriorityColumn(d.priorityColumn || NOT_CONFIGURED);
        setResponseColumn(d.responseColumn || NOT_CONFIGURED);
        setDbConfigLoaded(true);
        log.info('loadData', 'SLA column mapping loaded from DB', {
          createdColumn: d.createdColumn,
          closedColumn: d.closedColumn,
          priorityColumn: d.priorityColumn,
          responseColumn: d.responseColumn,
        });
        // Auto-fetch sample values for configured columns
        const toFetch = [d.createdColumn, d.closedColumn, d.priorityColumn, d.responseColumn].filter(Boolean);
        for (const col of toFetch) {
          fetchSampleValues(col);
        }
      }
    } catch (err) {
      log.error('loadData', 'Failed to load config', { error: err.message });
    } finally {
      setConfigLoading(false);
    }
  }, [fetchSampleValues]);

  const fetchSnowColumns = useCallback(async () => {
    setColumnsLoading(true);
    try {
      const res = await ApiClient.get(snApi.snowColumns);
      if (res?.success) {
        setSnowColumns(res.data.columns || []);
        log.info('fetchSnowColumns', 'SNOW columns loaded', { count: res.data.columns?.length || 0 });
      }
    } catch (err) {
      log.error('fetchSnowColumns', 'Failed to fetch columns', { error: err.message });
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

  // ── Save: Resolution SLA Mapping ────────────────────────────────────────
  const handleSaveResolution = useCallback(async () => {
    if (createdColumn === NOT_CONFIGURED || closedColumn === NOT_CONFIGURED) {
      setMsgResolution({ type: 'error', text: 'Both Created Column and Closed Column must be configured.' });
      return;
    }
    setSavingResolution(true);
    setMsgResolution(null);
    try {
      const res = await ApiClient.put(snApi.incidentSlaMapping, { createdColumn, closedColumn });
      if (res?.success) {
        setMsgResolution({ type: 'success', text: 'Resolution SLA column mapping saved successfully.' });
        log.info('handleSaveResolution', 'Resolution SLA mapping saved', { createdColumn, closedColumn });
      } else {
        setMsgResolution({ type: 'error', text: res?.error?.message || 'Failed to save Resolution SLA mapping.' });
      }
    } catch (err) {
      setMsgResolution({ type: 'error', text: 'Failed to save Resolution SLA mapping.' });
      log.error('handleSaveResolution', 'Save failed', { error: err.message });
    } finally {
      setSavingResolution(false);
    }
  }, [createdColumn, closedColumn]);

  // ── Save: Priority Column Mapping ────────────────────────────────────────
  const handleSavePriority = useCallback(async () => {
    if (priorityColumn === NOT_CONFIGURED) {
      setMsgPriority({ type: 'error', text: 'Priority Column must be configured.' });
      return;
    }
    setSavingPriority(true);
    setMsgPriority(null);
    try {
      const res = await ApiClient.put(snApi.incidentSlaMapping, { createdColumn: createdColumn !== NOT_CONFIGURED ? createdColumn : 'opened_at', closedColumn: closedColumn !== NOT_CONFIGURED ? closedColumn : 'closed_at', priorityColumn });
      if (res?.success) {
        setMsgPriority({ type: 'success', text: 'Priority column mapping saved successfully.' });
        log.info('handleSavePriority', 'Priority column mapping saved', { priorityColumn });
      } else {
        setMsgPriority({ type: 'error', text: res?.error?.message || 'Failed to save Priority column mapping.' });
      }
    } catch (err) {
      setMsgPriority({ type: 'error', text: 'Failed to save Priority column mapping.' });
      log.error('handleSavePriority', 'Save failed', { error: err.message });
    } finally {
      setSavingPriority(false);
    }
  }, [priorityColumn, createdColumn, closedColumn]);

  // ── Save: Response SLA Mapping ──────────────────────────────────────────
  const handleSaveResponse = useCallback(async () => {
    setSavingResponse(true);
    setMsgResponse(null);
    try {
      const payload = { createdColumn: createdColumn !== NOT_CONFIGURED ? createdColumn : 'opened_at', closedColumn: closedColumn !== NOT_CONFIGURED ? closedColumn : 'closed_at' };
      if (responseColumn !== NOT_CONFIGURED) payload.responseColumn = responseColumn;
      const res = await ApiClient.put(snApi.incidentSlaMapping, payload);
      if (res?.success) {
        setMsgResponse({ type: 'success', text: 'Response SLA column mapping saved successfully.' });
        log.info('handleSaveResponse', 'Response SLA mapping saved', { responseColumn });
      } else {
        setMsgResponse({ type: 'error', text: res?.error?.message || 'Failed to save Response SLA mapping.' });
      }
    } catch (err) {
      setMsgResponse({ type: 'error', text: 'Failed to save Response SLA mapping.' });
      log.error('handleSaveResponse', 'Save failed', { error: err.message });
    } finally {
      setSavingResponse(false);
    }
  }, [responseColumn, createdColumn, closedColumn]);

  if (configLoading) {
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
          <Clock size={20} className="text-brand-600" />
          <h2 className="text-lg font-bold text-surface-800">SLA Column Mapping</h2>
        </div>
        <p className="text-sm text-surface-500">
          Map ServiceNow incident columns to SLA calculation fields for Resolution, Response, and Priority tracking.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>
          Columns marked with <Star size={10} className="inline text-blue-600" /> are the recommended defaults. 
          When you select a column, its top 5 sample values from your ServiceNow instance are shown below the dropdown.
        </span>
      </div>

      {/* ═══ Resolution SLA Mapping ═══════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-surface-700">Resolution SLA</h3>
            <p className="text-xs text-surface-400 mt-0.5">Map columns used for Resolution SLA calculation (created and closed timestamps).</p>
          </div>
          <SectionSaveButton saving={savingResolution} onClick={handleSaveResolution} label="Save Resolution" />
        </div>
        <SectionMessage message={msgResolution} />
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Resolution SLA Label */}
          <div className="md:col-span-3">
            <div className="px-3 py-2 rounded-lg bg-brand-50 border border-brand-100">
              <p className="text-xs font-semibold text-brand-700">Resolution SLA</p>
              <p className="text-[11px] text-brand-600 mt-0.5">Calculated from Created Column → Closed Column</p>
            </div>
          </div>

          {/* Created Column */}
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1">Created Column</label>
            <ColumnSelect
              value={createdColumn}
              onChange={handleColumnChange(setCreatedColumn)}
              columns={snowColumns}
              placeholder="— Not Configured —"
              expectedDefault={EXPECTED_DEFAULTS.createdColumn}
            />
            <p className="text-[10px] text-surface-400 mt-1">When the incident was created.</p>
            <SampleValuesPreview columnName={createdColumn} sampleData={sampleCache[createdColumn]} />
          </div>

          {/* Closed Column */}
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1">Closed Column</label>
            <ColumnSelect
              value={closedColumn}
              onChange={handleColumnChange(setClosedColumn)}
              columns={snowColumns}
              placeholder="— Not Configured —"
              expectedDefault={EXPECTED_DEFAULTS.closedColumn}
            />
            <p className="text-[10px] text-surface-400 mt-1">When the incident was resolved/closed.</p>
            <SampleValuesPreview columnName={closedColumn} sampleData={sampleCache[closedColumn]} />
          </div>

          {/* Spacer */}
          <div />
        </div>
      </div>

      {/* ═══ Priority Column Mapping ══════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-surface-700">Priority Column</h3>
            <p className="text-xs text-surface-400 mt-0.5">Map the column used to identify incident priority for SLA threshold matching.</p>
          </div>
          <SectionSaveButton saving={savingPriority} onClick={handleSavePriority} label="Save Priority" />
        </div>
        <SectionMessage message={msgPriority} />
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Priority Column Label */}
          <div className="md:col-span-2">
            <div className="px-3 py-2 rounded-lg bg-violet-50 border border-violet-100">
              <p className="text-xs font-semibold text-violet-700">Priority Mapping</p>
              <p className="text-[11px] text-violet-600 mt-0.5">The priority column is used by SLA thresholds to match incidents to their SLA targets.</p>
            </div>
          </div>

          {/* Priority Column */}
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1">Priority Column</label>
            <ColumnSelect
              value={priorityColumn}
              onChange={handleColumnChange(setPriorityColumn)}
              columns={snowColumns}
              placeholder="— Not Configured —"
              expectedDefault={EXPECTED_DEFAULTS.priorityColumn}
            />
            <p className="text-[10px] text-surface-400 mt-1">The ServiceNow incident field that holds the priority value (e.g., priority, urgency).</p>
            <SampleValuesPreview columnName={priorityColumn} sampleData={sampleCache[priorityColumn]} />
          </div>

          {/* Spacer */}
          <div />
        </div>
      </div>

      {/* ═══ Response SLA Mapping ═════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-surface-700">Response SLA</h3>
            <p className="text-xs text-surface-400 mt-0.5">Map the column used for Response SLA calculation (first response timestamp).</p>
          </div>
          <SectionSaveButton saving={savingResponse} onClick={handleSaveResponse} label="Save Response" />
        </div>
        <SectionMessage message={msgResponse} />
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Response SLA Label */}
          <div className="md:col-span-2">
            <div className="px-3 py-2 rounded-lg bg-teal-50 border border-teal-100">
              <p className="text-xs font-semibold text-teal-700">Response SLA</p>
              <p className="text-[11px] text-teal-600 mt-0.5">Calculated from Created Column → Response Column</p>
            </div>
          </div>

          {/* Response Column */}
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1">Response Column</label>
            <ColumnSelect
              value={responseColumn}
              onChange={handleColumnChange(setResponseColumn)}
              columns={snowColumns}
              placeholder="— Not Configured —"
              expectedDefault={EXPECTED_DEFAULTS.responseColumn}
            />
            <p className="text-[10px] text-surface-400 mt-1">When the first response was sent (optional).</p>
            <SampleValuesPreview columnName={responseColumn} sampleData={sampleCache[responseColumn]} />
          </div>

          {/* Spacer */}
          <div />
        </div>
      </div>
    </div>
  );
}
