// ============================================================================
// StatsCount — PulseOps V2 Design System
//
// PURPOSE: Reusable component for displaying count statistics in a single-row
// layout with sync controls, last load time, and auto-sync schedule. Designed
// for ticket counts, task counts, or any countable metrics from external services.
// Matches ServiceNow Dashboard design pattern.
//
// USAGE:
//   import { StatsCount } from '@shared';
//   <StatsCount
//     title="Ticket Counts"
//     icon={Ticket}
//     counts={[
//       { id: 'total', label: 'Total Incidents', value: 42, color: 'danger' },
//       { id: 'open', label: 'Open Incidents', value: 15, color: 'danger' },
//       { id: 'ritms', label: 'Total RITMs', value: 28, color: 'info' },
//       { id: 'openritms', label: 'Open RITMs', value: 8, color: 'info' },
//       { id: 'changes', label: 'Total Changes', value: 12, color: 'success' },
//       { id: 'pendingchanges', label: 'Pending Changes', value: 3, color: 'success' }
//     ]}
//     lastLoad="3/2/2026, 10:46:36 AM"
//     autoSyncSchedule="Not Configured"
//     onSync={async () => { await syncTickets(); }}
//     isSyncing={false}
//   />
//
// PROPS:
//   title              — Component title (required)
//   icon               — Lucide icon component (optional)
//   counts             — Array of { id, label, value, color } (required)
//   lastLoad           — Last load timestamp (optional)
//   autoSyncSchedule   — Auto-sync schedule text (optional)
//   onSync             — Async function to sync data (optional)
//   isSyncing          — Loading state (default: false)
//
// ARCHITECTURE: Fully reusable and config-based. Single-row horizontal layout
// with counts displayed as centered values with labels below. Sync button and
// metadata at top right.
// ============================================================================
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@shared';

const COLOR_VARIANTS = {
  danger: { text: 'text-rose-600', label: 'text-surface-500' },
  info: { text: 'text-blue-600', label: 'text-surface-500' },
  success: { text: 'text-emerald-600', label: 'text-surface-500' },
  warning: { text: 'text-amber-600', label: 'text-surface-500' },
  brand: { text: 'text-brand-600', label: 'text-surface-500' },
};

export default function StatsCount({
  title,
  icon: HeaderIcon,
  counts = [],
  lastLoad,
  autoSyncSchedule,
  onSync,
  isSyncing = false,
}) {
  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-6 shadow-sm">
      {/* Header: Title on left, Last Load + Sync button on right */}
      <div className="flex items-center justify-between mb-6">
        {/* Left: Title with icon */}
        <div className="flex items-center gap-3">
          {HeaderIcon && (
            <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center">
              <HeaderIcon size={20} className="text-white" />
            </div>
          )}
          <h3 className="text-lg font-bold text-surface-800">{title}</h3>
        </div>

        {/* Right: Last Load info + Sync button */}
        <div className="flex items-center gap-4">
          <div className="text-right text-xs text-surface-500">
            {lastLoad && <p>Last Loaded: <span className="font-medium">{lastLoad}</span></p>}
            {autoSyncSchedule && <p>Auto Sync Schedule: <span className="font-medium">{autoSyncSchedule}</span></p>}
          </div>
          {onSync && (
            <Button
              variant="primary"
              size="sm"
              icon={<RefreshCw />}
              onClick={onSync}
              isLoading={isSyncing}
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          )}
        </div>
      </div>

      {/* Count tiles in single horizontal row */}
      <div className="flex items-center justify-between gap-6">
        {counts.map(count => {
          const colorVariant = COLOR_VARIANTS[count.color] || COLOR_VARIANTS.brand;

          return (
            <div key={count.id} className="flex-1 text-center">
              <p className={`text-4xl font-bold ${colorVariant.text}`}>{count.value}</p>
              <p className={`text-xs font-medium ${colorVariant.label} mt-1`}>{count.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
