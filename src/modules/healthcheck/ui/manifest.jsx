// ============================================================================
// HealthCheck Module Manifest — PulseOps V3
//
// PURPOSE: Self-describing manifest for the System HealthCheck module.
// The platform's module registry discovers this file and uses it to drive
// top navigation, sidebar navigation, view rendering, and configuration tabs.
//
// ARCHITECTURE: Plug-and-play module contract.
//   - Metadata (id, name, version, roles, order) sourced from constants.json.
//   - getViews() returns Component References (NOT instances).
//   - getConfigTabs() returns tab definitions with render functions for lazy mounting.
//
// HOW IT LOADS:
//   Dev mode  → registerModulePath() in moduleRegistry.js → direct Vite import
//   Prod mode → Build: `npm run build:module healthcheck`
//               Deploy: Copy dist-modules/healthcheck/manifest.js to server
//               Enable: Module Manager UI → POST /api/modules/healthcheck/enable
//               Load:   PlatformDashboard calls loadModuleManifest('healthcheck')
//
// DEPENDENCIES (all relative — self-contained module):
//   - lucide-react                     → Icons
//   - ./config/constants.json          → Module metadata (authoritative)
//   - ./config/uiText.json             → All UI text strings
//   - ./components/*                   → View + config components
// ============================================================================

import React from 'react';
import {
  Activity, LayoutDashboard, BarChart3, Sliders, AlertTriangle,
  Timer, Globe, Tag, Target, Database, Settings, Link2,
} from 'lucide-react';
import moduleConstants from './config/constants.json';
import uiText from './config/uiText.json';

// ── View Component References (NOT instances — never call new or pass JSX) ────
import HealthCheckDashboard from './components/HealthCheckDashboard';
import UptimeReportView     from './components/UptimeReportView';
import DowntimeView          from './components/DowntimeView';
import ApplicationsView      from './components/ApplicationsView';
import CategoriesView        from './components/CategoriesView';

// ── Config Tab Components (lazy-mounted via render functions) ─────────────────
import PollerConfigTab      from './components/settings/PollerConfigTab';
import SLATargetsTab        from './components/settings/SLATargetsTab';
import DowntimeSourceTab    from './components/settings/DowntimeSourceTab';
import GeneralSettingsTab   from './components/settings/GeneralSettingsTab';
import DataManagementTab    from './components/settings/DataManagementTab';

const navText = uiText.navItems;
const cfgText = uiText.config;

/** @type {import('@modules/moduleRegistry').ModuleManifest} */
const healthcheckManifest = {
  // ── Authoritative metadata from constants.json ────────────────────────────
  ...moduleConstants,

  // ── Module icon (Lucide — never hardcoded string) ─────────────────────────
  icon: Activity,

  // ── Sidebar Navigation ─────────────────────────────────────────────────────
  navItems: [
    { id: 'dashboard',     label: navText.dashboard,     icon: LayoutDashboard },
    { id: 'uptimeReport',  label: navText.uptimeReport,  icon: BarChart3       },
    { id: 'applications',  label: navText.applications,  icon: Globe           },
    { id: 'categories',    label: navText.categories,    icon: Tag             },
    { id: 'downtime',      label: navText.downtime,      icon: AlertTriangle   },
    { type: 'separator' },
    { id: 'config',        label: navText.config,        icon: Sliders         },
  ],

  /**
   * Returns a map of view IDs → Component References.
   * CRITICAL: Return references (Class/Function), NOT JSX elements.
   * PlatformDashboard instantiates them with props: { user, onNavigate, onModulesChanged }
   *
   * @returns {{ [viewId: string]: React.ComponentType }}
   */
  getViews: () => ({
    dashboard:     HealthCheckDashboard,
    uptimeReport:  UptimeReportView,
    applications:  ApplicationsView,
    categories:    CategoriesView,
    downtime:      DowntimeView,
  }),

  /**
   * Returns config tab definitions for the ConfigLayout component.
   * Content is a render function (() => JSX) — each tab only mounts when active.
   *
   * @returns {Array<{ id, label, icon, content: () => JSX }>}
   */
  getConfigTabs: () => [
    {
      id:      cfgText.tabs.pollerConfig.id,
      label:   cfgText.tabs.pollerConfig.label,
      icon:    Timer,
      content: () => <PollerConfigTab />,
    },
    {
      id:      cfgText.tabs.slaTargets.id,
      label:   cfgText.tabs.slaTargets.label,
      icon:    Target,
      separator: true,
      content: () => <SLATargetsTab />,
    },
    {
      id:      cfgText.tabs.downtimeSource.id,
      label:   cfgText.tabs.downtimeSource.label,
      icon:    Link2,
      content: () => <DowntimeSourceTab />,
    },
    {
      id:      cfgText.tabs.generalSettings.id,
      label:   cfgText.tabs.generalSettings.label,
      icon:    Settings,
      separator: true,
      content: () => <GeneralSettingsTab />,
    },
    {
      id:      cfgText.tabs.dataManagement.id,
      label:   cfgText.tabs.dataManagement.label,
      icon:    Database,
      content: () => <DataManagementTab />,
    },
  ],

  // ── ConfigLayout metadata ─────────────────────────────────────────────────
  configTitle:      cfgText.title,
  configSubtitle:   cfgText.subtitle,
  configIcon:       Sliders,
  configDefaultTab: moduleConstants.configDefaultTab,
};

export default healthcheckManifest;
