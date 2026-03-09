// ============================================================================
// ServiceNowConfigSettingsTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Configuration tab for report columns and sync filters.
// Users can toggle which columns appear in reports for Incidents,
// RITMs, and Changes, and configure sync filters like assignment group.
//
// USED BY: manifest.jsx → getConfigTabs() → sn_settings
//
// DEPENDENCIES:
//   - lucide-react       → Icons
//   - @shared            → createLogger, ApiClient
//   - @components        → ConfirmDialog, ToggleSwitch
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { ConfirmDialog, ToggleSwitch } from '@components';
import uiText from '../../config/uiText.json';

const log = createLogger('ServiceNowConfigSettingsTab.jsx');
const t = uiText.configSettings;

const snApi = { settings: '/api/servicenow/config/settings' };

const DEFAULT_COLUMNS = {
  incident: [
    { key: 'number', label: 'Number', enabled: true },
    { key: 'short_description', label: 'Short Description', enabled: true },
    { key: 'priority', label: 'Priority', enabled: true },
    { key: 'state', label: 'State', enabled: true },
    { key: 'assigned_to', label: 'Assigned To', enabled: true },
    { key: 'assignment_group', label: 'Assignment Group', enabled: false },
    { key: 'category', label: 'Category', enabled: false },
    { key: 'opened_at', label: 'Opened At', enabled: true },
    { key: 'resolved_at', label: 'Resolved At', enabled: false },
    { key: 'closed_at', label: 'Closed At', enabled: false },
  ],
  ritm: [
    { key: 'number', label: 'Number', enabled: true },
    { key: 'short_description', label: 'Short Description', enabled: true },
    { key: 'priority', label: 'Priority', enabled: true },
    { key: 'state', label: 'State', enabled: true },
    { key: 'cat_item', label: 'Catalog Item', enabled: true },
    { key: 'assignment_group', label: 'Assignment Group', enabled: false },
    { key: 'opened_at', label: 'Opened At', enabled: true },
    { key: 'closed_at', label: 'Closed At', enabled: false },
  ],
  change: [
    { key: 'number', label: 'Number', enabled: true },
    { key: 'short_description', label: 'Short Description', enabled: true },
    { key: 'priority', label: 'Priority', enabled: true },
    { key: 'state', label: 'State', enabled: true },
    { key: 'assigned_to', label: 'Assigned To', enabled: true },
    { key: 'opened_at', label: 'Opened At', enabled: true },
  ],
};

const DEFAULT_FILTERS = {
  assignmentGroup: '',
  fromDate: '',
};

export default function ServiceNowConfigSettingsTab() {
  const [columns, setColumns]     = useState(DEFAULT_COLUMNS);
  const [filters, setFilters]     = useState(DEFAULT_FILTERS);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);
  const [success, setSuccess]     = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const initRan = useRef(false);

  // ── Load ──────────────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.get(snApi.settings);
      if (res?.success && res.data) {
        if (res.data.columns) setColumns(res.data.columns);
        if (res.data.filters) setFilters(res.data.filters);
        log.info('loadSettings', 'Settings loaded');
      }
    } catch (err) {
      log.error('loadSettings', 'Load failed', { error: err.message });
      setError(uiText.common.fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadSettings();
  }, [loadSettings]);

  // ── Toggle column ──────────────────────────────────────────────────────
  const toggleColumn = useCallback((type, idx) => {
    setColumns(prev => ({
      ...prev,
      [type]: prev[type].map((col, i) => i === idx ? { ...col, enabled: !col.enabled } : col),
    }));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setShowConfirm(false);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await ApiClient.put(snApi.settings, { columns, filters });
      if (res?.success) {
        setSuccess(t.confirmSummarySuccess);
        log.info('handleSave', 'Settings saved');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(res?.error?.message || 'Save failed');
      }
    } catch (err) {
      setError(err.message);
      log.error('handleSave', 'Save failed', { error: err.message });
    } finally {
      setSaving(false);
    }
  }, [columns, filters]);

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400';

  // ── Column section renderer ────────────────────────────────────────────
  const ColumnSection = ({ label, type }) => (
    <div>
      <h4 className="text-xs font-bold text-surface-600 uppercase tracking-wide mb-2">{label}</h4>
      <div className="flex flex-wrap gap-2">
        {columns[type]?.map((col, idx) => (
          <button key={col.key} onClick={() => toggleColumn(type, idx)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              col.enabled
                ? 'bg-brand-50 text-brand-700 border-brand-200'
                : 'bg-surface-50 text-surface-400 border-surface-200 hover:border-surface-300'
            }`}>
            <span className={`w-2 h-2 rounded-full ${col.enabled ? 'bg-brand-500' : 'bg-surface-300'}`} />
            {col.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
          <Settings size={18} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-surface-800">{t.title}</h2>
          <p className="text-xs text-surface-500">{t.subtitle}</p>
        </div>
      </div>

      {/* Status banners */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <AlertCircle size={14} /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <CheckCircle2 size={14} /><span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="text-brand-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Report Columns */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-surface-700">{t.reportColumnsTitle}</h3>
              <p className="text-xs text-surface-400">{t.reportColumnsSubtitle}</p>
            </div>
            <ColumnSection label={t.incidentColumnsLabel} type="incident" />
            <ColumnSection label={t.ritmColumnsLabel} type="ritm" />
            <ColumnSection label={t.changeColumnsLabel} type="change" />
          </div>

          {/* Sync Filters */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-surface-700">{t.syncFiltersTitle}</h3>
              <p className="text-xs text-surface-400">{t.syncFiltersSubtitle}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.assignmentGroupLabel}</label>
                <input type="text" value={filters.assignmentGroup}
                  onChange={e => setFilters(prev => ({ ...prev, assignmentGroup: e.target.value }))}
                  placeholder={t.assignmentGroupPlaceholder} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-surface-600 mb-1 block">{t.fromDateLabel}</label>
                <input type="date" value={filters.fromDate}
                  onChange={e => setFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                  className={inputCls} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button onClick={() => setShowConfirm(true)} disabled={saving || loading}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? t.saving : t.saveButton}
        </button>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title={t.confirmTitle}
          description={t.confirmDescription}
          target={t.confirmTarget}
          onConfirm={handleSave}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
