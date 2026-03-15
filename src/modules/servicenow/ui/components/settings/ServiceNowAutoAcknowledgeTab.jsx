// ============================================================================
// ServiceNowAutoAcknowledgeTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Configuration UI for Incident Auto Acknowledge feature.
//   - Enable/disable auto acknowledge with toggle
//   - Configure acknowledge message template
//   - Configure poll frequency (minutes)
//   - Show SetupRequiredOverlay when not configured
//   - Manual poll trigger button
//   - Today's auto acknowledged incidents log grid
//
// USED BY: manifest.jsx → getConfigTabs() → Incident Configuration section
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare, Loader2, CheckCircle2, AlertCircle,
  Clock, RefreshCw, Save, Power, Info,
} from 'lucide-react';
import { createLogger, useConfigLayout } from '@shared';
import { ToggleSwitch, PageSpinner } from '@components';
import ApiClient from '@shared/services/apiClient';

const log = createLogger('ServiceNowAutoAcknowledgeTab');

const snApi = {
  config: '/api/servicenow/config/auto-acknowledge',
  poll: '/api/servicenow/auto-acknowledge/poll',
  logToday: '/api/servicenow/auto-acknowledge/log',
};

const DEFAULT_CONFIG = { enabled: false, message: '', pollFrequencyMinutes: 5 };

export default function ServiceNowAutoAcknowledgeTab() {
  const { navigateToTab } = useConfigLayout();
  const initRan = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [statusBanner, setStatusBanner] = useState(null);
  const [logEntries, setLogEntries] = useState([]);
  const [logLoading, setLogLoading] = useState(false);

  // ── Load config and today's log ─────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    try {
      const res = await ApiClient.get(snApi.config);
      if (res?.success) {
        setConfig({ ...DEFAULT_CONFIG, ...(res.data || {}) });
      }
    } catch (err) {
      log.error('loadConfig', 'Failed to load config', { error: err.message });
    }
  }, []);

  const loadTodayLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await ApiClient.get(snApi.logToday);
      if (res?.success) {
        setLogEntries(res.data || []);
      }
    } catch (err) {
      log.error('loadTodayLog', 'Failed to load log', { error: err.message });
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    (async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadTodayLog()]);
      setLoading(false);
    })();
  }, [loadConfig, loadTodayLog]);

  // ── Save config ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatusBanner(null);
    try {
      const res = await ApiClient.put(snApi.config, config);
      if (res?.success) {
        setStatusBanner({ success: true, message: 'Auto acknowledge configuration saved.' });
        if (res.data) setConfig({ ...DEFAULT_CONFIG, ...res.data });
      } else {
        throw new Error(res?.error?.message || 'Save failed.');
      }
    } catch (err) {
      setStatusBanner({ success: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }, [config]);

  // ── Toggle enabled ──────────────────────────────────────────────────────
  const handleToggle = useCallback(async () => {
    const newEnabled = !config.enabled;
    // If enabling, require message to be set
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
        setStatusBanner({ success: true, message: `Auto acknowledge ${newEnabled ? 'enabled' : 'disabled'}.` });
        if (res.data) setConfig({ ...DEFAULT_CONFIG, ...res.data });
      } else {
        // Revert
        setConfig(prev => ({ ...prev, enabled: !newEnabled }));
        throw new Error(res?.error?.message || 'Toggle failed.');
      }
    } catch (err) {
      setStatusBanner({ success: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }, [config]);

  // ── Manual poll ─────────────────────────────────────────────────────────
  const handlePoll = useCallback(async () => {
    setPolling(true);
    setStatusBanner(null);
    try {
      const res = await ApiClient.post(snApi.poll);
      if (res?.success) {
        const d = res.data || {};
        setStatusBanner({
          success: true,
          message: `Poll complete: ${d.totalNew || 0} new incidents found, ${d.acknowledged || 0} acknowledged, ${d.skipped || 0} skipped, ${d.failed || 0} failed.`,
        });
        await loadTodayLog();
      } else {
        throw new Error(res?.error?.message || 'Poll failed.');
      }
    } catch (err) {
      setStatusBanner({ success: false, message: err.message });
    } finally {
      setPolling(false);
    }
  }, [loadTodayLog]);

  // ── Check if configured ─────────────────────────────────────────────────
  const isConfigured = config.message && config.message.trim().length > 0;

  if (loading) {
    return <PageSpinner modal message="Loading auto acknowledge configuration..." />;
  }

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
            <p className="text-xs text-surface-500">Automatically acknowledge new incidents with a configured message.</p>
          </div>
        </div>
        {isConfigured && (
          <div className="flex items-center gap-3">
            <button
              onClick={handlePoll}
              disabled={polling || !config.enabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
            >
              {polling ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Poll Now
            </button>
          </div>
        )}
      </div>

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
            <p className="text-xs text-surface-400">When enabled, PulseOps will poll ServiceNow for new incidents and auto-acknowledge them.</p>
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
            placeholder="Enter the message to post as a comment on new incidents..."
          />
          <p className="text-[10px] text-surface-400 mt-1">This message will be posted as a work note (comment) on each new incident.</p>
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
          <p className="text-[10px] text-surface-400 mt-1">How often PulseOps polls ServiceNow for new incidents (1–1440 minutes).</p>
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
        </div>
      </div>

      {/* Today's Auto Acknowledged Incidents */}
      {isConfigured && (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200 bg-surface-50">
            <h3 className="text-sm font-bold text-surface-800 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" />
              Today's Auto Acknowledged Incidents
            </h3>
            <button
              onClick={loadTodayLog}
              disabled={logLoading}
              className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700 transition-colors"
            >
              {logLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh
            </button>
          </div>
          {logEntries.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-surface-400">No incidents auto-acknowledged today.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200">
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Incident</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Description</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Priority</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody>
                {logEntries.map((entry, idx) => (
                  <tr key={entry.id || idx} className="border-b border-surface-100 hover:bg-surface-50/50 transition-colors">
                    <td className="px-4 py-2.5 text-xs font-mono font-semibold text-brand-700">{entry.incident_number}</td>
                    <td className="px-4 py-2.5 text-xs text-surface-600 max-w-[250px] truncate">{entry.short_description || '—'}</td>
                    <td className="px-4 py-2.5 text-center text-xs text-surface-600">{entry.priority || '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        entry.status === 'success'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {entry.status === 'success' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                        {entry.status === 'success' ? 'Acknowledged' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-surface-500">
                      {entry.acknowledged_at ? new Date(entry.acknowledged_at).toLocaleTimeString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

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
