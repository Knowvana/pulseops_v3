// ============================================================================
// GeneralSettingsTab — HealthCheck Module Config
//
// PURPOSE: Module-wide default values — SLA target, HTTP status code, timeout.
//
// USED BY: manifest.jsx → getConfigTabs()
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Save, Settings } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../../config/uiText.json';
import urls from '../../config/urls.json';

const log = createLogger('GeneralSettingsTab.jsx');
const t = uiText.generalSettings;
const api = urls.api;

export default function GeneralSettingsTab() {
  const [config, setConfig] = useState({ defaultSlaTargetPercent: 99.00, defaultExpectedStatusCode: 200, defaultTimeoutMs: 10000 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const initRan = useRef(false);

  const loadConfig = useCallback(async () => {
    try {
      const res = await ApiClient.get(api.configGeneral);
      if (res?.success) setConfig(res.data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadConfig();
  }, [loadConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const res = await ApiClient.put(api.configGeneral, config);
      if (res?.success) {
        setSuccess(res.message); setTimeout(() => setSuccess(null), 3000);
      } else { setError(res?.error?.message || 'Save failed'); }
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }, [config]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-brand-500" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-surface-800">{t.title}</h3>
        <p className="text-xs text-surface-500 -mt-3">{t.subtitle}</p>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">{t.defaultSlaLabel}</label>
          <p className="text-xs text-surface-400 mb-2">{t.defaultSlaDesc}</p>
          <input type="number" step="0.01" min="0" max="100" value={config.defaultSlaTargetPercent}
            onChange={e => setConfig(p => ({ ...p, defaultSlaTargetPercent: parseFloat(e.target.value) || 99 }))}
            className="w-32 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
            placeholder={t.defaultSlaPlaceholder} />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">{t.defaultStatusCodeLabel}</label>
          <p className="text-xs text-surface-400 mb-2">{t.defaultStatusCodeDesc}</p>
          <input type="number" value={config.defaultExpectedStatusCode}
            onChange={e => setConfig(p => ({ ...p, defaultExpectedStatusCode: parseInt(e.target.value) || 200 }))}
            className="w-32 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
            placeholder={t.defaultStatusCodePlaceholder} />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">{t.defaultTimeoutLabel}</label>
          <p className="text-xs text-surface-400 mb-2">{t.defaultTimeoutDesc}</p>
          <input type="number" value={config.defaultTimeoutMs}
            onChange={e => setConfig(p => ({ ...p, defaultTimeoutMs: parseInt(e.target.value) || 10000 }))}
            className="w-32 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
            placeholder={t.defaultTimeoutPlaceholder} />
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle2 size={14} /> {success}
          </div>
        )}

        <div className="pt-2">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {saving ? <><Loader2 size={14} className="animate-spin inline mr-1" /> {t.savingButton}</> : <><Save size={14} className="inline mr-1" /> {t.saveButton}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
