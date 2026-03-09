// ============================================================================
// ConnectionIndicator — PulseOps V3 Reusable Component
//
// PURPOSE: Displays connection status with icon, message, progress bar,
// metadata, and timestamp. Used for database connections, API connections,
// module connections, etc.
//
// USAGE:
//   import { ConnectionIndicator } from '@components';
//   <ConnectionIndicator
//     type="Database Connection"
//     status="success"
//     message="Connected to database successfully"
//     meta="Response: 12ms | PostgreSQL 15.2"
//     lastTested="2:30 PM"
//     progress={100}
//     showBadge
//   />
//
// STATUS: loading, success, error, neutral
// ============================================================================
import React from 'react';
import { CheckCircle, XCircle, Loader, Info } from 'lucide-react';
import { variants as themeVariants, theme } from './theme';
import ProgressBar from './ProgressBar';
import StatusBadge from './StatusBadge';

const STATUS_CONFIG = {
  success: {
    ...themeVariants.success,
    badgeLabel: 'Connected',
    icon: CheckCircle,
    progressVariant: 'success',
  },
  error: {
    ...themeVariants.error,
    badgeLabel: 'Failed',
    icon: XCircle,
    progressVariant: 'error',
  },
  loading: {
    ...themeVariants.warning,
    badgeLabel: 'Connecting...',
    icon: Loader,
    progressVariant: 'warning',
  },
  neutral: {
    ...themeVariants.neutral,
    badgeLabel: 'Not Tested',
    icon: Info,
    progressVariant: 'neutral',
  },
};

export default function ConnectionIndicator({
  type = 'Connection',
  status = 'neutral',
  message,
  meta,
  lastTested,
  icon: CustomIcon,
  progress = 0,
  showBadge = false,
  className = '',
}) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.neutral;
  const StatusIcon = CustomIcon || cfg.icon;
  const isLoading = status === 'loading';

  return (
    <div className={`rounded-xl border p-4 ${cfg.gradientLight} ${cfg.border} ${className}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`${theme.iconBox} ${cfg.iconBg}`}>
          <StatusIcon
            size={20}
            className={`${cfg.icon} ${isLoading ? 'animate-spin' : ''}`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-surface-800">{type}</p>
              <p className={`text-xs font-medium mt-0.5 ${cfg.text}`}>{message}</p>
            </div>
            {showBadge && (
              <StatusBadge
                variant={status === 'loading' ? 'warning' : status === 'success' ? 'success' : status === 'error' ? 'error' : 'neutral'}
                label={cfg.badgeLabel}
                icon={isLoading ? Loader : undefined}
                pulse={isLoading}
              />
            )}
          </div>

          {/* Progress Bar */}
          {(isLoading || progress > 0) && (
            <div className="mt-3">
              <ProgressBar
                value={progress}
                variant={cfg.progressVariant}
                showLabel
                height="h-1.5"
              />
            </div>
          )}

          {/* Meta & Timestamp */}
          {(meta || lastTested) && (
            <div className="flex items-center gap-3 mt-2 text-xs text-surface-400">
              {meta && <span>{meta}</span>}
              {lastTested && <span>Last tested: {lastTested}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
