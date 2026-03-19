// ============================================================================
// PollerConfigTab — HealthCheck Module Config
//
// PURPOSE: Configure the background health poller — interval, timeout, retry.
// Also shows live poller status with start/stop/poll-now controls.
//
// USED BY: manifest.jsx → getConfigTabs()
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Timer, Play, Pause, RefreshCw, Loader2, CheckCircle2,
  AlertCircle, Save, Zap, Clock, RotateCcw,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../../config/uiText.json';
import urls from '../../config/urls.json';

const log = createLogger('PollerConfigTab.jsx');
const t = uiText.pollerConfig;
const api = urls.api;

export default function PollerConfigTab() {
  const [config, setConfig] = useState({ enabled: false, intervalSeconds: 60, timeoutMs: 10000, retryOnFailure: false, maxRetries: 1 });
  const [pollerStatus, setPollerStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const initRan = useRef(false);

  const loadConfig = useCallback(async () => {
    try {
      const [configRes, statusRes] = await Promise.all([
        ApiClient.get(api.configPoller),
        ApiClient.get(api.pollerStatus),
      ]);
      if (configRes?.success) setConfig(configRes.data);
      if (statusRes?.success) setPollerStatus(statusRes.data);
    } catch (err) {
      log.error('loadConfig', 'Failed', { error: err.message });
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
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await ApiClient.put(api.configPoller, config);
      if (res?.success) {
        setSuccess(res.message || uiText.common.saving);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(res?.error?.message || 'Save failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handlePollerAction = useCallback(async (action) => {
    setActionLoading(action);
    setError(null);
    try {
      let res;
      if (action === 'start') res = await ApiClient.post(api.pollerStart);
      else if (action === 'stop') res = await ApiClient.post(api.pollerStop);
      else if (action === 'pollNow') res = await ApiClient.post(api.pollerPollNow);

      if (res?.success) {
        setSuccess(res.message);
        setTimeout(() => setSuccess(null), 3000);
        // Refresh status
        const statusRes = await ApiClient.get(api.pollerStatus);
        if (statusRes?.success) setPollerStatus(statusRes.data);
      } else {
        setError(res?.error?.message || 'Action failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-brand-500" size={24} />
        <span className="ml-2 text-surface-500">{uiText.common.loading}</span>
      </div>
    );
  }

  const isRunning = pollerStatus?.isRunning;

  return (
    <div className="space-y-6">
      {/* Poller Status Card */}
      <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isRunning ? 'bg-emerald-100' : 'bg-surface-100'}`}>
              {isRunning ? <Play size={16} className="text-emerald-600" /> : <Pause size={16} className="text-surface-400" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-surface-800">{t.pollerStatus.title}</h3>
              <span className={`text-xs font-medium ${isRunning ? 'text-emerald-600' : 'text-surface-400'}`}>
                {isRunning ? t.pollerStatus.running : t.pollerStatus.stopped}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button onClick={() => handlePollerAction('stop')} disabled={!!actionLoading}
                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                {actionLoading === 'stop' ? <Loader2 size={12} className="animate-spin inline mr-1" /> : <Pause size={12} className="inline mr-1" />}
                {actionLoading === 'stop' ? t.pollerStatus.stoppingButton : t.pollerStatus.stopButton}
              </button>
            ) : (
              <button onClick={() => handlePollerAction('start')} disabled={!!actionLoading}
                className="px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50">
                {actionLoading === 'start' ? <Loader2 size={12} className="animate-spin inline mr-1" /> : <Play size={12} className="inline mr-1" />}
                {actionLoading === 'start' ? t.pollerStatus.startingButton : t.pollerStatus.startButton}
              </button>
            )}
            <button onClick={() => handlePollerAction('pollNow')} disabled={!!actionLoading}
              className="px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 disabled:opacity-50">
              {actionLoading === 'pollNow' ? <Loader2 size={12} className="animate-spin inline mr-1" /> : <Zap size={12} className="inline mr-1" />}
              {actionLoading === 'pollNow' ? t.pollerStatus.pollingButton : t.pollerStatus.pollNowButton}
            </button>
          </div>
        </div>
        {pollerStatus && (
          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-surface-100">
            <div>
              <p className="text-xs text-surface-400">{t.pollerStatus.lastPoll}</p>
              <p className="text-sm font-medium text-surface-700">{pollerStatus.lastPollTime || t.pollerStatus.notStarted}</p>
            </div>
            <div>
              <p className="text-xs text-surface-400">{t.pollerStatus.pollCount}</p>
              <p className="text-sm font-medium text-surface-700">{pollerStatus.pollCount || 0}</p>
            </div>
            <div>
              <p className="text-xs text-surface-400">{t.pollerStatus.lastResult}</p>
              {pollerStatus.lastPollResults ? (
                <p className="text-sm font-medium">
                  <span className="text-emerald-600">{pollerStatus.lastPollResults.up} UP</span>
                  {' / '}
                  <span className="text-red-600">{pollerStatus.lastPollResults.down} DOWN</span>
                </p>
              ) : (
                <p className="text-sm text-surface-400">—</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Configuration Form */}
      <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-surface-800">{t.title}</h3>
        <p className="text-xs text-surface-500 -mt-3">{t.subtitle}</p>

        {/* Enabled toggle */}
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

        {/* Interval */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">{t.intervalLabel}</label>
          <p className="text-xs text-surface-400 mb-2">{t.intervalDesc}</p>
          <input type="number" min="10" max="3600" value={config.intervalSeconds}
            onChange={e => setConfig(p => ({ ...p, intervalSeconds: parseInt(e.target.value) || 60 }))}
            className="w-40 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
            placeholder={t.intervalPlaceholder} />
        </div>

        {/* Timeout */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">{t.timeoutLabel}</label>
          <p className="text-xs text-surface-400 mb-2">{t.timeoutDesc}</p>
          <input type="number" min="1000" max="60000" value={config.timeoutMs}
            onChange={e => setConfig(p => ({ ...p, timeoutMs: parseInt(e.target.value) || 10000 }))}
            className="w-40 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
            placeholder={t.timeoutPlaceholder} />
        </div>

        {/* Retry */}
        <div className="flex items-center justify-between py-3 border-t border-surface-100">
          <div>
            <p className="text-sm font-medium text-surface-700">{t.retryLabel}</p>
            <p className="text-xs text-surface-400">{t.retryDesc}</p>
          </div>
          <button onClick={() => setConfig(p => ({ ...p, retryOnFailure: !p.retryOnFailure }))}
            className={`relative w-10 h-5 rounded-full transition-colors ${config.retryOnFailure ? 'bg-brand-500' : 'bg-surface-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.retryOnFailure ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {/* Alerts */}
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

        {/* Save button */}
        <div className="pt-2">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
            {saving ? <><Loader2 size={14} className="animate-spin inline mr-1" /> {t.savingButton}</> : <><Save size={14} className="inline mr-1" /> {t.saveButton}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
