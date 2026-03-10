// ============================================================================
// ServiceNowIncidentConfigTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Incident configuration tab with three sections:
//   1. Column Mapping — select which SNOW incident columns to display
//   2. SLA Column Mapping — map created/closed columns for SLA calculation
//   3. Assignment Group — filter incidents by assignment group
//   4. SLA Configuration — CRUD for SLA thresholds per priority
//
// DATA: All config is persisted to database via REST API.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Columns, Save, Loader2, AlertCircle, CheckCircle2, Plus, Trash2,
  RefreshCw, Shield, Users, Clock,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';

const log = createLogger('ServiceNowIncidentConfigTab.jsx');

const snApi = {
  incidentConfig: '/api/servicenow/config/incidents',
  snowColumns:    '/api/servicenow/schema/columns',
  slaConfig:      '/api/servicenow/config/sla',
};

// Priority badge styles
const PRIORITY_STYLES = {
  '1 - Critical': 'bg-rose-100 text-rose-700 border-rose-200',
  '2 - High':     'bg-amber-100 text-amber-700 border-amber-200',
  '3 - Medium':   'bg-blue-100 text-blue-700 border-blue-200',
  '4 - Low':      'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export default function ServiceNowIncidentConfigTab() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [message, setMessage]           = useState(null); // { type: 'success'|'error', text }
  const [snowColumns, setSnowColumns]   = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);

  // Incident config
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [createdColumn, setCreatedColumn]     = useState('opened_at');
  const [closedColumn, setClosedColumn]       = useState('closed_at');
  const [assignmentGroup, setAssignmentGroup] = useState('');

  // SLA config
  const [slaRows, setSlaRows]           = useState([]);
  const [slaLoading, setSlaLoading]     = useState(false);
  const [editingSla, setEditingSla]     = useState(null); // id of row being edited
  const [newSla, setNewSla]             = useState({ priority: '', responseMinutes: 60, resolutionMinutes: 480 });

  const initRan = useRef(false);

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
      setMessage({ type: 'error', text: 'Failed to load configuration.' });
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
      } else {
        setMessage({ type: 'error', text: res?.error?.message || 'Failed to fetch SNOW columns.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to fetch ServiceNow columns.' });
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

  // ── Save incident config ──────────────────────────────────────────────────
  const handleSaveConfig = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await ApiClient.put(snApi.incidentConfig, {
        selectedColumns,
        createdColumn,
        closedColumn,
        assignmentGroup,
      });
      if (res?.success) {
        setMessage({ type: 'success', text: 'Incident configuration saved successfully.' });
      } else {
        setMessage({ type: 'error', text: res?.error?.message || 'Failed to save configuration.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save configuration.' });
    } finally {
      setSaving(false);
    }
  }, [selectedColumns, createdColumn, closedColumn, assignmentGroup]);

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
    setMessage(null);
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
        setMessage({ type: 'success', text: isNew ? 'SLA created.' : 'SLA updated.' });
        setEditingSla(null);
        setNewSla({ priority: '', responseMinutes: 60, resolutionMinutes: 480 });
        // Reload SLA data
        const slaRes = await ApiClient.get(snApi.slaConfig);
        if (slaRes?.success) setSlaRows(slaRes.data || []);
      } else {
        setMessage({ type: 'error', text: res?.error?.message || 'SLA save failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'SLA save failed.' });
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
        setMessage({ type: 'success', text: 'SLA deleted.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete SLA.' });
    } finally {
      setSlaLoading(false);
    }
  }, []);

  // ── Message auto-dismiss ──────────────────────────────────────────────────
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

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
        <p className="text-sm text-surface-500">Configure incident column mapping, assignment group, and SLA thresholds.</p>
      </div>

      {/* Message banner */}
      {message && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${
          message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {message.text}
        </div>
      )}

      {/* Section 1: Column Mapping */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-surface-700">Incident Column Mapping</h3>
            <p className="text-xs text-surface-400 mt-0.5">Select which ServiceNow columns to display. Number is mandatory.</p>
          </div>
          <button onClick={fetchSnowColumns} disabled={columnsLoading} className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40">
            <RefreshCw size={13} className={columnsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="p-5">
          {columnsLoading ? (
            <div className="flex items-center justify-center py-6"><Loader2 size={18} className="text-brand-400 animate-spin" /></div>
          ) : snowColumns.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-4">No columns loaded. Connect to ServiceNow first and click refresh.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
              {snowColumns.map(col => {
                const isSelected = selectedColumns.includes(col.name);
                const isMandatory = col.name === 'number';
                return (
                  <label
                    key={col.name}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-all ${
                      isSelected ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-surface-200 text-surface-600 hover:border-surface-300'
                    } ${isMandatory ? 'opacity-75 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isMandatory}
                      onChange={() => toggleColumn(col.name)}
                      className="rounded border-surface-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
                    />
                    <span className="truncate font-medium">{col.name}</span>
                    {isMandatory && <span className="text-[9px] bg-rose-100 text-rose-600 px-1 rounded">Required</span>}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section 2: SLA Column Mapping */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
          <h3 className="text-sm font-bold text-surface-700">SLA Column Mapping</h3>
          <p className="text-xs text-surface-400 mt-0.5">Map the columns used for Resolution SLA calculation.</p>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1">Created Column</label>
            <select
              value={createdColumn}
              onChange={e => setCreatedColumn(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
            >
              {snowColumns.length > 0 ? snowColumns.map(col => (
                <option key={col.name} value={col.name}>{col.name}</option>
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
                <option key={col.name} value={col.name}>{col.name}</option>
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

      {/* Section 3: Assignment Group */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-700">Assignment Group</h3>
          </div>
          <p className="text-xs text-surface-400 mt-0.5">Filter all incident API calls to only fetch incidents from this group.</p>
        </div>
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

      {/* Save Config Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving...' : 'Save Incident Configuration'}
        </button>
      </div>

      {/* Section 4: SLA Configuration (CRUD) */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-700">Incident SLAs</h3>
          </div>
          <p className="text-xs text-surface-400 mt-0.5">Define contract-level SLA targets for incident response and resolution times.</p>
        </div>
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
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${PRIORITY_STYLES[row.priority] || 'bg-surface-100 text-surface-600 border-surface-200'}`}>
                        {row.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={row.response_minutes}
                          onChange={e => row._editResponse = e.target.value}
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
                          onChange={e => row._editResolution = e.target.value}
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
                            onClick={() => handleSaveSla({ id: row.id, priority: row.priority, responseMinutes: row._editResponse || row.response_minutes, resolutionMinutes: row._editResolution || row.resolution_minutes, enabled: row.enabled })}
                            className="px-2 py-1 rounded text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
                          >Save</button>
                          <button onClick={() => setEditingSla(null)} className="px-2 py-1 rounded text-xs text-surface-500 hover:bg-surface-100">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditingSla(row.id)} className="px-2 py-1 rounded text-xs text-brand-600 hover:bg-brand-50 font-semibold">Edit</button>
                          <button onClick={() => handleDeleteSla(row.id)} className="p-1 rounded text-rose-400 hover:text-rose-600 hover:bg-rose-50">
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
