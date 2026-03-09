// ============================================================================
// ServiceNowSlaTab — PulseOps V3 ServiceNow Module Config
//
// PURPOSE: Configuration tab for SLA thresholds per priority and record type.
// Supports per-priority response + resolution times for both Incidents and RITMs.
// Also retains the simple hours-based thresholds for backward compatibility.
//
// ARCHITECTURE:
//   - Loads config from GET /api/servicenow/config + /sla/config on mount
//   - Save uses ConfirmationModal (3-phase: Confirm → Progress → Summary)
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
  config:    '/api/servicenow/config',
  slaConfig: '/api/servicenow/sla/config',
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
  const [slaDetailed, setSlaDetailed] = useState([]);
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
      const [cfgRes, slaRes] = await Promise.all([
        ApiClient.get(snApi.config),
        ApiClient.get(snApi.slaConfig).catch(() => null),
      ]);
      if (cfgRes?.success) {
        log.info('loadConfig', 'SLA config loaded', { sla: cfgRes.data.sla });
        setFullConfig(cfgRes.data);
        setSla({ ...cfgRes.data.sla });
      } else {
        log.warn('loadConfig', 'Failed', { error: cfgRes?.error?.message });
        setFetchError(cfgRes?.error?.message || uiText.common.fetchError);
      }
      if (slaRes?.success && Array.isArray(slaRes.data)) {
        setSlaDetailed(slaRes.data);
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

  // ── Update detailed SLA row ────────────────────────────────────────────
  const handleDetailedChange = useCallback((idx, field, value) => {
    setSlaDetailed(prev => prev.map((row, i) => i === idx ? { ...row, [field]: parseInt(value, 10) || 0 } : row));
  }, []);

  // ── Save SLA config ─────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    log.info('handleSave', 'Saving SLA thresholds', { sla });
    const [res1, res2] = await Promise.all([
      ApiClient.put(snApi.config, {
        connection: fullConfig?.connection,
        sla,
        sync: fullConfig?.sync,
      }),
      slaDetailed.length > 0 ? ApiClient.put(snApi.slaConfig, slaDetailed) : Promise.resolve({ success: true }),
    ]);
    if (!res1?.success) {
      throw new Error(res1?.error?.message || uiText.common.fetchError);
    }
    log.info('handleSave', 'SLA thresholds saved');
    await loadConfig();
    return { sla };
  }, [sla, slaDetailed, fullConfig, loadConfig]);

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

      {/* Detailed SLA tables (Incidents / RITMs) */}
      {slaDetailed.length > 0 && (
        <div className="space-y-4">
          {['incident', 'ritm'].map(recordType => {
            const rows = slaDetailed.filter(r => r.recordType === recordType);
            if (rows.length === 0) return null;
            return (
              <div key={recordType} className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-surface-100 bg-surface-50/50">
                  <p className="text-xs font-bold text-surface-600 uppercase tracking-wide">
                    {recordType === 'incident' ? 'Incident' : 'RITM'} SLA Targets (minutes)
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-surface-500">Priority</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-surface-500">Response Time</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-surface-500">Resolution Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {rows.map((row) => {
                      const idx = slaDetailed.indexOf(row);
                      return (
                        <tr key={row.priority} className="hover:bg-surface-50/50">
                          <td className="px-4 py-2 text-surface-700 font-medium text-xs">{row.priority}</td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="number" min={1}
                              value={row.responseTimeMinutes || ''}
                              onChange={e => handleDetailedChange(idx, 'responseTimeMinutes', e.target.value)}
                              className="w-20 px-2 py-1 text-xs text-center rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-300"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="number" min={1}
                              value={row.resolutionTimeMinutes || ''}
                              onChange={e => handleDetailedChange(idx, 'resolutionTimeMinutes', e.target.value)}
                              className="w-20 px-2 py-1 text-xs text-center rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-300"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

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
