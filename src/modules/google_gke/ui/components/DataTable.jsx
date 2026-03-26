// ============================================================================
// DataTable.jsx — Reusable Data Table for Google GKE Module
//
// PURPOSE: Enterprise-grade data table component providing:
//   1. Column sorting (click header — asc/desc toggle, tri-state)
//   2. Pagination (configurable page size, prev/next/page jump)
//   3. Column reordering (drag-and-drop column headers)
//   4. Column resizing (drag right edge of header)
//   5. Optional search filtering (external or built-in)
//   6. Empty state and loading state rendering
//
// PROPS:
//   columns      — Array<{ key, label, sortable?, align?, width?, render? }>
//   data         — Array<Object> — row data
//   loading      — boolean — show skeleton/spinner
//   pageSize     — number (default 20) — rows per page
//   pageSizeOptions — number[] (default [10,20,50,100])
//   searchable   — boolean — show built-in search bar
//   searchPlaceholder — string
//   emptyMessage — string
//   emptyIcon    — React component
//   renderCell   — (row, colKey, colDef) => ReactNode
//   onRowClick   — (row) => void
//   stickyHeader — boolean (default true)
//   compact      — boolean (default false)
//   className    — string
//   defaultSort  — { key, order }
//   rowKeyField  — string (default 'id')
//
// PATTERN SOURCE: Identical to ServiceNow module's DataTable.jsx
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
  renderExpandedRow,
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
  const [columnWidths, setColumnWidths] = useState(() => {
    const widths = {};
    initialColumns.forEach(col => {
      widths[col.key] = col.width || '150px';
    });
    return widths;
  });
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const resizingColumn = useRef(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // ── Ordered columns (based on drag reorder) ─────────────────────────────
  const columns = useMemo(() => {
    const colMap = new Map(initialColumns.map(c => [c.key, c]));
    const ordered = columnOrder
      .filter(k => colMap.has(k))
      .map(k => colMap.get(k));
    for (const c of initialColumns) {
      if (!columnOrder.includes(c.key)) ordered.push(c);
    }
    return ordered;
  }, [initialColumns, columnOrder]);

  // ── Column resizing handlers ───────────────────────────────────────────────
  const handleMouseDown = useCallback((e, columnKey) => {
    e.preventDefault();
    resizingColumn.current = columnKey;
    startX.current = e.clientX;
    const th = e.target.closest('th');
    startWidth.current = th.offsetWidth;
    
    const handleMouseMove = (e) => {
      if (!resizingColumn.current) return;
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(50, startWidth.current + diff);
      setColumnWidths(prev => ({
        ...prev,
        [columnKey]: `${newWidth}px`
      }));
    };
    
    const handleMouseUp = () => {
      resizingColumn.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

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

  const cellPx = compact ? 'px-2 py-1.5' : 'px-4 py-2.5';
  const headerPx = compact ? 'px-2 py-2' : 'px-4 py-2.5';

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={`bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden ${className}`}>
      {/* Toolbar: search (left) + pagination (right) */}
      {(searchable || (!loading && sortedData.length > 0)) && (
        <div className="px-4 py-2 border-b border-surface-100 bg-surface-50/30 flex items-center justify-between gap-3">
          {searchable ? (
            <div className="flex items-center gap-2 max-w-md w-full px-3 py-2 rounded-lg border border-brand-300 bg-gradient-to-r from-brand-50 to-blue-50 shadow-sm">
              <Search size={14} className="text-brand-500 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
                placeholder={searchPlaceholder}
                className="flex-1 text-xs text-surface-700 bg-transparent outline-none placeholder:text-surface-400 min-w-0"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setPage(0); }} className="text-surface-400 hover:text-brand-600 transition-colors">
                  <X size={13} />
                </button>
              )}
              <span className="text-[10px] text-surface-500 whitespace-nowrap font-medium">
                {filteredData.length}/{data.length}
              </span>
            </div>
          ) : <div />}

          {!loading && sortedData.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-surface-500 flex-shrink-0">
              <span className="text-[10px] text-surface-400 whitespace-nowrap">
                {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sortedData.length)} of {sortedData.length}
              </span>
              <select
                value={pageSize}
                onChange={e => handlePageSizeChange(Number(e.target.value))}
                className="px-1 py-0.5 rounded border border-surface-200 text-[10px] text-surface-600 bg-white focus:outline-none focus:ring-1 focus:ring-brand-200"
              >
                {pageSizeOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="flex items-center gap-0.5">
                <button onClick={() => setPage(0)} disabled={safePage === 0} className="p-0.5 rounded hover:bg-surface-100 disabled:opacity-30 transition-colors" title="First"><ChevronsLeft size={13} /></button>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0} className="p-0.5 rounded hover:bg-surface-100 disabled:opacity-30 transition-colors" title="Previous"><ChevronLeft size={13} /></button>
                <span className="px-1.5 py-0.5 font-medium text-surface-600 text-[10px]">{safePage + 1}/{totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} className="p-0.5 rounded hover:bg-surface-100 disabled:opacity-30 transition-colors" title="Next"><ChevronRight size={13} /></button>
                <button onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1} className="p-0.5 rounded hover:bg-surface-100 disabled:opacity-30 transition-colors" title="Last"><ChevronsRight size={13} /></button>
              </div>
            </div>
          )}
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
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-surface-300 scrollbar-track-surface-50 hover:scrollbar-thumb-surface-400 scrollbar-thumb-rounded-full">
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
                      style={{ width: columnWidths[col.key], minWidth: columnWidths[col.key] }}
                      className={`${headerPx} ${align} text-[10px] font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap select-none relative ${
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
                      {/* Resize handle */}
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-brand-400 opacity-0 hover:opacity-100 transition-opacity z-10"
                        onMouseDown={(e) => handleMouseDown(e, col.key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pagedData.map((row, rowIdx) => (
                <React.Fragment key={row[rowKeyField] || rowIdx}>
                  <tr
                    onClick={() => onRowClick?.(row)}
                    className={`hover:bg-surface-50/60 transition-colors border-b border-gradient-to-r from-transparent via-gray-100/50 to-transparent ${onRowClick ? 'cursor-pointer' : ''}`}
                  >
                    {columns.map(col => {
                      const align = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                      const cellContent = renderCell
                        ? renderCell(row, col.key, col)
                        : col.render
                          ? col.render(row[col.key], row)
                          : (row[col.key] ?? '—');
                      return (
                        <td key={col.key} className={`${cellPx} ${align} text-surface-700 text-xs whitespace-nowrap`} style={{ width: columnWidths[col.key] }}>
                          {cellContent}
                        </td>
                      );
                    })}
                  </tr>
                  {renderExpandedRow && renderExpandedRow(row)}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
