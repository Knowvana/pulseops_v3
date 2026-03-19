// ============================================================================
// PlannedDowntimeView — ServiceNow Module
//
// PURPOSE: Display planned downtime entries fetched from ServiceNow Change
// Requests / Implementation Tasks. Provides Monthly/Weekly/Daily toggle and
// custom date range. Grid columns are driven by the saved change config.
// Features: column resize, reorder, pagination, filtering, search.
//
// USED BY: manifest.jsx → getViews() → plannedDowntime
// ============================================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  CalendarRange, Loader2, RefreshCw, AlertCircle, CheckCircle2,
  X, Calendar, Clock, ChevronLeft, ChevronRight, Search,
  ChevronDown, ChevronUp, Lock, GripVertical,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { PageSpinner } from '@components';
import urls from '../config/urls.json';

const log = createLogger('PlannedDowntimeView.jsx');
const api = urls.api;

// ── Mandatory columns — always first, locked, cannot be removed ─────────────
const MANDATORY_COLUMNS = ['change_request', 'number'];
const MANDATORY_LABELS = { change_request: 'Change Request', number: 'Task Number' };

// ── Date helpers (all local-time, no UTC conversion) ────────────────────────
function toYMD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getMonthRange(date) {
  const y = date.getFullYear(), m = date.getMonth();
  return { start: toYMD(new Date(y, m, 1)), end: toYMD(new Date(y, m + 1, 0)) };
}
function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.getFullYear(), d.getMonth(), diff);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: toYMD(mon), end: toYMD(sun) };
}
function getDayRange(date) {
  return { start: toYMD(date), end: toYMD(date) };
}

function parseLocalDate(str) { return new Date(str + 'T12:00:00'); }

function formatRangeLabel(mode, start, end) {
  const s = parseLocalDate(start);
  if (mode === 'monthly') return s.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  if (mode === 'daily') return s.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return `${parseLocalDate(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${parseLocalDate(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function navigateRange(mode, startDate, direction) {
  const d = parseLocalDate(startDate);
  if (mode === 'monthly') { d.setMonth(d.getMonth() + direction); return getMonthRange(d); }
  if (mode === 'weekly') { d.setDate(d.getDate() + direction * 7); return getWeekRange(d); }
  d.setDate(d.getDate() + direction);
  return getDayRange(d);
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

const VIEW_MODES = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'weekly',  label: 'Weekly' },
  { id: 'daily',   label: 'Daily' },
  { id: 'custom',  label: 'Custom' },
];

const PAGE_SIZES = [10, 25, 50, 100];

export default function PlannedDowntimeView() {
  const [mode, setMode]           = useState('monthly');
  const [startDate, setStartDate] = useState(() => getMonthRange(new Date()).start);
  const [endDate, setEndDate]     = useState(() => getMonthRange(new Date()).end);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');

  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [success, setSuccess]     = useState(null);

  // Change config — for selected columns
  const [changeConfig, setChangeConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);

  // Grid state: search, sort, pagination, column widths, column order
  const [searchTerm, setSearchTerm]     = useState('');
  const [sortCol, setSortCol]           = useState(null);
  const [sortDir, setSortDir]           = useState('asc');
  const [page, setPage]                 = useState(0);
  const [pageSize, setPageSize]         = useState(25);
  const [colWidths, setColWidths]       = useState({});
  const [colOrder, setColOrder]         = useState(null); // null = use displayColumns order

  // Column resize tracking
  const resizeRef = useRef(null);
  // Drag-and-drop column reorder tracking
  const dragRef = useRef(null);

  const initRan = useRef(false);
  const autoFetched = useRef(false);

  // ── Load change config on mount ─────────────────────────────────────────
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    (async () => {
      try {
        const res = await ApiClient.get(api.configChange);
        if (res?.success) setChangeConfig(res.data);
      } catch (err) {
        log.error('loadChangeConfig', err.message);
      } finally {
        setConfigLoading(false);
      }
    })();
  }, []);

  // ── Mode change → recalc dates ─────────────────────────────────────────
  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    setData(null);
    const now = new Date();
    if (newMode === 'monthly') { const r = getMonthRange(now); setStartDate(r.start); setEndDate(r.end); }
    else if (newMode === 'weekly') { const r = getWeekRange(now); setStartDate(r.start); setEndDate(r.end); }
    else if (newMode === 'daily') { const r = getDayRange(now); setStartDate(r.start); setEndDate(r.end); }
    else { setCustomStart(toYMD(now)); setCustomEnd(toYMD(now)); }
  }, []);

  // ── Navigate prev/next ──────────────────────────────────────────────────
  const handleNavigate = useCallback((direction) => {
    const r = navigateRange(mode, startDate, direction);
    setStartDate(r.start); setEndDate(r.end);
    setData(null);
  }, [mode, startDate]);

  // ── Fetch data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const sd = mode === 'custom' ? customStart : startDate;
    const ed = mode === 'custom' ? customEnd : endDate;
    if (!sd || !ed) { setError('Please select a date range.'); return; }

    setLoading(true); setError(null); setSuccess(null);
    try {
      const res = await ApiClient.get(`${api.plannedDowntime}?startDate=${sd}&endDate=${ed}`);
      if (res?.success) {
        setData(res.data || []);
        setSuccess(`${res.count ?? (res.data || []).length} records fetched.`);
        setPage(0);
      } else {
        setError(res?.error?.message || 'Failed to fetch planned downtime');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode, startDate, endDate, customStart, customEnd]);

  // ── Auto-fetch on mount (current month) ─────────────────────────────────
  useEffect(() => {
    if (autoFetched.current || configLoading) return;
    autoFetched.current = true;
    fetchData();
  }, [configLoading, fetchData]);

  // ── Downtime mapping columns ──────────────────────────────────────────
  const mapping = changeConfig?.downtimeMapping || {};
  const startField = mapping.startDateField || 'work_start';
  const endField = mapping.endDateField || 'work_end';

  // Grid columns: mandatory first (locked), then config columns, exclude start/end fields
  const displayColumns = useMemo(() => {
    const configCols = (changeConfig?.selectedColumns || [])
      .filter(c => c !== startField && c !== endField && !MANDATORY_COLUMNS.includes(c));
    return [...MANDATORY_COLUMNS, ...configCols];
  }, [changeConfig, startField, endField]);

  // Effective column order (supports drag reorder of non-mandatory columns)
  const orderedColumns = useMemo(() => {
    if (!colOrder) return displayColumns;
    // Mandatory columns always first, then reordered optional columns
    const optional = colOrder.filter(c => !MANDATORY_COLUMNS.includes(c) && displayColumns.includes(c));
    // Add any new config columns not in colOrder
    const remaining = displayColumns.filter(c => !MANDATORY_COLUMNS.includes(c) && !optional.includes(c));
    return [...MANDATORY_COLUMNS, ...optional, ...remaining];
  }, [displayColumns, colOrder]);

  // All columns including downtime computed columns
  const allColumns = useMemo(() => [...orderedColumns, '_start_time', '_end_time', '_duration'], [orderedColumns]);

  // Calculate total downtime for the period
  const totalDowntimeMs = useMemo(() => {
    if (!data || data.length === 0) return 0;
    return data.reduce((sum, row) => {
      const st = row._start_time ? new Date(row._start_time) : null;
      const et = row._end_time ? new Date(row._end_time) : null;
      const durMs = st && et ? et - st : 0;
      return sum + Math.max(0, durMs);
    }, 0);
  }, [data]);

  // ── Filtered + sorted data ──────────────────────────────────────────────
  const processedData = useMemo(() => {
    if (!data) return [];
    let rows = [...data];

    // Add computed duration to each row for sorting/filtering
    rows = rows.map(r => {
      const st = r._start_time ? new Date(r._start_time) : null;
      const et = r._end_time ? new Date(r._end_time) : null;
      return { ...r, _durMs: st && et ? Math.max(0, et - st) : 0 };
    });

    // Search filter
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

    // Sort
    if (sortCol) {
      rows.sort((a, b) => {
        let aVal, bVal;
        if (sortCol === '_duration') {
          aVal = a._durMs; bVal = b._durMs;
        } else if (sortCol === '_start_time' || sortCol === '_end_time') {
          aVal = a[sortCol] || ''; bVal = b[sortCol] || '';
        } else {
          aVal = a[sortCol] ?? ''; bVal = b[sortCol] ?? '';
        }
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        return sortDir === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      });
    }

    return rows;
  }, [data, searchTerm, sortCol, sortDir, orderedColumns]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(processedData.length / pageSize));
  const pagedData = useMemo(() => {
    const start = page * pageSize;
    return processedData.slice(start, start + pageSize);
  }, [processedData, page, pageSize]);

  const effectiveStartDate = mode === 'custom' ? customStart : startDate;
  const effectiveEndDate = mode === 'custom' ? customEnd : endDate;

  // ── Column sort handler ─────────────────────────────────────────────────
  const handleSort = useCallback((col) => {
    if (sortCol === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(0);
  }, [sortCol]);

  // ── Column resize handlers ──────────────────────────────────────────────
  const handleResizeStart = useCallback((col, e) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const currentWidth = colWidths[col] || 150;
    resizeRef.current = { col, startX, startWidth: currentWidth };

    const onMouseMove = (moveE) => {
      if (!resizeRef.current) return;
      const diff = moveE.clientX - resizeRef.current.startX;
      const newWidth = Math.max(80, resizeRef.current.startWidth + diff);
      setColWidths(prev => ({ ...prev, [resizeRef.current.col]: newWidth }));
    };
    const onMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [colWidths]);

  // ── Column drag reorder handlers ────────────────────────────────────────
  const handleDragStart = useCallback((col, e) => {
    if (MANDATORY_COLUMNS.includes(col)) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', col);
    dragRef.current = col;
  }, []);

  const handleDragOver = useCallback((col, e) => {
    if (MANDATORY_COLUMNS.includes(col)) return;
    e.preventDefault();
  }, []);

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

  // ── Render sort icon ────────────────────────────────────────────────────
  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ChevronDown size={10} className="text-surface-300 ml-0.5" />;
    return sortDir === 'asc'
      ? <ChevronUp size={10} className="text-brand-600 ml-0.5" />
      : <ChevronDown size={10} className="text-brand-600 ml-0.5" />;
  };

  return (
    <div className="relative space-y-5 animate-fade-in">
      {configLoading && <PageSpinner modal message="Loading change configuration..." />}
      {loading && <PageSpinner modal message="Fetching planned downtime from ServiceNow..." />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
            <CalendarRange size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800">Planned Downtime</h1>
            <p className="text-sm text-surface-500 mt-0.5">Change Tasks (implementation tasks) from ServiceNow filtered by your configured assignment group.</p>
          </div>
        </div>
      </div>

      {/* ── Controls Bar ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-0.5">
            {VIEW_MODES.map(vm => (
              <button key={vm.id} onClick={() => handleModeChange(vm.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === vm.id ? 'bg-white text-brand-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'
                }`}>
                {vm.label}
              </button>
            ))}
          </div>

          {/* Date Navigator (not for custom) */}
          {mode !== 'custom' && (
            <div className="flex items-center gap-2">
              <button onClick={() => handleNavigate(-1)}
                className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-surface-700 min-w-[180px] text-center">
                {formatRangeLabel(mode, startDate, endDate)}
              </span>
              <button onClick={() => handleNavigate(1)}
                className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Custom Date Range */}
          {mode === 'custom' && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-surface-500">From</label>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 outline-none" />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-surface-500">To</label>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-200 outline-none" />
              </div>
            </div>
          )}

          {/* Fetch Button */}
          <button onClick={fetchData} disabled={loading}
            className="ml-auto px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading ? 'Fetching...' : 'Fetch'}
          </button>
        </div>

        {/* Date range summary */}
        <div className="mt-2 text-xs text-surface-400 flex items-center gap-1.5">
          <Calendar size={11} />
          <span>{effectiveStartDate} — {effectiveEndDate}</span>
          <span className="ml-2 px-2 py-0.5 rounded-full bg-surface-100 text-surface-500 text-[10px] font-bold uppercase">
            change_task
          </span>
        </div>
      </div>

      {/* ── Messages (no auto-close) ─────────────────────────────────────── */}
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

      {/* ── Empty State ─────────────────────────────────────────────────── */}
      {data && data.length === 0 && !loading && (
        <div className="text-center py-12 text-sm text-surface-400">
          No change task records found for {effectiveStartDate} — {effectiveEndDate}.
        </div>
      )}

      {/* ── Total Downtime Summary ──────────────────────────────────────── */}
      {data && data.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Total Downtime</p>
              <p className="text-2xl font-bold text-amber-900">{formatDuration(totalDowntimeMs)}</p>
              <p className="text-xs text-amber-600 mt-1">{data.length} change task(s) — {effectiveStartDate} to {effectiveEndDate}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-amber-600 mb-2">Downtime Mapping</p>
              <p className="text-xs font-mono text-amber-700"><span className="font-semibold">{startField}</span> → <span className="font-semibold">{endField}</span></p>
            </div>
          </div>
        </div>
      )}

      {/* ── Data Grid ───────────────────────────────────────────────────── */}
      {data && data.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-200 shadow-sm">
          {/* Grid Header: title + search */}
          <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-surface-800">Change Tasks</h3>
              <p className="text-xs text-surface-500">{processedData.length} of {data.length} records — {effectiveStartDate} to {effectiveEndDate}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-surface-400">
                <Clock size={11} />
                <span>Downtime: <span className="font-mono">{startField}</span> → <span className="font-mono">{endField}</span></span>
              </div>
              {/* Search */}
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
          </div>

          {/* Table */}
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
                        {/* Resize handle */}
                        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-300"
                          onMouseDown={e => handleResizeStart(col, e)} />
                      </th>
                    );
                  })}
                  {/* Downtime computed columns */}
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
                {pagedData.map((row, idx) => {
                  const durMs = row._durMs || 0;
                  return (
                    <tr key={idx} className="border-b border-surface-50 hover:bg-surface-50/50">
                      {orderedColumns.map(col => {
                        const isMandatory = MANDATORY_COLUMNS.includes(col);
                        return (
                          <td key={col} className="px-4 py-2.5 text-surface-600 truncate" title={row[col] ?? ''}
                            style={{ maxWidth: `${colWidths[col] || 150}px` }}>
                            {isMandatory
                              ? <span className="font-mono font-medium text-surface-800">{row[col] || '—'}</span>
                              : (row[col] ?? '—')}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-surface-600 whitespace-nowrap">{row._start_time || '—'}</td>
                      <td className="px-4 py-2.5 text-surface-600 whitespace-nowrap">{row._end_time || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`font-semibold ${durMs > 0 ? 'text-amber-700' : 'text-surface-400'}`}>
                          {formatDuration(durMs)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ──────────────────────────────────────────────── */}
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
        </div>
      )}
    </div>
  );
}
