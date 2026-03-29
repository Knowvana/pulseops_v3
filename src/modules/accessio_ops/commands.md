# Accessio Operations Module - Commands

## Overview
Commands for setting up and managing the Accessio Operations module.

## Service Account & Token Setup

### 1. Create Service Account and Permissions
```bash
kubectl apply -f src/modules/accessio_ops/podman/accessio-service-account.yaml
```

### 2. Generate Permanent Token (Non-Expiring)

#### Option A: PowerShell Script (Recommended)
```powershell
# Enable script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

# Navigate to podman directory
cd src/modules/accessio_ops/podman

# Run the token generation script
.\generate-permanent-token.ps1
```

The script will:
- Create a permanent token secret
- Extract and display the token
- Copy the token to your clipboard
- Show the exact format for ClusterConfig.json

#### Option B: Manual Commands
```bash
# Create permanent token secret
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: accessio-service-permanent-token
  namespace: default
  annotations:
    kubernetes.io/service-account.name: accessio-service
type: kubernetes.io/service-account-token
EOF

# Get the token (base64 decoded)
kubectl get secret accessio-service-permanent-token -o jsonpath='{.data.token}' | base64 -d
```

#### Option C: Long-Duration Token
```bash
# Create token valid for 10 years
kubectl create token accessio-service --namespace=default --duration=87600h
```

### 3. Update Configuration
Copy the generated token and update `src/modules/accessio_ops/api/config/ClusterConfig.json`:

```json
{
  "connection": {
    "apiServerUrl": "https://127.0.0.1:64746",
    "serviceAccountToken": "YOUR_PERMANENT_TOKEN_HERE",
    "projectId": "local-dev",
    "region": "local",
    "clusterName": "prod1-cluster"
  }
}
```

### 4. Test Connection
Use the "Test Connection" button in the Accessio Operations → Cluster Configuration tab to verify the setup.

## Module Development

### Build Module
```bash
npm run build:module -- accessio_ops
```

### Hot Reload Module
```bash
# Reload module without restarting API server
curl -X POST http://localhost:4001/api/modules/accessio_ops/dev-reload
```

### View Logs
```bash
# View API server logs
tail -f logs/api.log

# View module-specific logs
grep "Accessio Operations" logs/api.log
```

## Troubleshooting

### Token Issues
- **401 Unauthorized**: Token expired → Generate new permanent token
- **Missing token**: Check ClusterConfig.json has serviceAccountToken field
- **Invalid token**: Verify token format and no extra spaces

### Connection Issues
- **API Server URL**: Ensure correct Kubernetes API endpoint
- **Cluster running**: Verify cluster is accessible with `kubectl cluster-info`
- **Permissions**: Service account needs cluster-reader permissions

### Module Loading Issues
- **404 on endpoints**: Module not loaded → Check module is enabled in Module Manager
- **Build errors**: Check syntax in API files and rebuild module
- **Import errors**: Verify relative imports in API files

## API Endpoints

### Cluster Management
- `GET /api/accessio_ops/clusters` - List all clusters
- `GET /api/accessio_ops/clusters/{id}` - Get specific cluster
- `POST /api/accessio_ops/cluster/test` - Test cluster connection
- `GET /api/accessio_ops/clusters/health` - Cluster health check

### Configuration
- `GET /api/accessio_ops/config/cluster` - Get cluster config
- `PUT /api/accessio_ops/config/cluster` - Update cluster config

## Local Development Setup

### Prerequisites
- Kubernetes cluster (local Kind or GKE)
- kubectl configured to connect to cluster
- Node.js and npm installed

### Quick Start
1. Apply service account: `kubectl apply -f src/modules/accessio_ops/podman/accessio-service-account.yaml`
2. Generate permanent token: `.\src\modules\accessio_ops\podman\generate-permanent-token.ps1`
3. Update ClusterConfig.json with generated token
4. Test connection in UI
5. Build module: `npm run build:module -- accessio_ops`
