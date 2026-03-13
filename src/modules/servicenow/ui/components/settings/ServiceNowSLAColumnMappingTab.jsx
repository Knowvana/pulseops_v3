// ============================================================================
// ServiceNowSLAColumnMappingTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Configuration tab for mapping ServiceNow incident columns to SLA
// calculation fields. Captures both Resolution SLA (created + closed columns)
// and Response SLA (response column) mappings.
//
// ARCHITECTURE:
//   - Fetches incident config on mount (StrictMode-guarded via useRef)
//   - Loads available columns from ServiceNow schema
//   - Allows independent mapping of Resolution and Response SLA columns
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
import { Clock, RefreshCw, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../../config/uiText.json';

const log = createLogger('ServiceNowSLAColumnMappingTab.jsx');

const snApi = {
  incidentConfig:       '/api/servicenow/config/incidents',
  incidentSlaMapping:   '/api/servicenow/config/incidents/sla-mapping',
  snowColumns:          '/api/servicenow/schema/columns',
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

export default function ServiceNowSLAColumnMappingTab() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [snowColumns, setSnowColumns]       = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  
  // Resolution SLA mapping
  const [createdColumn, setCreatedColumn]   = useState('opened_at');
  const [closedColumn, setClosedColumn]     = useState('closed_at');
  
  // Response SLA mapping
  const [responseColumn, setResponseColumn] = useState('');
  
  // Saving state
  const [savingResolution, setSavingResolution] = useState(false);
  const [savingResponse, setSavingResponse]     = useState(false);
  const [msgResolution, setMsgResolution]       = useState(null);
  const [msgResponse, setMsgResponse]           = useState(null);
  
  const initRan = useRef(false);

  // ── Auto-dismiss messages ─────────────────────────────────────────────────
  useEffect(() => { if (msgResolution) return setTimeout(() => setMsgResolution(null), 5000); }, [msgResolution]);
  useEffect(() => { if (msgResponse) return setTimeout(() => setMsgResponse(null), 5000); }, [msgResponse]);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const configRes = await ApiClient.get(snApi.incidentConfig);
      if (configRes?.success) {
        setCreatedColumn(configRes.data.createdColumn || 'opened_at');
        setClosedColumn(configRes.data.closedColumn || 'closed_at');
        setResponseColumn(configRes.data.responseColumn || '');
      }
    } catch (err) {
      log.error('loadData', 'Failed to load config', { error: err.message });
    }
  }, []);

  const fetchSnowColumns = useCallback(async () => {
    setColumnsLoading(true);
    try {
      const res = await ApiClient.get(snApi.snowColumns);
      if (res?.success) {
        setSnowColumns(res.data.columns || []);
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

  // ── Save: Response SLA Mapping ──────────────────────────────────────────
  const handleSaveResponse = useCallback(async () => {
    setSavingResponse(true);
    setMsgResponse(null);
    try {
      const res = await ApiClient.put(snApi.incidentSlaMapping, { responseColumn });
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
  }, [responseColumn]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Clock size={20} className="text-brand-600" />
          <h2 className="text-lg font-bold text-surface-800">SLA Column Mapping</h2>
        </div>
        <p className="text-sm text-surface-500">
          Map ServiceNow incident columns to SLA calculation fields for both Resolution and Response SLA tracking.
        </p>
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
            <p className="text-[10px] text-surface-400 mt-1">When the incident was created.</p>
          </div>

          {/* Closed Column */}
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
            <p className="text-[10px] text-surface-400 mt-1">When the incident was resolved/closed.</p>
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
            <select
              value={responseColumn}
              onChange={e => setResponseColumn(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
            >
              <option value="">— Not Configured —</option>
              {snowColumns.length > 0 ? snowColumns.map(col => (
                <option key={col.name} value={col.name}>
                  {col.label ? `${col.name} (${col.label})` : col.name}
                </option>
              )) : null}
            </select>
            <p className="text-[10px] text-surface-400 mt-1">When the first response was sent (optional).</p>
          </div>

          {/* Spacer */}
          <div />
        </div>
      </div>
    </div>
  );
}
