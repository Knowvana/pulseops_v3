# Podman Desktop Kubernetes Cluster Commands

| Order | Command | Purpose |
|-------|---------|---------|
| a | `cd C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman` | Navigate to the podman directory |
| b | `kind delete cluster --name prod1-cluster --ignore-not-found` | **DELETE** existing Kind cluster if exists |
| c | `kubectl delete serviceaccount accessio-service --ignore-not-found` | **DELETE** existing service account |
| d | `kubectl delete secret accessio-service-token --ignore-not-found` | **DELETE** existing service account token |
| e | `kubectl delete clusterrole accessio-cluster-reader --ignore-not-found` | **DELETE** existing cluster role |
| f | `kubectl delete clusterrolebinding accessio-cluster-reader-binding --ignore-not-found` | **DELETE** existing cluster role binding |
| g | `kubectl delete -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\00-metrics-server.yaml --ignore-not-found` | **DELETE** existing metrics-server deployment |
| 1 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\01-kind-clusters.yaml` | **CREATE** Kind cluster |
| 1.5 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\00-metrics-server.yaml` | **INSTALL** metrics-server for live resource usage |
| 1.6 | `kubectl top nodes` | **VERIFY** live node resource metrics |
| 1.7 | `kubectl top pods -A` | **VERIFY** live pod resource metrics |
| 1.8 | `kubectl get apiservices | grep metrics` | **VERIFY** metrics.k8s.io API is available |
| 1.9 | `kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes` | **TEST** raw metrics API for nodes |
| 1.10 | `kubectl get --raw /apis/metrics.k8s.io/v1beta1/pods` | **TEST** raw metrics API for pods |
| 1.11 | `kubectl describe pods -n kube-system -l k8s-app=metrics-server` | **CHECK** metrics-server pod status and logs |
| 2 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\02-namespaces.yaml` | **CREATE** namespaces (prod-iga, prod, mail) |
| 3 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\03-accessio-service-account.yaml` | **CREATE** service account with permissions |
| 4 | `./generate-permanent-token.ps1` | **GENERATE** permanent service account token |
| 5 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\06-deployments.yaml` | Deploy Deployment workloads |
| 6 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\07-statefulsets.yaml` | Deploy StatefulSet workloads |
| 7 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\08-cronjobs.yaml` | Deploy CronJob workloads |
| 8 | `kubectl get pods -n kube-system | findstr metrics` | **VERIFY** metrics-server is running |
| 9 | `kubectl get nodes --show-labels` | Show cluster nodes with labels |
| 10 | `kubectl get pods -A` | Show pods in cluster |
| 11 | `kubectl get services -A` | Show services in cluster |
| 12 | `kubectl cluster-info` | Get cluster information and API server URL |
| 13 | `curl -X POST http://localhost:4001/api/accessio_ops/cluster/test -H "Content-Type: application/json" -d "{\"apiServerUrl\": \"https://127.0.0.1:64308\", \"projectId\": \"local-dev\"}"` | **TEST** cluster connection via API |
| 14 | `curl -X GET http://localhost:4001/api/accessio_ops/clusters` | **TEST** get all clusters API |
| 15 | `curl -X GET http://localhost:4001/api/accessio_ops/clusters/prod1-cluster` | **TEST** get cluster by ID API |
| 16 | `curl -X GET http://localhost:4001/api/accessio_ops/clusters/health` | **TEST** cluster health API |
| 17 | `kind delete cluster --name prod1-cluster` | **DELETE** prod1-cluster (cleanup) |
| 18 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\99-cleanup-all.yaml` | **DELETE ALL** resources (cleanup) |

## 🚀 Step-by-Step Workflow (Complete Setup Process)

### Step 1: Navigate to Directory (Order a)
```bash
cd C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman
```

### Step 2: Clean Up Existing Resources (Orders b-g)
```bash
# Delete existing Kind cluster
kind delete cluster --name prod1-cluster --ignore-not-found

# Delete existing service account and resources
kubectl delete serviceaccount accessio-service --ignore-not-found
kubectl delete secret accessio-service-token --ignore-not-found
kubectl delete clusterrole accessio-cluster-reader --ignore-not-found
kubectl delete clusterrolebinding accessio-cluster-reader-binding --ignore-not-found

# Delete existing metrics-server deployment
kubectl delete -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\00-metrics-server.yaml --ignore-not-found
```

### Step 3: Create Physical Kind Cluster (Order 1)
```bash
# Create prod1-cluster with full path
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\01-kind-clusters.yaml

# Verify cluster creation
kind get clusters
kubectl config use-context kind-prod1-cluster
```

### Step 4: Install Metrics Server (Order 1.5)
```bash
# Install metrics-server for live resource monitoring
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\00-metrics-server.yaml

# Verify metrics-server is running
kubectl get pods -n kube-system | findstr metrics
```

### Step 5: Verify Metrics Server (Orders 1.6-1.11)
```bash
# Test live resource metrics
kubectl top nodes
kubectl top pods -A

# Verify metrics API is available
kubectl get apiservices | grep metrics

# Test raw metrics API endpoints
kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes
kubectl get --raw /apis/metrics.k8s.io/v1beta1/pods

# Check metrics-server pod status and logs
kubectl describe pods -n kube-system -l k8s-app=metrics-server
```

### Step 6: Create Namespaces (Order 2)
```bash
# Create namespaces with full path
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\02-namespaces.yaml

# Verify namespaces
kubectl get namespaces
```

### Step 7: Create Service Account and Permissions (Order 3)
```bash
# Apply service account YAML with full path
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\03-accessio-service-account.yaml
```

### Step 8: Generate Permanent Service Account Token (Order 4)
```bash
# Generate permanent token using PowerShell script
./generate-permanent-token.ps1

# Copy this token to ClusterConfig.json
```

### Step 9: Update Cluster Configuration
```bash
# Update the ClusterConfig.json file with:
# - API Server URL: https://127.0.0.1:64308
# - Service Account Token: (token from Step 6)
# - Project ID: local-dev
# - Cluster Name: prod1-cluster
```

### Step 10: Deploy Workloads to Cluster (Orders 5-7)
```bash
# Deploy Deployment workloads with full path
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\06-deployments.yaml

# Deploy StatefulSet workloads with full path
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\07-statefulsets.yaml

# Deploy CronJob workloads with full path
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\08-cronjobs.yaml

# Verify deployment
kubectl get pods -A
kubectl get services -A
kubectl get cronjobs -A
```

### Step 11: Verify Cluster Information (Orders 8-12)
```bash
# Get cluster details
kubectl get nodes --show-labels
kubectl get pods -A
kubectl get services -A
kubectl cluster-info
```

### Step 12: Test Accessio Operations API (Orders 13-16)
```bash
# Test cluster connection
curl -X POST http://localhost:4001/api/accessio_ops/cluster/test \
  -H "Content-Type: application/json" \
  -d '{"apiServerUrl": "https://127.0.0.1:64308", "projectId": "local-dev"}'

# Test cluster endpoints
curl -X GET http://localhost:4001/api/accessio_ops/clusters
curl -X GET http://localhost:4001/api/accessio_ops/clusters/prod1-cluster
curl -X GET http://localhost:4001/api/accessio_ops/clusters/health
```

### Step 13: Test in Swagger UI
```bash
# Open browser to test API endpoints
# http://localhost:4001/swagger-ui/
# Look for "Accessio Operations - Cluster" section
```

### Step 14: Cleanup (When Done - Orders 17-18)
```bash
# Delete the cluster
kind delete cluster --name prod1-cluster

# Delete metrics-server specifically
kubectl delete -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\00-metrics-server.yaml --ignore-not-found

# Or delete all resources with cleanup script
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\99-cleanup-all.yaml
```

## 🎯 What This Creates:

### **Single Physical Cluster:**
- **prod1-cluster** - Separate Kubernetes cluster with 1 control plane + 2 workers
- **Different API server** - Separate from Podman Desktop
- **Different context** - Switch between Podman and Kind contexts
- **Independent resources** - Complete isolation

### **Service Account with Permissions:**
- **accessio-service** - Dedicated service account for API access
- **Cluster-wide read access** - Can view all resources cluster-wide
- **Safe permissions** - No write/delete permissions
- **JWT token** - For API authentication

### **Workload Types Created:**

#### **Deployments (5 workloads)**
- **jas** - prod-iga namespace (nginx:alpine)
- **ig** - prod-iga namespace (nginx:alpine)
- **talend** - prod namespace (nginx:alpine)
- **iga-api** - prod-iga namespace (nginx:alpine)
- **jobserver** - prod namespace (nginx:alpine)

#### **StatefulSets (4 workloads)**
- **identityiq-ui** - prod-iga namespace (nginx:alpine)
- **identityiq-task** - prod-iga namespace (nginx:alpine)
- **openidm** - prod-iga namespace (nginx:alpine)
- **postfix-mta** - mail namespace (nginx:alpine)

#### **CronJobs (7 workloads)**
- **ad-link-write** - Daily (Success) - prod-iga namespace
- **cloudsql-backup** - Daily (Success) - prod namespace
- **elasticsearch-backup** - Hourly (Fails) - prod namespace
- **weekly-report-vdr** - Weekly (Success) - prod namespace
- **daily-report-ad-dqc** - Daily (Success) - prod-iga namespace
- **daily-report-vdr-dqc** - Daily (Failure) - prod namespace
- **bigtable-backup** - Daily (Failure) - prod namespace

### **GKE-like Experience:**
- **Physical cluster** like GKE with control plane + workers
- **Separate API endpoint** like GKE cluster endpoint
- **Context switching** like `gcloud container clusters get-credentials`
- **Node labels** for cluster identification

### **Where to See These in Podman Desktop:**

#### **Kubernetes Tab → Pods**
```
jas-7d8f9c-xyz1      Running    prod-iga
ig-4a2b3c-pqr2       Running    prod-iga  
talend-8e5f6g-stu3   Running    prod
iga-api-2h3j4k-vwx4  Running    prod-iga
jobserver-9k6l7m-yza5 Running    prod
identityiq-ui-0      Running    prod-iga
identityiq-task-0    Running    prod-iga
openidm-0            Running    prod-iga
postfix-mta-0        Running    mail
```

#### **Kubernetes Tab → Deployments**
```
jas         1/1 replicas    prod-iga
ig          1/1 replicas    prod-iga
talend      1/1 replicas    prod
iga-api     1/1 replicas    prod-iga
jobserver   1/1 replicas    prod
```

#### **Kubernetes Tab → StatefulSets**
```
identityiq-ui    1/1 ready    prod-iga
identityiq-task  1/1 ready    prod-iga  
openidm          1/1 ready    prod-iga
postfix-mta      1/1 ready    mail
```

#### **Kubernetes Tab → CronJobs**
```
ad-link-write          Daily    prod-iga
cloudsql-backup        Daily    prod
elasticsearch-backup   Hourly   prod
weekly-report-vdr      Weekly   prod
daily-report-ad-dqc    Daily    prod-iga
daily-report-vdr-dqc   Daily    prod
bigtable-backup         Daily    prod
```

### **Key Differences:**
- **Deployments**: Auto-restart pods, can scale multiple replicas
- **StatefulSets**: Stable pod names (identityiq-ui-0), ordered deployment
- **CronJobs**: Time-based job scheduling with success/failure simulation
- **All run inside** Kind cluster, managed by Podman Desktop

### **Cluster Architecture:**
```
Kind Cluster: prod1-cluster
├─ Control Plane Node (management)
├─ Worker Node 1 (workloads)
└─ Worker Node 2 (workloads)
```

## 🔍 Test with Accessio Operations:

Once cluster is created, you can test:

1. **Get API Server URL**: `kubectl cluster-info` (will show Kind cluster endpoint)
2. **Switch context**: `kubectl config use-context kind-prod1-cluster`
3. **Test endpoints**: Configure Accessio with Kind cluster's API server
4. **Physical cluster**: Accessio will see it as a real cluster like GKE

## ⚠️ **Important Notes:**

- **Requires Kind**: `kind install` if not already installed
- **Resource usage**: Single cluster uses moderate resources
- **Port mappings**: Cluster uses host ports 30001-30003
- **Context management**: Switch between Podman and Kind contexts
- **Order matters**: Follow commands in numerical order for best results
- **Token expiration**: Service account tokens expire, regenerate if needed

## 🗑️ **Complete Cleanup Command:**
```bash
# Full cleanup - remove everything
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\99-cleanup-all.yaml
```

## � **Metrics Server Troubleshooting:**

### If `kubectl top pods` returns "error: Metrics API not available":
```bash
# Check if metrics-server is running
kubectl get pods -n kube-system | findstr metrics

# Check metrics-server logs for errors
kubectl logs -n kube-system -l k8s-app=metrics-server

# Verify API service is registered
kubectl get apiservices | grep metrics

# Restart metrics-server
kubectl delete pods -n kube-system -l k8s-app=metrics-server

# Reinstall metrics-server
kubectl delete -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\00-metrics-server.yaml --ignore-not-found
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\00-metrics-server.yaml
```

### Common Metrics Server Issues:
1. **"Metrics API not available"** - Wait 2-3 minutes after installation
2. **"no metrics known for pod"** - Pod is still starting or has no containers
3. **"server is currently unable to handle"** - metrics-server needs more time
4. **"connection refused"** - Check if metrics-server pod is running

### Expected `kubectl top pods -A` Output:
```
NAMESPACE     NAME                                      CPU(cores)   MEMORY(bytes)
kube-system   coredns-7d764666f9-9998f                4m           13Mi
kube-system   coredns-7d764666f9-vxp9t                5m           14Mi
kube-system   etcd-prod1-cluster-control-plane        56m          46Mi
kube-system   kindnet-27fgz                           1m           12Mi
kube-system   kube-apiserver-prod1-cluster-control-plane 95m        232Mi
kube-system   kube-controller-manager-prod1-cluster-control-plane 45m 52Mi
kube-system   kube-proxy-hpccc                        1m           17Mi
kube-system   kube-scheduler-prod1-cluster-control-plane 16m        25Mi
kube-system   metrics-server-6bc6c6dfd-j9x6t         5m           16Mi
local-path-storage local-path-provisioner-67b8995b4b-fxs96 1m           8Mi
prod          jobserver-7668d4c5ff-p6rmg              1m           11Mi
prod          talend-7ccdb9f567-4k8kw                1m           11Mi
prod-iga      ig-959c86887-nkt7v                      1m           11Mi
prod-iga      iga-api-6f76657ccf-wm7xd                1m           11Mi
prod-iga      jas-ff8cd646c-92bfq                    1m           13Mi
```

## �🔄 **If Something Goes Wrong:**
```bash
# Start over from Step 2 (cleanup)
kubectl delete serviceaccount accessio-service --ignore-not-found
kubectl delete secret accessio-service-token --ignore-not-found
kubectl delete clusterrole accessio-cluster-reader --ignore-not-found
kubectl delete clusterrolebinding accessio-cluster-reader-binding --ignore-not-found
kind delete cluster --name prod1-cluster --ignore-not-found

# Then continue from Step 3
```
