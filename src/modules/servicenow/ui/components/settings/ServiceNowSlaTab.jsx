// ============================================================================
// ServiceNowSlaTab — PulseOps V2 ServiceNow Module Config
//
// PURPOSE: Configuration tab for SLA resolution time thresholds per priority.
// Each priority (critical/high/medium/low) has a max resolution time in hours.
// These thresholds are used for SLA breach detection in the Dashboard
// and for compliance % in the Reports view.
//
// ARCHITECTURE:
//   - Loads config from GET /api/servicenow/config on mount (StrictMode-guarded)
//   - Save uses ConfirmationModal (3-phase: Confirm → Progress → Summary)
//   - Only updates the sla section; other config sections are preserved
//   - All text from uiText.json — zero hardcoded strings
//
// USED BY: src/modules/servicenow/manifest.jsx → getConfigTabs()
//
// DEPENDENCIES:
//   - lucide-react                              → Icons
//   - @modules/servicenow/uiText.json           → All UI labels
//   - @config/urls.json                         → API endpoints
//   - @shared                                   → createLogger, ConfirmationModal
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, AlertCircle, Loader2, Info } from 'lucide-react';
import { createLogger, ConfirmationModal } from '@shared';
import ApiClient from '@shared/services/apiClient';
// Module-local API URLs — no dependency on platform urls.json
const snApi = {
  config: '/api/servicenow/config',
};
import uiText from '../../config/uiText.json';

const log = createLogger('ServiceNowSlaTab.jsx');
const t   = uiText.sla;
const inc = uiText.incidents;

// ── SLA field definitions ─────────────────────────────────────────────────────
const SLA_FIELDS = [
  {
    key:         'critical',
    label:       t.criticalLabel,
    description: t.criticalDescription,
    min:         1,
    max:         72,
    color:       'border-rose-300 focus:ring-rose-400',
    badge:       'bg-rose-100 text-rose-700',
  },
  {
    key:         'high',
    label:       t.highLabel,
    description: t.highDescription,
    min:         1,
    max:         168,
    color:       'border-amber-300 focus:ring-amber-400',
    badge:       'bg-amber-100 text-amber-700',
  },
  {
    key:         'medium',
    label:       t.mediumLabel,
    description: t.mediumDescription,
    min:         1,
    max:         336,
    color:       'border-blue-300 focus:ring-blue-400',
    badge:       'bg-blue-100 text-blue-700',
  },
  {
    key:         'low',
    label:       t.lowLabel,
    description: t.lowDescription,
    min:         1,
    max:         720,
    color:       'border-surface-300 focus:ring-surface-400',
    badge:       'bg-surface-100 text-surface-600',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowSlaTab() {
  const [sla,         setSla]         = useState({ critical: 4, high: 8, medium: 24, low: 72 });
  const [fullConfig,  setFullConfig]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const initRan = useRef(false);

  // ── Load config ─────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    log.debug('loadConfig', 'Loading SLA config');
    setLoading(true);
    setFetchError(null);
    try {
      const res = await ApiClient.get(snApi.config);
      if (res?.success) {
        log.info('loadConfig', 'SLA config loaded', { sla: res.data.sla });
        setFullConfig(res.data);
        setSla({ ...res.data.sla });
      } else {
        log.warn('loadConfig', 'Failed', { error: res?.error?.message });
        setFetchError(res?.error?.message || uiText.common.fetchError);
      }
    } catch (err) {
      log.error('loadConfig', 'Unexpected error', { error: err.message });
      setFetchError(uiText.common.fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  // StrictMode guard
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('mount', 'ServiceNowSlaTab mounted');
    loadConfig();
  }, [loadConfig]);

  const handleChange = useCallback((key, value) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      setSla(prev => ({ ...prev, [key]: num }));
    }
  }, []);

  // ── Save SLA config ─────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    log.info('handleSave', 'Saving SLA thresholds', { sla });
    const res = await ApiClient.put(snApi.config, {
      connection: fullConfig?.connection,
      sla,
      sync: fullConfig?.sync,
    });
    if (!res?.success) {
      throw new Error(res?.error?.message || uiText.common.fetchError);
    }
    log.info('handleSave', 'SLA thresholds saved');
    await loadConfig();
    return { sla };
  }, [sla, fullConfig, loadConfig]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 size={20} className="text-brand-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5 max-w-xl">
      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>{t.subtitle}</span>
      </div>

      {/* Fetch error */}
      {fetchError && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          <AlertCircle size={13} />{fetchError}
        </div>
      )}

      {/* SLA fields */}
      <div className="space-y-4">
        {SLA_FIELDS.map(field => (
          <div key={field.key} className="flex items-center gap-4 bg-white rounded-xl border border-surface-200 px-4 py-3 shadow-sm">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${field.badge}`}>
                  {inc.priority[field.key]}
                </span>
                <span className="text-sm font-semibold text-surface-700">{field.label}</span>
              </div>
              <p className="text-xs text-surface-400">{field.description}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  value={sla[field.key] || ''}
                  onChange={e => handleChange(field.key, e.target.value)}
                  className={`w-20 px-2 py-1.5 text-sm text-center rounded-lg border ${field.color} bg-white text-surface-700 focus:outline-none focus:ring-2 transition-all`}
                />
                <span className="text-xs text-surface-500 font-medium">{t.hoursLabel}</span>
              </div>
              <Clock size={14} className="text-surface-300" />
            </div>
          </div>
        ))}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => setShowConfirm(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          {t.saveButton}
        </button>
      </div>

      {/* Confirmation modal */}
      <ConfirmationModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title={t.confirmTitle}
        actionDescription={t.confirmDescription}
        actionTarget={t.confirmTarget}
        actionDetails={SLA_FIELDS.map(f => ({
          label: `${inc.priority[f.key]} ${uiText.reports.hours ? `(${uiText.reports.hours})` : ''}`,
          value: `${sla[f.key]} hrs`,
        }))}
        confirmLabel={uiText.common.save}
        variant="info"
        action={handleSave}
        onSuccess={() => setShowConfirm(false)}
        buildSummary={() => [
          { label: t.confirmSummaryStatus, value: t.confirmSummarySuccess },
          ...SLA_FIELDS.map(f => ({ label: inc.priority[f.key], value: `${sla[f.key]} hrs` })),
        ]}
      />
    </div>
  );
}
