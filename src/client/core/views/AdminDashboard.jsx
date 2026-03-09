// ============================================================================
// AdminDashboard — PulseOps V2 Core
//
// PURPOSE: Native core platform dashboard view. Displays system health,
// module status, database connection status, and quick actions.
// This is NOT a dynamic module — it is a hard-routed core view.
//
// ROUTE: / (default authenticated route)
//
// ARCHITECTURE: Reads all text from uiText.json. Uses shared components
// exclusively. No inline hardcoded strings.
//
// DEPENDENCIES:
//   - @config/uiText.json → All UI labels
//   - @shared → Reusable design system components
// ============================================================================
import React from 'react';
import { LayoutDashboard, Database, Activity, Package, Shield, Server } from 'lucide-react';
import { createLogger } from '@shared';
import uiText from '@config/uiElementsText.json';

const viewText = uiText.coreViews.dashboard;
const log = createLogger('AdminDashboard.jsx');

export default function AdminDashboard() {
  log.debug('render', 'Dashboard page accessed');
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
          <LayoutDashboard size={20} className="text-brand-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-surface-800">{viewText.title}</h1>
          <p className="text-sm text-surface-500 mt-0.5">{viewText.subtitle}</p>
        </div>
      </div>

      {/* Status Tiles */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg">
              <Activity size={16} className="text-emerald-600" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-surface-400">
              {uiText.common.active}
            </h3>
          </div>
          <p className="text-2xl font-bold text-surface-800">—</p>
          <p className="text-xs text-surface-400 mt-1">{uiText.common.loading}</p>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-gradient-to-br from-brand-100 to-cyan-100 rounded-lg">
              <Database size={16} className="text-brand-600" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-surface-400">
              {uiText.common.info}
            </h3>
          </div>
          <p className="text-2xl font-bold text-surface-800">—</p>
          <p className="text-xs text-surface-400 mt-1">{uiText.common.loading}</p>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg">
              <Package size={16} className="text-amber-600" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-surface-400">
              {uiText.common.info}
            </h3>
          </div>
          <p className="text-2xl font-bold text-surface-800">—</p>
          <p className="text-xs text-surface-400 mt-1">{uiText.common.loading}</p>
        </div>
      </div>

      {/* Placeholder content area */}
      <div className="bg-white rounded-xl border border-surface-200 p-8 shadow-sm flex flex-col items-center justify-center">
        <Server size={40} className="text-surface-300 mb-3" />
        <h3 className="text-sm font-bold text-surface-700 mb-1">{viewText.title}</h3>
        <p className="text-xs text-surface-400 text-center max-w-sm">
          {viewText.subtitle}
        </p>
      </div>
    </div>
  );
}
