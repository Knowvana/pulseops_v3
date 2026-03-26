// ============================================================================
// Google GKE Module — Pub/Sub View Component
//
// PURPOSE: Displays Google Cloud Pub/Sub topics, subscriptions, metrics,
// and dead-letter messages in a tabbed interface.
//
// LAYOUT:
//   ┌─────────────────────────────────────────────────────────────────────────┐
//   │ Pub/Sub Monitoring                                         [Refresh]   │
//   │ Monitor topics, subscriptions, and message flow.                        │
//   ├─────────────────────────────────────────────────────────────────────────┤
//   │ [Topics] [Subscriptions] [Metrics] [Dead Letters]                      │
//   ├─────────────────────────────────────────────────────────────────────────┤
//   │ Tab: Topics                                                             │
//   │ ┌─────────────────────┬───────────────┬──────────────┬───────────────┐ │
//   │ │ Topic Name          │ Subscriptions │ Publish Rate │ Retention     │ │
//   │ ├─────────────────────┼───────────────┼──────────────┼───────────────┤ │
//   │ │ identity.changes    │ 2             │ 15/sec       │ 7d            │ │
//   │ │ audit.logs          │ 3             │ 120/sec      │ 30d           │ │
//   │ └─────────────────────┴───────────────┴──────────────┴───────────────┘ │
//   │                                                                         │
//   │ Tab: Subscriptions                                                      │
//   │ ┌─────────────────────┬─────────────┬────────┬────────────┬──────────┐ │
//   │ │ Subscription        │ Topic       │ Unacked│ Oldest Age │ DL Topic │ │
//   │ ├─────────────────────┼─────────────┼────────┼────────────┼──────────┤ │
//   │ │ identity-proc-sub   │ id.changes  │ 0      │ -          │ -        │ │
//   │ │ audit-writer-sub    │ audit.logs  │ 142    │ 5m         │ dl-audit │ │
//   │ └─────────────────────┴─────────────┴────────┴────────────┴──────────┘ │
//   └─────────────────────────────────────────────────────────────────────────┘
//
// API ENDPOINTS:
//   - GET /api/google_gke/pubsub/topics          → List topics
//   - GET /api/google_gke/pubsub/subscriptions   → List subscriptions
//   - GET /api/google_gke/pubsub/metrics         → Aggregated metrics
//   - GET /api/google_gke/pubsub/dead-letters    → Dead-letter messages
//
// TEXT: uiText.json → pubsub section
// ============================================================================

import React from 'react';

// TODO: Implement the PubsubView component

export default function PubsubView({ user, onNavigate }) {
  return null;
}
