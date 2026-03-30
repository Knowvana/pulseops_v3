// ============================================================================
// Accessio Operations Module Manifest — PulseOps V3
//
// PURPOSE: Self-describing manifest for the Accessio Operations module.
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
//   Prod mode → Build: `npm run build:module accessio_ops`
//               Deploy: Copy dist-modules/accessio_ops/manifest.js to server
//               Enable: Module Manager UI → POST /api/modules/accessio_ops/enable
//               Load:   PlatformDashboard calls loadModuleManifest('accessio_ops')
//
// DEPENDENCIES (all relative — self-contained module):
//   - lucide-react                     → Icons
//   - ./config/constants.json          → Module metadata (authoritative)
//   - ./config/uiText.json             → All UI text strings
//   - ./components/*                   → View + config components
// ============================================================================

import React from 'react';
import {
  LayoutDashboard, Sliders, Settings, Database, Shield, Filter, Play,
} from 'lucide-react';
import moduleConstants from './config/constants.json';
import uiText from './config/uiText.json';

// ── View Component References (NOT instances — never call new or pass JSX) ────
import AccessioOpsDashboard from './components/AccessioOpsDashboard';
import WorkloadsView from './components/WorkloadsView';

// ── Config Tab Components (lazy-mounted via render functions) ─────────────────
import ClusterFiltersTab    from './components/Configuration/ClusterFiltersTab';
import GeneralSettingsTab   from './components/Configuration/GeneralSettingsTab';
import DataManagementTab    from './components/Configuration/DataManagementTab';
import ClusterConfigTab     from './components/Configuration/ClusterConfigTab';

const navText = uiText.navItems;
const cfgText = uiText.config;

/** @type {import('@modules/moduleRegistry').ModuleManifest} */
const accessioOpsManifest = {
  // ── Authoritative metadata from constants.json ────────────────────────────
  ...moduleConstants,

  // ── Module icon (Lucide — never hardcoded string) ─────────────────────────
  icon: Shield,

  // ── Sidebar Navigation ─────────────────────────────────────────────────────
  navItems: [
    { id: 'dashboard',     label: navText.dashboard,     icon: LayoutDashboard },
    { id: 'workloads',     label: 'Workloads',           icon: Play             },
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
    dashboard:     AccessioOpsDashboard,
    workloads:     WorkloadsView,
  }),

  /**
   * Returns config tab definitions for the ConfigLayout component.
   * Content is a render function (() => JSX) — each tab only mounts when active.
   *
   * @returns {Array<{ id, label, icon, content: () => JSX }>}
   */
  getConfigTabs: () => [
    {
      id:      'cluster-config',
      label:   'Cluster Configuration',
      icon:    Shield,
      content: () => <ClusterConfigTab />,
    },
    {
      id:      'cluster-filters',
      label:   'Cluster Filters',
      icon:    Filter,
      content: () => <ClusterFiltersTab />,
    },
    {
      id:      cfgText.tabs.generalSettings.id,
      label:   cfgText.tabs.generalSettings.label,
      icon:    Settings,
      content: () => <GeneralSettingsTab />,
    },
    {
      id:      cfgText.tabs.dataManagement.id,
      label:   cfgText.tabs.dataManagement.label,
      icon:    Database,
      separator: true,
      content: () => <DataManagementTab />,
    },
  ],

  // ── ConfigLayout metadata ─────────────────────────────────────────────────
  configTitle:      cfgText.title,
  configSubtitle:   cfgText.subtitle,
  configIcon:       Sliders,
  configDefaultTab: moduleConstants.configDefaultTab,
};

export default accessioOpsManifest;
