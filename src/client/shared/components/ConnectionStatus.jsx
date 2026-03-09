// ============================================================================
// ConnectionStatus — PulseOps V2 Design System
//
// PURPOSE: Reusable component to display connection status for any service
// (database, API, external service, etc.). Shows status indicator, message,
// and optional metadata like latency or version info.
//
// USAGE:
//   import { ConnectionStatus } from '@shared';
//   <ConnectionStatus
//     type="Database Connection"
//     status="success"
//     message="Connected to PostgreSQL"
//     meta="Response: 45ms • Version: 14.2"
//   />
//
// PROPS:
//   type    — Connection type label (e.g., "Database Connection", "API Connection")
//   status  — 'success' | 'error' | 'warning' | 'neutral' | 'loading' (required)
//   message — Status message (required)
//   meta    — Additional metadata text (optional)
//   icon    — Custom Lucide icon component (optional)
//   progress — Progress percentage 0-100 (optional, used with loading status)
//   lastTested — Last tested timestamp (optional, e.g., "3/1/2026, 10:30:19 PM")
//   showBadge — Show status badge in top right (optional, default: true)
//
// ARCHITECTURE: Fully reusable across all modules for any connection type.
// Consistent styling with semantic color tokens.
// ============================================================================
import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader } from 'lucide-react';

const STATUS_CONFIG = {
  success: {
    bg: 'bg-gradient-to-r from-emerald-50 to-teal-50',
    border: 'border-emerald-200',
    iconBg: 'bg-gradient-to-br from-emerald-100 to-teal-100',
    iconColor: 'text-emerald-600',
    textColor: 'text-emerald-700',
    labelColor: 'text-surface-700',
    metaColor: 'text-surface-500',
    icon: CheckCircle2,
  },
  error: {
    bg: 'bg-gradient-to-r from-rose-50 to-red-50',
    border: 'border-rose-200',
    iconBg: 'bg-gradient-to-br from-rose-100 to-red-100',
    iconColor: 'text-rose-600',
    textColor: 'text-rose-700',
    labelColor: 'text-rose-800',
    metaColor: 'text-rose-600',
    icon: XCircle,
  },
  warning: {
    bg: 'bg-gradient-to-r from-amber-50 to-orange-50',
    border: 'border-amber-200',
    iconBg: 'bg-gradient-to-br from-amber-100 to-orange-100',
    iconColor: 'text-amber-600',
    textColor: 'text-amber-700',
    labelColor: 'text-amber-800',
    metaColor: 'text-amber-600',
    icon: AlertTriangle,
  },
  neutral: {
    bg: 'bg-gradient-to-r from-surface-50 to-slate-50',
    border: 'border-surface-200',
    iconBg: 'bg-gradient-to-br from-surface-100 to-slate-100',
    iconColor: 'text-surface-600',
    textColor: 'text-surface-700',
    labelColor: 'text-surface-700',
    metaColor: 'text-surface-500',
    icon: Info,
  },
  loading: {
    bg: 'bg-gradient-to-r from-amber-50 to-orange-50',
    border: 'border-amber-200',
    iconBg: 'bg-gradient-to-br from-amber-100 to-orange-100',
    iconColor: 'text-amber-600',
    textColor: 'text-amber-700',
    labelColor: 'text-surface-700',
    metaColor: 'text-surface-500',
    icon: Loader,
    progressBg: 'bg-amber-200',
    progressFill: 'bg-amber-500',
  },
};

export default function ConnectionStatus({ 
  type, 
  status = 'neutral', 
  message, 
  meta, 
  icon: CustomIcon, 
  progress = 0,
  lastTested,
  showBadge = true 
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.neutral;
  const Icon = CustomIcon || config.icon;
  const isLoading = status === 'loading';

  // Format status label
  const getStatusLabel = () => {
    if (status === 'success') return 'Connected';
    if (status === 'error') return 'Failed';
    if (status === 'warning') return 'Warning';
    if (status === 'loading') return 'Connecting...';
    return 'Unknown';
  };

  // Get badge colors based on status
  const getBadgeColors = () => {
    switch (status) {
      case 'success':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'error':
        return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'warning':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'loading':
        return 'bg-brand-50 text-brand-700 border border-brand-200';
      default:
        return 'bg-surface-50 text-surface-700 border border-surface-200';
    }
  };

  return (
    <div className={`${config.bg} rounded-xl border ${config.border} p-4`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 ${config.iconBg} rounded-lg shrink-0`}>
          {isLoading ? (
            <Loader size={16} className={`${config.iconColor} animate-spin`} />
          ) : (
            <Icon size={16} className={config.iconColor} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h4 className={`text-sm font-bold mb-0.5 ${config.labelColor}`}>{type}</h4>
              <p className={`text-xs leading-relaxed ${config.textColor}`}>{message}</p>
              
              {/* Last Tested Timestamp */}
              {lastTested && !isLoading && (
                <p className="text-[11px] text-surface-400 mt-1.5">Last Tested: {lastTested}</p>
              )}
              
              {/* Progress Bar for Loading State */}
              {isLoading && (
                <div className="mt-3 space-y-1">
                  <div className={`w-full h-2 rounded-full ${config.progressBg} overflow-hidden`}>
                    <div
                      className={`h-full ${config.progressFill} transition-all duration-300 ease-out`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-surface-500 font-medium">{progress}% Complete</p>
                </div>
              )}
              
              {meta && !isLoading && <p className={`text-[11px] mt-1.5 font-medium ${config.metaColor}`}>{meta}</p>}
            </div>
            
            {/* Status Badge */}
            {showBadge && (
              <div className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 ${getBadgeColors()}`}>
                {getStatusLabel()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
