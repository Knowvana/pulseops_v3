// ============================================================================
// PageSpinner — PulseOps V3 Reusable Component
//
// PURPOSE: Full-page or section-level loading spinner with optional message.
// Uses the brand gradient theme for the spinner animation.
//
// USAGE:
//   import { PageSpinner } from '@components';
//   <PageSpinner message="Loading dashboard..." />
//   <PageSpinner size="sm" />
//
// SIZES: sm (inline), md (section), lg (full-page)
// ============================================================================
import React from 'react';
import { Loader } from 'lucide-react';

export default function PageSpinner({
  message,
  size = 'md',
  className = '',
}) {
  const sizeStyles = {
    sm: { wrapper: 'py-4', icon: 20, text: 'text-xs' },
    md: { wrapper: 'py-12', icon: 28, text: 'text-sm' },
    lg: { wrapper: 'py-24', icon: 36, text: 'text-base' },
  };

  const s = sizeStyles[size] || sizeStyles.md;

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${s.wrapper} ${className}`}>
      <Loader size={s.icon} className="animate-spin text-brand-500" />
      {message && <p className={`${s.text} text-surface-400 font-medium`}>{message}</p>}
    </div>
  );
}
