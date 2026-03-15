// ============================================================================
// ServiceNow Module Manifest — PulseOps V3
//
// PURPOSE: Self-describing manifest for the ServiceNow ITSM Integration module.
// The platform's module registry discovers this file and uses it to drive
// top navigation, sidebar navigation, view rendering, and configuration tabs.
// NO ServiceNow-specific code lives in the platform core — this manifest is
// the ONLY integration point between the platform and this module.
//
// ARCHITECTURE: Plug-and-play module contract.
//   - Metadata (id, name, version, roles, order) sourced from constants.json.
//   - getViews() returns Component References (NOT instances) — critical for performance.
//   - getConfigTabs() returns tab definitions with render functions for lazy mounting.
//   - All navItems follow the mandatory base-3: dashboard, config, reports.
//   - Custom navItem 'incidents' appended after the base three.
//
// HOW IT LOADS (zero-downtime plug-and-play):
//   Dev mode  → registerModulePath() in moduleRegistry.js → direct Vite import
//   Prod mode → Build: `npm run build:module servicenow`
//               Deploy: Copy dist-modules/servicenow/manifest.js to server
//               Enable: Module Manager UI → POST /api/modules/servicenow/enable
//               Load:   PlatformDashboard calls loadModuleManifest('servicenow')
//                       → fetches /api/modules/bundle/servicenow/manifest.js
//
// DEPENDENCIES (all relative — self-contained module):
//   - lucide-react                     → Icons
//   - ./config/constants.json          → Module metadata (authoritative)
//   - ./config/uiText.json             → All UI text strings
//   - ./components/*                   → View + config components
// ============================================================================

import React from 'react';
import { Headset, LayoutDashboard, BarChart3, Sliders, Wifi, Clock, RefreshCw, ListFilter, ClipboardList, CalendarClock, Settings, Database, Columns, ShieldCheck, FileText, ListChecks, TrendingUp, Users, MessageSquare, Globe } from 'lucide-react';
import moduleConstants from './config/constants.json';
import uiText from './config/uiText.json';

// ── View Component References (NOT instances — never call new or pass JSX) ────
import ServiceNowDashboard      from './components/ServiceNowDashboard';
import ServiceNowIncidents      from './components/ServiceNowIncidents';
import ServiceNowTestIncidents  from './components/ServiceNowTestIncidents';
import IncidentSlaReportView            from './views/IncidentSlaReportView';
import IncidentResponseSlaReportView    from './views/IncidentResponseSlaReportView';
import IncidentAnalyticsView             from './views/IncidentAnalyticsView';
import RitmReportsView                   from './views/RitmReportsView';

// ── Config Tab Components (lazy-mounted via render functions) ─────────────────
import ServiceNowConnectionTab         from './components/settings/ServiceNowConnectionTab';
import ServiceNowAssignmentGroupTab    from './components/settings/ServiceNowAssignmentGroupTab';
import ServiceNowIncidentConfigTab     from './components/settings/ServiceNowIncidentConfigTab';
import ServiceNowSLAColumnMappingTab   from './components/settings/ServiceNowSLAColumnMappingTab';
import ServiceNowSlaTab                from './components/settings/ServiceNowSlaTab';
import ServiceNowSyncTab               from './components/settings/ServiceNowSyncTab';
import ServiceNowBusinessHoursTab   from './components/settings/ServiceNowBusinessHoursTab';
import ServiceNowConfigSettingsTab  from './components/settings/ServiceNowConfigSettingsTab';
import ServiceNowDataManagementTab  from './components/settings/ServiceNowDataManagementTab';
import ServiceNowAutoAcknowledgeTab  from './components/settings/ServiceNowAutoAcknowledgeTab';
import ServiceNowTimezoneTab         from './components/settings/ServiceNowTimezoneTab';

const navText = uiText.navItems;
const cfgText = uiText.config;

/** @type {import('@modules/moduleRegistry').ModuleManifest} */
const servicenowManifest = {
  // ── Authoritative metadata from constants.json ────────────────────────────
  ...moduleConstants,

  // ── Module icon (Lucide — never hardcoded string) ─────────────────────────
  icon: Headset,

  // ── Sidebar Navigation ─────────────────────────────────────────────────────
  // Flat layout: main items → separator → Reports header → indented sub-items → config
  navItems: [
    { id: 'dashboard',        label: navText.dashboard,      icon: LayoutDashboard },
    { id: 'incidents',        label: navText.incidents,       icon: ListFilter       },
    { id: 'testIncidents',    label: navText.testIncidents,   icon: ClipboardList    },
    { type: 'separator' },
    { type: 'header', label: 'Reports' },
    { id: 'incidentSlaReport',          label: 'Incident Resolution SLA Report',  icon: ShieldCheck,   indent: true },
    { id: 'incidentResponseSlaReport',  label: 'Incident Response SLA Report',    icon: Clock,         indent: true },
    { id: 'incidentAnalytics',          label: 'Incident Analytics',              icon: TrendingUp,    indent: true },
    { id: 'ritmReports',        label: 'RITMs',                icon: ListChecks,    indent: true },
    { type: 'separator' },
    { id: 'config',           label: navText.config,          icon: Sliders          },
  ],

  /**
   * Returns a map of view IDs → Component References.
   * CRITICAL: Return references (Class/Function), NOT JSX elements.
   * PlatformDashboard instantiates them with props: { user, onNavigate, onModulesChanged }
   *
   * @returns {{ [viewId: string]: React.ComponentType }}
   */
  getViews: () => ({
    dashboard:          ServiceNowDashboard,
    incidents:          ServiceNowIncidents,
    testIncidents:      ServiceNowTestIncidents,
    incidentSlaReport:          IncidentSlaReportView,
    incidentResponseSlaReport:  IncidentResponseSlaReportView,
    incidentAnalytics:          IncidentAnalyticsView,
    ritmReports:        RitmReportsView,
  }),

  /**
   * Returns config tab definitions for the ConfigLayout component.
   * Content is a render function (() => JSX) — each tab only mounts when active.
   * This follows the lazy-rendering pattern established in Settings.jsx.
   *
   * @returns {Array<{ id, label, icon, content: () => JSX }>}
   */
  getConfigTabs: () => [
    {
      id:      cfgText.tabs.connection.id,
      label:   cfgText.tabs.connection.label,
      icon:    Wifi,
      content: () => <ServiceNowConnectionTab />,
    },
    {
      id:      'assignmentGroup',
      label:   'Assignment Group',
      icon:    Users,
      content: () => <ServiceNowAssignmentGroupTab />,
    },
    {
      id:      cfgText.tabs.businessHours.id,
      label:   cfgText.tabs.businessHours.label,
      icon:    CalendarClock,
      content: () => <ServiceNowBusinessHoursTab />,
    },
    {
      id:      cfgText.tabs.timezone.id,
      label:   cfgText.tabs.timezone.label,
      icon:    Globe,
      content: () => <ServiceNowTimezoneTab />,
    },
    {
      type: 'section',
      id: 'incident_configuration_section',
      label: 'Incident Configuration',
      icon: Columns,
      defaultExpanded: true,
      separator: true,
      children: [
        {
          id:      cfgText.tabs.incidentConfig.id,
          label:   cfgText.tabs.incidentConfig.label,
          icon:    Columns,
          content: () => <ServiceNowIncidentConfigTab />,
        },
        {
          id:      'slaColumnMapping',
          label:   'SLA Column Mapping',
          icon:    Clock,
          content: () => <ServiceNowSLAColumnMappingTab />,
        },
        {
          id:      cfgText.tabs.sla.id,
          label:   cfgText.tabs.sla.label,
          icon:    Clock,
          content: () => <ServiceNowSlaTab />,
        },
        {
          id:      'autoAcknowledge',
          label:   'Auto Acknowledge',
          icon:    MessageSquare,
          content: () => <ServiceNowAutoAcknowledgeTab />,
        },
      ],
    },
    {
      id:      cfgText.tabs.sync.id,
      label:   cfgText.tabs.sync.label,
      icon:    RefreshCw,
      separator: true,
      content: () => <ServiceNowSyncTab />,
    },
    {
      id:      cfgText.tabs.settings.id,
      label:   cfgText.tabs.settings.label,
      icon:    Settings,
      content: () => <ServiceNowConfigSettingsTab />,
    },
    {
      id:      cfgText.tabs.dataManagement.id,
      label:   cfgText.tabs.dataManagement.label,
      icon:    Database,
      content: () => <ServiceNowDataManagementTab />,
    },
  ],

  // ── ConfigLayout metadata (used by PlatformDashboard when activeView==='config') ──
  configTitle:      cfgText.title,
  configSubtitle:   cfgText.subtitle,
  configIcon:       Sliders,
  configDefaultTab: moduleConstants.configDefaultTab,
};

export default servicenowManifest;
