// ============================================================================
// DowntimeSourceTab — HealthCheck Module Config
//
// PURPOSE: Configure where planned downtime entries come from (ServiceNow API).
// Allows manual sync trigger.
//
// USED BY: manifest.jsx → getConfigTabs()
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, CheckCircle2, AlertCircle, Save, RefreshCw, Link2,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../../config/uiText.json';
import urls from '../../config/urls.json';

const log = createLogger('DowntimeSourceTab.jsx');
const t = uiText.downtimeSource;
const api = urls.api;

export default function DowntimeSourceTab() {
  const [config, setConfig] = useState({
    enabled: false, sourceModule: 'servicenow', apiUrl: '', autoSync: false, syncIntervalMinutes: 60,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const initRan = useRef(false);

  // Default full URL for ServiceNow planned downtime API
  const DEFAULT_API_URL = `${window.location.protocol}//${window.location.host}/api/servicenow/planned-downtime`;

  const loadConfig = useCallback(async () => {
    try {
      const res = await ApiClient.get(api.configDowntimeSource);
      if (res?.success) {
        const data = res.data || {};
        // Prepopulate API URL with explicit full URL if empty
        if (!data.apiUrl) data.apiUrl = DEFAULT_API_URL;
        setConfig(data);
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
    loadConfig();
  }, [loadConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const res = await ApiClient.put(api.configDowntimeSource, config);
      if (res?.success) {
        setSuccess(res.message); setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(res?.error?.message || 'Save failed');
      }
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }, [config]);

  const handleSync = useCallback(async () => {
    setSyncing(true); setError(null);
    try {
      const res = await ApiClient.post(api.plannedDowntimeSync);
      if (res?.success) {
        setSuccess(res.message); setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(res?.error?.message || 'Sync failed');
      }
    } catch (err) { setError(err.message); }
    finally { setSyncing(false); }
  }, []);

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

        {/* Enabled */}
        <div className="flex items-center justify-between py-3 border-b border-surface-100">
          <div>
            <p className="text-sm font-medium text-surface-700">{t.enabledLabel}</p>
            <p className="text-xs text-surface-400">{t.enabledDesc}</p>
          </div>
          <button onClick={() => setConfig(p => ({ ...p, enabled: !p.enabled }))}
            className={`relative w-10 h-5 rounded-full transition-colors ${config.enabled ? 'bg-brand-500' : 'bg-surface-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.enabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {/* Source Module */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">{t.sourceModuleLabel}</label>
          <p className="text-xs text-surface-400 mb-2">{t.sourceModuleDesc}</p>
          <input type="text" value={config.sourceModule} onChange={e => setConfig(p => ({ ...p, sourceModule: e.target.value }))}
            className="w-60 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none" />
        </div>

        {/* API URL */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">{t.apiUrlLabel}</label>
          <p className="text-xs text-surface-400 mb-2">{t.apiUrlDesc}</p>
          <input type="text" value={config.apiUrl} onChange={e => setConfig(p => ({ ...p, apiUrl: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
            placeholder="http://localhost:1001/api/servicenow/planned-downtime" />
          <p className="text-xs text-surface-400 mt-1">Example: <span className="font-mono text-brand-600">http://localhost:1001/api/servicenow/planned-downtime?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD</span></p>
          <p className="text-xs text-amber-600 mt-2">⚠️ Must be a full URL (http:// or https://). Relative URLs are not supported.</p>
        </div>

        {/* Auto sync */}
        <div className="flex items-center justify-between py-3 border-t border-surface-100">
          <div>
            <p className="text-sm font-medium text-surface-700">{t.autoSyncLabel}</p>
            <p className="text-xs text-surface-400">{t.autoSyncDesc}</p>
          </div>
          <button onClick={() => setConfig(p => ({ ...p, autoSync: !p.autoSync }))}
            className={`relative w-10 h-5 rounded-full transition-colors ${config.autoSync ? 'bg-brand-500' : 'bg-surface-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.autoSync ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {/* Sync interval */}
        {config.autoSync && (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">{t.syncIntervalLabel}</label>
            <input type="number" min="5" value={config.syncIntervalMinutes}
              onChange={e => setConfig(p => ({ ...p, syncIntervalMinutes: parseInt(e.target.value) || 60 }))}
              className="w-32 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
              placeholder={t.syncIntervalPlaceholder} />
          </div>
        )}

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

        <div className="flex items-center gap-2 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {saving ? <><Loader2 size={14} className="animate-spin inline mr-1" /> {t.savingButton}</> : <><Save size={14} className="inline mr-1" /> {t.saveButton}</>}
          </button>
          <button onClick={handleSync} disabled={syncing || !config.enabled || !config.apiUrl}
            className="px-4 py-2 text-sm font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 disabled:opacity-40">
            {syncing ? <><Loader2 size={14} className="animate-spin inline mr-1" /> {t.syncingButton}</> : <><RefreshCw size={14} className="inline mr-1" /> {t.manualSyncButton}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
