// ============================================================================
// Google GKE Module — Email Monitoring Configuration Tab
//
// PURPOSE: Settings tab for configuring email monitoring. Allows the admin
// to set the email provider (Mailpit for local, SendGrid/Mailgun for prod)
// and connection details.
//
// LAYOUT:
//   ┌─────────────────────────────────────────────────────────────────────────┐
//   │ Email Monitoring                                                        │
//   │ Configure email delivery monitoring provider and settings.              │
//   ├─────────────────────────────────────────────────────────────────────────┤
//   │                                                                         │
//   │ ☐ Enable Email Monitoring                                              │
//   │                                                                         │
//   │ Provider:  [Mailpit ▼]                                                 │
//   │   ○ Mailpit (local development — captures all emails)                  │
//   │   ○ SendGrid (production — API-based tracking)                         │
//   │   ○ Mailgun (production — API-based tracking)                          │
//   │   ○ Generic SMTP (any SMTP server)                                     │
//   │                                                                         │
//   │ Mailpit API URL:  [http://mailpit-service:8025/api/v1 ]               │
//   │ SMTP Host:        [mailpit-service                     ]               │
//   │ SMTP Port:        [1025                                ]               │
//   │                                                                         │
//   │                           [Save Email Config]                           │
//   └─────────────────────────────────────────────────────────────────────────┘
//
// API ENDPOINTS:
//   - GET /api/google_gke/email/config    → Load email config
//   - PUT /api/google_gke/email/config    → Save email config
//
// TEXT: uiText.json → config.tabs.emailConfig section
// ============================================================================

import React from 'react';

// TODO: Implement the EmailConfigTab component

export default function EmailConfigTab() {
  return null;
}
