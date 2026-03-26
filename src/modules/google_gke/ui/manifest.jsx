// ============================================================================
// Google GKE Module Manifest — PulseOps V3
//
// PURPOSE: Self-describing manifest for the Google GKE Infrastructure Monitoring
// module. The platform's module registry discovers this file and uses it to
// drive top navigation, sidebar navigation, view rendering, and config tabs.
//
// ═══════════════════════════════════════════════════════════════════════════════
// HOW THE MANIFEST WORKS (Learning Reference):
// ═══════════════════════════════════════════════════════════════════════════════
//
// When PulseOps loads a module, it reads this manifest to understand:
//
//   1. METADATA — id, name, version, description, roles, order
//      Comes from constants.json (single source of truth).
//
//   2. ICON — The Lucide icon shown in the module tab bar.
//      Must be a Lucide React component (not a string).
//
//   3. NAV ITEMS — Sidebar navigation entries.
//      Each entry has: id, label (from uiText.json), icon (Lucide component).
//      The id maps to a view returned by getViews().
//
//   4. VIEWS — React component references.
//      getViews() returns a map: { viewId: ComponentReference }
//      CRITICAL: Return component REFERENCES, not instances.
//      PlatformDashboard creates instances with props: { user, onNavigate }
//
//   5. CONFIG TABS — Settings tabs shown in the Configuration view.
//      Each tab has: id, label, icon, content (render function).
//      Content is a function () => JSX — lazy-mounted when tab is active.
//
// ═══════════════════════════════════════════════════════════════════════════════
// HOW IT LOADS:
// ═══════════════════════════════════════════════════════════════════════════════
//
//   Dev mode  → registerModulePath() in moduleRegistry.js → direct Vite import
//               Vite imports from /src/modules/google_gke/ui/manifest.jsx
//
//   Prod mode → Build: `npm run build:module google_gke`
//               Deploy: Copy dist-modules/google_gke/manifest.js to server
//               Enable: Module Manager UI → POST /api/modules/google_gke/enable
//               Load: PlatformDashboard calls loadModuleManifest('google_gke')
//
// ═══════════════════════════════════════════════════════════════════════════════
// DEPENDENCIES (all relative — self-contained module):
// ═══════════════════════════════════════════════════════════════════════════════
//
//   - lucide-react                     → Icons (must be marked as external in Vite build)
//   - ./config/constants.json          → Module metadata (authoritative)
//   - ./config/uiText.json             → All UI text strings (zero hardcoding)
//   - ./components/*                   → View components
//   - ./components/settings/*          → Config tab components
//
// PATTERN SOURCE: Identical to HealthCheck module's ui/manifest.jsx
// ============================================================================

import React from 'react';
import {
  Cloud,
  LayoutDashboard,
  Box,
  Clock,
  Workflow,
  MessageSquare,
  Mail,
  FileText,
  Sliders,
  Settings,
  Database,
  AlertTriangle,
  Server,
  Link2,
} from 'lucide-react';
import moduleConstants from './config/constants.json';
import uiText from './config/uiText.json';

// ── View Component References (NOT instances — never call new or pass JSX) ────
// These are imported as component references. PlatformDashboard instantiates
// them with props: { user, onNavigate, onModulesChanged }
import GKEDashboard       from './components/GKEDashboard';
import WorkloadsView      from './components/WorkloadsView';
import CronjobsView       from './components/CronjobsView';
import DataflowJobsView   from './components/DataflowJobsView';
import PubsubView          from './components/PubsubView';
import EmailMonitorView    from './components/EmailMonitorView';
import LogsMonitorView     from './components/LogsMonitorView';

// ── Config Tab Components (lazy-mounted via render functions) ─────────────────
// These are only rendered when the user navigates to the config view and
// selects the specific tab. The () => JSX pattern ensures lazy mounting.
import ConnectionTab       from './components/settings/ConnectionTab';
import PollerConfigTab     from './components/settings/PollerConfigTab';
import AlertConfigTab      from './components/settings/AlertConfigTab';
import EmailConfigTab      from './components/settings/EmailConfigTab';
import GeneralSettingsTab  from './components/settings/GeneralSettingsTab';
import DataManagementTab   from './components/settings/DataManagementTab';

// ── Text references from uiText.json ─────────────────────────────────────────
const navText = uiText.navItems;
const cfgText = uiText.config;

/** @type {import('@modules/moduleRegistry').ModuleManifest} */
const googleGkeManifest = {
  // ── Authoritative metadata from constants.json ────────────────────────────
  // Spreads: id, name, shortName, version, description, roles, isCore, order,
  //          defaultView, configDefaultTab, moduleDetails
  ...moduleConstants,

  // ── Module icon (Lucide — never hardcoded string) ─────────────────────────
  // Cloud icon represents cloud infrastructure monitoring.
  // This icon appears in the module tab bar at the top of the platform.
  icon: Cloud,

  // ── Sidebar Navigation ─────────────────────────────────────────────────────
  // Each navItem.id must match a key in getViews() below.
  // Labels come from uiText.json → navItems section.
  // Icons are Lucide React components.
  // { type: 'separator' } adds a visual divider in the sidebar.
  navItems: [
    { id: 'dashboard',    label: navText.dashboard,    icon: LayoutDashboard },
    { id: 'workloads',    label: navText.workloads,    icon: Box             },
    { id: 'cronjobs',     label: navText.cronjobs,     icon: Clock           },
    { id: 'dataflow',     label: navText.dataflow,     icon: Workflow        },
    { id: 'pubsub',       label: navText.pubsub,       icon: MessageSquare   },
    { id: 'email',        label: navText.email,        icon: Mail            },
    { id: 'logs',         label: navText.logs,         icon: FileText        },
    { type: 'separator' },
    { id: 'config',       label: navText.config,       icon: Sliders         },
  ],

  /**
   * Returns a map of view IDs → Component References.
   *
   * CRITICAL: Return references (Class/Function), NOT JSX elements.
   * PlatformDashboard instantiates them with props:
   *   { user, onNavigate, onModulesChanged }
   *
   * The keys here must match the navItem.id values above.
   * When user clicks "Workloads" in sidebar → PlatformDashboard renders
   * the component reference mapped to 'workloads' key.
   *
   * @returns {{ [viewId: string]: React.ComponentType }}
   */
  getViews: () => ({
    dashboard:   GKEDashboard,
    workloads:   WorkloadsView,
    cronjobs:    CronjobsView,
    dataflow:    DataflowJobsView,
    pubsub:      PubsubView,
    email:       EmailMonitorView,
    logs:        LogsMonitorView,
  }),

  /**
   * Returns config tab definitions for the ConfigLayout component.
   *
   * Each tab has:
   *   - id:      Unique tab ID (from uiText.json → config.tabs)
   *   - label:   Display label (from uiText.json → config.tabs)
   *   - icon:    Lucide icon component
   *   - separator: Optional boolean — adds divider before this tab
   *   - content: Render function () => JSX — lazy-mounted when tab is active
   *
   * The ConfigLayout component renders the active tab's content function.
   * This pattern ensures tabs only mount when selected (performance).
   *
   * @returns {Array<{ id, label, icon, content: () => JSX }>}
   */
  getConfigTabs: () => [
    {
      id:      cfgText.tabs.clusterConfig.id,
      label:   cfgText.tabs.clusterConfig.label,
      icon:    Server,
      content: () => <ConnectionTab />,
    },
    {
      id:      cfgText.tabs.pollerConfig.id,
      label:   cfgText.tabs.pollerConfig.label,
      icon:    Clock,
      content: () => <PollerConfigTab />,
    },
    {
      id:      cfgText.tabs.alertConfig.id,
      label:   cfgText.tabs.alertConfig.label,
      icon:    AlertTriangle,
      separator: true,
      content: () => <AlertConfigTab />,
    },
    {
      id:      cfgText.tabs.emailConfig.id,
      label:   cfgText.tabs.emailConfig.label,
      icon:    Mail,
      content: () => <EmailConfigTab />,
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
  // Used by the ConfigLayout wrapper to render the config page header.
  configTitle:      cfgText.title,
  configSubtitle:   cfgText.subtitle,
  configIcon:       Sliders,
  configDefaultTab: moduleConstants.configDefaultTab,
};

export default googleGkeManifest;
