// ============================================================================
// LogStats — PulseOps V2 Shared Component
//
// PURPOSE: Reusable stats bar for log viewer and logging configuration pages.
// Shows log source (File/DB), last sync time, entry count, refresh & delete.
//
// USAGE:
//   <LogStats
//     storage="file"
//     count={123}
//     lastSync="2026-03-03T08:15:08.191Z"
//     onRefresh={() => {}}
//     onDelete={() => {}}
//     isLoading={false}
//   />
//
// ARCHITECTURE: All text from uiElementsText.json. No hardcoded strings.
// ============================================================================
import React from 'react';
import { Database, FileText, RefreshCw, Trash2, Clock, Hash } from 'lucide-react';
import uiText from '@config/uiElementsText.json';
import TimezoneService from '@shared/services/timezoneService';

const statsText = uiText.coreViews.logs.stats;

function formatTime(isoString) {
  return TimezoneService.formatTime(isoString);
}

export default function LogStats({
  storage = 'file',
  count = 0,
  lastSync = null,
  onRefresh,
  onDelete,
  isLoading = false,
  isRefreshing = false,
  compact = false,
}) {
  const isFile = storage === 'file';
  const SourceIcon = isFile ? FileText : Database;
  const sourceLabel = isFile ? statsText.file : statsText.database;

  return (
    <div className={`flex flex-wrap items-center gap-3 ${compact ? 'gap-2' : 'gap-3'}`}>
      {/* Combined Stats Card */}
      <div className="flex items-center rounded-xl bg-gradient-to-r from-brand-50/80 via-teal-50/60 to-emerald-50/50 border border-brand-200/60 shadow-sm">
        {/* Log Source */}
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-teal-400 flex items-center justify-center shadow-sm">
            <SourceIcon size={14} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-surface-400 uppercase tracking-wider leading-none">{statsText.logSource}</span>
            <span className={`text-xs font-bold ${isFile ? 'text-amber-600' : 'text-brand-700'}`}>{sourceLabel}</span>
          </div>
        </div>

        {/* Gradient Separator */}
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-300 to-transparent" />

        {/* Last Sync */}
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-400 flex items-center justify-center shadow-sm">
            <Clock size={14} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-surface-400 uppercase tracking-wider leading-none">{statsText.lastSync}</span>
            <span className="text-xs font-bold text-surface-700">{formatTime(lastSync)}</span>
          </div>
        </div>

        {/* Gradient Separator */}
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-300 to-transparent" />

        {/* Entry Count */}
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-brand-400 flex items-center justify-center shadow-sm">
            <Hash size={14} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-surface-400 uppercase tracking-wider leading-none">{statsText.logEntries}</span>
            <span className="text-xs font-bold text-surface-700">{count.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Refresh */}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isLoading || isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 hover:bg-brand-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          {isRefreshing ? 'Refreshing…' : statsText.refreshNow}
        </button>
      )}

      {/* Delete */}
      {onDelete && (
        <button
          onClick={onDelete}
          disabled={isLoading || isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-danger-600 bg-danger-50 border border-danger-200 hover:bg-danger-100 transition-colors disabled:opacity-50"
        >
          <Trash2 size={13} />
          {statsText.deleteLogs}
        </button>
      )}
    </div>
  );
}
