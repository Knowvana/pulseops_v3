# Production GCP GKE Setup — Connection Requirements

## Overview

To connect PulseOps to a **Production GCP GKE cluster**, you need to configure the module with standard Kubernetes connection parameters. The unified cluster configuration handles authentication automatically via environment detection.

---

## Required Information

### 1. GCP Project Details

| Parameter | Description | Example | Required |
|-----------|-------------|---------|----------|
| **GCP Project ID** | Your GCP project identifier | `my-gcp-project-123456` | Optional (for reference) |
| **GCP Region** | GKE cluster region | `us-central1` | Optional (for reference) |
| **Cluster Name** | GKE cluster name | `prod-gke-cluster` | Optional (for reference) |

### 2. Kubernetes Cluster Details

| Parameter | Description | How to Find | Required |
|-----------|-------------|-------------|----------|
| **Cluster API Server** | K8s API endpoint | `gcloud container clusters describe <cluster-name> --zone <zone>` | Auto-detected |
| **Service Account** | K8s service account for PulseOps | Created during deployment | Auto-injected |
| **Namespace** | K8s namespace for PulseOps | Default: `default` | Auto-detected |

### 3. Authentication (Auto-Detected)

**In Production GKE:**
- PulseOps runs as a **pod inside the cluster**
- Kubernetes **auto-injects** a service account token
- Token location: `/var/run/secrets/kubernetes.io/serviceaccount/token`
- Environment variable: `KUBERNETES_SERVICE_HOST` (auto-set by K8s)

**No manual credentials needed** — K8s handles everything!

---

## Step-by-Step Setup

### Step 1: Create GKE Cluster (if not exists)

```bash
# Set your GCP project
export PROJECT_ID="my-gcp-project-123456"
export CLUSTER_NAME="prod-gke-cluster"
export REGION="us-central1"
export ZONE="us-central1-a"

gcloud config set project $PROJECT_ID

# Create GKE cluster
gcloud container clusters create $CLUSTER_NAME \
  --region $REGION \
  --num-nodes 3 \
  --machine-type n1-standard-2 \
  --enable-stackdriver-kubernetes \
  --addons HorizontalPodAutoscaling,HttpLoadBalancing,GcePersistentDiskCsiDriver
```

### Step 2: Create Service Account for PulseOps

```bash
# Create namespace
kubectl create namespace pulseops

# Create service account
kubectl create serviceaccount pulseops-sa -n pulseops

# Create cluster role binding (admin access for monitoring)
kubectl create clusterrolebinding pulseops-admin \
  --clusterrole=cluster-admin \
  --serviceaccount=pulseops:pulseops-sa
```

### Step 3: Deploy PulseOps to GKE

```bash
# Create deployment manifest
cat > pulseops-deployment.yaml <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pulseops
  namespace: pulseops
spec:
  replicas: 2
  selector:
    matchLabels:
      app: pulseops
  template:
    metadata:
      labels:
        app: pulseops
    spec:
      serviceAccountName: pulseops-sa
      containers:
      - name: pulseops
        image: pulseops:latest  # Use your image
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_HOST
          value: "your-postgres-host"
        - name: DATABASE_PORT
          value: "5432"
        - name: DATABASE_NAME
          value: "pulseops"
        - name: DATABASE_USER
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: username
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: pulseops-service
  namespace: pulseops
spec:
  type: LoadBalancer
  selector:
    app: pulseops
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
EOF

# Deploy
kubectl apply -f pulseops-deployment.yaml
```

### Step 4: Verify Deployment

```bash
# Check pod status
kubectl get pods -n pulseops

# Check service
kubectl get svc -n pulseops

# View logs
kubectl logs -n pulseops deployment/pulseops
```

---

## Configuration in PulseOps UI

Once PulseOps is running in GKE:

### Settings → Cluster Configuration

| Field | Value | Notes |
|-------|-------|-------|
| **Auth Mode** | Auto-detect | Will auto-detect in-cluster |
| **Kubeconfig Path** | (ignored) | Not used in production |
| **GCP Project ID** | `my-gcp-project-123456` | Optional, for reference |
| **GCP Region** | `us-central1` | Optional, for reference |
| **Cluster Name** | `prod-gke-cluster` | Optional, for reference |

### Test Connection

1. Go to **Settings → Cluster Configuration**
2. Click **Test Connection**
3. Should show: ✓ Connected
4. Displays: Cluster name, version, node count
5. Click **Save Configuration**

---

## API Access

Once connected, PulseOps can access:

### Kubernetes APIs

| API | Purpose | Example |
|-----|---------|---------|
| **Core API** | Pods, services, namespaces | `GET /api/v1/namespaces` |
| **Apps API** | Deployments, StatefulSets | `GET /apis/apps/v1/deployments` |
| **Batch API** | Jobs, CronJobs | `GET /apis/batch/v1/jobs` |

### PulseOps Module APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/google_gke/workloads` | GET | List all workloads |
| `/api/google_gke/cronjobs` | GET | List CronJobs |
| `/api/google_gke/dataflow/jobs` | GET | List Dataflow jobs |
| `/api/google_gke/pubsub/topics` | GET | List Pub/Sub topics |
| `/api/google_gke/dashboard` | GET | Dashboard summary |

---

## What PulseOps Can Monitor

With the unified configuration, PulseOps can monitor:

### Workloads
- **Deployments** — Web servers, APIs, services
- **StatefulSets** — Databases, caches, stateful apps
- **DaemonSets** — Logging agents, monitoring daemons
- **Pods** — Individual pod status, logs, events

### Jobs & Scheduling
- **CronJobs** — Scheduled tasks, execution history
- **Jobs** — Batch jobs, completion status
- **Dataflow Jobs** — Data pipeline status (via GCP API)

### Infrastructure
- **Nodes** — Node status, capacity, resource usage
- **Namespaces** — Namespace organization
- **Services** — Service endpoints, load balancers
- **Events** — Cluster events, warnings, errors

### GCP Services (Optional)
- **Pub/Sub** — Topics, subscriptions, message flow
- **Cloud Logging** — Application logs
- **Cloud Monitoring** — Metrics and alerts

---

## Permissions Required

The service account needs these permissions:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: pulseops-monitoring
rules:
# Core API
- apiGroups: [""]
  resources: ["pods", "services", "namespaces", "events", "configmaps"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods/log"]
  verbs: ["get"]

# Apps API
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "daemonsets", "replicasets"]
  verbs: ["get", "list", "watch"]

# Batch API
- apiGroups: ["batch"]
  resources: ["jobs", "cronjobs"]
  verbs: ["get", "list", "watch"]

# Nodes
- apiGroups: [""]
  resources: ["nodes"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: pulseops-monitoring
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: pulseops-monitoring
subjects:
- kind: ServiceAccount
  name: pulseops-sa
  namespace: pulseops
```

---

## Troubleshooting

### Connection Test Fails

**Problem:** "Failed to connect to cluster"

**Solutions:**
1. Verify pod is running: `kubectl get pods -n pulseops`
2. Check logs: `kubectl logs -n pulseops deployment/pulseops`
3. Verify service account: `kubectl get sa -n pulseops`
4. Verify RBAC: `kubectl get clusterrolebinding | grep pulseops`

### Can't List Workloads

**Problem:** "Permission denied" errors

**Solutions:**
1. Verify service account permissions: `kubectl auth can-i list deployments --as=system:serviceaccount:pulseops:pulseops-sa`
2. Apply correct RBAC rules (see above)
3. Restart pod: `kubectl rollout restart deployment/pulseops -n pulseops`

### Cluster Info Not Showing

**Problem:** Test connection succeeds but no cluster info displayed

**Solutions:**
1. Verify API access: `kubectl api-resources`
2. Check pod logs for errors
3. Verify kubeconfig is not being used (should be auto-detected)

---

## Environment Variables (Auto-Set by K8s)

When running in GKE, Kubernetes automatically sets:

```bash
KUBERNETES_SERVICE_HOST=10.0.0.1
KUBERNETES_SERVICE_PORT=443
KUBERNETES_SERVICE_PORT_HTTPS=443
```

These are detected by KubernetesClient.js to enable in-cluster authentication.

---

## Security Best Practices

1. **Use Workload Identity** (recommended for GCP):
   ```bash
   gcloud iam service-accounts create pulseops-gcp-sa
   gcloud iam service-accounts add-iam-policy-binding pulseops-gcp-sa@$PROJECT_ID.iam.gserviceaccount.com \
     --role roles/iam.workloadIdentityUser \
     --member "serviceAccount:$PROJECT_ID.svc.id.goog[pulseops/pulseops-sa]"
   ```

2. **Use Network Policies** to restrict traffic:
   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata:
     name: pulseops-network-policy
     namespace: pulseops
   spec:
     podSelector:
       matchLabels:
         app: pulseops
     policyTypes:
     - Ingress
     - Egress
     ingress:
     - from:
       - namespaceSelector:
           matchLabels:
             name: pulseops
     egress:
     - to:
       - namespaceSelector: {}
   ```

3. **Encrypt Secrets** in etcd:
   ```bash
   gcloud container clusters update $CLUSTER_NAME \
     --database-encryption-key projects/$PROJECT_ID/locations/$REGION/keyRings/gke-secrets/cryptoKeys/key-1 \
     --region $REGION
   ```

---

## Monitoring & Logging

### View PulseOps Logs

```bash
# Real-time logs
kubectl logs -f -n pulseops deployment/pulseops

# Last 100 lines
kubectl logs -n pulseops deployment/pulseops --tail=100

# Previous pod logs (if crashed)
kubectl logs -n pulseops deployment/pulseops --previous
```

### GCP Cloud Logging

```bash
# View logs in Cloud Logging
gcloud logging read "resource.type=k8s_container AND resource.labels.namespace_name=pulseops" \
  --limit 50 \
  --format json
```

### Metrics

```bash
# View resource usage
kubectl top pods -n pulseops

# View node usage
kubectl top nodes
```

---

## Summary

**To connect to Production GKE:**

1. ✅ Deploy PulseOps pod to GKE cluster
2. ✅ Create service account with RBAC permissions
3. ✅ K8s auto-injects service account token
4. ✅ KubernetesClient.js auto-detects in-cluster mode
5. ✅ Configure cluster in UI (optional parameters only)
6. ✅ Test connection → Should succeed
7. ✅ Start monitoring workloads, jobs, services

**No manual credentials needed** — Kubernetes handles everything!

