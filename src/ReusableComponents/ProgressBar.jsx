// ============================================================================
// ProgressBar — PulseOps V3 Reusable Component
//
// PURPOSE: Animated progress bar with percentage label. Supports multiple
// variants for different status contexts (loading, success, error).
//
// USAGE:
//   import { ProgressBar } from '@components';
//   <ProgressBar value={75} variant="info" showLabel />
//   <ProgressBar value={100} variant="success" />
//   <ProgressBar value={45} variant="warning" showLabel labelPosition="right" />
//
// VARIANTS: success, warning, error, info, neutral
// ============================================================================
import React from 'react';
import { variants as themeVariants } from './theme';

export default function ProgressBar({
  value = 0,
  variant = 'info',
  showLabel = false,
  labelPosition = 'bottom',
  height = 'h-2',
  className = '',
  animated = true,
}) {
  const v = themeVariants[variant] || themeVariants.info;
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className={`w-full ${className}`}>
      {showLabel && labelPosition === 'top' && (
        <div className={`text-xs font-medium mb-1 ${v.text}`}>
          {clamped}% Complete
        </div>
      )}
      <div className={`w-full ${height} rounded-full overflow-hidden ${v.progressBg}`}>
        <div
          className={`${height} rounded-full ${v.progressFill} ${animated ? 'transition-all duration-300 ease-out' : ''}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && labelPosition === 'bottom' && (
        <div className={`text-xs font-medium mt-1 ${v.text}`}>
          {clamped}% Complete
        </div>
      )}
      {showLabel && labelPosition === 'right' && (
        <div className={`text-xs font-medium ml-2 inline ${v.text}`}>
          {clamped}%
        </div>
      )}
    </div>
  );
}
