// ============================================================================
// TimezoneView — PulseOps V3 Core Admin View
//
// PURPOSE: Global timezone configuration. Allows the admin to select the
// display timezone used across all modules. All dates are stored in UTC
// in the database. UI components convert UTC to the selected timezone.
//
// ROUTE: /platform_admin/timezone
//
// DEPENDENCIES:
//   - @shared → TimezoneService, createLogger
//   - @config/urls.json → timezone API endpoints
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Globe, Save, Loader2, CheckCircle2, AlertCircle, Clock, Search,
} from 'lucide-react';
import { TimezoneService, createLogger } from '@shared';
import urls from '@config/urls.json';

const log = createLogger('TimezoneView.jsx');

export default function TimezoneView() {
  const [timezones, setTimezones] = useState([]);
  const [selectedTz, setSelectedTz] = useState('');
  const [currentLabel, setCurrentLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingTz, setPendingTz] = useState('');
  const initRan = useRef(false);
  const timerRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [tzRes, listRes] = await Promise.all([
        fetch(urls.timezone.get).then(r => r.json()),
        fetch(urls.timezone.list).then(r => r.json()),
      ]);
      if (tzRes?.success && tzRes.data?.timezone) {
        setSelectedTz(tzRes.data.timezone);
        setCurrentLabel(tzRes.data.timezoneLabel || '');
      }
      if (listRes?.success && listRes.data) {
        setTimezones(listRes.data);
      }
    } catch (err) {
      log.error('loadData', 'Failed', { error: err.message });
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

  // Update live clock every second
  useEffect(() => {
    const updateClock = () => {
      if (!selectedTz) return;
      try {
        const now = new Date();
        const formatted = new Intl.DateTimeFormat('en-IN', {
          timeZone: selectedTz,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
          weekday: 'long',
        }).format(now);
        setCurrentTime(formatted);
      } catch {
        setCurrentTime(new Date().toLocaleString());
      }
    };
    updateClock();
    timerRef.current = setInterval(updateClock, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [selectedTz]);

  const handleSaveClick = useCallback(() => {
    setPendingTz(selectedTz);
    setShowConfirmation(true);
  }, [selectedTz]);

  const confirmSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(urls.timezone.save, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ timezone: pendingTz }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(json.message || 'Timezone saved successfully.');
        setCurrentLabel(json.data?.timezoneLabel || '');
        // Update the global TimezoneService immediately
        TimezoneService.setTimezone(json.data?.timezone, json.data?.timezoneLabel);
        await TimezoneService.refresh();
        setShowConfirmation(false);
        setShowModal(false);
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError(json.error?.message || 'Failed to save timezone.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [pendingTz]);

  const filteredTimezones = timezones.filter(tz =>
    tz.label.toLowerCase().includes(search.toLowerCase()) ||
    tz.value.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-brand-500" size={24} />
        <span className="ml-2 text-surface-500">Loading timezone configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-xl">
          <Globe size={20} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-surface-800">Global Timezone Configuration</h2>
          <p className="text-sm text-surface-500">
            Set the display timezone for all modules. All dates are stored in UTC and converted for display.
          </p>
        </div>
      </div>

      {/* Messages */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span className="text-sm text-emerald-700">{success}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={16} className="text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* Current Timezone Card */}
      <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-surface-800 flex items-center gap-2">
            <Clock size={14} className="text-blue-500" />
            Current Timezone
            <span className="text-blue-600 font-mono font-bold bg-blue-50 px-2 py-0.5 rounded text-xs">
              {currentLabel || selectedTz}
            </span>
          </h3>
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Globe size={12} />
            Select Timezone
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-surface-400 mb-1">Selected Timezone</p>
            <p className="text-sm font-mono font-medium text-surface-700">{selectedTz}</p>
          </div>
          <div>
            <p className="text-xs text-surface-400 mb-1">Current Time</p>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-blue-500" />
              <p className="text-sm font-medium text-surface-700">{currentTime}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Timezone Selector Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-surface-800">Select Timezone</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-surface-400 hover:text-surface-600 transition-colors"
              >
                <span className="text-2xl">×</span>
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search timezones..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-300 focus:border-brand-400 outline-none"
              />
            </div>

            {/* Timezone Grid (2 columns: Timezone | Current Time) */}
            <div className="border border-surface-100 rounded-lg overflow-hidden">
              {/* Grid Header */}
              <div className="grid grid-cols-2 divide-x bg-surface-50 border-b border-surface-100 sticky top-0">
                <div className="px-4 py-2.5 text-xs font-bold text-surface-600">Timezone</div>
                <div className="px-4 py-2.5 text-xs font-bold text-surface-600">Current Time</div>
              </div>
              
              {/* Grid Rows */}
              <div className="divide-y divide-surface-100 max-h-96 overflow-y-auto">
                {filteredTimezones.map(tz => {
                  const isSelected = tz.value === selectedTz;
                  const now = new Date();
                  const tzTime = new Intl.DateTimeFormat('en-IN', {
                    timeZone: tz.value,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true,
                  }).format(now);
                  
                  return (
                    <button
                      key={tz.value}
                      onClick={() => setSelectedTz(tz.value)}
                      className={`grid grid-cols-2 divide-x w-full transition-colors
                        ${isSelected
                          ? 'bg-brand-50'
                          : 'hover:bg-surface-50'
                        }`}
                    >
                      <div className="px-4 py-3 text-left">
                        <p className={`text-sm font-medium ${isSelected ? 'text-brand-700' : 'text-surface-700'}`}>
                          {tz.label}
                        </p>
                        <p className="text-xs text-surface-400 font-mono mt-0.5">{tz.value}</p>
                      </div>
                      
                      <div className="px-4 py-3 flex items-center justify-between">
                        <p className={`text-sm font-bold ${isSelected ? 'text-brand-700' : 'text-surface-700'}`}>
                          {tzTime}
                        </p>
                        {isSelected && (
                          <CheckCircle2 size={16} className="text-brand-500 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              {filteredTimezones.length === 0 && (
                <p className="text-sm text-surface-400 text-center py-8">No timezones match your search.</p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-surface-700 bg-surface-100 rounded-lg hover:bg-surface-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveClick}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 shadow-sm transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Save Timezone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Globe size={20} className="text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-surface-800">Confirm Timezone Change</h3>
            </div>

            <p className="text-sm text-surface-600 mb-6">
              Are you sure you want to change the timezone to <span className="font-bold text-surface-800">{pendingTz}</span>?<br /><br/>
              This will affect how all dates and times are displayed across the platform.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmation(false)}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-surface-700 bg-surface-100 rounded-lg hover:bg-surface-200 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 shadow-sm transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {saving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
