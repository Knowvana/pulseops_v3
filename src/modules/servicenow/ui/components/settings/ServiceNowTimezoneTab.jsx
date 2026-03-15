// ============================================================================
// ServiceNowTimezoneTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Configuration tab for timezone settings. Fetches the ServiceNow
// instance timezone, shows a dropdown for mapping to a display timezone,
// and saves the selection to the database. All date/time conversions happen
// in the backend API — the UI simply displays what the API returns.
//
// FLOW:
//   1. On mount, load saved timezone config from DB
//   2. User can fetch ServiceNow timezone from the instance
//   3. User selects a display timezone from dropdown
//   4. Save persists to DB via PUT /api/servicenow/config/timezone
//   5. All report APIs automatically convert dates to the configured timezone
//
// USED BY: manifest.jsx → getConfigTabs() → timezone
//
// DEPENDENCIES:
//   - lucide-react       → Icons
//   - @shared            → createLogger, ApiClient
//   - @components        → PageSpinner
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Globe, RefreshCw, Loader2, AlertCircle, CheckCircle2,
  Save, Clock, Info, ArrowRight, ExternalLink,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { PageSpinner } from '@components';

const log = createLogger('ServiceNowTimezoneTab.jsx');

const snApi = {
  timezoneConfig:    '/api/servicenow/config/timezone',
  timezoneSN:        '/api/servicenow/config/timezone/servicenow',
  timezoneList:      '/api/servicenow/config/timezone/list',
};

export default function ServiceNowTimezoneTab() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [fetchingSN, setFetchingSN]         = useState(false);
  const [resultBanner, setResultBanner]     = useState(null);

  const [serviceNowTimezone, setServiceNowTimezone] = useState(null);
  const [displayTimezone, setDisplayTimezone]         = useState('');
  const [effectiveTimezone, setEffectiveTimezone]     = useState('UTC');
  const [timezoneList, setTimezoneList]               = useState([]);

  const initRan = useRef(false);

  // ── Load saved config + timezone list on mount ────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, listRes] = await Promise.all([
        ApiClient.get(snApi.timezoneConfig),
        ApiClient.get(snApi.timezoneList),
      ]);

      if (configRes?.success) {
        setServiceNowTimezone(configRes.data.serviceNowTimezone || null);
        setDisplayTimezone(configRes.data.displayTimezone || '');
        setEffectiveTimezone(configRes.data.effectiveTimezone || 'UTC');
        log.info('loadConfig', 'Timezone config loaded', configRes.data);
      }

      if (listRes?.success) {
        setTimezoneList(listRes.data.timezones || []);
        log.info('loadConfig', 'Timezone list loaded', { count: listRes.data.timezones?.length });
      }
    } catch (err) {
      log.error('loadConfig', 'Failed to load timezone config', { error: err.message });
      setResultBanner({ success: false, message: `Failed to load timezone config: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadConfig();
  }, [loadConfig]);

  // ── Fetch ServiceNow timezone ─────────────────────────────────────────────
  const handleFetchSNTimezone = useCallback(async () => {
    setFetchingSN(true);
    setResultBanner(null);
    try {
      const res = await ApiClient.get(snApi.timezoneSN);
      if (res?.success) {
        setServiceNowTimezone(res.data.serviceNowTimezone);
        setEffectiveTimezone(res.data.effectiveTimezone || res.data.serviceNowTimezone || 'UTC');
        if (res.data.serviceNowTimezone) {
          setResultBanner({ success: true, message: `ServiceNow timezone detected: ${res.data.serviceNowTimezone}` });
        } else {
          setResultBanner({ success: false, message: 'Could not detect ServiceNow instance timezone. You can manually select a timezone below.' });
        }
        log.info('handleFetchSNTimezone', 'ServiceNow timezone fetched', res.data);
      } else {
        setResultBanner({ success: false, message: res?.error?.message || 'Failed to fetch ServiceNow timezone.' });
      }
    } catch (err) {
      setResultBanner({ success: false, message: err.message || 'Failed to fetch ServiceNow timezone.' });
      log.error('handleFetchSNTimezone', 'Fetch failed', { error: err.message });
    } finally {
      setFetchingSN(false);
    }
  }, []);

  // ── Save timezone config ──────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    setResultBanner(null);
    try {
      const res = await ApiClient.put(snApi.timezoneConfig, {
        displayTimezone: displayTimezone || null,
      });
      if (res?.success) {
        setEffectiveTimezone(res.data.effectiveTimezone || displayTimezone || serviceNowTimezone || 'UTC');
        setResultBanner({ success: true, message: 'Timezone configuration saved successfully. All reports will now display dates in the selected timezone.' });
        log.info('handleSave', 'Timezone config saved', { displayTimezone });
      } else {
        setResultBanner({ success: false, message: res?.error?.message || 'Failed to save timezone configuration.' });
      }
    } catch (err) {
      setResultBanner({ success: false, message: err.message || 'Failed to save timezone configuration.' });
      log.error('handleSave', 'Save failed', { error: err.message });
    } finally {
      setSaving(false);
    }
  }, [displayTimezone, serviceNowTimezone]);

  // ── Current time preview ──────────────────────────────────────────────────
  const [currentTime, setCurrentTime] = useState('');
  useEffect(() => {
    const update = () => {
      try {
        const now = new Date();
        const formatted = now.toLocaleString('en-US', {
          timeZone: effectiveTimezone,
          year: 'numeric', month: 'short', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: true,
        });
        setCurrentTime(formatted);
      } catch {
        setCurrentTime(new Date().toLocaleString());
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [effectiveTimezone]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Modal loading spinner */}
      {loading && <PageSpinner modal message="Loading timezone configuration..." />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
            <Globe size={18} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-surface-800">Timezone Configuration</h2>
            <p className="text-xs text-surface-500">Configure the timezone used for displaying dates and times across all reports.</p>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>
          All date/time conversions are performed by the backend API. The UI displays the timezone-converted values returned by the API.
          If no display timezone is set, the ServiceNow instance timezone is used as the default.
        </span>
      </div>

      {/* Result banner */}
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
          <button onClick={() => setResultBanner(null)} className="p-0.5 rounded hover:bg-black/5 text-surface-400">
            ×
          </button>
        </div>
      )}

      {!loading && (
        <>
          {/* ═══ ServiceNow Instance Timezone ═══════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-surface-700">ServiceNow Instance Timezone</h3>
                <p className="text-xs text-surface-400 mt-0.5">
                  Fetch the timezone configured on your ServiceNow instance.
                </p>
              </div>
              <button
                onClick={handleFetchSNTimezone}
                disabled={fetchingSN}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {fetchingSN ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {fetchingSN ? 'Fetching...' : 'Fetch from ServiceNow'}
              </button>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-50 flex items-center justify-center border border-surface-200">
                  <ExternalLink size={16} className="text-surface-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">Instance Timezone</p>
                  <p className="text-sm font-bold text-surface-800 mt-0.5">
                    {serviceNowTimezone || <span className="text-surface-400 font-normal italic">Not fetched yet — click "Fetch from ServiceNow"</span>}
                  </p>
                </div>
                {serviceNowTimezone && (
                  <div className="text-right">
                    <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wide">Current Time</p>
                    <p className="text-sm font-mono font-semibold text-surface-700 mt-0.5">
                      {(() => {
                        try {
                          const now = new Date();
                          return now.toLocaleString('en-US', {
                            timeZone: serviceNowTimezone,
                            year: 'numeric', month: 'short', day: '2-digit',
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                            hour12: true,
                          });
                        } catch {
                          return new Date().toLocaleString();
                        }
                      })()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ Display Timezone Mapping ═══════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
              <h3 className="text-sm font-bold text-surface-700">Display Timezone</h3>
              <p className="text-xs text-surface-400 mt-0.5">
                Select the timezone for displaying all dates and times in reports. Leave empty to use the ServiceNow instance timezone.
              </p>
            </div>
            <div className="p-5 space-y-4">
              {/* 2-Column Layout: Dropdown + Live Time */}
              <div className="grid grid-cols-2 gap-4">
                {/* Column 1: Timezone dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1.5">Select Timezone</label>
                  <select
                    value={displayTimezone}
                    onChange={(e) => {
                      const newTz = e.target.value;
                      setDisplayTimezone(newTz);
                      // Update effective timezone immediately
                      setEffectiveTimezone(newTz || serviceNowTimezone || 'UTC');
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                  >
                    <option value="">
                      {serviceNowTimezone
                        ? `ServiceNow (${serviceNowTimezone})`
                        : 'Default'}
                    </option>
                    {timezoneList.map(tz => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-surface-400 mt-1">
                    Leave empty to use ServiceNow timezone
                  </p>
                </div>

                {/* Column 2: Live time in selected timezone */}
                <div className="flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-semibold text-surface-600 mb-1.5">Current Time</p>
                    <div className="px-3 py-2 rounded-lg bg-brand-50 border border-brand-200 h-10 flex items-center">
                      <p className="text-sm font-mono font-semibold text-brand-800">{currentTime}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wide">Effective: {effectiveTimezone}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : 'Save Timezone Configuration'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
