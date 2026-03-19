// ============================================================================
// DowntimeView — HealthCheck Module
//
// PURPOSE: Planned downtime analysis — maintenance windows fetched LIVE from
// the ServiceNow module API (no local DB table). The HC backend proxies the
// SNOW planned-downtime API with startDate/endDate, and SNOW returns records
// with _start_time, _end_time, change_request, number, etc.
//
// USED BY: manifest.jsx → getViews() → downtime
// ============================================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  CalendarRange, Loader2, RefreshCw, AlertCircle, CheckCircle2,
  X, Download, Settings,
  Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Lock, GripVertical,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import urls from '../config/urls.json';

const log = createLogger('DowntimeView.jsx');
const t = uiText.downtime;
const tc = uiText.common;
const api = urls.api;

// ── Mandatory columns — always first, locked ────────────────────────────────
// SNOW API returns: change_request (Change#), number (Task#), short_description, state, assignment_group, etc.
const MANDATORY_COLUMNS = ['change_request', 'number'];
const MANDATORY_LABELS = { change_request: 'Change Request', number: 'Task Number' };

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatColumnLabel(col) {
  if (MANDATORY_LABELS[col]) return MANDATORY_LABELS[col];
  return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const PAGE_SIZES = [10, 25, 50, 100];

export default function DowntimeView() {
  const [month, setMonth] = useState(currentMonth());
  const [plannedData, setPlannedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Grid state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCol, setSortCol]       = useState(null);
  const [sortDir, setSortDir]       = useState('asc');
  const [page, setPage]             = useState(0);
  const [pageSize, setPageSize]     = useState(25);
  const [colWidths, setColWidths]   = useState({});
  const [colOrder, setColOrder]     = useState(null);

  const resizeRef = useRef(null);
  const dragRef = useRef(null);
  const autoFetched = useRef(false);

  // ── Dynamic columns from SNOW data ──────────────────────────────────────
  // Detect all available columns from the first data fetch, excluding internal meta fields
  const displayColumns = useMemo(() => {
    if (!plannedData || plannedData.length === 0) return [...MANDATORY_COLUMNS];
    // Collect all keys from first record, skip internal meta and downtime computed fields
    const skipKeys = new Set(['sys_id', '_change_type', '_source', '_start_time', '_end_time', '_durMs']);
    const allKeys = Object.keys(plannedData[0]).filter(k => !skipKeys.has(k));
    // Mandatory first, then remaining in order
    const optional = allKeys.filter(c => !MANDATORY_COLUMNS.includes(c));
    return [...MANDATORY_COLUMNS.filter(c => allKeys.includes(c)), ...optional];
  }, [plannedData]);

  const orderedColumns = useMemo(() => {
    if (!colOrder) return displayColumns;
    const optional = colOrder.filter(c => !MANDATORY_COLUMNS.includes(c) && displayColumns.includes(c));
    const remaining = displayColumns.filter(c => !MANDATORY_COLUMNS.includes(c) && !optional.includes(c));
    return [...MANDATORY_COLUMNS.filter(c => displayColumns.includes(c)), ...optional, ...remaining];
  }, [displayColumns, colOrder]);

  // ── Data loading — live from SNOW via HC proxy ──────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await ApiClient.get(`${api.plannedDowntime}?month=${month}`);
      if (res?.success) {
        setPlannedData(res.data || []);
        setSuccess(`${(res.data || []).length} planned downtime entries loaded from ServiceNow.`);
      } else {
        setError(res?.error?.message || 'Failed to fetch planned downtime');
      }
      setPage(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  // ── Auto-fetch on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (autoFetched.current) return;
    autoFetched.current = true;
    loadData();
  }, [loadData]);

  const handleSync = useCallback(async () => {
    setSyncing(true); setError(null);
    try {
      const res = await ApiClient.post(api.plannedDowntimeSync, { month });
      if (res?.success) {
        setPlannedData(res.data || []);
        setSuccess(res.message || `${(res.data || []).length} records synced.`);
        setPage(0);
      } else {
        setError(res?.error?.message || 'Sync failed');
      }
    } catch (err) { setError(err.message); }
    finally { setSyncing(false); }
  }, [month]);

  // ── Total downtime (using _start_time/_end_time from SNOW) ─────────────
  const totalDowntimeMs = useMemo(() => {
    if (!plannedData || plannedData.length === 0) return 0;
    return plannedData.reduce((sum, pd) => {
      const st = pd._start_time ? new Date(pd._start_time) : null;
      const et = pd._end_time ? new Date(pd._end_time) : null;
      const dur = st && et ? et - st : 0;
      return sum + Math.max(0, dur);
    }, 0);
  }, [plannedData]);

  // ── Filtered + sorted data ──────────────────────────────────────────────
  const processedData = useMemo(() => {
    if (!plannedData) return [];
    let rows = plannedData.map(pd => ({
      ...pd,
      _durMs: pd._start_time && pd._end_time ? Math.max(0, new Date(pd._end_time) - new Date(pd._start_time)) : 0,
    }));

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter(r =>
        orderedColumns.some(col => {
          const val = r[col];
          return val && String(val).toLowerCase().includes(term);
        }) ||
        (r._start_time && r._start_time.toLowerCase().includes(term)) ||
        (r._end_time && r._end_time.toLowerCase().includes(term))
      );
    }

    if (sortCol) {
      rows.sort((a, b) => {
        let aVal, bVal;
        if (sortCol === '_duration') { aVal = a._durMs; bVal = b._durMs; }
        else if (sortCol === '_start_time' || sortCol === '_end_time') { aVal = a[sortCol] || ''; bVal = b[sortCol] || ''; }
        else { aVal = a[sortCol] ?? ''; bVal = b[sortCol] ?? ''; }
        if (typeof aVal === 'number' && typeof bVal === 'number') return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
      });
    }
    return rows;
  }, [plannedData, searchTerm, sortCol, sortDir, orderedColumns]);

  const totalPages = Math.max(1, Math.ceil(processedData.length / pageSize));
  const pagedData = useMemo(() => {
    const start = page * pageSize;
    return processedData.slice(start, start + pageSize);
  }, [processedData, page, pageSize]);

  // ── Sort handler ────────────────────────────────────────────────────────
  const handleSort = useCallback((col) => {
    if (sortCol === col) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  }, [sortCol]);

  // ── Column resize ───────────────────────────────────────────────────────
  const handleResizeStart = useCallback((col, e) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const currentWidth = colWidths[col] || 150;
    resizeRef.current = { col, startX, startWidth: currentWidth };
    const onMouseMove = (moveE) => {
      if (!resizeRef.current) return;
      const diff = moveE.clientX - resizeRef.current.startX;
      setColWidths(prev => ({ ...prev, [resizeRef.current.col]: Math.max(80, resizeRef.current.startWidth + diff) }));
    };
    const onMouseUp = () => { resizeRef.current = null; document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [colWidths]);

  // ── Column drag reorder ─────────────────────────────────────────────────
  const handleDragStart = useCallback((col, e) => {
    if (MANDATORY_COLUMNS.includes(col)) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', col); dragRef.current = col;
  }, []);
  const handleDragOver = useCallback((col, e) => { if (!MANDATORY_COLUMNS.includes(col)) e.preventDefault(); }, []);
  const handleDrop = useCallback((targetCol, e) => {
    e.preventDefault();
    const sourceCol = dragRef.current;
    if (!sourceCol || sourceCol === targetCol || MANDATORY_COLUMNS.includes(targetCol)) return;
    const current = colOrder || orderedColumns.filter(c => !MANDATORY_COLUMNS.includes(c));
    const optionalCols = [...current.filter(c => !MANDATORY_COLUMNS.includes(c))];
    const srcIdx = optionalCols.indexOf(sourceCol);
    const tgtIdx = optionalCols.indexOf(targetCol);
    if (srcIdx === -1 || tgtIdx === -1) return;
    optionalCols.splice(srcIdx, 1);
    optionalCols.splice(tgtIdx, 0, sourceCol);
    setColOrder(optionalCols);
    dragRef.current = null;
  }, [colOrder, orderedColumns]);

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ChevronDown size={10} className="text-surface-300 ml-0.5" />;
    return sortDir === 'asc' ? <ChevronUp size={10} className="text-brand-600 ml-0.5" /> : <ChevronDown size={10} className="text-brand-600 ml-0.5" />;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
            <CalendarRange size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800">Planned Downtime</h1>
            <p className="text-sm text-surface-500 mt-0.5">Maintenance windows fetched live from ServiceNow, used for SLA exclusions.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-surface-600">{t.monthLabel}</label>
            <input type="month" value={month} onChange={e => { setMonth(e.target.value); setPlannedData(null); }}
              className="px-3 py-1.5 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none" />
          </div>
          <button onClick={loadData} disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t.loadButton}
          </button>
        </div>
      </div>

      {/* Messages (no auto-close) */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle2 size={14} /> {success}
          <button onClick={() => setSuccess(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2">
        <button onClick={handleSync} disabled={syncing}
          className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1">
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {syncing ? t.planned.syncing : t.planned.syncButton}
        </button>
        <a href="/healthcheck/config" className="ml-auto px-3 py-1.5 text-xs font-medium text-surface-500 bg-surface-50 border border-surface-200 rounded-lg hover:bg-surface-100 flex items-center gap-1">
          <Settings size={12} /> Configuration
        </a>
      </div>

      {/* ── Total Downtime Summary ──────────────────────────────────────── */}
      {plannedData && plannedData.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Total Planned Downtime</p>
              <p className="text-2xl font-bold text-amber-900">{formatDuration(totalDowntimeMs)}</p>
              <p className="text-xs text-amber-600 mt-1">{plannedData.length} change task(s) — {month}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Data Grid ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-surface-800">{t.planned.title}</h3>
            <p className="text-xs text-surface-500">
              {plannedData ? `${processedData.length} of ${plannedData.length} entries` : 'Loading...'}
            </p>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
            <input type="text" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
              placeholder="Search..."
              className="pl-8 pr-3 py-1.5 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 outline-none w-48" />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {!plannedData || plannedData.length === 0 ? (
          <div className="text-center py-10 text-sm text-surface-400">{t.planned.noData}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    {orderedColumns.map(col => {
                      const isMandatory = MANDATORY_COLUMNS.includes(col);
                      const width = colWidths[col] || (isMandatory ? 160 : 150);
                      return (
                        <th key={col} style={{ width: `${width}px`, minWidth: '80px' }}
                          className="relative px-4 py-2.5 text-left font-semibold text-surface-600 whitespace-nowrap select-none group"
                          draggable={!isMandatory}
                          onDragStart={e => handleDragStart(col, e)}
                          onDragOver={e => handleDragOver(col, e)}
                          onDrop={e => handleDrop(col, e)}
                        >
                          <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort(col)}>
                            {!isMandatory && <GripVertical size={10} className="text-surface-300 opacity-0 group-hover:opacity-100 cursor-grab" />}
                            {isMandatory && <Lock size={9} className="text-surface-400" />}
                            <span>{formatColumnLabel(col)}</span>
                            <SortIcon col={col} />
                          </div>
                          <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-300"
                            onMouseDown={e => handleResizeStart(col, e)} />
                        </th>
                      );
                    })}
                    <th style={{ width: `${colWidths['_start_time'] || 160}px` }}
                      className="relative px-4 py-2.5 text-left font-semibold text-surface-600 whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('_start_time')}>
                      <div className="flex items-center gap-1">Downtime Start <SortIcon col="_start_time" /></div>
                      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-300"
                        onMouseDown={e => handleResizeStart('_start_time', e)} />
                    </th>
                    <th style={{ width: `${colWidths['_end_time'] || 160}px` }}
                      className="relative px-4 py-2.5 text-left font-semibold text-surface-600 whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('_end_time')}>
                      <div className="flex items-center gap-1">Downtime End <SortIcon col="_end_time" /></div>
                      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-300"
                        onMouseDown={e => handleResizeStart('_end_time', e)} />
                    </th>
                    <th style={{ width: `${colWidths['_duration'] || 120}px` }}
                      className="relative px-4 py-2.5 text-center font-semibold text-surface-600 whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('_duration')}>
                      <div className="flex items-center justify-center gap-1">Duration <SortIcon col="_duration" /></div>
                      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-300"
                        onMouseDown={e => handleResizeStart('_duration', e)} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedData.map((pd, idx) => (
                    <tr key={pd.sys_id || idx} className="border-b border-surface-50 hover:bg-surface-50/50">
                      {orderedColumns.map(col => {
                        const isMandatory = MANDATORY_COLUMNS.includes(col);
                        return (
                          <td key={col} className="px-4 py-2.5 text-surface-600 truncate" title={pd[col] ?? ''}
                            style={{ maxWidth: `${colWidths[col] || 150}px` }}>
                            {isMandatory
                              ? <span className="font-mono font-medium text-surface-800">{pd[col] || '—'}</span>
                              : (pd[col] ?? '—')}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-surface-600 whitespace-nowrap">{pd._start_time || '—'}</td>
                      <td className="px-4 py-2.5 text-surface-600 whitespace-nowrap">{pd._end_time || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`font-semibold ${pd._durMs > 0 ? 'text-amber-700' : 'text-surface-400'}`}>
                          {formatDuration(pd._durMs)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-5 py-3 border-t border-surface-100 flex items-center justify-between text-xs text-surface-500">
              <div className="flex items-center gap-2">
                <span>Rows per page:</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
                  className="px-2 py-1 border border-surface-200 rounded text-xs bg-white outline-none">
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="ml-2">{processedData.length} total</span>
              </div>
              <div className="flex items-center gap-2">
                <span>Page {page + 1} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="p-1 rounded hover:bg-surface-100 disabled:opacity-30"><ChevronLeft size={14} /></button>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="p-1 rounded hover:bg-surface-100 disabled:opacity-30"><ChevronRight size={14} /></button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
