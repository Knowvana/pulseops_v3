// ============================================================================
// Module Manifest Template — PulseOps V3
//
// PURPOSE: Template for creating new add-on modules. Copy the entire
// _template/ directory and rename it to your module ID.
//
// ARCHITECTURE: Self-contained module with ui/ and api/ subdirectories.
//   - All imports use RELATIVE paths within the module (self-contained)
//   - Platform shared components use @shared alias (resolved by Vite)
//   - Module metadata comes from ./config/constants.json
//   - All UI text comes from ./config/uiText.json
//
// REQUIRED NAV ITEMS: dashboard, reports, config (in this order)
// OPTIONAL: Custom items appended after the base three.
// ============================================================================

import React from 'react';
import { Package, LayoutDashboard, BarChart3, Sliders, Blocks, Database } from 'lucide-react';
import moduleConstants from './config/constants.json';
import uiText from './config/uiText.json';
import ComponentShowcase from './components/ComponentShowcase';
import DataManagementTab from './components/settings/DataManagementTab';

const navText = uiText.navItems;
const cfgText = uiText.config;

// ── Placeholder view component ──────────────────────────────────────────────
function PlaceholderView({ viewName }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-surface-800">{viewName}</h1>
      <p className="text-sm text-surface-500 mt-1">This view is under construction.</p>
    </div>
  );
}

function DashboardView() { return <PlaceholderView viewName="Dashboard" />; }
function ReportsView()   { return <PlaceholderView viewName="Reports" />; }

/** @type {import('@modules/moduleRegistry').ModuleManifest} */
const manifest = {
  // ── Metadata from constants.json ──────────────────────────────────────────
  ...moduleConstants,

  // ── Module icon ───────────────────────────────────────────────────────────
  icon: Package,

  // ── Navigation ────────────────────────────────────────────────────────────
  navItems: [
    { id: 'dashboard',  label: navText.dashboard,  icon: LayoutDashboard },
    { id: 'reports',    label: navText.reports,     icon: BarChart3 },
    { id: 'components', label: 'Components',        icon: Blocks },
    { id: 'config',     label: navText.config,      icon: Sliders },
  ],

  getViews: () => ({
    dashboard:  DashboardView,
    reports:    ReportsView,
    components: ComponentShowcase,
  }),

  getConfigTabs: () => [
    {
      id:      cfgText.tabs.general.id,
      label:   cfgText.tabs.general.label,
      icon:    Sliders,
      content: () => <PlaceholderView viewName="General Configuration" />,
    },
    {
      id:      cfgText.tabs.dataManagement.id,
      label:   cfgText.tabs.dataManagement.label,
      icon:    Database,
      content: () => <DataManagementTab />,
    },
  ],

  configTitle:      cfgText.title,
  configSubtitle:   cfgText.subtitle,
  configIcon:       Sliders,
  configDefaultTab: moduleConstants.configDefaultTab,
};

export default manifest;
