// ============================================================================
// StatCard — PulseOps V3 Reusable Component
//
// PURPOSE: Compact stat display card with icon, label, value, and optional
// trend indicator. Used for dashboard metrics, log counts, etc.
//
// USAGE:
//   import { StatCard } from '@components';
//   <StatCard icon={Activity} label="Total Logs" value={1234} variant="info" />
//   <StatCard icon={AlertTriangle} label="Errors" value={5} trend="+2" variant="error" />
//
// VARIANTS: success, warning, error, info, neutral
// ============================================================================
import React from 'react';
import { variants as themeVariants, theme } from './theme';

export default function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  variant = 'info',
  className = '',
  onClick,
}) {
  const v = themeVariants[variant] || themeVariants.info;

  return (
    <div
      className={`${theme.card} p-4 ${onClick ? 'cursor-pointer hover:shadow-md' : ''} ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className={`${theme.iconBox} ${v.iconBg} ${v.icon}`}>
          {Icon && <Icon size={20} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={theme.caption}>{label}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-surface-800">{value ?? '—'}</p>
            {trend && (
              <span className={`text-xs font-semibold ${
                trend.startsWith('+') ? 'text-emerald-600' :
                trend.startsWith('-') ? 'text-red-600' :
                'text-surface-400'
              }`}>
                {trend}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
