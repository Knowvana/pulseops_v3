// ============================================================================
// SlaComplianceView — PulseOps V3 ServiceNow Module
//
// PURPOSE: Standalone view for SLA Compliance reporting (incident + RITM SLA
// compliance tables). Extracted from ServiceNowReports.
//
// USED BY: manifest.jsx → getViews().slaCompliance
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';

const log = createLogger('SlaComplianceView');
const t   = uiText.reports;

const snApi = { reportSla: '/api/servicenow/reports/sla' };

function SlaComplianceGrid({ slaData, loading }) {
  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 size={20} className="text-brand-400 animate-spin" /></div>;
  const entries = slaData?.byPriority ? Object.entries(slaData.byPriority) : [];
  if (entries.length === 0) return <div className="p-8 text-center text-sm text-surface-400">{t.noData}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-50 border-b border-surface-200">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase">Priority</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase">Met</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase">Breached</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase">Compliance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-50">
          {entries.map(([priority, data]) => (
            <tr key={priority} className="hover:bg-surface-50/50">
              <td className="px-4 py-2.5 font-medium text-surface-700">{priority}</td>
              <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold">{data.resolutionMet}</td>
              <td className="px-4 py-2.5 text-right text-rose-600 font-semibold">{data.resolutionBreached}</td>
              <td className="px-4 py-2.5 text-right">
                {data.resolutionCompliance != null ? (
                  <span className={`inline-flex items-center gap-1 text-xs font-bold ${data.resolutionCompliance >= 90 ? 'text-emerald-600' : data.resolutionCompliance >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {data.resolutionCompliance}%
                    {data.resolutionCompliance >= 90 ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  </span>
                ) : uiText.common.na}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SlaComplianceView() {
  const [slaData, setSlaData] = useState(null);
  const initRan = useRef(false);

  const fetchSla = useCallback(async () => {
    try {
      const res = await ApiClient.get(snApi.reportSla);
      if (res?.success) setSlaData(res.data);
    } catch (err) {
      log.error('fetchSla', 'Failed', { error: err.message });
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    fetchSla();
  }, [fetchSla]);

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-800">SLA Compliance</h2>
        <button onClick={fetchSla} className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">Incident SLA Compliance</p>
        </div>
        <SlaComplianceGrid slaData={slaData?.incidentSla} loading={!slaData} />
      </div>
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">RITM SLA Compliance</p>
        </div>
        <SlaComplianceGrid slaData={slaData?.ritmSla} loading={!slaData} />
      </div>
    </div>
  );
}
