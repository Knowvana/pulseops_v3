// ============================================================================
// ToggleSwitch — PulseOps V3 Reusable Component
//
// PURPOSE: On/off toggle switch with label and optional description.
// Used for enabling/disabling features, modules, config options.
//
// USAGE:
//   import { ToggleSwitch } from '@components';
//   <ToggleSwitch label="Enable Logging" enabled={true} onToggle={() => toggle()} />
//   <ToggleSwitch label="API Logs" description="Track API requests" enabled={cfg.apiLogs} />
//
// ============================================================================
import React from 'react';

export default function ToggleSwitch({
  label,
  description,
  enabled = false,
  onToggle,
  disabled = false,
  icon: Icon,
  size = 'md',
  className = '',
}) {
  const sizes = {
    sm: { track: 'w-7 h-3.5', thumb: 'w-2.5 h-2.5 top-0.5', on: 'translate-x-3.5', off: 'translate-x-0.5' },
    md: { track: 'w-8 h-4', thumb: 'w-3 h-3 top-0.5', on: 'translate-x-4', off: 'translate-x-0.5' },
    lg: { track: 'w-10 h-5', thumb: 'w-4 h-4 top-0.5', on: 'translate-x-5', off: 'translate-x-0.5' },
  };

  const s = sizes[size] || sizes.md;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {Icon && <Icon size={16} className="text-surface-500" />}
      <div className="flex-1">
        {label && <p className="text-sm font-medium text-surface-700">{label}</p>}
        {description && <p className="text-xs text-surface-400">{description}</p>}
      </div>
      <div
        className={`relative ${s.track} rounded-full transition-colors cursor-pointer ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${enabled ? 'bg-brand-500' : 'bg-surface-300'}`}
        onClick={() => !disabled && onToggle && onToggle(!enabled)}
      >
        <div
          className={`absolute ${s.thumb} rounded-full bg-white shadow transition-transform ${
            enabled ? s.on : s.off
          }`}
        />
      </div>
    </div>
  );
}
