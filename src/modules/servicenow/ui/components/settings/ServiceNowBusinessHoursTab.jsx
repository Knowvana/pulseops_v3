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
// USED BY: manifest.jsx → getConfigTabs() → sn_business_hours
//
// DEPENDENCIES:
//   - lucide-react       → Icons
//   - @shared            → createLogger, ApiClient
//   - @components        → ToggleSwitch
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Save, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { ToggleSwitch } from '@components';
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

export default function ServiceNowBusinessHoursTab() {
  const [hours, setHours]             = useState(DEFAULT_HOURS);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [resultBanner, setResultBanner] = useState(null); // persistent { success, message }
  const [modalPhase, setModalPhase]   = useState(null); // 'confirm' | 'summary' | 'done'
  const [summaryData, setSummaryData] = useState(null);
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
          is_business_day: row.is_business_day,
          start_time: String(row.start_time || '09:00').slice(0, 5),
          end_time: String(row.end_time || '17:00').slice(0, 5),
        }));
        setHours(mapped);
        log.info('loadHours', 'Business hours loaded from DB');
      } else {
        setHours(DEFAULT_HOURS);
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
    setHours(prev => prev.map((d, i) => i === idx ? { ...d, is_business_day: !d.is_business_day } : d));
    setResultBanner(null);
  }, []);

  const changeTime = useCallback((idx, field, value) => {
    setHours(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
    setResultBanner(null);
  }, []);

  // ── Save flow: Confirm → Save → Summary → Done ────────────────────────
  const handleConfirmSave = useCallback(async () => {
    setModalPhase(null);
    setSaving(true);
    setResultBanner(null);
    try {
      const res = await ApiClient.put(snApi.businessHours, { hours });
      if (res?.success) {
        const businessDays = hours.filter(d => d.is_business_day);
        setSummaryData({
          success: true,
          businessDayCount: businessDays.length,
          days: businessDays.map(d => `${d.day_name} (${d.start_time} – ${d.end_time})`),
        });
        setModalPhase('summary');
        log.info('handleSave', 'Business hours saved to DB');
        await loadHours();
      } else {
        setSummaryData({ success: false, error: res?.error?.message || 'Save failed' });
        setModalPhase('summary');
      }
    } catch (err) {
      setSummaryData({ success: false, error: err.message });
      setModalPhase('summary');
      log.error('handleSave', 'Save failed', { error: err.message });
    } finally {
      setSaving(false);
    }
  }, [hours, loadHours]);

  const handleSummaryOk = useCallback(() => {
    if (summaryData?.success) {
      setResultBanner({ success: true, message: 'Business hours updated successfully.' });
    } else {
      setResultBanner({ success: false, message: summaryData?.error || 'Failed to save business hours.' });
    }
    setModalPhase(null);
    setSummaryData(null);
  }, [summaryData]);

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
                <tr key={day.day_of_week} className={`hover:bg-surface-50/50 transition-colors ${!day.is_business_day ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-medium text-surface-700">{day.day_name}</td>
                  <td className="px-5 py-3 text-center">
                    <ToggleSwitch checked={day.is_business_day} onChange={() => toggleDay(idx)} size="sm" />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <input type="time" value={day.start_time}
                      onChange={e => changeTime(idx, 'start_time', e.target.value)}
                      disabled={!day.is_business_day} className={inputCls} />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <input type="time" value={day.end_time}
                      onChange={e => changeTime(idx, 'end_time', e.target.value)}
                      disabled={!day.is_business_day} className={inputCls} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button onClick={() => setModalPhase('confirm')} disabled={saving || loading}
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
                <p key={d.day_of_week}>• {d.day_name}: {d.start_time} – {d.end_time}</p>
              ))}
              {hours.filter(d => !d.is_business_day).length > 0 && (
                <p className="text-surface-400">Non-business: {hours.filter(d => !d.is_business_day).map(d => d.day_name).join(', ')}</p>
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

      {/* ── Summary Modal ──────────────────────────────────────────────── */}
      {modalPhase === 'summary' && summaryData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-surface-200">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${summaryData.success ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                {summaryData.success ? <CheckCircle2 size={20} className="text-emerald-600" /> : <AlertCircle size={20} className="text-rose-600" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-surface-800">
                  {summaryData.success ? 'Business Hours Updated' : 'Update Failed'}
                </h3>
              </div>
            </div>
            {summaryData.success ? (
              <div className="bg-emerald-50 rounded-lg p-3 mb-5 text-xs text-emerald-700 space-y-1 border border-emerald-100">
                <p className="font-semibold">{summaryData.businessDayCount} business day(s) configured:</p>
                {summaryData.days.map((d, i) => <p key={i}>• {d}</p>)}
              </div>
            ) : (
              <div className="bg-rose-50 rounded-lg p-3 mb-5 text-xs text-rose-700 border border-rose-100">
                {summaryData.error}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={handleSummaryOk} className="px-5 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
