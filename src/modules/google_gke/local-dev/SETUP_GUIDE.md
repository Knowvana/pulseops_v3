# Local GKE Setup Guide — Step-by-Step (prod1-cluster)

This guide walks you through setting up a local Kubernetes cluster that simulates your prod1-cluster environment with all workloads, CronJobs, and Dataflow jobs.

## Prerequisites

### 1. Install Podman

**Windows (via Podman Desktop):**
- Download: https://podman-desktop.io/
- Install and launch Podman Desktop
- Verify: Open PowerShell and run `podman --version`

**Linux:**
```bash
sudo apt-get install podman
podman --version
```

**macOS:**
```bash
brew install podman
podman --version
```

### 2. Install Kind (Kubernetes in Docker)

**Windows:**
```powershell
winget install Kubernetes.kind
kind --version
```

**Linux/macOS:**
```bash
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind
kind --version
```

### 3. Install kubectl

**Windows:**
```powershell
winget install Kubernetes.kubectl
kubectl version --client
```

**Linux/macOS:**
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/
kubectl version --client
```

---

## Step 1: Start Podman Machine

Podman runs Kubernetes inside a lightweight VM. You must start the machine first.

**Windows (PowerShell):**
```powershell
podman machine start
podman info
```

**Linux/macOS:**
```bash
podman machine start
podman info
```

**Expected output:** Shows machine status, storage, and runtime info.

---

## Step 2: Create the Kind Cluster

Navigate to the local-dev directory and create the cluster.

**Windows (PowerShell):**
```powershell
cd src\modules\google_gke\local-dev
$env:KIND_EXPERIMENTAL_PROVIDER = "podman"
kind create cluster --config kind-cluster-config.yaml --name prod1-cluster --wait 60s
```

**Linux/macOS (Bash):**
```bash
cd src/modules/google_gke/local-dev
KIND_EXPERIMENTAL_PROVIDER=podman kind create cluster \
  --config kind-cluster-config.yaml \
  --name prod1-cluster \
  --wait 60s
```

**Expected output:**
```
Creating cluster "prod1-cluster" ...
 ✓ Ensuring node image (kindest/node:v1.27.0) 🖼
 ✓ Preparing nodes (control-plane, worker, worker2)
 ✓ Writing configuration
 ✓ Starting control-plane
 ✓ Installing CNI
 ✓ Installing StorageClass
 ✓ Joining workers
Set kubectl context to "kind-prod1-cluster"
```

**Verify:**
```bash
kubectl cluster-info --context kind-prod1-cluster
kubectl get nodes
```

You should see 3 nodes: 1 control-plane + 2 workers.

---

## Step 3: Create the Namespace

Create the `prod-iga` namespace where all workloads will run.

```bash
kubectl apply -f k8s-manifests/namespace.yaml
kubectl get namespaces
```

**Expected output:**
```
NAME              STATUS   AGE
prod-iga          Active   5s
default           Active   2m
kube-node-lease   Active   2m
kube-public       Active   2m
kube-system       Active   2m
```

---

## Step 4: Deploy Sample Workloads

Deploy all Deployments and StatefulSets (identityiq-ui, identityiq-task, web, openidm, ig, iga-api, cloudsql-proxy, elasticsearch-master).

```bash
kubectl apply -f k8s-manifests/sample-workloads.yaml
```

**Verify:**
```bash
kubectl get deployments -n prod-iga
kubectl get statefulsets -n prod-iga
kubectl get pods -n prod-iga -w
```

**Expected output (after ~30 seconds):**
```
NAME                    READY   UP-TO-DATE   AVAILABLE   AGE
identityiq-ui           2/2     2            2           20s
identityiq-task         2/2     2            2           20s
web                     3/3     3            3           20s
openidm                 2/2     2            2           20s
ig                      2/2     2            2           20s
iga-api                 3/3     3            3           20s
cloudsql-proxy          1/1     1            1           20s

NAME                           READY   AGE
elasticsearch-master-0         1/1     20s
elasticsearch-master-1         1/1     15s
elasticsearch-master-2         1/1     10s
```

All pods should show `1/1` ready and `Running` status.

---

## Step 5: Deploy CronJobs

Deploy the 3 CronJobs (bigtable-backup, elasticsearch-backup, daily-report-vdr-dqc).

```bash
kubectl apply -f k8s-manifests/sample-cronjobs.yaml
```

**Verify:**
```bash
kubectl get cronjobs -n prod-iga
```

**Expected output:**
```
NAME                      SCHEDULE    SUSPEND   ACTIVE   LAST SCHEDULE   AGE
bigtable-backup           0 1 * * *   False     0        <none>          5s
elasticsearch-backup      0 2 * * *   False     0        <none>          5s
daily-report-vdr-dqc      0 6 * * *   False     0        <none>          5s
```

**Note:** CronJobs won't execute until their scheduled time. To test immediately, you can manually trigger a job:

```bash
kubectl create job --from=cronjob/bigtable-backup bigtable-backup-manual -n prod-iga
kubectl get jobs -n prod-iga
kubectl logs -n prod-iga job/bigtable-backup-manual
```

---

## Step 6: Deploy Dataflow Job Simulations

Deploy the 2 Dataflow job simulations (identity-data-etl-pipeline, access-request-processing-pipeline).

```bash
kubectl apply -f k8s-manifests/sample-dataflow-jobs.yaml
```

**Verify:**
```bash
kubectl get jobs -n prod-iga -l pulseops.io/type=dataflow
```

**Expected output:**
```
NAME                                    COMPLETIONS   DURATION   AGE
identity-data-etl-pipeline              1/1           25s        30s
access-request-processing-pipeline      1/1           20s        30s
```

**View job logs:**
```bash
kubectl logs -n prod-iga job/identity-data-etl-pipeline
kubectl logs -n prod-iga job/access-request-processing-pipeline
```

---

## Step 7: Deploy Pub/Sub Emulator (Optional)

Deploy the Google Cloud Pub/Sub emulator for testing Pub/Sub monitoring.

```bash
kubectl apply -f k8s-manifests/pubsub-emulator.yaml
```

**Verify:**
```bash
kubectl get pods -n prod-iga -l app=pubsub-emulator
kubectl get svc -n prod-iga pubsub-emulator
```

**Access from PulseOps:**
- Set environment variable: `PUBSUB_EMULATOR_HOST=pubsub-emulator:8085`
- The @google-cloud/pubsub library will auto-detect and connect to the emulator

---

## Step 8: Deploy Mailpit (Email Testing - Optional)

Deploy Mailpit for email delivery monitoring.

```bash
kubectl apply -f k8s-manifests/mailpit.yaml
```

**Verify:**
```bash
kubectl get pods -n prod-iga -l app=mailpit
kubectl get svc -n prod-iga mailpit-nodeport
```

**Access Mailpit Web UI:**
- Open browser: http://localhost:30001
- You should see the Mailpit interface

---

## Step 9: Verify Everything is Running

Run a comprehensive health check:

```bash
# All pods should be Running
kubectl get pods -n prod-iga

# All deployments should be ready
kubectl get deployments -n prod-iga

# All statefulsets should be ready
kubectl get statefulsets -n prod-iga

# All cronjobs should exist
kubectl get cronjobs -n prod-iga

# All dataflow jobs should be completed
kubectl get jobs -n prod-iga -l pulseops.io/type=dataflow
```

**Expected summary:**
- 7 Deployments: all 2/2 or 3/3 ready
- 1 StatefulSet: 3/3 ready
- 3 CronJobs: all active
- 2 Dataflow Jobs: both completed
- Total: ~20 pods running

---

## Step 10: Configure PulseOps to Connect

Now that the cluster is running, configure PulseOps to monitor it.

### 10a. Start PulseOps

```bash
npm run dev
```

### 10b. Enable the Google GKE Module

1. Open PulseOps in browser: http://localhost:5173
2. Go to **Module Manager** (admin panel)
3. Find **Google GKE** module
4. Click **Enable**

### 10c. Configure Cluster Connection

1. Go to **Settings → Cluster Configuration**
2. Set **Auth Mode**: `Auto-detect`
3. Leave other fields empty (auto-detect will use kubeconfig)
4. Click **Test Connection**
   - Should show: "Cluster connection test successful"
   - Cluster name: `prod1-cluster`
   - Server version: `v1.27.0` (or similar)
5. Click **Save Configuration**

### 10d. Load Default Data

1. Go to **Settings → Data Management**
2. Click **Load Default Data**
   - This seeds the database with sample workloads, CronJobs, and alert rules
3. Verify: Check the **Schema Status** table — all 9 tables should exist

### 10e. Enable the Poller

1. Go to **Settings → Poller Configuration**
2. Check **Enable Background Poller**
3. Set **Poll Interval**: 30 seconds
4. Check all monitoring options:
   - ✓ Monitor Workloads
   - ✓ Monitor CronJobs
   - ✓ Monitor Dataflow Jobs
   - ✓ Monitor Pub/Sub
5. Click **Save Poller Config**
6. Click **Start Poller**
   - Status should change to "Running"

### 10f. View the Dashboard

1. Go to **Google GKE → Dashboard**
2. You should see:
   - **Workloads**: 7 deployments + 1 statefulset = 8 total (all healthy)
   - **CronJobs**: 3 CronJobs listed
   - **Dataflow**: 2 jobs (completed)
   - **Poller Status**: Running, last poll 30s ago
   - **Component Status Grid**: All workloads showing as HEALTHY

---

## Useful kubectl Commands for Testing

### View All Resources
```bash
kubectl get all -n prod-iga
```

### Watch Pods in Real-Time
```bash
kubectl get pods -n prod-iga -w
```

### View Pod Logs
```bash
kubectl logs -n prod-iga deployment/identityiq-ui
kubectl logs -n prod-iga statefulset/elasticsearch-master
```

### Describe a Pod (for debugging)
```bash
kubectl describe pod -n prod-iga <pod-name>
```

### Exec into a Pod
```bash
kubectl exec -it -n prod-iga deployment/web -- /bin/sh
```

### Scale a Deployment (simulate unhealthy state)
```bash
kubectl scale deployment identityiq-ui -n prod-iga --replicas=0
kubectl scale deployment identityiq-ui -n prod-iga --replicas=2
```

### View Events
```bash
kubectl get events -n prod-iga --sort-by='.lastTimestamp'
```

### Delete and Recreate a Pod
```bash
kubectl delete pod -n prod-iga <pod-name>
kubectl get pods -n prod-iga -w  # Watch it restart
```

---

## Troubleshooting

### Cluster Creation Fails

**Error:** `podman: command not found`
- **Solution:** Install Podman and ensure it's in PATH

**Error:** `kind: command not found`
- **Solution:** Install Kind and ensure it's in PATH

**Error:** `Cannot connect to Podman socket`
- **Solution:** Start Podman machine: `podman machine start`

### Pods Not Starting

**Check pod status:**
```bash
kubectl describe pod -n prod-iga <pod-name>
kubectl logs -n prod-iga <pod-name>
```

**Common issues:**
- Image pull failures: Check internet connection
- Resource constraints: Reduce pod replicas or increase Podman VM memory
- Port conflicts: Check if ports 8080, 9200, 5432 are available

### kubectl Context Issues

**List available contexts:**
```bash
kubectl config get-contexts
```

**Switch to prod1-cluster:**
```bash
kubectl config use-context kind-prod1-cluster
```

### Cluster Cleanup

**Delete the entire cluster:**
```bash
kind delete cluster --name prod1-cluster
```

**Verify deletion:**
```bash
kind get clusters
```

---

## Next Steps

1. **Implement API Services** — Start implementing business logic in `api/services/`
2. **Implement UI Components** — Build React views in `ui/components/`
3. **Test with Real Data** — Monitor your actual prod1-cluster by updating kubeconfig path
4. **Deploy to GCP** — When ready, deploy PulseOps to GKE and connect to real cluster

---

## Architecture Summary

```
Your Local Machine
├── Podman (Container Runtime)
│   └── Kind Cluster: prod1-cluster
│       ├── Control Plane Node
│       ├── Worker Node 1
│       └── Worker Node 2
│
└── PulseOps (Node.js)
    ├── KubernetesClient.js (auto-detects kubeconfig)
    ├── WorkloadService.js (queries K8s API)
    ├── CronjobService.js (queries K8s API)
    ├── DataflowService.js (queries K8s Jobs with label)
    └── Dashboard (displays all data)
```

**Zero code changes** when moving to production GKE — just update kubeconfig path!
