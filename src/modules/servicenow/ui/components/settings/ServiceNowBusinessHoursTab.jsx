// ============================================================================
// ServiceNowBusinessHoursTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Configuration tab for defining business days and working hours
// used in SLA calculations. Users can toggle business days and set
// start/end times for each day of the week. DB-backed via REST API.
// Business hours cannot be deleted — only start/end time and
// business day toggle can be updated.
//
// FLOW: Edit → Save → Confirmation Modal → Summary Modal → OK Modal
// Result shown as persistent color-coded label (does not auto-vanish).
//
// FEATURES:
//   - Beautiful time picker inputs with clock icon and styled container
//   - Toggle switch for business day enable/disable (fully functional)
//   - Fetches saved values from DB on page load
//   - Validates and persists all changes to DB
//
// USED BY: manifest.jsx → getConfigTabs() → sn_business_hours
//
// DEPENDENCIES:
//   - lucide-react       → Icons
//   - @shared            → createLogger, ApiClient
//   - @components        → ToggleSwitch
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Save, Loader2, AlertCircle, CheckCircle2, X, CalendarClock, Info } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { ToggleSwitch, PageSpinner } from '@components';
import uiText from '../../config/uiText.json';

const log = createLogger('ServiceNowBusinessHoursTab.jsx');
const t = uiText.businessHours;

const DEFAULT_HOURS = [
  { day_of_week: 0, day_name: 'Sunday',    is_business_day: false, start_time: '00:00', end_time: '00:00' },
  { day_of_week: 1, day_name: 'Monday',    is_business_day: true,  start_time: '09:00', end_time: '17:00' },
  { day_of_week: 2, day_name: 'Tuesday',   is_business_day: true,  start_time: '09:00', end_time: '17:00' },
  { day_of_week: 3, day_name: 'Wednesday', is_business_day: true,  start_time: '09:00', end_time: '17:00' },
  { day_of_week: 4, day_name: 'Thursday',  is_business_day: true,  start_time: '09:00', end_time: '17:00' },
  { day_of_week: 5, day_name: 'Friday',    is_business_day: true,  start_time: '09:00', end_time: '17:00' },
  { day_of_week: 6, day_name: 'Saturday',  is_business_day: false, start_time: '00:00', end_time: '00:00' },
];

const snApi = { businessHours: '/api/servicenow/business-hours' };

// ── Beautiful Time Picker Component ──────────────────────────────────────
function TimePicker({ value, onChange, disabled = false, label }) {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-200 ${
      disabled
        ? 'bg-surface-50 border-surface-100 opacity-40 cursor-not-allowed'
        : 'bg-white border-surface-200 hover:border-brand-300 focus-within:ring-2 focus-within:ring-brand-200 focus-within:border-brand-400 shadow-sm'
    }`}>
      <Clock size={14} className={disabled ? 'text-surface-300' : 'text-brand-500'} />
      <input
        type="time"
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
        className="bg-transparent text-sm font-medium text-surface-700 outline-none border-none p-0 w-20 disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute"
      />
    </div>
  );
}

// ── Day Name Badge Component ─────────────────────────────────────────────
function DayBadge({ name, isBusinessDay }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isBusinessDay ? 'bg-emerald-400' : 'bg-surface-300'}`} />
      <span className={`text-sm font-semibold ${isBusinessDay ? 'text-surface-800' : 'text-surface-400'}`}>
        {name}
      </span>
    </div>
  );
}

export default function ServiceNowBusinessHoursTab() {
  const [hours, setHours]             = useState(DEFAULT_HOURS);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [resultBanner, setResultBanner] = useState(null);
  const [modalPhase, setModalPhase]   = useState(null);
  const initRan = useRef(false);

  // ── Load from DB ──────────────────────────────────────────────────────
  const loadHours = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ApiClient.get(snApi.businessHours);
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        const mapped = res.data.map(row => ({
          day_of_week: row.day_of_week,
          day_name: row.day_name,
          is_business_day: Boolean(row.is_business_day),
          start_time: String(row.start_time || '09:00').slice(0, 5),
          end_time: String(row.end_time || '17:00').slice(0, 5),
        }));
        setHours(mapped);
        log.info('loadHours', 'Business hours loaded from DB', { count: mapped.length });
      } else {
        setHours(DEFAULT_HOURS);
        log.info('loadHours', 'No business hours in DB, using defaults');
      }
    } catch (err) {
      log.error('loadHours', 'Load failed', { error: err.message });
      setResultBanner({ success: false, message: `Failed to load business hours: ${err.message}` });
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
    setHours(prev => prev.map((d, i) => {
      if (i !== idx) return d;
      const toggled = !d.is_business_day;
      return {
        ...d,
        is_business_day: toggled,
        start_time: toggled && d.start_time === '00:00' ? '09:00' : d.start_time,
        end_time: toggled && d.end_time === '00:00' ? '17:00' : d.end_time,
      };
    }));
    setResultBanner(null);
  }, []);

  const changeTime = useCallback((idx, field, value) => {
    setHours(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
    setResultBanner(null);
  }, []);

  // ── Validate ───────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    for (const day of hours) {
      if (day.is_business_day) {
        if (!day.start_time || !day.end_time) {
          return { valid: false, error: `${day.day_name}: Start and End time are required for business days.` };
        }
        if (day.start_time >= day.end_time) {
          return { valid: false, error: `${day.day_name}: Start time must be before End time.` };
        }
      }
    }
    return { valid: true };
  }, [hours]);

  // ── Save flow: Confirm → Save → Summary → Done ────────────────────────
  const handleOpenConfirm = useCallback(() => {
    const result = validate();
    if (!result.valid) {
      setResultBanner({ success: false, message: result.error });
      return;
    }
    setModalPhase('confirm');
  }, [validate]);

  const handleConfirmSave = useCallback(async () => {
    setModalPhase(null);
    setSaving(true);
    setResultBanner(null);
    try {
      const res = await ApiClient.put(snApi.businessHours, { hours });
      if (res?.success) {
        const businessDays = hours.filter(d => d.is_business_day);
        setResultBanner({ success: true, message: `Business hours updated successfully — ${businessDays.length} business day(s) configured.` });
        log.info('handleSave', 'Business hours saved to DB', { businessDays: businessDays.length });
        await loadHours();
      } else {
        setResultBanner({ success: false, message: res?.error?.message || 'Failed to save business hours.' });
      }
    } catch (err) {
      setResultBanner({ success: false, message: err.message });
      log.error('handleSave', 'Save failed', { error: err.message });
    } finally {
      setSaving(false);
    }
  }, [hours, loadHours]);

  const businessDayCount = hours.filter(d => d.is_business_day).length;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
            <CalendarClock size={18} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-surface-800">{t.title}</h2>
            <p className="text-xs text-surface-500">{t.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-surface-500">
          <span className="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 font-semibold">
            {businessDayCount} business day{businessDayCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>Toggle business days on/off and set working hours. These are used for SLA calculations. Changes are saved only after clicking "Save Business Hours".</span>
      </div>

      {/* Persistent result banner (does NOT auto-vanish) */}
      {resultBanner && (
        <div className={`flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg text-sm border ${
          resultBanner.success
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          <div className="flex items-center gap-2">
            {resultBanner.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{resultBanner.message}</span>
          </div>
          <button onClick={() => setResultBanner(null)} className="p-0.5 rounded hover:bg-black/5">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Modal loading spinner */}
      {loading && <PageSpinner modal message="Loading business hours..." />}

      {/* Table */}
      {!loading && (
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
                <tr key={day.day_of_week} className={`transition-all duration-200 ${day.is_business_day ? 'hover:bg-surface-50/50' : 'bg-surface-25'}`}>
                  <td className="px-5 py-3">
                    <DayBadge name={day.day_name} isBusinessDay={day.is_business_day} />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <ToggleSwitch
                      enabled={day.is_business_day}
                      onToggle={() => toggleDay(idx)}
                      size="sm"
                    />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <TimePicker
                      value={day.start_time}
                      onChange={e => changeTime(idx, 'start_time', e.target.value)}
                      disabled={!day.is_business_day}
                      label={`${day.day_name} start time`}
                    />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <TimePicker
                      value={day.end_time}
                      onChange={e => changeTime(idx, 'end_time', e.target.value)}
                      disabled={!day.is_business_day}
                      label={`${day.day_name} end time`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button onClick={handleOpenConfirm} disabled={saving || loading}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? t.saving : t.saveButton}
        </button>
      </div>

      {/* ── Confirmation Modal ─────────────────────────────────────────── */}
      {modalPhase === 'confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-surface-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                <AlertCircle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-surface-800">Update Business Hours</h3>
                <p className="text-xs text-surface-500 mt-0.5">This will update the business hours used for SLA calculations.</p>
              </div>
            </div>
            <div className="bg-surface-50 rounded-lg p-3 mb-5 text-xs text-surface-600 space-y-1">
              <p className="font-semibold text-surface-700">Changes summary:</p>
              {hours.filter(d => d.is_business_day).map(d => (
                <p key={d.day_of_week} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  {d.day_name}: {d.start_time} – {d.end_time}
                </p>
              ))}
              {hours.filter(d => !d.is_business_day).length > 0 && (
                <p className="text-surface-400 mt-1">Non-business: {hours.filter(d => !d.is_business_day).map(d => d.day_name).join(', ')}</p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setModalPhase(null)} className="px-4 py-2 rounded-lg text-xs font-semibold text-surface-600 bg-surface-100 hover:bg-surface-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleConfirmSave} className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors">
                Confirm Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
