// ============================================================================
// RitmReportsView — PulseOps V3 ServiceNow Module
//
// PURPOSE: Standalone view for RITM Reports (volume by priority, catalog item
// breakdown, RITM data grid). Extracted from ServiceNowReports.
//
// USED BY: manifest.jsx → getViews().ritmReports
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';

const log = createLogger('RitmReportsView');
const t   = uiText.reports;

const snApi = { reportRitms: '/api/servicenow/reports/ritms' };

function BreakdownTable({ title, data, loading }) {
  const entries = data ? Object.entries(data) : [];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
        <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">{title}</p>
      </div>
      {loading ? (
        <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-5 bg-surface-100 rounded animate-pulse" />)}</div>
      ) : entries.length === 0 ? (
        <div className="p-6 text-center text-sm text-surface-400">{t.noData}</div>
      ) : (
        <div className="divide-y divide-surface-50">
          {entries.map(([key, count]) => (
            <div key={key} className="flex items-center justify-between px-5 py-2.5">
              <span className="text-sm text-surface-700">{key}</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-400 rounded-full" style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
                </div>
                <span className="text-xs font-bold text-surface-600 w-8 text-right">{count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataGrid({ columns, rows, loading }) {
  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 size={20} className="text-brand-400 animate-spin" /></div>;
  if (!rows || rows.length === 0) return <div className="p-8 text-center text-sm text-surface-400">{t.noData}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-50 border-b border-surface-200">
            {columns.map(col => (
              <th key={col.key} className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide whitespace-nowrap">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface-50/50 transition-colors">
              {columns.map(col => (
                <td key={col.key} className="px-4 py-2.5 text-surface-700 text-xs whitespace-nowrap">{row[col.key] ?? uiText.common.na}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RITM_GRID_COLS = [
  { key: 'number', label: 'Number' },
  { key: 'shortDescription', label: 'Description' },
  { key: 'priority', label: 'Priority' },
  { key: 'state', label: 'State' },
  { key: 'catalogItem', label: 'Catalog Item' },
  { key: 'openedAt', label: 'Opened' },
];

export default function RitmReportsView() {
  const [ritmData, setRitmData] = useState(null);
  const initRan = useRef(false);

  const fetchRitms = useCallback(async () => {
    try {
      const res = await ApiClient.get(snApi.reportRitms);
      if (res?.success) setRitmData(res.data);
    } catch (err) {
      log.error('fetchRitms', 'Failed', { error: err.message });
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    fetchRitms();
  }, [fetchRitms]);

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-800">RITM Reports</h2>
        <button onClick={fetchRitms} className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BreakdownTable title="By Priority" data={ritmData?.byPriority} loading={!ritmData} />
        <BreakdownTable title="By Catalog Item" data={ritmData?.byCatalogItem} loading={!ritmData} />
      </div>
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">RITM Details</p>
          <span className="text-xs text-surface-400">{ritmData?.totalCount ?? 0} records</span>
        </div>
        <DataGrid columns={RITM_GRID_COLS} rows={ritmData?.ritms} loading={!ritmData} />
      </div>
    </div>
  );
}
