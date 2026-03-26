# Google GKE Module — Implementation Guide

## Phase 1: API Services (Business Logic)

### Step 1.1: WorkloadService.js — List & Monitor Workloads

**Goal**: Implement functions to list and monitor GKE workloads (Deployments, StatefulSets, DaemonSets, Pods).

**What You'll Learn**:
- How to use KubernetesClient to query the K8s API
- How to extract health metrics from K8s resources
- How to structure service methods for reusability

**Key Functions to Implement**:

1. **`listWorkloads(namespace)`**
   - Query K8s API for all Deployments, StatefulSets, DaemonSets
   - Return array of workload objects with:
     - `name`, `type` (Deployment/StatefulSet/DaemonSet)
     - `replicas`, `ready`, `updated`, `available`
     - `restarts`, `age`
   - Example output:
     ```javascript
     [
       {
         name: "identityiq-ui",
         type: "Deployment",
         replicas: 1,
         ready: 1,
         updated: 1,
         available: 1,
         restarts: 0,
         age: "2m"
       }
     ]
     ```

2. **`getWorkloadDetails(namespace, name, type)`**
   - Get detailed info about a specific workload
   - Return:
     - Workload metadata (labels, annotations)
     - Pod list with individual pod status
     - Events (recent K8s events)
     - Resource usage (CPU, memory requests/limits)

3. **`getWorkloadHealth(namespace, name, type)`**
   - Calculate health status (HEALTHY, DEGRADED, UNHEALTHY)
   - Logic:
     - HEALTHY: all replicas ready, no recent restarts
     - DEGRADED: some replicas not ready, or recent restarts
     - UNHEALTHY: no replicas ready, or pod errors

**File Location**: `src/modules/google_gke/api/services/WorkloadService.js`

**Dependencies**:
- `KubernetesClient` — for K8s API calls
- `moduleLogger` — for logging

**Testing**:
After implementation, test with:
```bash
curl http://localhost:3000/api/google_gke/workloads/list?namespace=prod-iga
```

---

### Step 1.2: ClusterPollerService.js — Background Health Poller

**Goal**: Implement the background service that periodically polls cluster health.

**What You'll Learn**:
- How to create background services in Node.js
- How to schedule recurring tasks
- How to store poll results in the database

**Key Functions**:

1. **`start()`**
   - Initialize the poller
   - Set up interval timer (e.g., every 30 seconds)
   - Start polling

2. **`stop()`**
   - Stop the interval timer
   - Clean up resources

3. **`poll()`**
   - Called every 30 seconds
   - Call WorkloadService.listWorkloads()
   - Call CronjobService.listCronjobs()
   - Call DataflowService.listDataflowJobs()
   - Store results in database table `gke_poll_results`
   - Update `gke_workloads` table with latest status

**File Location**: `src/modules/google_gke/api/services/ClusterPollerService.js`

**Testing**:
After implementation, enable the poller in PulseOps settings and check:
```bash
kubectl logs -n prod-iga deployment/identityiq-ui
# Should see poller logs every 30 seconds
```

---

### Step 1.3: CronjobService.js — Monitor CronJobs

**Goal**: Monitor Kubernetes CronJobs and their execution history.

**Key Functions**:

1. **`listCronjobs(namespace)`**
   - List all CronJobs
   - Return: name, schedule, last schedule time, active jobs

2. **`getCronjobHistory(namespace, cronjobName, limit=10)`**
   - Get execution history (last 10 jobs)
   - Return: job name, status, start time, completion time, duration

3. **`getCronjobLogs(namespace, jobName)`**
   - Get logs from a completed job's pods

---

### Step 1.4: DataflowService.js — Monitor Dataflow Jobs

**Goal**: Monitor Dataflow pipelines (both local K8s Jobs and real GCP Dataflow).

**Key Functions**:

1. **`listDataflowJobs()`**
   - In local mode: query K8s Jobs with label `pulseops.io/type=dataflow`
   - In GCP mode: query Dataflow API
   - Return: job name, status, progress, start time, duration

2. **`getDataflowJobDetails(jobId)`**
   - Get detailed metrics: elements processed, throughput, errors

---

## Phase 2: API Routes (HTTP Endpoints)

Once services are implemented, create routes that call them:

- `GET /api/google_gke/workloads/list` → WorkloadService.listWorkloads()
- `GET /api/google_gke/workloads/:name` → WorkloadService.getWorkloadDetails()
- `GET /api/google_gke/cronjobs/list` → CronjobService.listCronjobs()
- `GET /api/google_gke/dataflow/list` → DataflowService.listDataflowJobs()

---

## Phase 3: UI Components (React)

Once routes are working, implement React components:

- Dashboard: Display summary stats
- WorkloadsView: Table of all workloads
- CronjobsView: Table of CronJobs
- etc.

---

## Implementation Order (Recommended)

1. **WorkloadService.js** ← Start here (simplest, most fundamental)
2. **ClusterPollerService.js** ← Depends on WorkloadService
3. **CronjobService.js** ← Similar to WorkloadService
4. **DataflowService.js** ← Slightly more complex (local vs GCP)
5. **PubsubService.js** ← Depends on environment detection
6. **EmailService.js** ← Depends on environment detection
7. **LogsService.js** ← Most complex (log streaming)

---

## Code Structure Example

Here's what a completed service looks like:

```javascript
// WorkloadService.js
const { KubernetesClient } = require('../lib/KubernetesClient');
const { moduleLogger } = require('../lib/moduleLogger');

class WorkloadService {
  constructor() {
    this.k8sClient = new KubernetesClient();
    this.logger = moduleLogger('WorkloadService');
  }

  async listWorkloads(namespace) {
    try {
      this.logger.info(`Listing workloads in namespace: ${namespace}`);
      
      // Get all Deployments
      const deployments = await this.k8sClient.listDeployments(namespace);
      
      // Get all StatefulSets
      const statefulsets = await this.k8sClient.listStatefulSets(namespace);
      
      // Get all DaemonSets
      const daemonsets = await this.k8sClient.listDaemonSets(namespace);
      
      // Combine and format
      const workloads = [
        ...this.formatDeployments(deployments),
        ...this.formatStatefulSets(statefulsets),
        ...this.formatDaemonSets(daemonsets)
      ];
      
      this.logger.info(`Found ${workloads.length} workloads`);
      return workloads;
    } catch (error) {
      this.logger.error(`Failed to list workloads: ${error.message}`);
      throw error;
    }
  }

  formatDeployments(deployments) {
    return deployments.map(dep => ({
      name: dep.metadata.name,
      type: 'Deployment',
      replicas: dep.spec.replicas,
      ready: dep.status.readyReplicas || 0,
      updated: dep.status.updatedReplicas || 0,
      available: dep.status.availableReplicas || 0,
      restarts: this.calculateRestarts(dep),
      age: this.calculateAge(dep.metadata.creationTimestamp)
    }));
  }

  // ... other methods
}

module.exports = { WorkloadService };
```

---

## Next Steps

1. Read through `KubernetesClient.js` to understand available methods
2. Start implementing `WorkloadService.js`
3. Test with: `curl http://localhost:3000/api/google_gke/workloads/list?namespace=prod-iga`
4. Move to `ClusterPollerService.js`
5. Implement routes and test in PulseOps UI

---

## Resources

- Kubernetes JS Client: https://github.com/kubernetes-client/javascript
- K8s API Docs: https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.35/
- Your local cluster: `kubectl get deployments -n prod-iga`
