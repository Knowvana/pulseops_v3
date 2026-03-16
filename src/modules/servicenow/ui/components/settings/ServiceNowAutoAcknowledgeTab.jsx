// ============================================================================
// ServiceNowAutoAcknowledgeTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Configuration UI for Incident Auto Acknowledge feature.
//   - Enable/disable auto acknowledge with toggle
//   - Configure acknowledge message template
//   - Configure poll frequency (minutes)
//   - Live poller status card (running/stopped, next poll, last result)
//   - Manual poll trigger button
//
// NOTE: Today's auto acknowledged incidents are shown on the Dashboard.
//
// USED BY: manifest.jsx → getConfigTabs() → Incident Configuration section
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare, Loader2, CheckCircle2, AlertCircle,
  Clock, RefreshCw, Save, Info, Activity, Timer, Play, Square,
} from 'lucide-react';
import { createLogger, useConfigLayout } from '@shared';
import { ToggleSwitch, PageSpinner } from '@components';
import ApiClient from '@shared/services/apiClient';

const log = createLogger('ServiceNowAutoAcknowledgeTab');

const snApi = {
  config:  '/api/servicenow/config/auto-acknowledge',
  poll:    '/api/servicenow/auto-acknowledge/poll',
  status:  '/api/servicenow/auto-acknowledge/status',
};

const DEFAULT_CONFIG = { enabled: false, message: '', pollFrequencyMinutes: 5 };

export default function ServiceNowAutoAcknowledgeTab() {
  const { navigateToTab } = useConfigLayout();
  const initRan      = useRef(false);
  const statusTimer  = useRef(null);

  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [polling, setPolling]           = useState(false);
  const [config, setConfig]             = useState(DEFAULT_CONFIG);
  const [pollerStatus, setPollerStatus] = useState(null);
  const [statusBanner, setStatusBanner] = useState(null);

  // ── Load config ──────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    try {
      const res = await ApiClient.get(snApi.config);
      if (res?.success) setConfig({ ...DEFAULT_CONFIG, ...(res.data || {}) });
    } catch (err) {
      log.error('loadConfig', 'Failed to load config', { error: err.message });
    }
  }, []);

  // ── Load poller status ───────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    try {
      const res = await ApiClient.get(snApi.status);
      if (res?.success) setPollerStatus(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    (async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadStatus()]);
      setLoading(false);
    })();
  }, [loadConfig, loadStatus]);

  // Auto-refresh status every 30 seconds while tab is open
  useEffect(() => {
    statusTimer.current = setInterval(loadStatus, 30_000);
    return () => clearInterval(statusTimer.current);
  }, [loadStatus]);

  // ── Save config ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatusBanner(null);
    try {
      const res = await ApiClient.put(snApi.config, config);
      if (res?.success) {
        setStatusBanner({ success: true, message: 'Auto acknowledge configuration saved. Poller restarted.' });
        if (res.data) setConfig({ ...DEFAULT_CONFIG, ...res.data });
        await loadStatus();
      } else {
        throw new Error(res?.error?.message || 'Save failed.');
      }
    } catch (err) {
      setStatusBanner({ success: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }, [config, loadStatus]);

  // ── Toggle enabled ───────────────────────────────────────────────────────
  const handleToggle = useCallback(async () => {
    const newEnabled = !config.enabled;
    if (newEnabled && (!config.message || !config.message.trim())) {
      setStatusBanner({ success: false, message: 'Please enter an acknowledge message before enabling.' });
      return;
    }
    setConfig(prev => ({ ...prev, enabled: newEnabled }));
    setSaving(true);
    setStatusBanner(null);
    try {
      const res = await ApiClient.put(snApi.config, { ...config, enabled: newEnabled });
      if (res?.success) {
        setStatusBanner({ success: true, message: `Auto acknowledge ${newEnabled ? 'enabled — poller started' : 'disabled — poller stopped'}.` });
        if (res.data) setConfig({ ...DEFAULT_CONFIG, ...res.data });
        await loadStatus();
      } else {
        setConfig(prev => ({ ...prev, enabled: !newEnabled }));
        throw new Error(res?.error?.message || 'Toggle failed.');
      }
    } catch (err) {
      setStatusBanner({ success: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }, [config, loadStatus]);

  // ── Manual poll ──────────────────────────────────────────────────────────
  const handlePoll = useCallback(async () => {
    setPolling(true);
    setStatusBanner(null);
    try {
      const res = await ApiClient.post(snApi.poll);
      if (res?.success) {
        const d = res.data || {};
        setStatusBanner({
          success: true,
          message: `Poll complete: ${d.totalNew || 0} new, ${d.acknowledged || 0} acknowledged, ${d.skipped || 0} skipped, ${d.failed || 0} failed.`,
        });
        await loadStatus();
      } else {
        throw new Error(res?.error?.message || 'Poll failed.');
      }
    } catch (err) {
      setStatusBanner({ success: false, message: err.message });
    } finally {
      setPolling(false);
    }
  }, [loadStatus]);

  const isConfigured = !!(config.message?.trim());

  if (loading) return <PageSpinner modal message="Loading auto acknowledge configuration..." />;

  const lastResult = pollerStatus?.lastPollResult;

  return (
    <div className="relative space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
            <MessageSquare size={18} className="text-brand-600" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-bold text-surface-800">Incident Auto Acknowledge</h2>
              {!isConfigured && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  <AlertCircle size={10} /> Not Configured — Enter a message below and save
                </span>
              )}
            </div>
            <p className="text-xs text-surface-500">Automatically acknowledge new incidents with a configured message at the configured poll frequency.</p>
          </div>
        </div>
        {isConfigured && config.enabled && (
          <button
            onClick={handlePoll}
            disabled={polling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            {polling ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Poll Now
          </button>
        )}
      </div>

      {/* Poller Status Card */}
      {isConfigured && (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-surface-100 bg-surface-50/50">
            <h3 className="text-sm font-bold text-surface-700 flex items-center gap-2">
              <Activity size={14} className="text-brand-500" />
              Background Poller Status
            </h3>
            <button onClick={loadStatus} className="p-1 rounded text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors" title="Refresh status">
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Running state */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Status</span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${pollerStatus?.running ? 'text-emerald-600' : 'text-surface-400'}`}>
                {pollerStatus?.running
                  ? <><Play size={11} className="text-emerald-500" /> Running</>
                  : <><Square size={11} /> Stopped</>}
              </span>
            </div>
            {/* Poll frequency */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Interval</span>
              <span className="text-xs font-semibold text-surface-700 flex items-center gap-1">
                <Timer size={11} className="text-brand-400" />
                {pollerStatus?.pollFreqMinutes != null ? `${pollerStatus.pollFreqMinutes} min` : `${config.pollFrequencyMinutes} min`}
              </span>
            </div>
            {/* Last poll */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Last Poll</span>
              <span className="text-xs text-surface-600">
                {pollerStatus?.lastPollAt ? new Date(pollerStatus.lastPollAt).toLocaleTimeString() : '—'}
              </span>
            </div>
            {/* Next poll */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Next Poll</span>
              <span className="text-xs text-surface-600">
                {pollerStatus?.nextPollAt ? new Date(pollerStatus.nextPollAt).toLocaleTimeString() : '—'}
              </span>
            </div>
          </div>
          {/* Last poll result */}
          {lastResult && !lastResult.error && (
            <div className="px-5 pb-4 flex items-center gap-4 text-xs text-surface-500 border-t border-surface-100 pt-3">
              <span className="font-semibold text-surface-600">Last Result:</span>
              <span>Found <strong className="text-surface-700">{lastResult.totalNew}</strong> new</span>
              <span>·</span>
              <span className="text-emerald-600 font-semibold">{lastResult.acknowledged} acknowledged</span>
              <span>·</span>
              <span>{lastResult.skipped} skipped</span>
              {lastResult.failed > 0 && <><span>·</span><span className="text-rose-600 font-semibold">{lastResult.failed} failed</span></>}
            </div>
          )}
          {lastResult?.error && (
            <div className="px-5 pb-4 text-xs text-rose-600 border-t border-surface-100 pt-3">
              Last poll error: {lastResult.error}
            </div>
          )}
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6 space-y-5">
        <h3 className="text-sm font-bold text-surface-800 flex items-center gap-2">
          <Info size={14} className="text-brand-500" />
          Configuration
        </h3>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between py-3 border-b border-surface-100">
          <div>
            <p className="text-sm font-semibold text-surface-700">Enabled</p>
            <p className="text-xs text-surface-400">When enabled, PulseOps polls ServiceNow for new (state=New) incidents and auto-acknowledges them at the configured interval.</p>
          </div>
          <ToggleSwitch
            checked={config.enabled}
            onChange={handleToggle}
            disabled={saving || !isConfigured}
          />
        </div>

        {/* Acknowledge Message */}
        <div>
          <label className="block text-xs font-bold text-surface-600 uppercase tracking-wider mb-2">
            Acknowledge Message
          </label>
          <textarea
            value={config.message}
            onChange={e => setConfig(prev => ({ ...prev, message: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 resize-none"
            placeholder="Enter the message to post as a work note on new incidents..."
          />
          <p className="text-[10px] text-surface-400 mt-1">
            Posted as a work note on each new incident. Incidents already containing this message are skipped.
          </p>
        </div>

        {/* Poll Frequency */}
        <div>
          <label className="block text-xs font-bold text-surface-600 uppercase tracking-wider mb-2">
            Poll Frequency (Minutes)
          </label>
          <input
            type="number"
            min="1"
            max="1440"
            value={config.pollFrequencyMinutes}
            onChange={e => setConfig(prev => ({ ...prev, pollFrequencyMinutes: parseInt(e.target.value, 10) || 5 }))}
            className="w-32 px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
          />
          <p className="text-[10px] text-surface-400 mt-1">How often PulseOps polls ServiceNow (1–1440 minutes). Poller restarts on save.</p>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          <p className="text-[10px] text-surface-400">Today's acknowledged incidents are shown on the Dashboard.</p>
        </div>
      </div>

      {/* Status Banner */}
      {statusBanner && (
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs border ${
          statusBanner.success
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {statusBanner.success ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          <span>{statusBanner.message}</span>
          <button onClick={() => setStatusBanner(null)} className="ml-auto text-surface-400 hover:text-surface-600">×</button>
        </div>
      )}

      {/* Polling overlay */}
      {polling && (
        <div className="absolute inset-0 z-40 flex items-center justify-center backdrop-blur-sm rounded-2xl">
          <div className="flex flex-col items-center gap-3 bg-white px-6 py-4 rounded-xl shadow-xl border-2 border-brand-200 ring-4 ring-brand-100">
            <Loader2 size={28} className="animate-spin text-brand-600" />
            <span className="text-sm font-medium text-surface-700">Polling ServiceNow for new incidents...</span>
          </div>
        </div>
      )}
    </div>
  );
}
