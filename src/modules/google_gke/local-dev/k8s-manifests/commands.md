# CronJob Management Commands

## Purpose
Commands to manage CronJobs, clean up failed jobs/pods, and apply updated configurations.

## Common Operations

| Command | Purpose |
|---------|---------|
| `kubectl get cronjobs -n prod-iga` | List all CronJobs in prod-iga namespace |
| `kubectl get jobs -n prod-iga` | List all Jobs in prod-iga namespace |
| `kubectl get pods -n prod-iga` | List all Pods in prod-iga namespace |

## Cleanup Commands

| Command | Purpose |
|---------|---------|
| `kubectl delete jobs --all -n prod-iga` | Delete all failed/completed jobs (keeps CronJobs intact) |
| `kubectl delete pods -n prod-iga -l app=elasticsearch-backup` | Delete all pods for elasticsearch-backup |
| `kubectl delete namespace prod-iga && kubectl create namespace prod-iga` | Complete cleanup: delete and recreate namespace |

## Apply/Update Commands

| Command | Purpose |
|---------|---------|
| `kubectl apply -f src/modules/google_gke/local-dev/k8s-manifests/sample-cronjobs.yaml` | Apply updated CronJob YAML with no-retry policy and 3-job history limit |
| `kubectl apply -f src/modules/google_gke/local-dev/k8s-manifests/namespace.yaml` | Create/update prod-iga namespace |

## Recommended Workflow

1. **Clean up old jobs**: `kubectl delete jobs --all -n prod-iga`
2. **Apply updated CronJobs**: `kubectl apply -f src/modules/google_gke/local-dev/k8s-manifests/sample-cronjobs.yaml`
3. **Verify**: `kubectl get cronjobs -n prod-iga`

## Configuration Details

- **backoffLimit: 0** — No retries on failure (job fails immediately)
- **successfulJobsHistoryLimit: 3** — Keep last 3 successful jobs
- **failedJobsHistoryLimit: 3** — Keep last 3 failed jobs
- **restartPolicy: Never** — Don't restart failed pods
