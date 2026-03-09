// ============================================================================
// StatusBadge — PulseOps V3 Reusable Component
//
// PURPOSE: Compact status indicator pill/badge with icon and label.
// Shows connection status, module status, log level, etc.
//
// USAGE:
//   import { StatusBadge } from '@components';
//   <StatusBadge variant="success" label="Connected" />
//   <StatusBadge variant="warning" label="Connecting..." icon={Loader} pulse />
//   <StatusBadge variant="error" label="Failed" icon={AlertTriangle} />
//
// VARIANTS: success, warning, error, info, neutral
// ============================================================================
import React from 'react';
import { variants as themeVariants } from './theme';

export default function StatusBadge({
  variant = 'neutral',
  label,
  icon: Icon,
  pulse = false,
  size = 'sm',
  className = '',
}) {
  const v = themeVariants[variant] || themeVariants.neutral;

  const sizeStyles = {
    xs: 'px-1.5 py-0.5 text-[10px] gap-1',
    sm: 'px-2.5 py-0.5 text-xs gap-1.5',
    md: 'px-3 py-1 text-sm gap-2',
  };

  const iconSize = { xs: 10, sm: 12, md: 14 };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border ${v.bg} ${v.border} ${v.text} ${sizeStyles[size]} ${className}`}
    >
      {Icon && (
        <Icon
          size={iconSize[size]}
          className={`${v.icon} ${pulse ? 'animate-spin' : ''}`}
        />
      )}
      {label}
    </span>
  );
}
