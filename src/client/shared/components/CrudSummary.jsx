// ============================================================================
// CrudSummary — PulseOps V2 Design System
//
// PURPOSE: Reusable inline component to display CRUD operation results with
// progress animation and summary details. Can be used standalone or embedded
// in any view to show operation feedback without a modal.
//
// USAGE:
//   import { CrudSummary } from '@shared';
//   <CrudSummary
//     status="success"
//     title="Schema Initialized"
//     message="All tables created successfully"
//     details={[
//       { label: 'Tables', value: 'system_users, system_config, system_modules' },
//       { label: 'Duration', value: '1.2s' }
//     ]}
//     progress={100}
//     onDismiss={() => setCrudResult(null)}
//   />
//
// PROPS:
//   status    — 'idle' | 'loading' | 'success' | 'error' (required)
//   title     — Operation title (required)
//   message   — Status message (optional)
//   details   — Array of { label, value } summary rows (optional)
//   progress  — Progress percentage 0-100 (optional, used with loading status)
//   onDismiss — Callback to dismiss/hide the summary (optional)
//   variant   — 'inline' | 'card' (default: 'card')
//   className — Additional CSS classes (optional)
//
// ARCHITECTURE: Fully reusable across all modules for any CRUD operation.
// Consistent styling with semantic color tokens. No hardcoded strings.
// ============================================================================
import React from 'react';
import { CheckCircle2, XCircle, Loader2, X, Info } from 'lucide-react';

const STATUS_CONFIG = {
  idle: {
    bg: 'bg-surface-50',
    border: 'border-surface-200',
    iconBg: 'bg-surface-100',
    iconColor: 'text-surface-500',
    titleColor: 'text-surface-700',
    messageColor: 'text-surface-500',
    icon: Info,
    progressBg: 'bg-surface-200',
    progressFill: 'bg-surface-400',
  },
  loading: {
    bg: 'bg-gradient-to-r from-brand-50 to-cyan-50',
    border: 'border-brand-200',
    iconBg: 'bg-gradient-to-br from-brand-100 to-cyan-100',
    iconColor: 'text-brand-600',
    titleColor: 'text-brand-800',
    messageColor: 'text-brand-600',
    icon: Loader2,
    progressBg: 'bg-brand-100',
    progressFill: 'bg-brand-500',
  },
  success: {
    bg: 'bg-gradient-to-r from-emerald-50 to-teal-50',
    border: 'border-emerald-200',
    iconBg: 'bg-gradient-to-br from-emerald-100 to-teal-100',
    iconColor: 'text-emerald-600',
    titleColor: 'text-emerald-800',
    messageColor: 'text-emerald-600',
    icon: CheckCircle2,
    progressBg: 'bg-emerald-100',
    progressFill: 'bg-emerald-500',
  },
  error: {
    bg: 'bg-gradient-to-r from-rose-50 to-red-50',
    border: 'border-rose-200',
    iconBg: 'bg-gradient-to-br from-rose-100 to-red-100',
    iconColor: 'text-rose-600',
    titleColor: 'text-rose-800',
    messageColor: 'text-rose-600',
    icon: XCircle,
    progressBg: 'bg-rose-100',
    progressFill: 'bg-rose-500',
  },
};

export default function CrudSummary({
  status = 'idle',
  title,
  message,
  details = [],
  progress = 0,
  onDismiss,
  variant = 'card',
  className = '',
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  const Icon = config.icon;
  const isLoading = status === 'loading';

  const wrapperClass = variant === 'card'
    ? `${config.bg} rounded-xl border ${config.border} p-4 shadow-sm ${className}`
    : `${config.bg} rounded-lg border ${config.border} px-3 py-2.5 ${className}`;

  return (
    <div className={wrapperClass}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`p-2 ${config.iconBg} rounded-lg shrink-0`}>
          {isLoading ? (
            <Loader2 size={16} className={`${config.iconColor} animate-spin`} />
          ) : (
            <Icon size={16} className={config.iconColor} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4 className={`text-sm font-bold ${config.titleColor}`}>{title}</h4>
              {message && (
                <p className={`text-xs mt-0.5 ${config.messageColor}`}>{message}</p>
              )}
            </div>

            {/* Dismiss button */}
            {onDismiss && !isLoading && (
              <button
                onClick={onDismiss}
                className="p-1 rounded-lg hover:bg-black/5 transition-colors shrink-0"
              >
                <X size={14} className="text-surface-400" />
              </button>
            )}
          </div>

          {/* Progress bar for loading state */}
          {isLoading && (
            <div className="mt-3 space-y-1">
              <div className={`w-full h-1.5 rounded-full ${config.progressBg} overflow-hidden`}>
                <div
                  className={`h-full ${config.progressFill} rounded-full transition-all duration-300 ease-out`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-surface-500 font-medium">{Math.round(Math.min(progress, 100))}%</p>
            </div>
          )}

          {/* Summary details */}
          {details.length > 0 && !isLoading && (
            <div className="mt-3 bg-white/60 rounded-lg p-2.5 space-y-1.5">
              {details.map((detail, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="text-surface-500 font-medium">{detail.label}</span>
                  <span className="text-surface-800 font-semibold truncate ml-3">{detail.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
