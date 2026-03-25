# Quick Start — Local GKE (prod1-cluster) in 5 Minutes

## TL;DR — Copy & Paste Commands

### Windows (PowerShell)
```powershell
# 1. Start Podman
podman machine start

# 2. Create cluster
cd src\modules\google_gke\local-dev
set KIND_EXPERIMENTAL_PROVIDER=podman
kind create cluster --config kind-cluster-config.yaml --name prod1-cluster --wait 60s
winget install Kubernetes.kubectl
# 3. Deploy everything
kubectl apply -f k8s-manifests/namespace.yaml
kubectl apply -f k8s-manifests/sample-workloads.yaml
kubectl apply -f k8s-manifests/sample-cronjobs.yaml
kubectl apply -f k8s-manifests/sample-dataflow-jobs.yaml
#kubectl apply -f k8s-manifests/pubsub-emulator.yaml
#kubectl apply -f k8s-manifests/mailpit.yaml

# 4. Verify
kubectl get pods -n prod-iga
kubectl get cronjobs -n prod-iga
kubectl get jobs -n prod-iga -l pulseops.io/type=dataflow

# 5. Start PulseOps
npm run dev
```

### Linux/macOS (Bash)
```bash
# 1. Start Podman
podman machine start

# 2. Create cluster
cd src/modules/google_gke/local-dev
KIND_EXPERIMENTAL_PROVIDER=podman kind create cluster \
  --config kind-cluster-config.yaml \
  --name prod1-cluster \
  --wait 60s

# 3. Deploy everything
kubectl apply -f k8s-manifests/namespace.yaml
kubectl apply -f k8s-manifests/sample-workloads.yaml
kubectl apply -f k8s-manifests/sample-cronjobs.yaml
kubectl apply -f k8s-manifests/sample-dataflow-jobs.yaml
kubectl apply -f k8s-manifests/pubsub-emulator.yaml
kubectl apply -f k8s-manifests/mailpit.yaml

# 4. Verify
kubectl get pods -n prod-iga
kubectl get cronjobs -n prod-iga
kubectl get jobs -n prod-iga -l pulseops.io/type=dataflow

# 5. Start PulseOps
npm run dev
```

---

## What Gets Created

| Component | Count | Status |
|-----------|-------|--------|
| **Deployments** | 7 | identityiq-ui (2), identityiq-task (2), web (3), openidm (2), ig (2), iga-api (3), cloudsql-proxy (1) |
| **StatefulSets** | 1 | elasticsearch-master (3 replicas) |
| **CronJobs** | 3 | bigtable-backup (1 AM), elasticsearch-backup (2 AM), daily-report-vdr-dqc (6 AM) |
| **Dataflow Jobs** | 2 | identity-data-etl-pipeline, access-request-processing-pipeline |
| **Total Pods** | ~20 | All running and healthy |

---

## PulseOps Configuration (After npm run dev)

1. **Module Manager** → Enable "Google GKE"
2. **Settings → Cluster Configuration**
   - Auth Mode: `Auto-detect`
   - Test Connection → Save
3. **Settings → Data Management**
   - Load Default Data
4. **Settings → Poller Configuration**
   - Enable Poller
   - Interval: 30 seconds
   - Check all monitoring options
   - Start Poller
5. **Dashboard** → View all workloads, CronJobs, Dataflow jobs

---

## Verify Everything Works

```bash
# Check cluster
kubectl cluster-info --context kind-prod1-cluster
kubectl get nodes

# Check namespace
kubectl get namespaces | grep prod-iga

# Check workloads (should all be Running)
kubectl get pods -n prod-iga

# Check CronJobs
kubectl get cronjobs -n prod-iga

# Check Dataflow jobs
kubectl get jobs -n prod-iga -l pulseops.io/type=dataflow

# Check services
kubectl get svc -n prod-iga
```

---

## Access Points

| Service | URL | Purpose |
|---------|-----|---------|
| **PulseOps** | http://localhost:5173 | Main dashboard |
| **Mailpit** | http://localhost:30001 | Email testing UI |
| **Pub/Sub Emulator** | pubsub-emulator:8085 | Internal (cluster only) |

---

## Common Tasks

### Manually Trigger a CronJob
```bash
kubectl create job --from=cronjob/bigtable-backup bigtable-backup-manual -n prod-iga
kubectl logs -n prod-iga job/bigtable-backup-manual
```

### Scale a Deployment (simulate unhealthy)
```bash
kubectl scale deployment identityiq-ui -n prod-iga --replicas=0
kubectl scale deployment identityiq-ui -n prod-iga --replicas=2
```

### View Pod Logs
```bash
kubectl logs -n prod-iga deployment/identityiq-ui
kubectl logs -n prod-iga statefulset/elasticsearch-master
```

### Delete Cluster
```bash
kind delete cluster --name prod1-cluster
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `podman: command not found` | Install Podman Desktop or podman CLI |
| `kind: command not found` | Install Kind: `winget install Kubernetes.kind` |
| Pods not starting | Check logs: `kubectl describe pod -n prod-iga <name>` |
| Can't connect to cluster | Verify context: `kubectl config use-context kind-prod1-cluster` |
| Mailpit not accessible | Check service: `kubectl get svc -n prod-iga mailpit-nodeport` |

---

## Full Setup Guide

For detailed step-by-step instructions, see: **SETUP_GUIDE.md**


kubectl delete deployment -n prod-iga --all
kubectl delete statefulset -n prod-iga --all
kubectl apply -f k8s-manifests/sample-workloads.yaml
kubectl get pods -n prod-iga


npm run build:module google_gke