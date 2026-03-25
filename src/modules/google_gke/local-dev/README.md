# Local GKE Simulation — Setup Guide

## Overview

This directory contains everything needed to run a **local Kubernetes cluster** that simulates a GCP GKE environment. The simulation uses **Kind** (Kubernetes in Docker) running on **Podman**, with sample workloads that mimic the Accessio platform components.

**Zero code changes** are needed when moving from this local simulation to the actual GCP GKE cluster. The module's `KubernetesClient.js` auto-detects the environment and connects accordingly.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Local Development Machine                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Podman (Container Runtime)                     │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │           Kind Cluster: pulseops-gke                  │ │ │
│  │  │                                                      │ │ │
│  │  │  ┌──────────────┐ ┌────────────┐ ┌────────────┐    │ │ │
│  │  │  │ Control Plane│ │  Worker 1  │ │  Worker 2  │    │ │ │
│  │  │  │ (API Server) │ │ (Pods run  │ │ (Pods run  │    │ │ │
│  │  │  │              │ │  here)     │ │  here)     │    │ │ │
│  │  │  └──────────────┘ └────────────┘ └────────────┘    │ │ │
│  │  │                                                      │ │ │
│  │  │  Namespace: accessio                                 │ │ │
│  │  │  ├── forgerock-iga (Deployment, 2 replicas)         │ │ │
│  │  │  ├── sailpoint-iiq (Deployment, 2 replicas)         │ │ │
│  │  │  ├── accessio-web  (Deployment, 3 replicas)         │ │ │
│  │  │  ├── accessio-api  (Deployment, 3 replicas)         │ │ │
│  │  │  ├── postgresql    (StatefulSet, 1 replica)         │ │ │
│  │  │  ├── elasticsearch (StatefulSet, 3 replicas)        │ │ │
│  │  │  ├── 5 CronJobs (identity-sync, db-backup, etc.)   │ │ │
│  │  │  ├── 3 Dataflow simulations (K8s Jobs)              │ │ │
│  │  │  ├── Pub/Sub Emulator (1 replica)                   │ │ │
│  │  │  └── Mailpit (1 replica, SMTP + Web UI)             │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  PulseOps (Node.js) ←── kubeconfig ──→ Kind K8s API             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Podman** | 4.x+ | [podman.io](https://podman.io/getting-started/installation) or [Podman Desktop](https://podman-desktop.io/) |
| **Kind** | 0.20+ | `winget install Kubernetes.kind` or [kind.sigs.k8s.io](https://kind.sigs.k8s.io/) |
| **kubectl** | 1.28+ | `winget install Kubernetes.kubectl` or [kubernetes.io](https://kubernetes.io/docs/tasks/tools/) |

## Quick Start

### Windows (PowerShell)
```powershell
cd src\modules\google_gke\local-dev
.\setup-local-gke.ps1
```

### Linux / macOS (Bash)
```bash
cd src/modules/google_gke/local-dev
chmod +x setup-local-gke.sh
./setup-local-gke.sh
```

## What Gets Created

### Workloads (Deployments)
| Name | Replicas | Simulates |
|------|----------|-----------|
| `forgerock-iga` | 2 | ForgeRock Identity Governance & Administration |
| `sailpoint-iiq` | 2 | Sailpoint IdentityIQ |
| `accessio-web` | 3 | Web frontend (React SPA via Nginx) |
| `accessio-api` | 3 | API backend (Node.js Express) |

### Workloads (StatefulSets)
| Name | Replicas | Simulates |
|------|----------|-----------|
| `postgresql` | 1 | PostgreSQL database |
| `elasticsearch` | 3 | Elasticsearch cluster |

### CronJobs
| Name | Schedule | Simulates |
|------|----------|-----------|
| `identity-sync` | `*/15 * * * *` | ForgeRock → Sailpoint data sync |
| `compliance-report` | `0 2 * * *` | Daily compliance report generation |
| `db-backup` | `0 */6 * * *` | PostgreSQL backup |
| `es-index-rotate` | `0 3 * * *` | Elasticsearch index rotation |
| `cache-refresh` | `*/30 * * * *` | Application cache rebuild |

### Dataflow Simulations (K8s Jobs)
| Name | Type | Simulates |
|------|------|-----------|
| `identity-sync-pipeline` | BATCH | Identity data sync pipeline |
| `audit-aggregation-pipeline` | BATCH | Audit log aggregation |
| `compliance-report-pipeline` | BATCH | Compliance report generation |

### Services
| Name | Port | Purpose |
|------|------|---------|
| `pubsub-emulator` | 8085 | Google Pub/Sub emulator (cluster-internal) |
| `mailpit-service` | 1025/8025 | SMTP server + REST API (cluster-internal) |
| `mailpit-nodeport` | 30001 | Mailpit Web UI (browser access) |

## Access Points

| Resource | URL |
|----------|-----|
| **Mailpit Web UI** | http://localhost:30001 |
| **kubectl context** | `kind-pulseops-gke` |

## Useful kubectl Commands

```bash
# View all resources in accessio namespace
kubectl get all -n accessio

# Watch pods in real-time
kubectl get pods -n accessio -w

# View pod logs
kubectl logs -n accessio deployment/forgerock-iga

# View CronJob execution history
kubectl get jobs -n accessio

# View events (useful for debugging)
kubectl get events -n accessio --sort-by='.lastTimestamp'

# Exec into a pod (for debugging)
kubectl exec -it -n accessio deployment/accessio-api -- /bin/sh

# Scale a deployment (simulate unhealthy state)
kubectl scale deployment forgerock-iga -n accessio --replicas=0
```

## Teardown

### Windows (PowerShell)
```powershell
kind delete cluster --name pulseops-gke
```

### Linux / macOS (Bash)
```bash
chmod +x teardown-local-gke.sh
./teardown-local-gke.sh
```

## How This Maps to Production GKE

| Local (Kind + Podman) | Production (GCP GKE) |
|----------------------|---------------------|
| Kind cluster | GKE cluster |
| kubeconfig auth | Service Account (Workload Identity) |
| K8s Jobs with labels | Real Dataflow API |
| Pub/Sub emulator | Real Cloud Pub/Sub |
| Mailpit | SendGrid / Mailgun |
| nginx containers | Real application images |
| `KubernetesClient.js` auto-detect | `KubernetesClient.js` auto-detect |
| **Same K8s API calls** | **Same K8s API calls** |
