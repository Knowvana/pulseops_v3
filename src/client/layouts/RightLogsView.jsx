// ============================================================================
// RightLogsView — PulseOps V2 Layout
//
// PURPOSE: Right slide-out panel for system monitoring. Displays real-time
// logs and API calls in a tabbed interface. Toggles open/closed from the
// top nav bar monitor button.
//
// ARCHITECTURE: Stateful component managing tab selection and log display.
// All text from uiElementsText.json. Follows V1 RightPanel design with V2 theming.
// Logs rendered as structured JSON entries in a single scrollable area.
//
// USED BY: AppShell.jsx
//
// DEPENDENCIES:
//   - @config/uiElementsText.json → UI labels
//   - lucide-react            → Icons
// ============================================================================
import React, { useState, useRef, useEffect } from 'react';
import {
  X, ScrollText, Globe, Trash2, ChevronDown, ChevronRight, Copy, Check,
  Bug, Info, AlertTriangle, AlertCircle, Navigation, MousePointer
} from 'lucide-react';
import { ConfirmationModal } from '@shared';
import uiText from '@config/uiElementsText.json';

const panelText  = uiText.rightPanel;
const logText    = panelText.logs;
const apiText    = panelText.apiCalls;
const delText    = panelText.deleteConfirm;

const LOG_LEVEL_CONFIG = {
  debug: { icon: Bug,           color: 'text-surface-400', bg: 'bg-surface-50',    border: 'border-surface-200', dot: 'bg-surface-400' },
  info:  { icon: Info,          color: 'text-blue-500',    bg: 'bg-blue-50/50',    border: 'border-blue-100',    dot: 'bg-blue-500' },
  warn:  { icon: AlertTriangle, color: 'text-amber-500',   bg: 'bg-amber-50/50',   border: 'border-amber-100',   dot: 'bg-amber-500' },
  error: { icon: AlertCircle,   color: 'text-rose-500',    bg: 'bg-rose-50/50',    border: 'border-rose-100',    dot: 'bg-rose-500' },
};

const LOG_TYPE_CONFIG = {
  navigation:  { icon: Navigation,   label: 'NAV',    color: 'text-violet-500 bg-violet-50' },
  interaction: { icon: MousePointer, label: 'CLICK',  color: 'text-teal-600 bg-teal-50' },
  error:       { icon: AlertCircle,  label: 'ERROR',  color: 'text-rose-600 bg-rose-50' },
  app:         { icon: null,         label: null,     color: '' },
};

const STATUS_COLOR = (s) =>
  s >= 500 ? 'text-rose-600' : s >= 400 ? 'text-amber-600' : s >= 200 ? 'text-emerald-600' : 'text-surface-400';

const FILTER_OPTIONS = [
  { id: 'all',   label: logText.filterAll },
  { id: 'debug', label: logText.filterDebug },
  { id: 'info',  label: logText.filterInfo },
  { id: 'warn',  label: logText.filterWarn },
  { id: 'error', label: logText.filterError },
];

// Font scale: 0=small, 1=medium(default), 2=large
const FONT_SCALES = [
  { ts: 'text-[10px]', label: 'text-[10px]', meta: 'text-[9px]',  caller: 'text-[9px]',  msg: 'text-xs',  url: 'text-xs',  status: 'text-xs'  },
  { ts: 'text-xs',     label: 'text-xs',     meta: 'text-[10px]', caller: 'text-[10px]', msg: 'text-sm',  url: 'text-sm',  status: 'text-sm'  },
  { ts: 'text-sm',     label: 'text-sm',     meta: 'text-xs',     caller: 'text-xs',     msg: 'text-base',url: 'text-base',status: 'text-base'},
];

// ── JSON Detail Collapsible Component ──────────────────────────────────────
// Font sizes: Button label = text-[10px], JSON content = text-xs (12px)
// Height: max-h-64 (16rem / 256px)
function JsonDetail({ data, label }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  let formatted;
  try {
    formatted = typeof data === 'object' ? JSON.stringify(data, null, 2) : JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    formatted = String(data);
  }
  return (
    <div className="mt-1">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex items-center gap-0.5 text-[10px] font-medium text-brand-500 hover:text-brand-700"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {label || 'Details'}
      </button>
      {open && (
        <pre className="mt-1 p-1.5 rounded bg-surface-100 border border-surface-200 text-xs font-mono text-surface-600 whitespace-pre-wrap break-all max-h-64 overflow-auto">
          {formatted}
        </pre>
      )}
    </div>
  );
}

// ── Log Entry Card Component ──────────────────────────────────────────────────
function LogEntryCard({ log, scale = 1 }) {
  const cfg     = LOG_LEVEL_CONFIG[log.level] || LOG_LEVEL_CONFIG.debug;
  const typeCfg = LOG_TYPE_CONFIG[log.type]   || LOG_TYPE_CONFIG.app;
  const FS      = FONT_SCALES[scale] || FONT_SCALES[1];

  const callerLabel = log.fileName
    ? (log.functionName ? `${log.fileName}:${log.functionName}` : log.fileName)
    : null;

  return (
    <div className={`rounded-md border ${cfg.border} ${cfg.bg} px-2.5 py-2`}>
      {/* Line 1: Timestamp — always first and prominent */}
      <div className={`${FS.ts} font-mono font-semibold text-surface-500 mb-1`}>
        {log.displayTime || log.timestamp}
      </div>
      {/* Line 2: Level badge + type badge + caller label */}
      <div className="flex items-center gap-1 flex-wrap mb-1">
        <span className={`${FS.label} font-bold uppercase px-1.5 py-0.5 rounded ${cfg.color}`}>{log.level}</span>
        {typeCfg.label && (
          <span className={`${FS.meta} font-semibold uppercase px-1.5 py-0.5 rounded ${typeCfg.color}`}>{typeCfg.label}</span>
        )}
        {callerLabel && (
          <span className={`${FS.caller} text-surface-400 font-mono break-all`}>{callerLabel}</span>
        )}
      </div>
      {/* Line 3: Message */}
      <p className={`${FS.msg} text-surface-700 break-words leading-snug`}>{log.message}</p>
      {/* Tracking IDs */}
      <div className="flex flex-wrap gap-1 mt-1">
        {log.sessionId && (
          <span className={`inline-block ${FS.meta} font-mono text-teal-600 bg-teal-50 px-1.5 rounded border border-teal-100`}>
            SID: {log.sessionId}
          </span>
        )}
        {log.correlationId && (
          <span className={`inline-block ${FS.meta} font-mono text-violet-500 bg-violet-50 px-1.5 rounded border border-violet-100`}>
            COR: {log.correlationId}
          </span>
        )}
      </div>
      {log.context && <JsonDetail data={log.context} label="Context" />}
    </div>
  );
}

// ── API Call Card Component ───────────────────────────────────────────────────
function ApiCallCard({ call, scale = 1 }) {
  const isSuccess = call.status >= 200 && call.status < 300;
  const isError   = call.status === 0 || call.status >= 400;
  const FS        = FONT_SCALES[scale] || FONT_SCALES[1];

  return (
    <div className={`rounded-md border px-2.5 py-2 ${
      isError ? 'border-rose-100 bg-rose-50/30' : 'border-emerald-100 bg-emerald-50/30'
    }`}>
      {/* Line 1: Timestamp — always first and prominent */}
      <div className={`${FS.ts} font-mono font-semibold text-surface-500 mb-1`}>
        {call.displayTime || call.timestamp}
      </div>
      {/* Line 2: Method + URL + Status */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`${FS.label} font-bold px-1.5 py-0.5 rounded shrink-0 ${
            isError ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
          }`}>{call.method}</span>
          <span className={`${FS.url} text-surface-600 break-all`}>{call.url}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`${FS.status} font-bold ${STATUS_COLOR(call.status)}`}>{call.status || '—'}</span>
          {call.duration != null && <span className={`${FS.meta} text-surface-400`}>{call.duration}ms</span>}
        </div>
      </div>
      {call.error && (
        <p className={`${FS.meta} text-rose-500 mt-1 break-all`}>{call.error}</p>
      )}
      {/* Tracking IDs */}
      <div className="flex flex-wrap gap-1 mt-1">
        {call.sessionId && (
          <span className={`inline-block ${FS.meta} font-mono text-teal-600 bg-teal-50 px-1.5 rounded border border-teal-100 break-all`}>
            SID: {call.sessionId}
          </span>
        )}
        {call.correlationId && (
          <span className={`inline-block ${FS.meta} font-mono text-violet-500 bg-violet-50 px-1.5 rounded border border-violet-100 break-all`}>
            COR: {call.correlationId}
          </span>
        )}
      </div>
      {call.requestBody  && <JsonDetail data={call.requestBody}  label="Request Body" />}
      {call.responseBody && <JsonDetail data={call.responseBody} label="Response Body" />}
    </div>
  );
}

export default function RightLogsView({ isOpen, onClose, logs = [], apiCalls = [], onDeleteAllLogs, totalCount }) {
  const [activeTab, setActiveTab]           = useState('logs');
  const [logFilter, setLogFilter]           = useState('all');
  const [copied, setCopied]                 = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fontScale, setFontScale]           = useState(1);
  const scrollEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const wasAtBottomRef = useRef(true);
  const prevLogCountRef = useRef(0);

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.level === logFilter);

  // Track if user is scrolled to bottom before updates
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Consider "at bottom" if within 50px of the bottom
      wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Only auto-scroll when panel opens or when user was already at bottom
  useEffect(() => {
    const currentLogCount = activeTab === 'logs' ? filteredLogs.length : apiCalls.length;
    const isNewLogs = currentLogCount > prevLogCountRef.current;
    prevLogCountRef.current = currentLogCount;

    // Auto-scroll only if: panel just opened OR (new logs arrived AND user was at bottom)
    if (isOpen && scrollEndRef.current) {
      if (!isNewLogs || wasAtBottomRef.current) {
        scrollEndRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }
    }
  }, [filteredLogs.length, apiCalls.length, isOpen, activeTab]);

  const handleCopyAll = () => {
    const data = activeTab === 'logs' ? filteredLogs : apiCalls;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => {});
  };

  const sessionId = logs[0]?.sessionId || apiCalls[0]?.sessionId;

  return (
    <div
      className={`flex-shrink-0 bg-white border-l border-surface-200 shadow-xl flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
        isOpen ? 'w-[var(--right-panel-width)]' : 'w-0 border-l-0'
      }`}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-200 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'logs' ? 'bg-brand-50 text-brand-700' : 'text-surface-400 hover:text-surface-600 hover:bg-surface-50'
            }`}
          >
            <div className="flex items-center gap-1">
              <ScrollText size={12} />
              {panelText.tabs.systemLogs}
              {logs.length > 0 && (
                <span className="px-1 py-0 rounded-full text-[9px] bg-brand-100 text-brand-600">{logs.length}</span>
              )}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'api' ? 'bg-brand-50 text-brand-700' : 'text-surface-400 hover:text-surface-600 hover:bg-surface-50'
            }`}
          >
            <div className="flex items-center gap-1">
              <Globe size={12} />
              {panelText.tabs.apiCalls}
              {apiCalls.length > 0 && (
                <span className="px-1 py-0 rounded-full text-[9px] bg-brand-100 text-brand-600">{apiCalls.length}</span>
              )}
            </div>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFontScale(s => Math.max(0, s - 1))}
            title="Decrease font size"
            disabled={fontScale === 0}
            className="px-1 py-0.5 rounded text-[10px] font-bold text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-30"
          >A-</button>
          <button
            onClick={() => setFontScale(s => Math.min(2, s + 1))}
            title="Increase font size"
            disabled={fontScale === 2}
            className="px-1 py-0.5 rounded text-[10px] font-bold text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-30"
          >A+</button>
          <button onClick={handleCopyAll} title="Copy as JSON"
            className="p-1 rounded text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete all logs"
            className="p-1 rounded text-surface-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
          >
            <Trash2 size={12} />
          </button>
          <button onClick={onClose}
            className="p-1 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Session + backend total count strip ── */}
      <div className="px-3 py-1 bg-surface-50 border-b border-surface-100 flex-shrink-0 flex items-center justify-between">
        {sessionId
          ? <span className="text-[9px] font-mono text-surface-400">Session: {sessionId}</span>
          : <span />}
        {totalCount !== null && (
          <span className="text-[9px] text-surface-400">
            {totalCount.toLocaleString()} total log{totalCount !== 1 ? 's' : ''} stored
          </span>
        )}
      </div>

      {/* ── Filter bar (logs tab) ── */}
      {activeTab === 'logs' && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-surface-100 bg-surface-50 flex-shrink-0">
          {FILTER_OPTIONS.map((f) => (
            <button key={f.id} onClick={() => setLogFilter(f.id)}
              className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase transition-all ${
                logFilter === f.id ? 'bg-brand-100 text-brand-700' : 'text-surface-400 hover:text-surface-600 hover:bg-surface-100'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-2 space-y-1">

        {/* UI logs only */}
        {activeTab === 'logs' && (
          <>
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ScrollText size={28} className="text-surface-300 mb-2" />
                <p className="text-xs font-medium text-surface-500">{logText.emptyMessage}</p>
                <p className="text-[10px] text-surface-400 mt-1">{logText.emptyHint}</p>
              </div>
            ) : (
              filteredLogs.map((log) => <LogEntryCard key={log.id || log.timestamp} log={log} scale={fontScale} />)
            )}
            <div ref={scrollEndRef} />
          </>
        )}

        {/* API calls only */}
        {activeTab === 'api' && (
          <>
            {apiCalls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Globe size={28} className="text-surface-300 mb-2" />
                <p className="text-xs font-medium text-surface-500">{apiText.emptyMessage}</p>
                <p className="text-[10px] text-surface-400 mt-1">{apiText.emptyHint}</p>
              </div>
            ) : (
              apiCalls.map((call) => <ApiCallCard key={call.id || call.timestamp} call={call} scale={fontScale} />)
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={delText.title}
        actionDescription={delText.actionDescription}
        actionTarget={delText.actionTarget}
        actionDetails={[
          { label: delText.detailUiLogs,   value: logs.length },
          { label: delText.detailApiCalls, value: apiCalls.length },
          { label: delText.detailStored,   value: totalCount !== null ? totalCount.toLocaleString() : '—' },
        ]}
        confirmLabel={delText.confirmLabel}
        variant="danger"
        action={async () => {
          const cleared = logs.length + apiCalls.length;
          const stored  = totalCount;
          await onDeleteAllLogs?.();
          return { cleared, stored };
        }}
        onSuccess={() => setShowDeleteConfirm(false)}
        buildSummary={(result) => [
          { label: delText.summaryDeleted, value: result.cleared },
          { label: delText.detailStored,   value: result.stored !== null ? result.stored.toLocaleString() : '—' },
          { label: 'Status',               value: delText.summaryStatus },
        ]}
      />
    </div>
  );
}
