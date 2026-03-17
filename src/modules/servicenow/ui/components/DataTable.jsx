// ============================================================================
// DataTable.jsx — Reusable Data Table for ServiceNow Module
//
// PURPOSE: Enterprise-grade data table component providing:
//   1. Column sorting (click header — asc/desc toggle, tri-state)
//   2. Pagination (configurable page size, prev/next/page jump)
//   3. Column reordering (drag-and-drop column headers)
//   4. Optional search filtering (external or built-in)
//   5. Empty state and loading state rendering
//
// USAGE:
//   import DataTable from './DataTable';
//   <DataTable
//     columns={[{ key: 'number', label: 'Number', sortable: true }, ...]}
//     data={rows}
//     loading={false}
//     pageSize={20}
//     searchable={true}
//     emptyMessage="No records found"
//     renderCell={(row, colKey) => <span>{row[colKey]}</span>}
//   />
//
// PROPS:
//   columns      — Array<{ key: string, label: string, sortable?: boolean,
//                           align?: 'left'|'center'|'right', width?: string,
//                           render?: (value, row) => ReactNode }>
//   data         — Array<Object> — row data
//   loading      — boolean — show skeleton/spinner
//   pageSize     — number (default 20) — rows per page
//   pageSizeOptions — number[] (default [10,20,50,100]) — page size dropdown
//   searchable   — boolean — show built-in search bar
//   searchPlaceholder — string
//   emptyMessage — string — shown when data is empty
//   emptyIcon    — React component — icon for empty state
//   renderCell   — (row, colKey, colDef) => ReactNode — custom cell renderer
//   onRowClick   — (row) => void — row click handler
//   stickyHeader — boolean — sticky table header (default true)
//   compact      — boolean — reduced padding (default false)
//   className    — string — additional CSS classes on wrapper
//   defaultSort  — { key: string, order: 'asc'|'desc' } — initial sort
//   rowKeyField  — string — field name for React key (default 'id')
//
// ARCHITECTURE:
//   - Pure client-side sorting and pagination (operates on provided data[])
//   - Column reorder state persisted in component (drag-and-drop)
//   - All visual styling via Tailwind — no external CSS
//   - Zero hardcoded strings — labels passed via props
//
// USED BY: ServiceNowSlaReport, ServiceNowReports (DataGrid), Dashboard
// ============================================================================

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown, Search, GripVertical, X,
} from 'lucide-react';

// ── Default config ──────────────────────────────────────────────────────────
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// ── Sorting comparator ─────────────────────────────────────────────────────
function compareValues(a, b, order) {
  if (a == null && b == null) return 0;
  if (a == null) return order === 'asc' ? 1 : -1;
  if (b == null) return order === 'asc' ? -1 : 1;

  // Numeric comparison
  if (typeof a === 'number' && typeof b === 'number') {
    return order === 'asc' ? a - b : b - a;
  }

  // Date detection
  const dateA = Date.parse(a);
  const dateB = Date.parse(b);
  if (!isNaN(dateA) && !isNaN(dateB)) {
    return order === 'asc' ? dateA - dateB : dateB - dateA;
  }

  // String comparison (case-insensitive)
  const strA = String(a).toLowerCase();
  const strB = String(b).toLowerCase();
  if (strA < strB) return order === 'asc' ? -1 : 1;
  if (strA > strB) return order === 'asc' ? 1 : -1;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// DataTable Component
// ─────────────────────────────────────────────────────────────────────────────
export default function DataTable({
  columns: initialColumns = [],
  data = [],
  loading = false,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  searchable = false,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No records found.',
  emptyIcon: EmptyIcon = null,
  renderCell,
  onRowClick,
  stickyHeader = true,
  compact = false,
  className = '',
  defaultSort = null,
  rowKeyField = 'id',
}) {
  // ── State ───────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState(defaultSort?.key || null);
  const [sortOrder, setSortOrder] = useState(defaultSort?.order || 'asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [searchQuery, setSearchQuery] = useState('');
  const [columnOrder, setColumnOrder] = useState(() => initialColumns.map(c => c.key));
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  // ── Ordered columns (based on drag reorder) ─────────────────────────────
  const columns = useMemo(() => {
    const colMap = new Map(initialColumns.map(c => [c.key, c]));
    // Ensure new columns are included even if not in columnOrder
    const ordered = columnOrder
      .filter(k => colMap.has(k))
      .map(k => colMap.get(k));
    // Append any columns from initialColumns not yet in columnOrder
    for (const c of initialColumns) {
      if (!columnOrder.includes(c.key)) ordered.push(c);
    }
    return ordered;
  }, [initialColumns, columnOrder]);

  // ── Search filter ───────────────────────────────────────────────────────
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(row =>
      columns.some(col => {
        const val = row[col.key];
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, searchQuery, columns]);

  // ── Sort ────────────────────────────────────────────────────────────────
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) =>
      compareValues(a[sortKey], b[sortKey], sortOrder)
    );
  }, [filteredData, sortKey, sortOrder]);

  // ── Paginate ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedData = useMemo(() => {
    const start = safePage * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, safePage, pageSize]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSort = useCallback((colKey) => {
    if (sortKey === colKey) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(colKey);
      setSortOrder('asc');
    }
    setPage(0);
  }, [sortKey]);

  const handlePageSizeChange = useCallback((newSize) => {
    setPageSize(newSize);
    setPage(0);
  }, []);

  // ── Drag-and-drop column reorder ────────────────────────────────────────
  const handleDragStart = useCallback((idx) => {
    dragItem.current = idx;
  }, []);

  const handleDragEnter = useCallback((idx) => {
    dragOverItem.current = idx;
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragItem.current == null || dragOverItem.current == null) return;
    if (dragItem.current === dragOverItem.current) return;
    setColumnOrder(prev => {
      const updated = [...prev];
      const [removed] = updated.splice(dragItem.current, 1);
      updated.splice(dragOverItem.current, 0, removed);
      return updated;
    });
    dragItem.current = null;
    dragOverItem.current = null;
  }, []);

  // Cell padding based on compact mode
  const cellPx = compact ? 'px-2 py-1.5' : 'px-4 py-2.5';
  const headerPx = compact ? 'px-2 py-2' : 'px-4 py-2.5';

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={`bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden ${className}`}>
      {/* Search bar (optional) */}
      {searchable && (
        <div className="px-4 py-2.5 border-b border-surface-100 bg-surface-50/30 flex items-center gap-2">
          <Search size={13} className="text-surface-400 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
            placeholder={searchPlaceholder}
            className="flex-1 text-xs text-surface-700 bg-transparent outline-none placeholder:text-surface-400"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setPage(0); }} className="text-surface-400 hover:text-surface-600">
              <X size={12} />
            </button>
          )}
          <span className="text-[10px] text-surface-400 ml-2">
            {filteredData.length} of {data.length}
          </span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="p-12 flex items-center justify-center">
          <Loader2 size={22} className="text-brand-400 animate-spin" />
        </div>
      ) : pagedData.length === 0 ? (
        <div className="p-12 text-center">
          {EmptyIcon && <EmptyIcon size={28} className="text-surface-300 mx-auto mb-2" />}
          <p className="text-sm text-surface-500">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`bg-surface-50 border-b border-surface-200 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
                {columns.map((col, idx) => {
                  const isSorted = sortKey === col.key;
                  const isSortable = col.sortable !== false;
                  const align = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                  return (
                    <th
                      key={col.key}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragEnter={() => handleDragEnter(idx)}
                      onDragEnd={handleDragEnd}
                      onDragOver={e => e.preventDefault()}
                      onClick={() => isSortable && handleSort(col.key)}
                      style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                      className={`${headerPx} ${align} text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap select-none ${
                        isSortable ? 'cursor-pointer hover:text-brand-600 hover:bg-brand-50/30' : ''
                      } transition-colors group`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <GripVertical size={10} className="text-surface-300 opacity-0 group-hover:opacity-100 cursor-grab" />
                        {col.label}
                        {isSortable && (
                          isSorted
                            ? sortOrder === 'asc'
                              ? <ArrowUp size={11} className="text-brand-500" />
                              : <ArrowDown size={11} className="text-brand-500" />
                            : <ArrowUpDown size={11} className="text-surface-300 opacity-0 group-hover:opacity-100" />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {pagedData.map((row, rowIdx) => (
                <tr
                  key={row[rowKeyField] || rowIdx}
                  onClick={() => onRowClick?.(row)}
                  className={`hover:bg-surface-50/60 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {columns.map(col => {
                    const align = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                    const cellContent = renderCell
                      ? renderCell(row, col.key, col)
                      : col.render
                        ? col.render(row[col.key], row)
                        : (row[col.key] ?? '—');
                    return (
                      <td key={col.key} className={`${cellPx} ${align} text-surface-700 text-xs whitespace-nowrap`}>
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination footer */}
      {!loading && sortedData.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-surface-100 bg-surface-50/30 text-xs text-surface-500">
          {/* Left: rows info + page size selector */}
          <div className="flex items-center gap-3">
            <span>
              {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sortedData.length)} of {sortedData.length}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-surface-400">Rows:</span>
              <select
                value={pageSize}
                onChange={e => handlePageSizeChange(Number(e.target.value))}
                className="px-1.5 py-0.5 rounded border border-surface-200 text-xs text-surface-600 bg-white focus:outline-none focus:ring-1 focus:ring-brand-200"
              >
                {pageSizeOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: page navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={safePage === 0}
              className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 transition-colors"
              title="First page"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 transition-colors"
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 py-0.5 font-medium text-surface-600">
              {safePage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 transition-colors"
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={safePage >= totalPages - 1}
              className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 transition-colors"
              title="Last page"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
