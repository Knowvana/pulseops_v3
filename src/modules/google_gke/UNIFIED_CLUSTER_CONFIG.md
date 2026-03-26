# Unified Cluster Configuration — Local & Production

## Overview

The Google GKE module now uses a **unified cluster configuration** that works identically for both **production GKE** and **local development (Kind/Podman)**. The same UI, same configuration file, and same code path handle both environments automatically via environment detection.

**Key Principle:** SAME UI, SAME CONFIG, ZERO CODE CHANGES

---

## Architecture

### Configuration File: `ClusterConfig.json`

Location: `src/modules/google_gke/api/config/ClusterConfig.json`

Stores only standard Kubernetes connection parameters (no environment-specific credentials):

```json
{
  "connection": {
    "authMode": "auto",
    "kubeconfigPath": "~/.kube/config",
    "gcpProjectId": "",
    "gcpRegion": "",
    "clusterName": ""
  },
  "connectionStatus": {
    "isConfigured": false,
    "testStatus": null,
    "lastTested": null,
    "clusterInfo": {
      "name": null,
      "version": null,
      "nodeCount": 0
    }
  }
}
```

### How Auto-Detection Works

**KubernetesClient.js** (`src/modules/google_gke/api/lib/KubernetesClient.js`) implements auto-detection:

```
┌─────────────────────────────────────────────────────────────┐
│ initializeClient()                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Check: Is KUBERNETES_SERVICE_HOST env var set?        │
│     ├─ YES → In-cluster mode (Production GKE)             │
│     │        Use service account token                     │
│     │        ✓ kc.loadFromCluster()                        │
│     │                                                       │
│     └─ NO → Local development mode                         │
│            Try to load kubeconfig file                     │
│            ✓ kc.loadFromDefault()                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Result:** Same code, different authentication method per environment.

---

## Local Development (Kind + Podman)

### Setup

```bash
cd src/modules/google_gke/local-dev
chmod +x setup-local-gke.sh
./setup-local-gke.sh
```

### How It Works

1. **Kind creates kubeconfig** at `~/.kube/config`
2. **KubernetesClient.js detects:** NOT in-cluster (no KUBERNETES_SERVICE_HOST)
3. **Falls back to kubeconfig:** Reads `~/.kube/config`
4. **Connects to local Kind cluster** via kubeconfig auth

### Configuration in UI

**Settings → Cluster Configuration:**
- **Auth Mode:** Auto-detect (recommended)
- **Kubeconfig Path:** `~/.kube/config` (default)
- **GCP Project ID:** (optional, for reference)
- **GCP Region:** (optional, for reference)
- **Cluster Name:** (optional, for reference)

**Test Connection:** Click to verify connectivity to local cluster

---

## Production GKE

### How It Works

1. **PulseOps runs as a pod** inside the GKE cluster
2. **Kubernetes auto-injects** service account token at `/var/run/secrets/kubernetes.io/serviceaccount/token`
3. **KubernetesClient.js detects:** IN-CLUSTER (KUBERNETES_SERVICE_HOST env var present)
4. **Uses service account token:** Authenticates with K8s API
5. **Connects to GKE cluster** via in-cluster auth

### Configuration in UI

**Settings → Cluster Configuration:**
- **Auth Mode:** Auto-detect (recommended) — will auto-detect in-cluster
- **Kubeconfig Path:** (ignored in production, auto-detected)
- **GCP Project ID:** (optional, for reference)
- **GCP Region:** (optional, for reference)
- **Cluster Name:** (optional, for reference)

**Test Connection:** Click to verify connectivity to GKE cluster

---

## Configuration UI (ClusterConfigTab.jsx)

Location: `src/modules/google_gke/ui/components/settings/ClusterConfigTab.jsx`

### Features

- **Connection Status Display:** Shows current connection state (Connected/Disconnected/Not Tested)
- **Cluster Info Display:** Shows cluster name, version, node count (after successful test)
- **Auth Mode Selection:** Radio buttons for authentication mode
- **Standard Parameters:** Kubeconfig path, GCP Project ID, GCP Region, Cluster Name
- **Test Connection Button:** Verifies connectivity to the cluster
- **Save Configuration Button:** Persists settings to ClusterConfig.json

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/google_gke/config/cluster` | Load current cluster config |
| PUT | `/api/google_gke/config/cluster` | Save cluster config |
| POST | `/api/google_gke/config/cluster/test` | Test cluster connectivity |

---

## Backend Implementation

### configRoutes.js

Location: `src/modules/google_gke/api/routes/configRoutes.js`

**GET /config/cluster:**
- Loads cluster config from ClusterConfig.json
- Returns config with connection status

**PUT /config/cluster:**
- Saves cluster config to ClusterConfig.json
- Saves poller and alert configs to database

**POST /config/cluster/test:**
- Calls `testConnection()` from KubernetesClient.js
- Updates connection status and cluster info
- Returns test result to UI

### KubernetesClient.js

Location: `src/modules/google_gke/api/lib/KubernetesClient.js`

**Key Functions:**

- `initializeClient()` — Auto-detects environment and initializes K8s client
- `getK8sClient()` — Returns cached KubeConfig instance
- `getK8sCoreApi()` — Returns CoreV1Api for pods, services, namespaces
- `getK8sAppsApi()` — Returns AppsV1Api for deployments, statefulsets
- `getK8sBatchApi()` — Returns BatchV1Api for jobs, cronjobs
- `testConnection()` — Tests cluster connectivity by listing namespaces
- `resetClient()` — Clears cached client (called when config changes)

### helpers.js

Location: `src/modules/google_gke/api/routes/helpers.js`

**Cluster Config Functions:**

- `loadClusterConfigFile()` — Loads ClusterConfig.json with defaults
- `saveClusterConfigFile(config)` — Saves config to ClusterConfig.json

---

## Environment Comparison

| Aspect | Local (Kind + Podman) | Production (GCP GKE) |
|--------|----------------------|---------------------|
| **Cluster** | Kind cluster (local) | GCP GKE cluster |
| **Authentication** | kubeconfig file | Service account token |
| **Auto-Detection** | Detects: NOT in-cluster | Detects: IN-CLUSTER |
| **Kubeconfig** | `~/.kube/config` | N/A (uses mounted token) |
| **Service Account** | N/A | Auto-injected by K8s |
| **K8s API Calls** | Same | Same |
| **Configuration UI** | Same | Same |
| **Code Changes** | ZERO | ZERO |

---

## Testing the Configuration

### Local Development

1. **Start local cluster:**
   ```bash
   cd src/modules/google_gke/local-dev
   ./setup-local-gke.sh
   ```

2. **Start PulseOps:**
   ```bash
   npm run dev
   ```

3. **Configure cluster:**
   - Go to **Settings → Cluster Configuration**
   - Auth Mode: Auto-detect
   - Kubeconfig Path: `~/.kube/config`
   - Click **Test Connection**
   - Should show: ✓ Connected, cluster name, version, node count

4. **Load default data:**
   - Go to **Settings → Data Management**
   - Click **Load Default Data**

5. **Enable poller:**
   - Go to **Settings → Poller Configuration**
   - Enable: Background Poller
   - Click **Save Poller Config**

6. **View dashboard:**
   - Go to **Dashboard**
   - Should show all workloads, cronjobs, etc.

### Production GKE

1. **Deploy PulseOps to GKE:**
   ```bash
   kubectl apply -f pulseops-deployment.yaml
   ```

2. **PulseOps pod starts:**
   - K8s auto-injects service account token
   - KUBERNETES_SERVICE_HOST env var is set

3. **Configure cluster (same UI):**
   - Go to **Settings → Cluster Configuration**
   - Auth Mode: Auto-detect (will auto-detect in-cluster)
   - Click **Test Connection**
   - Should show: ✓ Connected, cluster name, version, node count

4. **Rest is identical to local development**

---

## Key Benefits

✅ **Same UI for local and production** — No separate configuration pages

✅ **Same configuration file** — ClusterConfig.json works in both environments

✅ **Zero code changes** — Same KubernetesClient.js code handles both

✅ **Automatic environment detection** — No manual switching needed

✅ **Standard parameters only** — No environment-specific credentials in config

✅ **Easy to test** — Local development mirrors production exactly

---

## Files Modified

| File | Changes |
|------|---------|
| `src/modules/google_gke/api/config/ClusterConfig.json` | Created — unified config structure |
| `src/modules/google_gke/api/lib/KubernetesClient.js` | Implemented auto-detection and K8s client initialization |
| `src/modules/google_gke/api/routes/configRoutes.js` | Updated to work with unified config |
| `src/modules/google_gke/api/routes/helpers.js` | Simplified cluster config file I/O |
| `src/modules/google_gke/ui/components/settings/ClusterConfigTab.jsx` | Implemented unified UI component |
| `src/modules/google_gke/local-dev/README.md` | Updated with unified config documentation |
| `src/modules/google_gke/local-dev/setup-local-gke.sh` | Updated setup instructions |

---

## Next Steps

1. **Install K8s client dependency:**
   ```bash
   npm install @kubernetes/client-node
   ```

2. **Test locally:**
   - Run setup script
   - Configure cluster in UI
   - Verify connection test works

3. **Deploy to production:**
   - Same configuration works in GKE
   - Just deploy PulseOps pod to cluster
   - Auto-detection handles authentication

