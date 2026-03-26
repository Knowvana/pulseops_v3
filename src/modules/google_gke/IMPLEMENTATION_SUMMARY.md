# Unified Cluster Configuration — Implementation Summary

## Objective

Implement a unified cluster configuration system that works identically for both production GKE and local development (Kind/Podman). The same UI, configuration file, and code handle both environments automatically via environment auto-detection.

**Result:** SAME UI, SAME CONFIG, ZERO CODE CHANGES between environments.

---

## Changes Made

### 1. ClusterConfig.json (NEW)

**File:** `src/modules/google_gke/api/config/ClusterConfig.json`

**Purpose:** Unified configuration file storing only standard Kubernetes connection parameters.

**Structure:**
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

**Key Points:**
- Stores only standard parameters (no environment-specific credentials)
- Works for both local and production via auto-detection
- Single configuration file, not multiple cluster configs

---

### 2. KubernetesClient.js (UPDATED)

**File:** `src/modules/google_gke/api/lib/KubernetesClient.js`

**Changes:**
- Implemented `initializeClient()` with auto-detection logic
- Implemented `getK8sClient()`, `getK8sCoreApi()`, `getK8sAppsApi()`, `getK8sBatchApi()`
- Implemented `testConnection()` to verify cluster connectivity
- Implemented `resetClient()` to clear cached client

**Auto-Detection Logic:**
```
1. Check if KUBERNETES_SERVICE_HOST env var is set
   ├─ YES → In-cluster mode (Production GKE)
   │        Use: kc.loadFromCluster() (service account token)
   │
   └─ NO → Local development mode
            Use: kc.loadFromDefault() (kubeconfig file)
```

**Key Functions:**
- `initializeClient()` — Auto-detects environment and creates KubeConfig
- `getK8sClient()` — Returns cached KubeConfig instance (singleton)
- `getK8sCoreApi()` — Returns CoreV1Api for pods, services, namespaces
- `getK8sAppsApi()` — Returns AppsV1Api for deployments, statefulsets
- `getK8sBatchApi()` — Returns BatchV1Api for jobs, cronjobs
- `testConnection()` — Tests connectivity by listing namespaces
- `resetClient()` — Clears cache when config changes

---

### 3. configRoutes.js (UPDATED)

**File:** `src/modules/google_gke/api/routes/configRoutes.js`

**Changes:**
- Simplified `GET /config` endpoint to load unified config
- Simplified `PUT /config` endpoint to save unified config
- Updated `POST /config/test` endpoint to use `testConnection()` from KubernetesClient
- Removed multi-cluster complexity
- Removed credential encryption/decryption logic

**Endpoints:**
- `GET /api/google_gke/config/cluster` — Load config
- `PUT /api/google_gke/config/cluster` — Save config
- `POST /api/google_gke/config/cluster/test` — Test connection

---

### 4. helpers.js (UPDATED)

**File:** `src/modules/google_gke/api/routes/helpers.js`

**Changes:**
- Simplified `loadClusterConfigFile()` to load unified config with defaults
- Simplified `saveClusterConfigFile()` to save without encryption
- Removed multi-cluster support
- Removed `getDecryptedClusterConfig()` function
- Updated `CLUSTER_CONFIG_FILE_DEFAULTS` to match unified structure

**Key Functions:**
- `loadClusterConfigFile()` — Loads ClusterConfig.json with defaults
- `saveClusterConfigFile(config)` — Saves config to ClusterConfig.json

---

### 5. ClusterConfigTab.jsx (IMPLEMENTED)

**File:** `src/modules/google_gke/ui/components/settings/ClusterConfigTab.jsx`

**Purpose:** Unified UI for configuring cluster connection (works for both local and production).

**Features:**
- **Connection Status Display:** Shows current status (Connected/Disconnected/Not Tested)
- **Cluster Info Display:** Shows cluster name, version, node count
- **Auth Mode Selection:** Radio buttons for authentication mode selection
- **Standard Parameters:** Input fields for kubeconfig path, GCP project ID, region, cluster name
- **Test Connection Button:** Verifies connectivity to cluster
- **Save Configuration Button:** Persists settings

**State Management:**
- `config` — Current cluster configuration
- `testResult` — Result of last connection test
- `loading` — Loading state for initial config fetch
- `saving` — Saving state
- `testing` — Testing state
- `error` — Error messages

**API Calls:**
- `GET /api/google_gke/config/cluster` — Load config on mount
- `POST /api/google_gke/config/cluster/test` — Test connection
- `PUT /api/google_gke/config/cluster` — Save configuration

---

### 6. Local Dev Documentation (UPDATED)

**Files:**
- `src/modules/google_gke/local-dev/README.md`
- `src/modules/google_gke/local-dev/setup-local-gke.sh`

**Changes:**
- Added "Unified Cluster Configuration" section explaining how it works
- Updated setup instructions to mention unified config
- Added UI configuration steps for both local and production
- Added environment mapping table
- Updated setup script output with unified config instructions

**Key Points:**
- Same UI for both local and production
- Auto-detection handles authentication automatically
- Local: Uses kubeconfig (~/.kube/config)
- Production: Uses in-cluster service account token

---

## How It Works

### Local Development (Kind + Podman)

1. **Setup:** Run `./setup-local-gke.sh`
   - Creates Kind cluster
   - Kind writes kubeconfig to `~/.kube/config`

2. **Configuration (UI):**
   - Go to Settings → Cluster Configuration
   - Auth Mode: Auto-detect (recommended)
   - Kubeconfig Path: `~/.kube/config`
   - Click Test Connection

3. **Auto-Detection:**
   - KubernetesClient.js checks: Is KUBERNETES_SERVICE_HOST set?
   - NO → Local mode, reads kubeconfig file
   - Connects to local Kind cluster

### Production GKE

1. **Deployment:**
   - Deploy PulseOps pod to GKE cluster
   - K8s auto-injects service account token

2. **Configuration (Same UI):**
   - Go to Settings → Cluster Configuration
   - Auth Mode: Auto-detect (will auto-detect in-cluster)
   - Click Test Connection

3. **Auto-Detection:**
   - KubernetesClient.js checks: Is KUBERNETES_SERVICE_HOST set?
   - YES → In-cluster mode, uses service account token
   - Connects to GKE cluster

---

## Benefits

✅ **Same UI** — No separate configuration pages for local vs production

✅ **Same Config File** — ClusterConfig.json works in both environments

✅ **Zero Code Changes** — Same KubernetesClient.js code handles both

✅ **Automatic Detection** — No manual switching needed

✅ **Standard Parameters Only** — No environment-specific credentials

✅ **Easy Testing** — Local development mirrors production exactly

✅ **Production Ready** — Same code path tested locally before production

---

## Testing Checklist

### Local Development

- [ ] Run `./setup-local-gke.sh` successfully
- [ ] Start PulseOps: `npm run dev`
- [ ] Go to Settings → Cluster Configuration
- [ ] Auth Mode: Auto-detect
- [ ] Kubeconfig Path: `~/.kube/config`
- [ ] Click "Test Connection" → Should show ✓ Connected
- [ ] Verify cluster info displayed (name, version, node count)
- [ ] Click "Save Configuration"
- [ ] Go to Settings → Data Management → Load Default Data
- [ ] Go to Settings → Poller Configuration → Enable Poller
- [ ] Go to Dashboard → Should show all workloads

### Production GKE

- [ ] Deploy PulseOps pod to GKE cluster
- [ ] Go to Settings → Cluster Configuration
- [ ] Auth Mode: Auto-detect (will auto-detect in-cluster)
- [ ] Click "Test Connection" → Should show ✓ Connected
- [ ] Verify cluster info displayed
- [ ] Click "Save Configuration"
- [ ] Load default data and enable poller
- [ ] Verify dashboard shows workloads

---

## Dependencies

**Required npm package:**
```bash
npm install @kubernetes/client-node
```

This package provides the official Kubernetes client for Node.js with support for:
- In-cluster authentication (service account token)
- Kubeconfig authentication
- All Kubernetes API operations

---

## Files Modified

| File | Type | Changes |
|------|------|---------|
| `src/modules/google_gke/api/config/ClusterConfig.json` | NEW | Unified config structure |
| `src/modules/google_gke/api/lib/KubernetesClient.js` | UPDATED | Auto-detection + K8s client init |
| `src/modules/google_gke/api/routes/configRoutes.js` | UPDATED | Simplified endpoints |
| `src/modules/google_gke/api/routes/helpers.js` | UPDATED | Simplified config file I/O |
| `src/modules/google_gke/ui/components/settings/ClusterConfigTab.jsx` | IMPLEMENTED | Unified UI component |
| `src/modules/google_gke/local-dev/README.md` | UPDATED | Unified config documentation |
| `src/modules/google_gke/local-dev/setup-local-gke.sh` | UPDATED | Setup instructions |

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    ClusterConfigTab.jsx (UI)                 │
│                  (Same for local & production)                │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ↓
        ┌────────────────────────────┐
        │   configRoutes.js (API)    │
        │ GET/PUT/POST /config/*     │
        └────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ↓                         ↓
  ┌──────────────┐      ┌──────────────────────┐
  │ ClusterConfig│      │ KubernetesClient.js  │
  │   .json      │      │ (Auto-Detection)     │
  │              │      │                      │
  │ connection:  │      │ 1. Check env var     │
  │ - authMode   │      │ 2. Init K8s client   │
  │ - kubeconfig │      │ 3. Return API        │
  │ - gcp*       │      │                      │
  └──────────────┘      └──────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ↓                         ↓
            ┌──────────────┐        ┌──────────────┐
            │ Local Dev    │        │ Production   │
            │ (Kind)       │        │ (GKE)        │
            │              │        │              │
            │ kubeconfig   │        │ Service      │
            │ auth         │        │ Account      │
            │              │        │ auth         │
            └──────────────┘        └──────────────┘
```

---

## Next Steps

1. **Install dependency:**
   ```bash
   npm install @kubernetes/client-node
   ```

2. **Test locally:**
   - Run local setup script
   - Configure cluster in UI
   - Verify connection test works
   - Load default data and enable poller

3. **Deploy to production:**
   - Same configuration works in GKE
   - Just deploy PulseOps pod to cluster
   - Auto-detection handles authentication

4. **Documentation:**
   - See `UNIFIED_CLUSTER_CONFIG.md` for detailed documentation
   - See `local-dev/README.md` for local setup guide

