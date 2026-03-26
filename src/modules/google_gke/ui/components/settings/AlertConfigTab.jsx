// ============================================================================
// Google GKE Module — Alert Configuration Tab
//
// PURPOSE: Settings tab for configuring alert thresholds. These thresholds
// determine when the poller creates alerts during poll cycles.
//
// LAYOUT:
//   ┌─────────────────────────────────────────────────────────────────────────┐
//   │ Alert Thresholds                                                        │
//   │ Configure when alerts are triggered during poll cycles.                 │
//   ├─────────────────────────────────────────────────────────────────────────┤
//   │                                                                         │
//   │ Pod Alerts                                                              │
//   │   Pod Restart Threshold:        [5    ]                                │
//   │   ☑ CrashLoopBackOff Detection                                        │
//   │   CPU Threshold (%):            [90   ]                                │
//   │   Memory Threshold (%):         [90   ]                                │
//   │                                                                         │
//   │ Job Alerts                                                              │
//   │   ☑ CronJob Failure Detection                                          │
//   │   ☑ Dataflow Failure Detection                                         │
//   │                                                                         │
//   │ Messaging Alerts                                                        │
//   │   Pub/Sub Backlog Threshold:    [1000 ]                                │
//   │   ☑ Email Delivery Failure Detection                                   │
//   │                                                                         │
//   │                          [Save Alert Config]                            │
//   └─────────────────────────────────────────────────────────────────────────┘
//
// API ENDPOINTS:
//   - GET /api/google_gke/config/alerts    → Load alert config
//   - PUT /api/google_gke/config/alerts    → Save alert config
//
// TEXT: uiText.json → alertConfig section
// ============================================================================

import React from 'react';

// TODO: Implement the AlertConfigTab component

export default function AlertConfigTab() {
  return null;
}
