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
  AlertCircle, Save, Zap, Clock, RotateCcw, Trash2,
} from 'lucide-react';
import { createLogger, TimezoneService, ConfirmationModal } from '@shared';
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
  const [nextPollTime, setNextPollTime] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStats, setDeleteStats] = useState(null);
  const [totalPollCount, setTotalPollCount] = useState(0);
  const initRan = useRef(false);
  const pollTimerRef = useRef(null);
  const sseRef = useRef(null);

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

  // Fetch total poll count from database
  const fetchTotalPollCount = useCallback(async () => {
    try {
      const res = await ApiClient.get(api.pollerTotalCount);
      if (res?.success) {
        setTotalPollCount(res.data?.totalCount || 0);
      }
    } catch (err) {
      log.error('fetchTotalPollCount', 'Failed', { error: err.message });
      setTotalPollCount(0);
    }
  }, []);

  // Format time as HH:MM only (no seconds)
  const formatTimeNoSeconds = useCallback((date) => {
    if (!date) return '—';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = date.getHours() >= 12 ? 'pm' : 'am';
    const displayHours = date.getHours() % 12 || 12;
    return `${String(displayHours).padStart(2, '0')}:${minutes} ${ampm}`;
  }, []);

  // Calculate next poll time at start of next minute
  const calculateNextPollTime = useCallback(() => {
    if (!pollerStatus?.isRunning || !pollerStatus?.lastPollTime) return null;
    const lastPoll = new Date(pollerStatus.lastPollTime);
    const interval = config.intervalSeconds || 60;
    const nextPoll = new Date(lastPoll.getTime() + interval * 1000);
    // Round to start of next minute
    nextPoll.setSeconds(0);
    nextPoll.setMilliseconds(0);
    return nextPoll;
  }, [pollerStatus, config.intervalSeconds]);

  // Update next poll time and set up timer
  useEffect(() => {
    const updateNextPoll = () => {
      const nextTime = calculateNextPollTime();
      setNextPollTime(nextTime);
    };
    updateNextPoll();

    // Update every second to show countdown
    if (pollerStatus?.isRunning) {
      pollTimerRef.current = setInterval(updateNextPoll, 1000);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [pollerStatus?.isRunning, calculateNextPollTime]);

  // Connect to SSE stream for real-time poll completion events
  useEffect(() => {
    // Close existing connection if any
    if (sseRef.current) {
      sseRef.current.close();
    }

    const eventSource = new EventSource(`${api.pollEvents}`);
    sseRef.current = eventSource;

    eventSource.onopen = () => {
      log.debug('SSE connection established for poll events');
    };

    eventSource.onmessage = (event) => {
      try {
        const eventData = JSON.parse(event.data);
        
        if (eventData.type === 'poll_complete') {
          log.debug('Poll completion event received', { timestamp: eventData.timestamp });
          // Emit custom browser event for other components to listen
          window.dispatchEvent(new CustomEvent('healthcheck:pollComplete'));
          // Refresh poller status immediately
          loadConfig();
        }
      } catch (err) {
        log.error('Failed to parse SSE event', { error: err.message });
      }
    };

    eventSource.onerror = (err) => {
      log.error('SSE connection error', { error: err.message });
      eventSource.close();
    };

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [loadConfig]);

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
      else if (action === 'deleteData') res = await ApiClient.post(api.pollerDeleteData);

      if (res?.success) {
        setSuccess(res.message);
        setTimeout(() => setSuccess(null), 3000);
        // Refresh status and config
        const [statusRes, configRes] = await Promise.all([
          ApiClient.get(api.pollerStatus),
          ApiClient.get(api.configPoller),
        ]);
        if (statusRes?.success) setPollerStatus(statusRes.data);
        if (configRes?.success) setConfig(configRes.data);
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
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${isRunning ? 'text-emerald-600' : 'text-surface-400'}`}>
                  {isRunning ? t.pollerStatus.running : t.pollerStatus.stopped}
                </span>
                {isRunning && config.pollerStartedAt && (
                  <span className="text-xs text-surface-400">
                    Poller Started at: {formatTimeNoSeconds(new Date(config.pollerStartedAt))}
                  </span>
                )}
              </div>
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
          </div>
        </div>
        {pollerStatus && (
          <div className="pt-3 border-t border-surface-100">
            {/* Single Row: 4 columns with gradient separators */}
            <div className="grid grid-cols-4 gap-0 relative">
              <div className="relative">
                <p className="text-xs text-surface-400">{t.pollerStatus.lastPoll} ({pollerStatus.timezoneLabel || 'IST'})</p>
                <p className="text-sm font-medium text-surface-700">
                  {pollerStatus.lastPollTime ? formatTimeNoSeconds(new Date(pollerStatus.lastPollTime)) : t.pollerStatus.notStarted}
                </p>
              </div>
              <div className="relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-gradient-to-b before:from-transparent before:via-brand-400 before:to-transparent">
                <div className="pl-4">
                  <p className="text-xs text-surface-400">Next Poll at:</p>
                  <p className="text-sm font-medium text-surface-700">
                    {nextPollTime ? formatTimeNoSeconds(nextPollTime) : '—'}
                  </p>
                </div>
              </div>
              <div className="relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-gradient-to-b before:from-transparent before:via-brand-400 before:to-transparent">
                <div className="pl-4">
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
              <div className="relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-gradient-to-b before:from-transparent before:via-brand-400 before:to-transparent">
                <div className="pl-4">
                  <p className="text-xs text-surface-400">Polls Since Start:</p>
                  <p className="text-sm font-medium text-surface-700">{pollerStatus.pollCount || 0}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Poll Data Section */}
      <div className="bg-white rounded-xl border border-red-200 p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-100">
              <Trash2 size={16} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-surface-800">Delete Poll Data</h3>
              <p className="text-xs text-surface-500 mt-1">
                Permanently delete all poll records and reset the poller start time. The poller will be stopped.
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              await fetchTotalPollCount();
              setShowDeleteModal(true);
            }}
            disabled={!!actionLoading}
            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 whitespace-nowrap"
          >
            {actionLoading === 'deleteData' ? (
              <><Loader2 size={12} className="animate-spin inline mr-1" /> Deleting...</>
            ) : (
              <><Trash2 size={12} className="inline mr-1" /> Delete All Data</>
            )}
          </button>
        </div>
      </div>

      {/* Delete Data Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Poll Data"
        actionDescription="permanently delete all poll records"
        actionTarget="Health Check Database"
        actionDetails={[
          { label: 'Total Records in Database', value: `${totalPollCount.toLocaleString()} poll records` },
          { label: 'Poller Status', value: 'Will be stopped' },
          { label: 'Start Time', value: 'Will be reset' },
          { label: 'Action', value: 'Cannot be undone' }
        ]}
        confirmLabel="Delete All Data"
        variant="danger"
        action={async () => {
          const res = await ApiClient.post(api.pollerDeleteData);
          if (res?.success) {
            setDeleteStats({
              recordsDeleted: totalPollCount,
              timestamp: new Date().toISOString(),
              status: 'Completed'
            });
            await loadConfig();
            return { recordsDeleted: totalPollCount };
          }
          throw new Error(res?.error?.message || 'Failed to delete poll data');
        }}
        onSuccess={() => {
          setSuccess('Poll data deleted successfully');
          setShowDeleteModal(false);
        }}
        buildSummary={(data) => [
          { label: 'Records Deleted', value: data.recordsDeleted.toLocaleString() },
          { label: 'Status', value: 'All poll data removed' },
          { label: 'Poller', value: 'Stopped and reset' }
        ]}
      />

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
