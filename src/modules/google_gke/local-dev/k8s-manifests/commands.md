# Elasticsearch Backup CronJob — Update Commands

## Purpose
Commands to update the `elasticsearch-backup` CronJob to use `restartPolicy: Never` instead of `OnFailure`.

## Commands

| Command | Purpose |
|---------|---------|
| `kubectl delete cronjob elasticsearch-backup -n prod-iga` | Delete the existing elasticsearch-backup CronJob from the prod-iga namespace |
| `kubectl apply -f src/modules/google_gke/local-dev/k8s-manifests/sample-cronjobs.yaml` | Reapply the updated YAML with `restartPolicy: Never` to prevent pod restart on failure |

## Notes

- **Before running the second command**, update `sample-cronjobs.yaml` line 104 from `restartPolicy: OnFailure` to `restartPolicy: Never`
- This change prevents the pod from restarting if the backup command fails
- The pod will exit immediately on failure, and the Job status will reflect the failure without retry attempts
- Alerts will now trigger correctly when the backup fails (see CronjobService.js alert detection logic)
