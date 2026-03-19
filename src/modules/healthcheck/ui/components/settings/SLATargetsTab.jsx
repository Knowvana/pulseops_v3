// ============================================================================
// SLATargetsTab → Global SLA Configuration Tab
//
// PURPOSE: Single global monthly SLA target % applied to all categories
//          marked for Uptime SLA calculation. Replaces per-app SLA targets.
//
// USED BY: manifest.jsx → getConfigTabs()
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Save, X, Target, Shield } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../../config/uiText.json';
import urls from '../../config/urls.json';

const log = createLogger('SLATargetsTab.jsx');
const t = uiText.globalSla;
const api = urls.api;

export default function SLATargetsTab() {
  const [config, setConfig] = useState({ slaTargetPercent: 99, measurementPeriod: 'monthly' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [inputValue, setInputValue] = useState('99');
  const initRan = useRef(false);

  const loadData = useCallback(async () => {
    try {
      const res = await ApiClient.get(api.configGlobalSla);
      if (res?.success && res.data) {
        setConfig(res.data);
        setInputValue(String(res.data.slaTargetPercent ?? 99));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadData();
  }, [loadData]);

  const handleSave = useCallback(async () => {
    const val = parseFloat(inputValue);
    if (isNaN(val) || val < 0 || val > 100) {
      setError('SLA target must be between 0 and 100.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { slaTargetPercent: val, measurementPeriod: 'monthly' };
      const res = await ApiClient.put(api.configGlobalSla, payload);
      if (res?.success) {
        setConfig(res.data || payload);
        setSuccess(t.savedMessage);
      } else {
        setError(res?.error?.message || 'Save failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [inputValue]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-brand-500" size={24} />
        <span className="ml-2 text-surface-500">{uiText.common.loading}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-surface-800">{t.title}</h3>
        <p className="text-xs text-surface-500">{t.subtitle}</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle2 size={14} /> {success}
          <button onClick={() => setSuccess(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* Current SLA Display */}
      <div className="bg-gradient-to-r from-brand-50 to-indigo-50 border border-brand-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-brand-100">
            <Shield size={20} className="text-brand-600" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-surface-800">{t.currentLabel}</h4>
            <p className="text-xs text-surface-500">{t.measurementLabel}: {t.measurementValue}</p>
          </div>
          <div className="ml-auto">
            <span className="text-3xl font-black text-brand-700">{config.slaTargetPercent}%</span>
          </div>
        </div>
      </div>

      {/* Edit SLA */}
      <div className="bg-surface-50 border border-surface-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1">{t.slaInputLabel}</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              className="w-32 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
              placeholder={t.slaInputPlaceholder}
            />
            <span className="text-sm font-medium text-surface-500">%</span>
          </div>
          <p className="text-xs text-surface-400 mt-2">{t.slaInputDesc}</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <><Loader2 size={14} className="animate-spin" /> {t.savingButton}</> : <><Save size={14} /> {t.saveButton}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
