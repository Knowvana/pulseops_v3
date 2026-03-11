// =========================================================================
// ServiceNowSlaTab — PulseOps V3 ServiceNow Module Config
//
// PURPOSE: Thin wrapper that renders the dedicated SLAThreshold component,
// which now owns the CRUD experience (ConfirmationModal, summaries, etc.).
// =========================================================================

import React from 'react';
import SLAThreshold from './SLAThreshold';

export default function ServiceNowSlaTab() {
  return <SLAThreshold />;
}
