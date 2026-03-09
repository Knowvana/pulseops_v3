// ============================================================================
// MainContent — PulseOps V2 Layout
//
// PURPOSE: Scrollable main content area wrapper. Renders the routed view
// (children) inside a padded, scrollable container. Provides consistent
// spacing and overflow handling across all views.
//
// ARCHITECTURE: Purely presentational. Receives children as the routed view.
//
// USED BY: AppShell.jsx
//
// DEPENDENCIES: None (pure wrapper)
// ============================================================================
import React from 'react';

export default function MainContent({ children }) {
  return (
    <main className="flex-1 overflow-y-auto bg-surface-50 p-6">
      {children}
    </main>
  );
}
