// ============================================================================
// Google GKE Module — Pod Logs Dialog Component
//
// PURPOSE: Modal dialog for viewing live pod logs with:
//   - Tail lines / since minutes / container selection
//   - Error/Warning text highlighting and filtering
//   - Log search with match count
//   - Download logs as .txt
//   - Previous container log toggle
//   - Auto-scroll to bottom
//
// API ENDPOINT:
//   GET /api/google_gke/workloads/pods/{ns}/{name}/logs
//     ?tailLines=500&sinceSeconds=3600&container=main&previous=false
//
// TEXT: uiText.json → workloads.podLogs section
// ============================================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  X, RefreshCw, Download, Search, Loader2,
  AlertTriangle, AlertCircle, FileText, ChevronDown,
} from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import uiErrors from '../config/uiErrors.json';
import urls from '../config/urls.json';

const log = createLogger('PodLogsDialog');
const t = uiText.workloads.podLogs;
const api = urls.api;

// ── Log line classifier ─────────────────────────────────────────────────────
function classifyLine(line) {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('fatal') || lower.includes('panic') || lower.includes('exception')) return 'error';
  if (lower.includes('warn') || lower.includes('warning')) return 'warn';
  return 'normal';
}

// ─────────────────────────────────────────────────────────────────────────────
// PodLogsDialog Component
// ─────────────────────────────────────────────────────────────────────────────
export default function PodLogsDialog({ pod, onClose }) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Options
  const [tailLines, setTailLines] = useState(500);
  const [sinceMinutes, setSinceMinutes] = useState('');
  const [container, setContainer] = useState('');
  const [previous, setPrevious] = useState(false);

  // Filter / search
  const [filterText, setFilterText] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // all | errors | warnings

  const logEndRef = useRef(null);
  const logContainerRef = useRef(null);

  // ── Build container list from pod data ──────────────────────────────────
  const containers = useMemo(() => {
    if (!pod) return [];
    const list = [];
    if (pod.containers && Array.isArray(pod.containers)) {
      pod.containers.forEach(c => {
        if (c.name) list.push(c.name);
      });
    }
    return list;
  }, [pod]);

  // ── Fetch logs ─────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    if (!pod) return;
    setLoading(true);
    setError(null);
    try {
      const url = api.workloadPodLogs
        .replace('{ns}', pod.namespace)
        .replace('{name}', pod.name);

      const params = new URLSearchParams();
      params.set('tailLines', String(tailLines));
      if (sinceMinutes) params.set('sinceSeconds', String(parseInt(sinceMinutes, 10) * 60));
      if (container) params.set('container', container);
      if (previous) params.set('previous', 'true');

      const fullUrl = `${url}?${params.toString()}`;
      log.debug('fetchLogs', 'Fetching pod logs', { url: fullUrl });

      const res = await ApiClient.get(fullUrl);
      if (res?.success) {
        setLogs(res.data?.logs || '');
      } else {
        setError(res?.error?.message || uiErrors.workloads.logsFetchFailed);
      }
    } catch (err) {
      log.error('fetchLogs', 'Failed', { error: err.message });
      setError(uiErrors.workloads.logsFetchFailed);
    } finally {
      setLoading(false);
    }
  }, [pod, tailLines, sinceMinutes, container, previous]);

  // ── Auto-fetch on mount ────────────────────────────────────────────────
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // ── Auto-scroll to bottom ──────────────────────────────────────────────
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // ── Parsed lines ──────────────────────────────────────────────────────
  const parsedLines = useMemo(() => {
    if (!logs) return [];
    return logs.split('\n').map((line, idx) => ({
      idx,
      text: line,
      type: classifyLine(line),
    }));
  }, [logs]);

  // ── Filtered lines ────────────────────────────────────────────────────
  const filteredLines = useMemo(() => {
    let lines = parsedLines;
    if (filterMode === 'errors') lines = lines.filter(l => l.type === 'error');
    if (filterMode === 'warnings') lines = lines.filter(l => l.type === 'warn' || l.type === 'error');
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      lines = lines.filter(l => l.text.toLowerCase().includes(q));
    }
    return lines;
  }, [parsedLines, filterMode, filterText]);

  // ── Stats ─────────────────────────────────────────────────────────────
  const errorCount = useMemo(() => parsedLines.filter(l => l.type === 'error').length, [parsedLines]);
  const warnCount = useMemo(() => parsedLines.filter(l => l.type === 'warn').length, [parsedLines]);

  // ── Download logs ─────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pod.name}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs, pod]);

  if (!pod) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-surface-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={16} className="text-brand-500 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-surface-800 truncate">{t.title}: {pod.name}</h2>
              <p className="text-[10px] text-surface-400">{pod.namespace}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-2 border-b border-surface-100 flex items-center gap-3 flex-wrap text-xs">
          {/* Tail lines */}
          <div className="flex items-center gap-1">
            <span className="text-surface-500 font-medium">{t.tailLines}:</span>
            <select
              value={tailLines}
              onChange={e => setTailLines(Number(e.target.value))}
              className="px-1.5 py-0.5 rounded border border-surface-200 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-brand-200"
            >
              {[100, 250, 500, 1000, 2000, 5000].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Since minutes */}
          <div className="flex items-center gap-1">
            <span className="text-surface-500 font-medium">{t.sinceMinutes}:</span>
            <input
              type="number"
              value={sinceMinutes}
              onChange={e => setSinceMinutes(e.target.value)}
              placeholder="—"
              className="w-14 px-1.5 py-0.5 rounded border border-surface-200 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-brand-200"
            />
          </div>

          {/* Container */}
          {containers.length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-surface-500 font-medium">{t.container}:</span>
              <select
                value={container}
                onChange={e => setContainer(e.target.value)}
                className="px-1.5 py-0.5 rounded border border-surface-200 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-brand-200"
              >
                <option value="">All</option>
                {containers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Previous */}
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={previous}
              onChange={e => setPrevious(e.target.checked)}
              className="w-3 h-3 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-surface-500 font-medium text-[11px]">{t.previous}</span>
          </label>

          {/* Refresh */}
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 text-[11px] font-semibold transition-colors disabled:opacity-40"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            {t.refreshLogs}
          </button>

          {/* Download */}
          {logs && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-100 text-surface-600 hover:bg-surface-200 text-[11px] font-semibold transition-colors"
            >
              <Download size={11} />
              {t.downloadLogs}
            </button>
          )}

          <div className="flex-1" />

          {/* Error/Warn counts */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600">
              <AlertCircle size={10} /> {errorCount} {t.errorLines}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
              <AlertTriangle size={10} /> {warnCount} {t.warnLines}
            </span>
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-5 py-2 border-b border-surface-100 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-lg px-3 py-1.5 rounded-lg border border-surface-200 bg-white">
            <Search size={12} className="text-surface-400 flex-shrink-0" />
            <input
              type="text"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder={t.filterPlaceholder}
              className="flex-1 text-xs text-surface-700 bg-transparent outline-none placeholder:text-surface-400 min-w-0"
            />
            {filterText && (
              <button onClick={() => setFilterText('')} className="text-surface-400 hover:text-surface-600">
                <X size={11} />
              </button>
            )}
            <span className="text-[10px] text-surface-400 font-medium">{filteredLines.length}</span>
          </div>

          {/* Filter mode buttons */}
          <div className="flex items-center gap-0.5 bg-surface-100 rounded-lg p-0.5">
            {[
              { key: 'all', label: 'All' },
              { key: 'errors', label: 'Errors' },
              { key: 'warnings', label: 'Warn+Err' },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setFilterMode(m.key)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                  filterMode === m.key ? 'bg-white text-brand-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Log output */}
        <div
          ref={logContainerRef}
          className="flex-1 overflow-y-auto bg-surface-900 text-surface-100 font-mono text-[11px] leading-relaxed p-4 min-h-0"
        >
          {loading && !logs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="text-brand-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-rose-400 py-8 justify-center">
              <AlertTriangle size={14} />
              <span className="text-xs">{error}</span>
            </div>
          ) : filteredLines.length === 0 ? (
            <div className="text-surface-500 text-center py-8 text-xs">{t.noLogs}</div>
          ) : (
            <>
              {filteredLines.map(line => {
                const bgClass = line.type === 'error' ? 'bg-rose-900/30' : line.type === 'warn' ? 'bg-amber-900/20' : '';
                const textClass = line.type === 'error' ? 'text-rose-300' : line.type === 'warn' ? 'text-amber-300' : 'text-surface-300';
                return (
                  <div key={line.idx} className={`${bgClass} px-1 py-px hover:bg-white/5 rounded-sm`}>
                    <span className="text-surface-600 select-none mr-3 inline-block w-8 text-right text-[9px]">{line.idx + 1}</span>
                    <span className={textClass}>{line.text}</span>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <span className="text-[10px] text-surface-400">
            {parsedLines.length} lines total | {filteredLines.length} shown
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-surface-300 text-surface-600 hover:bg-surface-50 transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
