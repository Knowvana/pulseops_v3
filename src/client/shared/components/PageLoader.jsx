// ============================================================================
// PageLoader — PulseOps V2 Shared Component
//
// PURPOSE: Universal full-page or inline loading spinner with brand gradient.
// Reusable across all views and modules. Matches the platform's calming,
// fluid design language.
//
// USAGE:
//   <PageLoader />                          // Full page overlay
//   <PageLoader inline />                   // Inline within a container
//   <PageLoader message="Loading logs..." /> // With custom message
//
// ARCHITECTURE: No hardcoded strings — uses uiElementsText.json for default.
// ============================================================================
import React from 'react';

export default function PageLoader({
  message = null,
  inline = false,
  size = 'md',
}) {
  const sizes = {
    sm: { spinner: 'w-5 h-5 border-2', text: 'text-xs' },
    md: { spinner: 'w-8 h-8 border-[3px]', text: 'text-sm' },
    lg: { spinner: 'w-12 h-12 border-4', text: 'text-base' },
  };

  const s = sizes[size] || sizes.md;

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative">
        <div
          className={`${s.spinner} rounded-full border-brand-200 border-t-brand-500 animate-spin`}
        />
        <div
          className={`absolute inset-0 ${s.spinner} rounded-full border-transparent border-r-brand-300 animate-spin`}
          style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}
        />
      </div>
      {message && (
        <p className={`${s.text} font-medium text-surface-500 animate-pulse`}>
          {message}
        </p>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className="flex items-center justify-center py-12">
        {spinner}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
      {spinner}
    </div>
  );
}
