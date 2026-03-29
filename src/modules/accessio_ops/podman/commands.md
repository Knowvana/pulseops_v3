# Podman Desktop Kubernetes Cluster Commands

| Order | Command | Purpose |
|-------|---------|---------|
| a | `cd C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman` | Navigate to the podman directory |
| b | `kind delete cluster --name prod1-cluster --ignore-not-found` | **DELETE** existing Kind cluster if exists |
| c | `kubectl delete serviceaccount accessio-service --ignore-not-found` | **DELETE** existing service account |
| d | `kubectl delete secret accessio-service-token --ignore-not-found` | **DELETE** existing service account token |
| e | `kubectl delete clusterrole accessio-cluster-reader --ignore-not-found` | **DELETE** existing cluster role |
| f | `kubectl delete clusterrolebinding accessio-cluster-reader-binding --ignore-not-found` | **DELETE** existing cluster role binding |
| 1 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\01-kind-clusters.yaml` | **CREATE** Kind cluster |
| 2 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\02-namespaces.yaml` | **CREATE** namespaces (prod-iga, prod, mail) |
| 3 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\03-accessio-service-account.yaml` | **CREATE** service account with permissions |
| 4 | `./generate-permanent-token.ps1` | **GENERATE** permanent service account token |
| 5 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\06-deployments.yaml` | Deploy Deployment workloads |
| 6 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\07-statefulsets.yaml` | Deploy StatefulSet workloads |
| 7 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\08-cronjobs.yaml` | Deploy CronJob workloads |
| 8 | `kubectl get nodes --show-labels` | Show cluster nodes with labels |
| 9 | `kubectl get pods -A` | Show pods in cluster |
| 10 | `kubectl get services -A` | Show services in cluster |
| 11 | `kubectl cluster-info` | Get cluster information and API server URL |
| 12 | `curl -X POST http://localhost:4001/api/accessio_ops/cluster/test -H "Content-Type: application/json" -d "{\"apiServerUrl\": \"https://127.0.0.1:64308\", \"projectId\": \"local-dev\"}"` | **TEST** cluster connection via API |
| 13 | `curl -X GET http://localhost:4001/api/accessio_ops/clusters` | **TEST** get all clusters API |
| 14 | `curl -X GET http://localhost:4001/api/accessio_ops/clusters/prod1-cluster` | **TEST** get cluster by ID API |
| 15 | `curl -X GET http://localhost:4001/api/accessio_ops/clusters/health` | **TEST** cluster health API |
| 16 | `kind delete cluster --name prod1-cluster` | **DELETE** prod1-cluster (cleanup) |
| 17 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\99-cleanup-all.yaml` | **DELETE ALL** resources (cleanup) |

## 🚀 Step-by-Step Workflow (Complete Setup Process)

### Step 1: Navigate to Directory (Order a)
```bash
cd C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman
```

### Step 2: Clean Up Existing Resources (Orders b-f)
```bash
# Delete existing Kind cluster
kind delete cluster --name prod1-cluster --ignore-not-found

# Delete existing service account and resources
kubectl delete serviceaccount accessio-service --ignore-not-found
kubectl delete secret accessio-service-token --ignore-not-found
kubectl delete clusterrole accessio-cluster-reader --ignore-not-found
kubectl delete clusterrolebinding accessio-cluster-reader-binding --ignore-not-found
```

### Step 3: Create Physical Kind Cluster (Order 1)
```bash
# Create prod1-cluster with full path
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\01-kind-clusters.yaml

# Verify cluster creation
kind get clusters
kubectl config use-context kind-prod1-cluster
```

### Step 4: Create Namespaces (Order 2)
```bash
# Create namespaces with full path
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\02-namespaces.yaml

# Verify namespaces
kubectl get namespaces
```

### Step 5: Create Service Account and Permissions (Order 3)
```bash
# Apply service account YAML with full path
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\03-accessio-service-account.yaml
```

### Step 6: Generate Permanent Service Account Token (Order 4)
```bash
# Generate permanent token using PowerShell script
./generate-permanent-token.ps1

# Copy this token to ClusterConfig.json
```

### Step 7: Update Cluster Configuration
```bash
# Update the ClusterConfig.json file with:
# - API Server URL: https://127.0.0.1:64308
# - Service Account Token: (token from Step 6)
# - Project ID: local-dev
# - Cluster Name: prod1-cluster
```

### Step 8: Deploy Workloads to Cluster (Orders 5-7)
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

### Step 9: Verify Cluster Information (Orders 8-11)
```bash
# Get cluster details
kubectl get nodes --show-labels
kubectl get pods -A
kubectl get services -A
kubectl cluster-info
```

### Step 10: Test Accessio Operations API (Orders 12-15)
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

### Step 11: Test in Swagger UI
```bash
# Open browser to test API endpoints
# http://localhost:4001/swagger-ui/
# Look for "Accessio Operations - Cluster" section
```

### Step 12: Cleanup (When Done - Orders 16-17)
```bash
# Delete the cluster
kind delete cluster --name prod1-cluster

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

## 🔄 **If Something Goes Wrong:**
```bash
# Start over from Step 2 (cleanup)
kubectl delete serviceaccount accessio-service --ignore-not-found
kubectl delete secret accessio-service-token --ignore-not-found
kubectl delete clusterrole accessio-cluster-reader --ignore-not-found
kubectl delete clusterrolebinding accessio-cluster-reader-binding --ignore-not-found
kind delete cluster --name prod1-cluster --ignore-not-found

# Then continue from Step 3
```
