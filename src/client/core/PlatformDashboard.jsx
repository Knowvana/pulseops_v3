// ============================================================================
// PlatformDashboard — PulseOps V2 (Core)
//
// PURPOSE: The root orchestrator for the authenticated UI. Manages both
// core Admin views AND dynamic hot-drop module views. Fetches enabled
// modules from the database, dynamically loads their manifests, and
// renders the active view inside AppShell.
//
// CORE ADMIN: "Admin" is always the first tab — its views (Dashboard,
// ModuleManager, LogManager, Settings) are defined here in core, NOT
// as a module manifest. These are native platform views.
//
// DYNAMIC MODULES: When enabled from Module Manager, hot-drop modules
// appear as additional tabs after Admin. Their manifests are loaded
// dynamically via moduleRegistry — NO rebuild or downtime needed.
//
// ZERO-DOWNTIME MODULE ADDITION:
//   1. On mount, fetches enabled module list from DB (when API available)
//   2. Dynamically loads manifests for enabled add-on modules via import()
//   3. Core Admin tab is always present (hardcoded first tab)
//   4. Dynamic module tabs appear after Admin
//   5. Active module's navItems drive the SideNav
//   6. Active view renders in the center content area
//
// DEPENDENCIES:
//   - react-router-dom          → useNavigate, useParams
//   - @layouts                  → AppShell
//   - @core/views/*             → Native core views
//   - @modules/moduleRegistry   → Dynamic module loading
//   - @config/uiElementsText.json   → All UI text
//   - @config/app.json          → App name, default credentials
// ============================================================================
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LayoutDashboard, Package, ScrollText, Settings as SettingsIcon, Shield, Eye
} from 'lucide-react';
import { AppShell } from '@layouts';
import { getAllManifests, getManifestById, loadModuleManifests, unregisterDynamicManifest } from '@modules/moduleRegistry';
import urls from '@config/urls.json';
import { ConfigLayout, PageLoader, createLogger } from '@shared';
import appConfig from '@config/app.json';
import uiText from '@config/uiElementsText.json';

const log = createLogger('PlatformDashboard.jsx');

// Lazy-load heavy views for faster navigation (code-split per view)
const AdminDashboard = React.lazy(() => import('@core/views/AdminDashboard'));
const ModuleManager = React.lazy(() => import('@core/views/ModuleManager'));
const LogManager = React.lazy(() => import('@core/views/LogManager'));
const Settings = React.lazy(() => import('@core/views/Settings'));
const TestPage = React.lazy(() => import('@shared/components/TestPage'));

const coreNav = uiText.coreNav;

// ── Core Admin definition (NOT a module — hardcoded first tab) ──────────────
const CORE_ADMIN = {
  id: 'platform_admin',
  name: 'Admin',
  icon: Shield,
  isCore: true,
  order: 0,
  defaultView: 'dashboard',
  navItems: [
    { id: 'dashboard', label: coreNav.dashboard, icon: LayoutDashboard },
    { id: 'moduleManager', label: coreNav.moduleManager, icon: Package },
    { id: 'logs', label: coreNav.logs, icon: ScrollText },
    { id: 'Settings', label: coreNav.settings, icon: SettingsIcon },
    { id: 'testPage', label: 'Test Page', icon: Eye },
  ],
  views: {
    dashboard: AdminDashboard,
    testPage: TestPage,
    moduleManager: ModuleManager,
    logs: LogManager,
    Settings: Settings,
  },
};

export default function PlatformDashboard({ user, onLogout }) {
  const navigate = useNavigate();
  const { moduleId: urlModuleId, viewId: urlViewId } = useParams();

  // Derive active module/view directly from URL — no separate state to sync
  const activeModuleId = urlModuleId || CORE_ADMIN.id;
  const activeView = urlViewId || CORE_ADMIN.defaultView;

  const [dbModules, setDbModules] = useState([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const initRan = useRef(false);

  log.debug('render', `Dashboard rendered — module: ${activeModuleId}, view: ${activeView}`);

  // ── Fetch enabled modules from API + load manifests via moduleRegistry ───────────
  const fetchModules = useCallback(async () => {
    log.debug('fetchModules', 'Fetching enabled modules from API');
    setModulesLoading(true);
    try {
      // GET /api/modules — returns list of { id, name, version, enabled } records
      const res = await fetch(urls.modules.list, { credentials: 'include' });
      if (!res.ok) {
        log.warn('fetchModules', `Modules API returned ${res.status}`);
        setDbModules([]);
        return;
      }
      const json = await res.json();
      const enabledModules = (json.data || []).filter(m => m.enabled);
      log.info('fetchModules', `Found ${enabledModules.length} enabled module(s)`, { ids: enabledModules.map(m => m.id) });

      // Unregister manifests that are no longer enabled
      const enabledIds = new Set(enabledModules.map(m => m.id));
      const currentManifests = getAllManifests();
      for (const m of currentManifests) {
        if (!enabledIds.has(m.id)) {
          unregisterDynamicManifest(m.id);
          log.info('fetchModules', `Unregistered disabled module: ${m.id}`);
        }
      }

      // Dynamically load each enabled module's manifest (dev: Vite import, prod: hot-drop bundle)
      const ids = enabledModules.map(m => m.id);
      const loaded = await loadModuleManifests(ids);
      log.info('fetchModules', `Loaded ${loaded.length} manifest(s)`);
      setDbModules(enabledModules);
    } catch (err) {
      log.warn('fetchModules', 'Failed to fetch/load modules — continuing without add-ons', { message: err.message });
      setDbModules([]);
    } finally {
      setModulesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    fetchModules();
  }, [fetchModules]);

  // ── Build available modules: Core Admin + dynamic add-ons ─────────────────
  const availableModules = useMemo(() => {
    const dynamicManifests = getAllManifests();

    const dynamicTabs = dynamicManifests
      .filter(m => m.enabled !== false)
      .map(manifest => ({
        id: manifest.id,
        name: manifest.shortName || manifest.name,
        icon: manifest.icon,
        isCore: false,
        order: manifest.order || 99,
      }))
      .sort((a, b) => a.order - b.order);

    return [CORE_ADMIN, ...dynamicTabs];
  }, [dbModules, modulesLoading]);

  // ── Auto-select Admin on initial load if no URL params ────────────────────
  useEffect(() => {
    if (!urlModuleId) {
      navigate(`/${CORE_ADMIN.id}/${CORE_ADMIN.defaultView}`, { replace: true });
    }
  }, [urlModuleId, navigate]);

  // ── Resolve active module data ────────────────────────────────────────────
  const isAdminActive = activeModuleId === CORE_ADMIN.id;
  const activeManifest = isAdminActive ? null : getManifestById(activeModuleId);
  const activeModuleName = isAdminActive
    ? CORE_ADMIN.name
    : (availableModules.find(m => m.id === activeModuleId)?.name || '');

  // ── SideNav items from active module ──────────────────────────────────────
  const sideNavItems = useMemo(() => {
    if (isAdminActive) return CORE_ADMIN.navItems;
    if (activeManifest?.navItems) return activeManifest.navItems;
    return [];
  }, [isAdminActive, activeManifest]);

  // ── Module switching ──────────────────────────────────────────────────────
  const handleSwitchModule = useCallback((moduleId) => {
    log.info('handleSwitchModule', `Switching module: ${activeModuleId} → ${moduleId}`);
    if (moduleId === CORE_ADMIN.id) {
      navigate(`/${CORE_ADMIN.id}/${CORE_ADMIN.defaultView}`);
    } else {
      const manifest = getManifestById(moduleId);
      const defaultView = manifest?.defaultView || 'dashboard';
      navigate(`/${moduleId}/${defaultView}`);
    }
  }, [navigate, activeModuleId]);

  // ── SideNav item selection ────────────────────────────────────────────────
  const handleSideNavSelect = useCallback((viewId) => {
    log.info('handleSideNavSelect', `Navigating to view: ${viewId} (module: ${activeModuleId})`);
    if (activeModuleId) {
      navigate(`/${activeModuleId}/${viewId}`);
    }
  }, [activeModuleId, navigate]);

  // ── Resolve active content component ───────────────────────────────────────
  const activeContent = useMemo(() => {
    // Core Admin views
    if (isAdminActive) {
      const ViewComponent = CORE_ADMIN.views[activeView];
      return ViewComponent || CORE_ADMIN.views[CORE_ADMIN.defaultView] || null;
    }

    // Dynamic module views — config tab
    if (activeView === 'config' && activeManifest?.getConfigTabs) {
      return null; // handled separately below
    }

    // Dynamic module views — regular views
    if (activeManifest?.getViews) {
      const views = activeManifest.getViews();
      return views[activeView] || views[activeManifest.defaultView] || null;
    }

    return null;
  }, [isAdminActive, activeManifest, activeView]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppShell
      appName={appConfig.appName || 'PulseOps'}
      modules={availableModules}
      activeModuleId={activeModuleId}
      onSwitchModule={handleSwitchModule}
      onLogout={onLogout}
      user={user}
      sideNavTitle={activeModuleName}
      sideNavItems={sideNavItems}
      activeSideNavItemId={activeView}
      onSelectSideNavItem={handleSideNavSelect}
    >
      <Suspense fallback={<PageLoader inline message="Loading view..." />}>
        {(() => {
          // Dynamic module config tab (special case)
          if (!isAdminActive && activeView === 'config' && activeManifest?.getConfigTabs) {
            const tabs = typeof activeManifest.getConfigTabs === 'function'
              ? activeManifest.getConfigTabs() : activeManifest.getConfigTabs;
            return (
              <ConfigLayout
                title={activeManifest.configTitle}
                subtitle={activeManifest.configSubtitle}
                icon={activeManifest.configIcon}
                tabs={tabs}
                defaultTab={activeManifest.configDefaultTab}
              />
            );
          }

          // Resolved view component
          const ViewComponent = activeContent;
          if (!ViewComponent) return null;

          return isAdminActive
            ? <ViewComponent user={user} onModulesChanged={fetchModules} />
            : <ViewComponent user={user} onNavigate={handleSideNavSelect} onModulesChanged={fetchModules} />;
        })()}
      </Suspense>
    </AppShell>
  );
}
