// ============================================================================
// IncidentSlaReportView — PulseOps V3 ServiceNow Module
//
// PURPOSE: Standalone view wrapper for the Incident SLA Report.
// Registered in manifest.jsx as a direct nav item (no nested tabs).
//
// USED BY: manifest.jsx → getViews().incidentSlaReport
// ============================================================================
import React from 'react';
import ServiceNowSlaReport from '../components/ServiceNowSlaReport';

export default function IncidentSlaReportView({ onNavigate }) {
  return <ServiceNowSlaReport onNavigate={onNavigate} />;
}
