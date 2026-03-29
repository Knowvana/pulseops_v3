# Podman Desktop Kubernetes Cluster Commands

| Order | Command | Purpose |
|-------|---------|---------|
| 1 | `cd C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman` | Navigate to the podman directory |
| 2 | `kind delete cluster --name prod1-cluster --ignore-not-found` | **DELETE** existing Kind cluster if exists |
| 3 | `kubectl delete serviceaccount accessio-service --ignore-not-found` | **DELETE** existing service account |
| 4 | `kubectl delete secret accessio-service-token --ignore-not-found` | **DELETE** existing service account token |
| 5 | `kubectl delete clusterrole accessio-cluster-reader --ignore-not-found` | **DELETE** existing cluster role |
| 6 | `kubectl delete clusterrolebinding accessio-cluster-reader-binding --ignore-not-found` | **DELETE** existing cluster role binding |
| 7 | `kind create cluster --config C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\kind-clusters.yaml --name prod1-cluster` | **CREATE** actual Kind cluster prod1-cluster |
| 8 | `kubectl config use-context kind-prod1-cluster` | Switch to prod1-cluster context |
| 9 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\accessio-service-account.yaml` | **CREATE** service account with permissions |
| 10 | `kubectl create token accessio-service` | **GET** service account token |
| 11 | `kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\cluster-workloads.yaml` | Deploy workloads to cluster |
| 12 | `kubectl get nodes --show-labels` | Show cluster nodes with labels |
| 13 | `kubectl get pods -A` | Show pods in cluster |
| 14 | `kubectl get services -A` | Show services in cluster |
| 15 | `kubectl cluster-info` | Get cluster information and API server URL |
| 16 | `curl -X POST http://localhost:4001/api/accessio_ops/cluster/test -H "Content-Type: application/json" -d "{\"apiServerUrl\": \"https://127.0.0.1:64308\", \"projectId\": \"local-dev\"}"` | **TEST** cluster connection via API |
| 17 | `curl -X GET http://localhost:4001/api/accessio_ops/clusters` | **TEST** get all clusters API |
| 18 | `curl -X GET http://localhost:4001/api/accessio_ops/clusters/prod1-cluster` | **TEST** get cluster by ID API |
| 19 | `curl -X GET http://localhost:4001/api/accessio_ops/clusters/health` | **TEST** cluster health API |
| 20 | `kind delete cluster --name prod1-cluster` | **DELETE** prod1-cluster (cleanup) |
| 21 | `kind delete clusters --all` | **DELETE ALL** Kind clusters (cleanup) |

## 🚀 Step-by-Step Workflow (Complete Setup Process)

### Step 1: Navigate to Directory (Order 1)
```bash
cd C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman
```

### Step 2: Clean Up Existing Resources (Orders 2-6)
```bash
# Delete existing Kind cluster
kind delete cluster --name prod1-cluster --ignore-not-found

# Delete existing service account and resources
kubectl delete serviceaccount accessio-service --ignore-not-found
kubectl delete secret accessio-service-token --ignore-not-found
kubectl delete clusterrole accessio-cluster-reader --ignore-not-found
kubectl delete clusterrolebinding accessio-cluster-reader-binding --ignore-not-found
```

### Step 3: Create Physical Kind Cluster (Order 7)
```bash
# Create prod1-cluster with full path
kind create cluster --config C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\kind-clusters.yaml --name prod1-cluster

# Verify cluster creation
kind get clusters
```

### Step 4: Switch to New Cluster Context (Order 8)
```bash
# Switch to prod1-cluster context
kubectl config use-context kind-prod1-cluster

# Verify context
kubectl config current-context
```

### Step 5: Create Service Account and Permissions (Order 9)
```bash
# Apply service account YAML with full path
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\accessio-service-account.yaml
```

### Step 6: Get Service Account Token (Order 10)
```bash
# Generate token for service account
kubectl create token accessio-service

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

### Step 8: Deploy Workloads to Cluster (Order 11)
```bash
# Deploy workloads with full path
kubectl apply -f C:\MyDevelopment\Knowvana\pulseops_v3\src\modules\accessio_ops\podman\cluster-workloads.yaml

# Verify deployment
kubectl get pods -A
kubectl get services -A
```

### Step 9: Verify Cluster Information (Orders 12-15)
```bash
# Get cluster details
kubectl get nodes --show-labels
kubectl get pods -A
kubectl get services -A
kubectl cluster-info
```

### Step 10: Test Accessio Operations API (Orders 16-19)
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

### Step 12: Cleanup (When Done - Orders 20-21)
```bash
# Delete the cluster
kind delete cluster --name prod1-cluster

# Or delete all Kind clusters
kind delete clusters --all
```

## 🎯 What This Creates:

### **Single Physical Cluster:**
- **prod1-cluster** - Separate Kubernetes cluster with 1 control plane + 2 workers
- **Different API server** - Separate from Podman Desktop
- **Different context** - Switch between Podman and Kind clusters
- **Independent resources** - Complete isolation

### **Service Account with Permissions:**
- **accessio-service** - Dedicated service account for API access
- **Cluster-wide read access** - Can view all resources cluster-wide
- **Safe permissions** - No write/delete permissions
- **JWT token** - For API authentication

### **GKE-like Experience:**
- **Physical cluster** like GKE with control plane + workers
- **Separate API endpoint** like GKE cluster endpoint
- **Context switching** like `gcloud container clusters get-credentials`
- **Node labels** for cluster identification

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
kind delete cluster --name prod1-cluster
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
