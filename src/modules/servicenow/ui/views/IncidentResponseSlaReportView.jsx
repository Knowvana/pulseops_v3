// ============================================================================
// IncidentResponseSlaReportView — PulseOps V3 ServiceNow Module
//
// PURPOSE: Standalone view wrapper for the Incident Response SLA Report.
// Registered in manifest.jsx as a direct nav item (no nested tabs).
//
// USED BY: manifest.jsx → getViews().incidentResponseSlaReport
// ============================================================================
import React from 'react';
import ServiceNowResponseSlaReport from '../components/ServiceNowResponseSlaReport';

export default function IncidentResponseSlaReportView({ onNavigate }) {
  return <ServiceNowResponseSlaReport onNavigate={onNavigate} />;
}
