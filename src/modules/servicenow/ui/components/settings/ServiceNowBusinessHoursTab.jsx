// ============================================================================
// ServiceNowBusinessHoursTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Configuration tab for defining business days and working hours
// used in SLA calculations. Users can toggle business days and set
// start/end times for each day of the week.
//
// USED BY: manifest.jsx → getConfigTabs() → sn_business_hours
//
// DEPENDENCIES:
//   - lucide-react       → Icons
//   - @shared            → createLogger, ApiClient
//   - @components        → ConfirmDialog, ToggleSwitch
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { ConfirmDialog, ToggleSwitch } from '@components';
import uiText from '../../config/uiText.json';

const log = createLogger('ServiceNowBusinessHoursTab.jsx');
const t = uiText.businessHours;

const DEFAULT_HOURS = [
  { dayOfWeek: 0, dayName: 'Sunday',    isBusinessDay: false, startTime: '00:00', endTime: '00:00' },
  { dayOfWeek: 1, dayName: 'Monday',    isBusinessDay: true,  startTime: '09:00', endTime: '17:00' },
  { dayOfWeek: 2, dayName: 'Tuesday',   isBusinessDay: true,  startTime: '09:00', endTime: '17:00' },
  { dayOfWeek: 3, dayName: 'Wednesday', isBusinessDay: true,  startTime: '09:00', endTime: '17:00' },
  { dayOfWeek: 4, dayName: 'Thursday',  isBusinessDay: true,  startTime: '09:00', endTime: '17:00' },
  { dayOfWeek: 5, dayName: 'Friday',    isBusinessDay: true,  startTime: '09:00', endTime: '17:00' },
  { dayOfWeek: 6, dayName: 'Saturday',  isBusinessDay: false, startTime: '00:00', endTime: '00:00' },
];

const snApi = { businessHours: '/api/servicenow/business-hours' };

export default function ServiceNowBusinessHoursTab() {
  const [hours, setHours]       = useState(DEFAULT_HOURS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const initRan = useRef(false);

  // ── Load ──────────────────────────────────────────────────────────────
  const loadHours = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.get(snApi.businessHours);
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        setHours(res.data);
        log.info('loadHours', 'Business hours loaded');
      } else {
        setHours(DEFAULT_HOURS);
      }
    } catch (err) {
      log.error('loadHours', 'Load failed', { error: err.message });
      setError(uiText.common.fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadHours();
  }, [loadHours]);

  // ── Toggle / change ────────────────────────────────────────────────────
  const toggleDay = useCallback((idx) => {
    setHours(prev => prev.map((d, i) => i === idx ? { ...d, isBusinessDay: !d.isBusinessDay } : d));
  }, []);

  const changeTime = useCallback((idx, field, value) => {
    setHours(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setShowConfirm(false);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await ApiClient.put(snApi.businessHours, hours);
      if (res?.success) {
        setSuccess(t.confirmSummarySuccess);
        log.info('handleSave', 'Business hours saved');
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
  }, [hours]);

  const inputCls = 'px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 w-28';

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
          <Clock size={18} className="text-brand-600" />
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

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="text-brand-400 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide">{t.dayColumn}</th>
                <th className="text-center px-5 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide">{t.businessDayColumn}</th>
                <th className="text-center px-5 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide">{t.startTimeColumn}</th>
                <th className="text-center px-5 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide">{t.endTimeColumn}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {hours.map((day, idx) => (
                <tr key={day.dayOfWeek} className={`hover:bg-surface-50/50 transition-colors ${!day.isBusinessDay ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-medium text-surface-700">{day.dayName}</td>
                  <td className="px-5 py-3 text-center">
                    <ToggleSwitch checked={day.isBusinessDay} onChange={() => toggleDay(idx)} size="sm" />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <input type="time" value={day.startTime}
                      onChange={e => changeTime(idx, 'startTime', e.target.value)}
                      disabled={!day.isBusinessDay} className={inputCls} />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <input type="time" value={day.endTime}
                      onChange={e => changeTime(idx, 'endTime', e.target.value)}
                      disabled={!day.isBusinessDay} className={inputCls} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button onClick={() => setShowConfirm(true)} disabled={saving || loading}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? t.saving : t.saveButton}
        </button>
      </div>

      {/* Confirm dialog */}
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
