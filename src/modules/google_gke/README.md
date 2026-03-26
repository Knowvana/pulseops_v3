# Google GKE Module — PulseOps V3

## Overview

The **Google GKE** module is a PulseOps V3 add-on module that provides comprehensive monitoring for Google Cloud GKE infrastructure components. It monitors GKE workloads, Kubernetes CronJobs, Google Cloud Dataflow pipelines, Pub/Sub messaging, email delivery, and provides log-based alerting.

**Module ID:** `google_gke`  
**Version:** 1.0.0  
**Architecture:** Microkernel hot-drop module (plug-and-play)

## Key Design Principle: Zero Code Changes

This module is designed so that **zero code changes** are needed when moving from local development to production GCP GKE:

| Component | Local (Kind + Podman) | Production (GCP GKE) |
|-----------|----------------------|---------------------|
| K8s API | kubeconfig auth | In-cluster service account |
| Dataflow | K8s Jobs with labels | Dataflow REST API |
| Pub/Sub | Pub/Sub Emulator | Real Cloud Pub/Sub |
| Email | Mailpit | SendGrid / Mailgun |
| Detection | `KubernetesClient.js` auto-detect | `KubernetesClient.js` auto-detect |

## Monitoring Domains

1. **GKE Workloads** — Deployments, StatefulSets, DaemonSets, Pods
2. **CronJobs** — Scheduled task execution, success rates, history
3. **Dataflow Jobs** — Batch and streaming pipeline monitoring
4. **Pub/Sub** — Topics, subscriptions, backlog, dead letters
5. **Email** — Delivery health, send/receive metrics, bounce tracking
6. **Logs** — Log search, live streaming, pattern-based alerting

## File Structure

```
src/modules/google_gke/
├── README.md                              ← You are here
│
├── api/                                   ── Backend (Express.js API)
│   ├── index.js                           ← API entry point + lifecycle hooks
│   ├── config/
│   │   ├── index.js                       ← Config loader (JSON → exports)
│   │   ├── urls.json                      ← All API route paths
│   │   ├── APIErrors.json                 ← All error message templates
│   │   └── APIMessages.json               ← All success message templates
│   ├── lib/
│   │   ├── moduleLogger.js                ← Winston logger wrapper (module-scoped)
│   │   └── KubernetesClient.js            ← K8s client abstraction (local ↔ GKE)
│   ├── routes/
│   │   ├── helpers.js                     ← Shared utilities (MODULE_ID, DB helpers)
│   │   ├── configRoutes.js                ← Cluster/poller/general/alert config
│   │   ├── workloadRoutes.js              ← GKE workload monitoring
│   │   ├── dataflowRoutes.js              ← Dataflow job monitoring
│   │   ├── cronjobRoutes.js               ← CronJob monitoring
│   │   ├── pubsubRoutes.js                ← Pub/Sub monitoring
│   │   ├── emailRoutes.js                 ← Email delivery monitoring
│   │   ├── logsRoutes.js                  ← Log search, stream, alerts
│   │   ├── reportRoutes.js                ← Dashboard + reports
│   │   └── dataRoutes.js                  ← Schema info, defaults, reset
│   └── services/
│       ├── ClusterPollerService.js         ← Background health poller
│       ├── WorkloadService.js              ← Workload business logic
│       ├── DataflowService.js              ← Dataflow business logic
│       ├── CronjobService.js               ← CronJob business logic
│       ├── PubsubService.js                ← Pub/Sub business logic
│       ├── EmailService.js                 ← Email business logic
│       └── LogsService.js                  ← Log monitoring business logic
│
├── database/                              ── Database Schema & Seed Data
│   ├── Schema.json                        ← 9 tables (gke_* prefix)
│   └── DefaultData.json                   ← Seed: config, workloads, alert rules
│
├── ui/                                    ── Frontend (React)
│   ├── manifest.jsx                       ← Module manifest (nav, views, config tabs)
│   ├── config/
│   │   ├── constants.json                 ← Module metadata (id, name, version)
│   │   ├── urls.json                      ← Frontend API endpoint URLs
│   │   ├── uiText.json                    ← All UI text strings
│   │   ├── uiErrors.json                  ← Frontend error messages
│   │   └── uiMessages.json                ← Frontend success messages
│   ├── components/
│   │   ├── GKEDashboard.jsx               ← Main dashboard view
│   │   ├── WorkloadsView.jsx              ← Workloads monitoring view
│   │   ├── CronjobsView.jsx              ← CronJobs monitoring view
│   │   ├── DataflowJobsView.jsx           ← Dataflow jobs view
│   │   ├── PubsubView.jsx                 ← Pub/Sub monitoring view
│   │   ├── EmailMonitorView.jsx           ← Email monitoring view
│   │   ├── LogsMonitorView.jsx            ← Logs monitoring view
│   │   └── settings/
│   │       ├── ClusterConfigTab.jsx       ← Cluster connection settings
│   │       ├── PollerConfigTab.jsx        ← Poller configuration
│   │       ├── AlertConfigTab.jsx         ← Alert thresholds
│   │       ├── EmailConfigTab.jsx         ← Email provider config
│   │       ├── GeneralSettingsTab.jsx     ← Namespaces, retention
│   │       └── DataManagementTab.jsx      ← Schema status, load/reset data
│
└── local-dev/                             ── Local GKE Simulation
    ├── README.md                          ← Setup guide
    ├── kind-cluster-config.yaml           ← Kind cluster definition (3 nodes)
    ├── setup-local-gke.sh                 ← Bash setup script
    ├── setup-local-gke.ps1                ← PowerShell setup script
    ├── teardown-local-gke.sh              ← Bash teardown script
    └── k8s-manifests/
        ├── namespace.yaml                 ← 'accessio' namespace
        ├── sample-workloads.yaml          ← Deployments + StatefulSets
        ├── sample-cronjobs.yaml           ← 5 CronJobs
        ├── sample-dataflow-jobs.yaml      ← 3 Dataflow simulation Jobs
        ├── pubsub-emulator.yaml           ← Google Pub/Sub emulator
        └── mailpit.yaml                   ← Email testing (SMTP + Web UI)
```

## Database Tables (9 tables)

| Table | Purpose |
|-------|---------|
| `gke_module_config` | Key-value config store (cluster, poller, general, alerts, email) |
| `gke_workloads` | Monitored workload registry |
| `gke_poll_results` | Health poll results per workload per cycle |
| `gke_cronjob_history` | CronJob execution history |
| `gke_dataflow_jobs` | Dataflow job tracking |
| `gke_pubsub_metrics` | Pub/Sub metrics snapshots |
| `gke_email_history` | Email delivery tracking |
| `gke_alerts` | Active and resolved alerts |
| `gke_log_alerts` | Log-based alert rules |

## Getting Started

### 1. Set Up Local GKE Simulation
```powershell
cd src\modules\google_gke\local-dev
.\setup-local-gke.ps1
```

### 2. Install npm Dependencies
```bash
npm install @kubernetes/client-node @google-cloud/pubsub @google-cloud/logging
```

### 3. Start PulseOps
```bash
npm run dev
```

### 4. Enable the Module
1. Go to **Module Manager** in PulseOps admin
2. Enable **Google GKE** module
3. Go to **Settings → Cluster Configuration**
4. Auth mode: **Auto-detect** → **Test Connection** → **Save**
5. Go to **Settings → Data Management** → **Load Default Data**
6. Go to **Settings → Poller Configuration** → Enable → Save
7. View the **Dashboard**

## Accessio-Specific Components Monitored

| Component | Type | Description |
|-----------|------|-------------|
| ForgeRock IGA | Deployment | Identity Governance & Administration |
| Sailpoint IIQ | Deployment | Identity Security Platform |
| Accessio Web | Deployment | React SPA frontend |
| Accessio API | Deployment | Node.js Express API backend |
| PostgreSQL | StatefulSet | Primary database |
| Elasticsearch | StatefulSet | Search and analytics engine |

## Development Status

All files are created with **detailed comments** explaining architecture, patterns, and implementation TODOs. Each file follows the exact same pattern as the HealthCheck module for consistency and plug-and-play integration.

**Status:** Scaffolded with empty implementations — ready for incremental development.
