// ============================================================================
// SLATargetsTab — HealthCheck Module Config
//
// PURPOSE: View and override monthly SLA targets per application. Apps without
// an override use their configured default SLA target %.
//
// USED BY: manifest.jsx → getConfigTabs()
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, CheckCircle2, AlertCircle, Save, Target,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../../config/uiText.json';
import urls from '../../config/urls.json';

const log = createLogger('SLATargetsTab.jsx');
const t = uiText.slaTargets;
const api = urls.api;

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function SLATargetsTab() {
  const [targets, setTargets] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editValues, setEditValues] = useState({});
  const initRan = useRef(false);

  const loadData = useCallback(async (m) => {
    setLoading(true);
    try {
      const res = await ApiClient.get(`${api.slaTargets}?month=${m || month}`);
      if (res?.success) setTargets(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadData();
  }, [loadData]);

  const handleMonthChange = (val) => {
    setMonth(val);
    loadData(val);
  };

  const handleSave = useCallback(async (appId) => {
    const val = editValues[appId];
    if (val === undefined || val === null) return;
    setSavingId(appId);
    setError(null);
    try {
      const res = await ApiClient.put(api.slaTargetById.replace('{id}', appId), {
        month,
        sla_target_percent: parseFloat(val),
      });
      if (res?.success) {
        setSuccess(res.message);
        setTimeout(() => setSuccess(null), 3000);
        await loadData();
        setEditValues(p => { const n = { ...p }; delete n[appId]; return n; });
      } else {
        setError(res?.error?.message || 'Save failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }, [editValues, month, loadData]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-surface-800">{t.title}</h3>
          <p className="text-xs text-surface-500">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-surface-600">{t.monthLabel}</label>
          <input type="month" value={month} onChange={e => handleMonthChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none" />
        </div>
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-brand-500" size={24} />
        </div>
      ) : targets.length === 0 ? (
        <div className="text-center py-12 text-sm text-surface-400">{t.noTargets}</div>
      ) : (
        <div className="overflow-x-auto border border-surface-200 rounded-xl">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.grid.application}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-surface-600">{t.grid.url}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.defaultTarget}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.monthTarget}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.isOverride}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-surface-600">{t.grid.actions}</th>
              </tr>
            </thead>
            <tbody>
              {targets.map(row => (
                <tr key={row.applicationId} className="border-b border-surface-100 hover:bg-surface-50/50">
                  <td className="px-3 py-2.5 font-medium text-surface-800">{row.appName}</td>
                  <td className="px-3 py-2.5 text-surface-500 max-w-[200px] truncate">{row.appUrl}</td>
                  <td className="px-3 py-2.5 text-center">{row.slaTargetPercent}%</td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="number" step="0.01" min="0" max="100"
                      value={editValues[row.applicationId] !== undefined ? editValues[row.applicationId] : row.slaTargetPercent}
                      onChange={e => setEditValues(p => ({ ...p, [row.applicationId]: e.target.value }))}
                      className="w-20 px-2 py-1 text-xs text-center border border-surface-200 rounded focus:ring-1 focus:ring-brand-200 outline-none" />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {row.isOverride
                      ? <span className="text-amber-600 font-medium">Yes</span>
                      : <span className="text-surface-300">No</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => handleSave(row.applicationId)}
                      disabled={savingId === row.applicationId || editValues[row.applicationId] === undefined}
                      className="px-2 py-1 text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded hover:bg-brand-100 disabled:opacity-40">
                      {savingId === row.applicationId
                        ? <Loader2 size={12} className="animate-spin inline" />
                        : <><Save size={10} className="inline mr-0.5" /> {t.saveButton}</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
