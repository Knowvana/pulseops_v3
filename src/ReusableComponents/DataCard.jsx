// ============================================================================
// DataCard — PulseOps V3 Reusable Component
//
// PURPOSE: Generic card container with optional header, icon, and content area.
// Used as a building block for dashboards, settings sections, and data displays.
//
// USAGE:
//   import { DataCard } from '@components';
//   <DataCard title="Server Info" icon={Server} subtitle="Current status">
//     <p>Uptime: 99.9%</p>
//   </DataCard>
//
// ============================================================================
import React from 'react';
import { theme } from './theme';

export default function DataCard({
  title,
  subtitle,
  icon: Icon,
  children,
  headerRight,
  className = '',
  padding = 'p-4',
}) {
  return (
    <div className={`${theme.card} ${padding} ${className}`}>
      {(title || Icon || headerRight) && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={18} className="text-brand-500" />}
            <div>
              {title && <h4 className={theme.subheading}>{title}</h4>}
              {subtitle && <p className={theme.caption}>{subtitle}</p>}
            </div>
          </div>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
