// ============================================================================
// AppShell — PulseOps V2 Layout
//
// PURPOSE: The master layout that composes the entire authenticated UI.
// Composes: TopMenu (top) + LeftSideNavBar (left, collapsible) +
// MainContent (center) + RightLogsView (slide-out, right).
//
// ARCHITECTURE: Module-agnostic. Receives modules[], sideNavItems[],
// children for the active page content. ZERO module-specific code lives
// here — all module data flows through props from PlatformDashboard.
//
// LAYOUT STRUCTURE:
//   ┌──────────────────────────────────────────────────┐
//   │              TopMenu (fixed)             [👤][📊]│
//   ├────────┬────────────────────────┬───────────────┤
//   │        │                        │  RightPanel   │
//   │SideNav │     Main Content       │  (slide-out)  │
//   │  (◀▶)  │     (children)         │  Logs|API     │
//   │        │                        │               │
//   └────────┴────────────────────────┴───────────────┘
//
// USED BY: PlatformDashboard.jsx (wraps all authenticated content)
//
// DEPENDENCIES:
//   - @layouts/TopMenu
//   - @layouts/LeftSideNavBar
//   - @layouts/RightLogsView
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import TopMenu from '@layouts/TopMenu';
import LeftSideNavBar from '@layouts/LeftSideNavBar';
import RightLogsView from '@layouts/RightLogsView';
import { UILogService } from '@shared';
import urls from '@config/urls.json';

export default function AppShell({
  appName,
  modules = [],
  activeModuleId,
  onSwitchModule,
  onLogout,
  user,

  sideNavTitle,
  sideNavItems = [],
  activeSideNavItemId,
  onSelectSideNavItem,
  sideNavCollapsed: controlledCollapsed,
  onToggleSideNav: controlledToggle,

  children,
}) {
  const hasSideNav = sideNavItems.length > 0;

  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const sideNavCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const onToggleSideNav = controlledToggle || (() => setInternalCollapsed((c) => !c));

  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [uiLogs, setUiLogs] = useState([]);
  const [apiCalls, setApiCalls] = useState([]);
  const [totalLogCount, setTotalLogCount] = useState(null);
  const pollIntervalRef = useRef(null);

  // Subscribe to UILogService for updates (service already initialized in main.jsx)
  useEffect(() => {
    const unsub = UILogService.subscribe(({ logs, apiCalls: calls }) => {
      // Create new array references to ensure React detects the change
      setUiLogs([...logs]);
      setApiCalls([...calls]);
    });
    return unsub;
  }, []);

  // Force real-time updates while panel is open by calling forceNotify every 200ms
  useEffect(() => {
    if (!isRightPanelOpen) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Poll every 200ms to force immediate notification of new logs
    pollIntervalRef.current = setInterval(() => {
      UILogService.forceNotify();
    }, 200);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isRightPanelOpen]);

  // Fetch total log count from backend whenever panel opens
  useEffect(() => {
    if (!isRightPanelOpen) return;
    fetch(urls.logs.stats, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.success && d?.data) {
          const total = (d.data.ui?.count || 0) + (d.data.api?.count || 0);
          setTotalLogCount(total);
        }
      })
      .catch(() => {});
  }, [isRightPanelOpen]);

  const handleDeleteAllLogs = useCallback(async () => {
    try {
      const res = await fetch(urls.logs.deleteAll, { method: 'DELETE', credentials: 'include' });
      if (res.status === 404) {
        await Promise.all([
          fetch(urls.logs.ui,  { method: 'DELETE', credentials: 'include' }),
          fetch(urls.logs.api, { method: 'DELETE', credentials: 'include' }),
        ]);
      }
    } catch { /* ignore network errors */ }
    UILogService.clearLogs();
    UILogService.clearApiCalls();
    setTotalLogCount(0);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-surface-50 font-sans text-surface-800 overflow-hidden">
      {/* Top Navigation */}
      <TopMenu
        appName={appName}
        modules={modules}
        activeModuleId={activeModuleId}
        onSwitchModule={onSwitchModule}
        onLogout={onLogout}
        user={user}
        onToggleRightPanel={() => setIsRightPanelOpen((o) => !o)}
        isRightPanelOpen={isRightPanelOpen}
      />

      {/* Body: SideNav + Main Content + RightPanel */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {hasSideNav && (
          <LeftSideNavBar
            title={sideNavTitle}
            items={sideNavItems}
            activeItemId={activeSideNavItemId}
            onSelectItem={onSelectSideNavItem}
            collapsed={sideNavCollapsed}
            onToggleCollapse={onToggleSideNav}
          />
        )}

        <main className="flex-1 overflow-hidden">
          <div className="w-full h-full px-4 py-4 overflow-y-auto">
            {children}
          </div>
        </main>

        {/* Right Panel (Logs, API) — inline */}
        <RightLogsView
          isOpen={isRightPanelOpen}
          onClose={() => setIsRightPanelOpen(false)}
          logs={uiLogs}
          apiCalls={apiCalls}
          onDeleteAllLogs={handleDeleteAllLogs}
          totalCount={totalLogCount}
        />
      </div>
    </div>
  );
}
