// ============================================================================
// LogViewer — PulseOps V2 Shared Component
//
// PURPOSE: Enterprise log viewer grid with column sorting, resizing, pagination,
// level filters, search, and a slide-out detail panel. Supports both UI and
// API log schemas. No page-level scrollbar — grid has its own scrollbars.
//
// ARCHITECTURE: All text from uiElementsText.json. No hardcoded strings.
// ============================================================================
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  X, Copy, Check, FileJson, AlertCircle, Info, AlertTriangle, Bug, ChevronsUpDown,
  Monitor, Server,
} from 'lucide-react';
import uiText from '@config/uiElementsText.json';
import TimezoneService from '@shared/services/timezoneService';

const logText = uiText.coreViews.logs;
const gridText = logText.grid;
const detailText = logText.detail;
const paginationText = logText.pagination;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatIST(isoString) {
  return TimezoneService.formatTime(isoString);
}

const LEVEL_STYLES = {
  debug: { bg: 'bg-surface-100', text: 'text-surface-600', icon: Bug, border: 'border-surface-300' },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', icon: Info, border: 'border-blue-200' },
  warn: { bg: 'bg-amber-50', text: 'text-amber-700', icon: AlertTriangle, border: 'border-amber-200' },
  error: { bg: 'bg-red-50', text: 'text-red-700', icon: AlertCircle, border: 'border-red-200' },
};

function LevelBadge({ level }) {
  const style = LEVEL_STYLES[level] || LEVEL_STYLES.info;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${style.bg} ${style.text} border ${style.border}`}>
      <Icon size={10} />
      {level}
    </span>
  );
}

function MethodBadge({ method }) {
  const colors = {
    GET: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    POST: 'bg-blue-50 text-blue-700 border-blue-200',
    PUT: 'bg-amber-50 text-amber-700 border-amber-200',
    PATCH: 'bg-orange-50 text-orange-700 border-orange-200',
    DELETE: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase border ${colors[method] || 'bg-surface-50 text-surface-600 border-surface-200'}`}>
      {method}
    </span>
  );
}

function StatusBadge({ code }) {
  if (!code) return <span className="text-[13px] text-surface-400">—</span>;
  const color = code >= 500 ? 'text-red-600' : code >= 400 ? 'text-amber-600' : 'text-emerald-600';
  return <span className={`text-[13px] font-bold ${color}`}>{code}</span>;
}

// ── UI Log Columns ───────────────────────────────────────────────────────────

const UI_COLUMNS = [
  { id: 'timestamp', label: gridText.time, width: 170, sortable: true, render: (row) => <span className="text-[13px] text-surface-700">{formatIST(row.timestamp || row.created_at)}</span> },
  { id: 'sessionId', label: gridText.sessionId, width: 185, sortable: true, render: (row) => <span className="text-[13px] font-mono text-teal-600 truncate">{row.session_id || row.sessionId || '—'}</span> },
  { id: 'transactionId', label: gridText.transactionId, width: 170, sortable: true, render: (row) => <span className="text-[13px] font-mono text-surface-500 truncate">{row.transaction_id || row.transactionId || '—'}</span> },
  { id: 'correlationId', label: gridText.correlationId, width: 170, sortable: true, render: (row) => <span className="text-[13px] font-mono text-violet-500 truncate">{row.correlation_id || row.correlationId || '—'}</span> },
  { id: 'source', label: gridText.source, width: 65, sortable: true, render: (row) => <span className="text-[13px] font-medium text-surface-500">{row.source || 'UI'}</span> },
  { id: 'user', label: gridText.user, width: 150, sortable: true, render: (row) => <span className="text-[13px] text-surface-600 truncate">{row.user_email || row.user || '—'}</span> },
  { id: 'level', label: gridText.logLevel, width: 85, sortable: true, render: (row) => <LevelBadge level={row.level} /> },
  { id: 'fileName', label: gridText.fileName, width: 160, sortable: true, render: (row) => <span className="text-[13px] font-mono text-surface-500 truncate">{row.file_name || row.fileName || '—'}</span> },
  { id: 'event', label: gridText.event, width: 110, sortable: true, render: (row) => <span className="text-[13px] text-surface-700 truncate">{row.event || '—'}</span> },
  { id: 'pageUrl', label: gridText.pageUrl, width: 180, sortable: true, render: (row) => <span className="text-[13px] font-mono text-surface-500 truncate">{row.page_url || row.pageUrl || '—'}</span> },
  { id: 'message', label: gridText.message, width: 300, sortable: false, render: (row) => <span className="text-[13px] text-surface-700 truncate block">{row.message || '—'}</span> },
  { id: 'module', label: gridText.module, width: 85, sortable: true, render: (row) => <span className="text-[13px] text-surface-500">{row.module || 'Core'}</span> },
];

// ── API Log Columns ──────────────────────────────────────────────────────────

const API_COLUMNS = [
  { id: 'timestamp', label: gridText.time, width: 170, sortable: true, render: (row) => <span className="text-[13px] text-surface-700">{formatIST(row.timestamp || row.created_at)}</span> },
  { id: 'sessionId', label: gridText.sessionId, width: 185, sortable: true, render: (row) => <span className="text-[13px] font-mono text-teal-600 truncate">{row.session_id || row.sessionId || '—'}</span> },
  { id: 'transactionId', label: gridText.transactionId, width: 170, sortable: true, render: (row) => <span className="text-[13px] font-mono text-surface-500 truncate">{row.transaction_id || row.transactionId || '—'}</span> },
  { id: 'correlationId', label: gridText.correlationId, width: 170, sortable: true, render: (row) => <span className="text-[13px] font-mono text-violet-500 truncate">{row.correlation_id || row.correlationId || '—'}</span> },
  { id: 'source', label: gridText.source, width: 65, sortable: true, render: (row) => <span className="text-[13px] font-medium text-surface-500">{row.source || 'API'}</span> },
  { id: 'user', label: gridText.user, width: 150, sortable: true, render: (row) => <span className="text-[13px] text-surface-600 truncate">{row.user_email || row.user || '—'}</span> },
  { id: 'level', label: gridText.logLevel, width: 85, sortable: true, render: (row) => <LevelBadge level={row.level} /> },
  { id: 'method', label: gridText.method, width: 76, sortable: true, render: (row) => { const m = row.http_method || row.method; return m ? <MethodBadge method={m} /> : <span className="text-[13px] text-surface-400">—</span>; } },
  { id: 'url', label: gridText.apiUrl, width: 260, sortable: true, render: (row) => <span className="text-[13px] font-mono text-surface-600 truncate block">{row.api_url || row.url || '—'}</span> },
  { id: 'statusCode', label: gridText.statusCode, width: 68, sortable: true, render: (row) => <StatusBadge code={row.status_code || row.statusCode} /> },
  { id: 'responseTime', label: gridText.responseTime, width: 100, sortable: true, render: (row) => { const t = row.duration_ms || row.responseTime; return t ? <span className="text-[13px] text-surface-600">{t}ms</span> : <span className="text-[13px] text-surface-400">—</span>; } },
  { id: 'fileName', label: gridText.fileName, width: 160, sortable: true, render: (row) => <span className="text-[13px] font-mono text-surface-500 truncate">{row.file_name || row.fileName || '—'}</span> },
  { id: 'message', label: gridText.message, width: 250, sortable: false, render: (row) => <span className="text-[13px] text-surface-700 truncate block">{row.message || '—'}</span> },
  { id: 'error', label: gridText.error, width: 200, sortable: false, render: (row) => <span className="text-[13px] text-danger-600 truncate block">{row.error || '—'}</span> },
  { id: 'module', label: gridText.module, width: 85, sortable: true, render: (row) => <span className="text-[13px] text-surface-500">{row.module || 'Core'}</span> },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

// ── Detail Panel ─────────────────────────────────────────────────────────────

function LogDetailPanel({ log, logType, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!log) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-surface-400 italic px-4">
        {detailText.noSelection}
      </div>
    );
  }

  const isApi = logType === 'api';

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const renderJsonBlock = (label, data) => {
    if (!data) return (
      <div>
        <h4 className="text-xs font-bold text-surface-600 mb-1">{label}</h4>
        <div className="bg-surface-50 rounded-lg border border-surface-200 p-3">
          <pre className="text-[11px] font-mono text-surface-400">—</pre>
        </div>
      </div>
    );
    let formatted;
    try {
      formatted = typeof data === 'string' ? JSON.stringify(JSON.parse(data), null, 2) : JSON.stringify(data, null, 2);
    } catch {
      formatted = String(data);
    }
    return (
      <div>
        <h4 className="text-xs font-bold text-surface-600 mb-1">{label}</h4>
        <div className="bg-surface-50 rounded-lg border border-surface-200 p-3">
          <pre className="text-[11px] font-mono text-surface-700 whitespace-pre-wrap break-all">{formatted}</pre>
        </div>
      </div>
    );
  };

  const renderField = (label, value) => (
    <div className="flex items-start gap-2 py-1.5 border-b border-surface-100 last:border-b-0">
      <span className="text-xs font-medium text-surface-500 w-28 flex-shrink-0">{label}</span>
      <span className="text-xs text-surface-800 break-all">{value || '—'}</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 bg-gradient-to-r from-brand-50 to-white flex-shrink-0">
        <h3 className="text-sm font-bold text-surface-800">{detailText.title}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            title="Copy to clipboard"
            className="p-1 rounded-lg hover:bg-surface-100 transition-colors"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-surface-500" />}
          </button>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-100 transition-colors">
            <X size={16} className="text-surface-500" />
          </button>
        </div>
      </div>

      {/* Single scrollable area — fields + JSON blocks together */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {renderField(detailText.transactionId, log.transaction_id || log.transactionId)}
        {renderField(detailText.sessionId, log.session_id || log.sessionId)}
        {renderField(detailText.correlationId, log.correlation_id || log.correlationId)}
        {renderField(detailText.timestamp, formatIST(log.timestamp || log.created_at))}
        {renderField(detailText.level, log.level)}
        {renderField(detailText.source, log.source)}
        {renderField(detailText.fileName, log.file_name || log.fileName)}
        {renderField(detailText.user, log.user_email || log.user)}
        {renderField(detailText.module, log.module)}

        {isApi && (
          <>
            {renderField(detailText.method, log.http_method || log.method)}
            {renderField(detailText.url, log.api_url || log.url)}
            {renderField(detailText.statusCode, log.status_code || log.statusCode)}
            {renderField(detailText.responseTime, (log.duration_ms || log.responseTime) ? `${log.duration_ms || log.responseTime}ms` : null)}
          </>
        )}

        {!isApi && (
          <>
            {renderField(detailText.event, log.event)}
            {renderField(detailText.pageUrl, log.page_url || log.pageUrl)}
            {renderField(detailText.message, log.message)}
          </>
        )}

        {!isApi && (log.data || log.context) && (
          <div className="pt-1 space-y-2">
            {renderJsonBlock(detailText.context, log.data || log.context)}
          </div>
        )}

        {isApi && (
          <div className="space-y-3 pt-1">
            {renderJsonBlock(detailText.requestBody, log.request_body || log.requestBody)}
            {renderJsonBlock(detailText.responseBody, log.response_body || log.responseBody)}
          </div>
        )}

        {isApi && log.message && (
          <div className="pt-1">
            {renderField(detailText.message, log.message)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main LogViewer ───────────────────────────────────────────────────────────

export default function LogViewer({
  logs = [],
  logType = 'api',
  isLoading = false,
  totalCount = 0,
  onLogTypeChange,
  levelFilter = 'all',
  onLevelFilterChange,
  searchTerm = '',
  onSearchChange,
}) {
  const [selectedLog, setSelectedLog] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [sortColumn, setSortColumn] = useState('timestamp');
  const [sortDirection, setSortDirection] = useState('desc');
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [columnWidths, setColumnWidths] = useState({});
  const [detailWidth, setDetailWidth] = useState(320);
  const gridRef = useRef(null);
  const resizingRef = useRef(null);

  const columns = logType === 'ui' ? UI_COLUMNS : API_COLUMNS;

  // Reset page when logs or search change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedLog(null);
    setShowDetail(false);
  }, [logType, logs.length, searchTerm]);

  // ── Unified Search (client-side — searches message, transactionId, fileName, user, event) ─
  const filteredByTx = useMemo(() => {
    if (!searchTerm.trim()) return logs;
    const q = searchTerm.trim().toLowerCase();
    return logs.filter(log =>
      (log.transaction_id || log.transactionId || '').toLowerCase().includes(q) ||
      (log.session_id || log.sessionId || '').toLowerCase().includes(q) ||
      (log.correlation_id || log.correlationId || '').toLowerCase().includes(q) ||
      (log.message || '').toLowerCase().includes(q) ||
      (log.file_name || log.fileName || '').toLowerCase().includes(q) ||
      (log.user_email || log.user || '').toLowerCase().includes(q) ||
      (log.event || '').toLowerCase().includes(q) ||
      (log.api_url || log.url || '').toLowerCase().includes(q) ||
      (log.page_url || log.pageUrl || '').toLowerCase().includes(q)
    );
  }, [logs, searchTerm]);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sortedLogs = useMemo(() => {
    if (!sortColumn) return filteredByTx;
    const col = columns.find(c => c.id === sortColumn);
    if (!col?.sortable) return filteredByTx;

    return [...filteredByTx].sort((a, b) => {
      let aVal = a[sortColumn] || a[sortColumn.replace(/([A-Z])/g, '_$1').toLowerCase()] || '';
      let bVal = b[sortColumn] || b[sortColumn.replace(/([A-Z])/g, '_$1').toLowerCase()] || '';
      if (sortColumn === 'timestamp') {
        aVal = new Date(a.timestamp || a.created_at || 0).getTime();
        bVal = new Date(b.timestamp || b.created_at || 0).getTime();
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const strA = String(aVal).toLowerCase();
      const strB = String(bVal).toLowerCase();
      return sortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredByTx, sortColumn, sortDirection, columns]);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sortedLogs.length / pageSize));
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedLogs.slice(start, start + pageSize);
  }, [sortedLogs, currentPage, pageSize]);

  const handleSort = useCallback((colId) => {
    if (sortColumn === colId) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(colId);
      setSortDirection('desc');
    }
  }, [sortColumn]);

  const handleRowClick = useCallback((log) => {
    setSelectedLog(log);
    setShowDetail(true);
  }, []);

  // ── Column Resizing ────────────────────────────────────────────────────────
  const handleResizeStart = useCallback((e, colId, defaultWidth) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colId] || defaultWidth;

    const handleMouseMove = (moveEvent) => {
      const diff = moveEvent.clientX - startX;
      const newWidth = Math.max(50, startWidth + diff);
      setColumnWidths(prev => ({ ...prev, [colId]: newWidth }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnWidths]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const noLogs = !isLoading && paginatedLogs.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
      {/* Top Controls Row: Log Type + Level Filters + Search + Separator + Page Size + Pagination */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-surface-200 bg-gradient-to-r from-surface-50 to-white flex-shrink-0">
        {/* Log Type Selector */}
        {onLogTypeChange && (
          <div className="flex items-center rounded-lg border border-surface-200 overflow-hidden bg-white shadow-sm flex-shrink-0">
            <button
              onClick={() => onLogTypeChange('ui')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors
                ${logType === 'ui' ? 'bg-brand-500 text-white' : 'text-surface-600 hover:bg-surface-50'}`}
            >
              <Monitor size={13} />
              UI Logs
            </button>
            <button
              onClick={() => onLogTypeChange('api')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors
                ${logType === 'api' ? 'bg-brand-500 text-white' : 'text-surface-600 hover:bg-surface-50'}`}
            >
              <Server size={13} />
              API Logs
            </button>
          </div>
        )}

        {/* Level Filters */}
        {onLevelFilterChange && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {['all', 'debug', 'info', 'warn', 'error'].map(level => (
              <button
                key={level}
                onClick={() => onLevelFilterChange(level)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium uppercase transition-colors border
                  ${levelFilter === level
                    ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                    : 'bg-white text-surface-600 border-surface-200 hover:bg-surface-50 hover:border-surface-300'}`}
              >
                {level}
              </button>
            ))}
          </div>
        )}

        {/* Search — expanded width */}
        {onSearchChange && (
          <div className="relative flex-1 min-w-[300px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by message, Transaction ID, Session ID, Correlation ID, file, user..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-surface-200 rounded-lg bg-white text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-300 focus:border-brand-300"
            />
          </div>
        )}

        {/* Gradient Separator */}
        <div className="h-6 w-1 bg-gradient-to-b from-transparent via-brand-200 to-transparent flex-shrink-0 rounded-full" />

        {/* Page Size */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-surface-500">{paginationText.pageSize}:</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="text-xs border border-surface-200 rounded px-1.5 py-0.5 bg-white text-surface-700 focus:outline-none focus:ring-1 focus:ring-brand-300"
          >
            {PAGE_SIZE_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {/* Page Navigator */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-surface-500">
            {paginationText.page} {currentPage} {paginationText.of} {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-0.5 rounded hover:bg-surface-200 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} className="text-surface-600" />
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-0.5 rounded hover:bg-surface-200 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={14} className="text-surface-600" />
          </button>
        </div>
      </div>

      {/* Grid + Detail Panel row — side by side */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Grid Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Filtered count indicator — optional, can be removed if not needed */}
          {searchTerm.trim() && (
            <div className="flex items-center px-3 py-1.5 border-b border-surface-100 bg-surface-50 flex-shrink-0">
              <span className="text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                {sortedLogs.length} of {logs.length} match
              </span>
            </div>
          )}
        {/* Grid */}
        <div className="flex-1 overflow-auto" ref={gridRef}>
          <table className="w-full border-collapse text-left min-w-max">
            {/* Header */}
            <thead className="sticky top-0 z-10">
              <tr className="bg-gradient-to-r from-surface-50 to-surface-100 border-b border-surface-200">
                {columns.map((col) => {
                  const width = columnWidths[col.id] || col.width;
                  const isSorted = sortColumn === col.id;
                  return (
                    <th
                      key={col.id}
                      style={{ minWidth: width }}
                      className="relative px-2 py-1.5 text-[11px] font-bold text-surface-600 uppercase tracking-wide select-none whitespace-nowrap"
                    >
                      <div
                        className={`flex items-center gap-1 ${col.sortable ? 'cursor-pointer hover:text-brand-600' : ''}`}
                        onClick={() => col.sortable && handleSort(col.id)}
                      >
                        <span>{col.label}</span>
                        {col.sortable && (
                          <span className="flex-shrink-0">
                            {isSorted ? (
                              sortDirection === 'asc' ? <ChevronUp size={12} className="text-brand-500" /> : <ChevronDown size={12} className="text-brand-500" />
                            ) : (
                              <ChevronsUpDown size={12} className="text-surface-300" />
                            )}
                          </span>
                        )}
                      </div>
                      {/* Resize Handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-300 transition-colors"
                        onMouseDown={(e) => handleResizeStart(e, col.id, col.width)}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={columns.length} className="py-16">
                    <div className="sticky left-0 w-[calc(100vw-320px)] flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-surface-400">{uiText.coreViews.logs.stats.refreshNow}...</span>
                    </div>
                  </td>
                </tr>
              )}

              {noLogs && (
                <tr>
                  <td colSpan={columns.length} className="py-16">
                    <div className="sticky left-0 w-[calc(100vw-320px)] flex flex-col items-center justify-center gap-2">
                      <FileJson size={32} className="text-surface-300" />
                      <span className="text-sm font-medium text-surface-500">{logText.stats.noLogs}</span>
                      <span className="text-xs text-surface-400">{logText.stats.noLogsHint}</span>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && paginatedLogs.map((log, index) => {
                const isSelected = selectedLog === log;
                const level = log.level || log.log_level || 'info';
                const rowBg = level === 'error' ? 'bg-red-50/40' : level === 'warn' ? 'bg-amber-50/30' : '';

                return (
                  <tr
                    key={`${log.id || index}-${log.timestamp || log.created_at || ''}-${index}`}
                    onClick={() => handleRowClick(log)}
                    className={`border-b border-surface-100 cursor-pointer transition-colors
                      ${isSelected ? 'bg-brand-50 border-l-2 border-l-brand-400' : `${rowBg} hover:bg-surface-50`}`}
                  >
                    {columns.map((col) => {
                      const width = columnWidths[col.id] || col.width;
                      return (
                        <td
                          key={col.id}
                          style={{ minWidth: width }}
                          className="px-2 py-1.5 whitespace-nowrap"
                        >
                          {col.render(log)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

          {/* Bottom bar removed — pagination is now in the top filter bar */}
        </div>

        {/* Detail Panel — inline beside grid, not overlaid */}
        {showDetail && (
          <div
            className="flex-shrink-0 border-l border-surface-200 bg-white overflow-hidden relative"
            style={{ width: detailWidth, minWidth: 240, maxWidth: 600 }}
          >
            {/* Resize drag handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-300 active:bg-brand-400 transition-colors z-10"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = detailWidth;
                const onMove = (ev) => {
                  const diff = startX - ev.clientX;
                  setDetailWidth(Math.max(240, Math.min(600, startWidth + diff)));
                };
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            />
            <LogDetailPanel
              log={selectedLog}
              logType={logType}
              onClose={() => { setShowDetail(false); setSelectedLog(null); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
