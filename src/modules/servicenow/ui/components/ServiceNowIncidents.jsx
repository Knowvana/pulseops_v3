// ============================================================================
// ServiceNowIncidents — PulseOps V3 ServiceNow Module
//
// PURPOSE: Full incident list view with filtering (state, priority), free-text
// search, and client-side pagination. Fetches from GET /api/servicenow/incidents
// and re-queries on filter changes. Shows a "not configured" prompt when the
// ServiceNow connection has not been set up.
//
// ARCHITECTURE:
//   - Debounced search (300ms) to avoid hammering the API on every keystroke
//   - Page state resets on filter change to avoid empty-page scenarios
//   - All text from uiText.json — zero hardcoded strings
//   - Priority / state badges use Tailwind semantic tokens
//
// USED BY: src/modules/servicenow/manifest.jsx → getViews().incidents
//
// DEPENDENCIES:
//   - lucide-react                         → Icons
//   - @modules/servicenow/uiText.json      → All UI labels
//   - @config/urls.json                    → API endpoints
//   - @shared                              → createLogger, ApiClient
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ListFilter, Search, RefreshCw, ChevronLeft, ChevronRight,
  WifiOff, ArrowRight, Loader2, AlertCircle,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
// Module-local API URLs — no dependency on platform urls.json
const snApi = {
  incidents: '/api/servicenow/incidents',
  incidentConfig: '/api/servicenow/config/incidents',
};
import uiText from '../config/uiText.json';

const log = createLogger('ServiceNowIncidents.jsx');
const t   = uiText.incidents;

const PAGE_SIZE = 20;

// ── SNOW numeric → display key mappings ──────────────────────────────────────
const PRIORITY_NUM_MAP = { '1': 'critical', '2': 'high', '3': 'medium', '4': 'low', '5': 'planning' };
const STATE_NUM_MAP = { '1': 'open', '2': 'in_progress', '3': 'on_hold', '6': 'resolved', '7': 'closed', '8': 'cancelled' };

// ── Column label map for SNOW field names ────────────────────────────────────
const COLUMN_LABELS = {
  number: 'Number', short_description: 'Title', priority: 'Priority',
  state: 'State', assigned_to: 'Assigned To', assignment_group: 'Assignment Group',
  opened_at: 'Created', sys_created_on: 'Sys Created', resolved_at: 'Resolved',
  closed_at: 'Closed', category: 'Category', subcategory: 'Subcategory',
  impact: 'Impact', urgency: 'Urgency', description: 'Description',
  caller_id: 'Caller', sla_due: 'SLA Due', sys_updated_on: 'Updated',
  close_code: 'Close Code', close_notes: 'Close Notes', contact_type: 'Contact Type',
  work_notes: 'Work Notes', comments: 'Comments', sys_id: 'Sys ID',
};
const DEFAULT_COLUMNS = ['number','short_description','priority','state','assigned_to','opened_at'];

// ── Filter option arrays ──────────────────────────────────────────────────────
const STATE_OPTIONS   = ['all', 'open', 'in_progress', 'on_hold', 'resolved', 'closed'];
const PRIORITY_OPTIONS = ['all', 'critical', 'high', 'medium', 'low', 'planning'];

// ── Visual config ─────────────────────────────────────────────────────────────
const PRIORITY_STYLES = {
  critical: 'bg-rose-100 text-rose-700 border border-rose-200',
  high:     'bg-amber-100 text-amber-700 border border-amber-200',
  medium:   'bg-blue-100 text-blue-700 border border-blue-200',
  low:      'bg-surface-100 text-surface-600 border border-surface-200',
  planning: 'bg-violet-100 text-violet-700 border border-violet-200',
};

const PRIORITY_DOTS = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-blue-500',
  low:      'bg-surface-400',
  planning: 'bg-violet-500',
};

const STATE_STYLES = {
  open:        'bg-rose-50 text-rose-600',
  in_progress: 'bg-amber-50 text-amber-600',
  on_hold:     'bg-violet-50 text-violet-600',
  resolved:    'bg-emerald-50 text-emerald-600',
  closed:      'bg-surface-100 text-surface-500',
  cancelled:   'bg-surface-50 text-surface-400',
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceNowIncidents({ onNavigate }) {
  const [incidents, setIncidents] = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [incidentConfig, setIncidentConfig] = useState(null);
  const [sortField, setSortField] = useState('number');
  const [sortOrder, setSortOrder] = useState('desc');

  // Filters
  const [search,   setSearch]   = useState('');
  const [state,    setState]    = useState('all');
  const [priority, setPriority] = useState('all');
  const [page,     setPage]     = useState(0);

  const initRan   = useRef(false);
  const searchRef = useRef(null);

  // ── Fetch incident config ─────────────────────────────────────────────
  const fetchIncidentConfig = useCallback(async () => {
    try {
      const res = await ApiClient.get(snApi.incidentConfig);
      if (res?.success) setIncidentConfig(res.data);
    } catch { /* use defaults */ }
  }, []);

  // ── Fetch incidents (always live from SNOW) ────────────────────────────
  const fetchIncidents = useCallback(async (opts = {}) => {
    const {
      searchVal   = search,
      stateVal    = state,
      priorityVal = priority,
      pageVal     = page,
      sort        = sortField,
      order       = sortOrder,
    } = opts;

    log.debug('fetchIncidents', 'Fetching', { state: stateVal, priority: priorityVal, page: pageVal, search: searchVal, sort, order });
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      limit:  String(PAGE_SIZE),
      offset: String(pageVal * PAGE_SIZE),
      sort,
      order,
    });
    if (stateVal    !== 'all') params.set('state',    stateVal);
    if (priorityVal !== 'all') params.set('priority', priorityVal);
    if (searchVal.trim())      params.set('search',   searchVal.trim());

    try {
      const res = await ApiClient.get(`${snApi.incidents}?${params}`);
      if (res?.success) {
        log.info('fetchIncidents', 'Incidents loaded', { count: res.data.incidents?.length, total: res.data.total });
        
        // Map ServiceNow fields to component properties and extract from {link, value} objects
        const mappedIncidents = (res.data.incidents || []).map(inc => {
          const getValue = (field) => typeof field === 'object' && field?.value ? field.value : field;
          const mapped = {
            id: getValue(inc.sys_id) || getValue(inc.number),
            number: getValue(inc.number),
            title: getValue(inc.short_description) || getValue(inc.title) || '—',
            priority: PRIORITY_NUM_MAP[String(getValue(inc.priority))] || getValue(inc.priority),
            state: STATE_NUM_MAP[String(getValue(inc.state))] || getValue(inc.state),
            assignedTo: getValue(inc.assigned_to) || getValue(inc.assignedTo),
            slaDue: getValue(inc.sla_due) || getValue(inc.slaDue),
            createdAt: getValue(inc.opened_at) || getValue(inc.sys_created_on) || getValue(inc.createdAt),
          };
          // Also store raw values for dynamic column display
          mapped._raw = {};
          for (const key of Object.keys(inc)) {
            mapped._raw[key] = getValue(inc[key]);
          }
          return mapped;
        });
        
        setIncidents(mappedIncidents);
        setTotal(res.data.total || 0);
        setNotConfigured(false);
      } else {
        log.warn('fetchIncidents', 'Failed', { error: res?.error?.message });
        setError(res?.error?.message || uiText.common.fetchError);
      }
    } catch (err) {
      log.error('fetchIncidents', 'Unexpected error', { error: err.message });
      setError(uiText.common.fetchError);
    } finally {
      setLoading(false);
    }
  }, [search, state, priority, page, sortField, sortOrder]);

  // StrictMode-safe initial load
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('mount', 'ServiceNow Incidents mounted');
    fetchIncidentConfig();
    fetchIncidents();
  }, [fetchIncidents, fetchIncidentConfig]);

  // ── Column sort handler ─────────────────────────────────────────────────
  const handleSort = useCallback((field) => {
    const newOrder = sortField === field && sortOrder === 'desc' ? 'asc' : 'desc';
    setSortField(field);
    setSortOrder(newOrder);
    setPage(0);
    fetchIncidents({ sort: field, order: newOrder, pageVal: 0 });
  }, [sortField, sortOrder, fetchIncidents]);

  // Debounced search — avoid hammering API on every keystroke
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setPage(0);
      fetchIncidents({ searchVal: search, pageVal: 0 });
    }, 300);
    return () => clearTimeout(searchRef.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter handlers ────────────────────────────────────────────────────
  const handleStateChange = useCallback((val) => {
    setState(val);
    setPage(0);
    fetchIncidents({ stateVal: val, pageVal: 0 });
  }, [fetchIncidents]);

  const handlePriorityChange = useCallback((val) => {
    setPriority(val);
    setPage(0);
    fetchIncidents({ priorityVal: val, pageVal: 0 });
  }, [fetchIncidents]);

  const handlePageChange = useCallback((newPage) => {
    setPage(newPage);
    fetchIncidents({ pageVal: newPage });
  }, [fetchIncidents]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Dynamic columns from incident config ──────────────────────────────
  const activeColumns = useMemo(() => {
    const cols = incidentConfig?.selectedColumns?.length > 0
      ? incidentConfig.selectedColumns
      : DEFAULT_COLUMNS;
    return cols.map(key => ({
      key,
      label: COLUMN_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }));
  }, [incidentConfig]);

  // ── Render a cell value with special formatting for priority/state ─────
  const renderCellValue = useCallback((inc, colKey) => {
    const raw = inc._raw?.[colKey];
    const val = raw !== undefined ? raw : inc[colKey];
    if (colKey === 'priority') {
      const pKey = PRIORITY_NUM_MAP[String(val)] || val;
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${PRIORITY_STYLES[pKey] || PRIORITY_STYLES.low}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOTS[pKey] || 'bg-surface-400'}`} />
          {t.priority[pKey] || pKey}
        </span>
      );
    }
    if (colKey === 'state') {
      const sKey = STATE_NUM_MAP[String(val)] || val;
      return (
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${STATE_STYLES[sKey] || STATE_STYLES.open}`}>
          {t.state[sKey] || sKey}
        </span>
      );
    }
    if (colKey === 'number') {
      return <span className="font-mono text-xs text-brand-600 font-bold whitespace-nowrap">{val || uiText.common.na}</span>;
    }
    if (colKey === 'short_description') {
      return <span className="block truncate max-w-[300px]">{val || uiText.common.na}</span>;
    }
    // Date columns — format without ISO "T" separator
    if (['opened_at','sys_created_on','resolved_at','closed_at','sys_updated_on','sla_due'].includes(colKey)) {
      if (!val) return uiText.common.na;
      const d = new Date(val);
      if (isNaN(d.getTime())) return val;
      return d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }
    return val || uiText.common.na;
  }, []);

  // ── Not configured ─────────────────────────────────────────────────────
  if (!loading && notConfigured) {
    return (
      <div className="p-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <ListFilter size={20} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800">{t.title}</h1>
            <p className="text-sm text-surface-500">{t.subtitle}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-surface-200 p-12 flex flex-col items-center text-center shadow-sm">
          <WifiOff size={28} className="text-surface-300 mb-3" />
          <h2 className="text-sm font-bold text-surface-700 mb-1">{t.notConfigured}</h2>
          <p className="text-xs text-surface-400 max-w-sm mb-5">{t.notConfiguredHint}</p>
          <button
            onClick={() => onNavigate?.('config')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
          >
            Configure Now <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <ListFilter size={20} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800">{t.title}</h1>
            <p className="text-sm text-surface-500">{t.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchIncidents()}
            disabled={loading}
            className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button onClick={() => fetchIncidents()} className="ml-auto text-xs underline">{uiText.common.retry}</button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-surface-200 px-3 py-2 shadow-sm">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-surface-400 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="flex-1 text-sm text-surface-700 placeholder-surface-400 bg-transparent outline-none"
          />
        </div>
        <div className="w-px h-5 bg-surface-200" />
        {/* State filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-surface-500 font-medium">{t.filterState}:</span>
          <div className="flex gap-0.5">
            {STATE_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => handleStateChange(opt)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize transition-all ${
                  state === opt ? 'bg-brand-100 text-brand-700' : 'text-surface-500 hover:bg-surface-100'
                }`}
              >
                {opt === 'all' ? t.filterAll : t.state[opt] || opt}
              </button>
            ))}
          </div>
        </div>
        <div className="w-px h-5 bg-surface-200" />
        {/* Priority filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-surface-500 font-medium">{t.filterPriority}:</span>
          <div className="flex gap-0.5">
            {PRIORITY_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => handlePriorityChange(opt)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold capitalize transition-all ${
                  priority === opt ? 'bg-brand-100 text-brand-700' : 'text-surface-500 hover:bg-surface-100'
                }`}
              >
                {opt !== 'all' && (
                  <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOTS[opt] || 'bg-surface-400'}`} />
                )}
                {opt === 'all' ? t.filterAll : t.priority[opt] || opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 size={22} className="text-brand-400 animate-spin" />
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-12 text-center">
            <ListFilter size={28} className="text-surface-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-surface-600">{t.noIncidents}</p>
            <p className="text-xs text-surface-400 mt-1">{t.noIncidentsHint}</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-surface-300 scrollbar-track-surface-50 hover:scrollbar-thumb-surface-400">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200">
                  {activeColumns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-brand-600 select-none"
                    >
                      {col.label}
                      {sortField === col.key && (
                        <span className="ml-1 text-brand-500">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {incidents.map(inc => (
                  <tr key={inc.id} className="hover:bg-surface-50/60 transition-colors">
                    {activeColumns.map(col => (
                      <td key={col.key} className="px-4 py-2.5 text-surface-700 text-xs whitespace-nowrap">
                        {renderCellValue(inc, col.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between text-xs text-surface-500">
          <span>
            {t.showing} {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} {t.of} {total} {t.incidents}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-surface-200 text-surface-600 hover:border-brand-300 hover:text-brand-600 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={13} /> {t.prevPage}
            </button>
            <span className="px-3 py-1 text-surface-500 font-medium">{page + 1} / {totalPages}</span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-surface-200 text-surface-600 hover:border-brand-300 hover:text-brand-600 disabled:opacity-40 transition-colors"
            >
              {t.nextPage} <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
