#!/bin/bash
# =============================================================================
# Google GKE Module — Local GKE Simulation Setup Script
#
# PURPOSE: Automates the creation of a local Kubernetes cluster using Kind
# (Kubernetes in Docker) with Podman, and deploys all sample workloads,
# CronJobs, Dataflow simulations, Pub/Sub emulator, and Mailpit.
#
# PREREQUISITES:
#   1. Podman installed and running:  podman machine start
#   2. Kind installed:                https://kind.sigs.k8s.io/
#   3. kubectl installed:             https://kubernetes.io/docs/tasks/tools/
#
# USAGE:
#   chmod +x setup-local-gke.sh
#   ./setup-local-gke.sh
#
# WHAT THIS SCRIPT DOES:
#   1. Checks prerequisites (podman, kind, kubectl)
#   2. Creates a 3-node Kind cluster (1 control-plane + 2 workers)
#   3. Creates the 'accessio' namespace
#   4. Deploys sample workloads (Deployments, StatefulSets)
#   5. Deploys sample CronJobs (identity-sync, db-backup, etc.)
#   6. Deploys sample Dataflow job simulations
#   7. Deploys Pub/Sub emulator
#   8. Deploys Mailpit (email testing)
#   9. Waits for all pods to be ready
#  10. Prints cluster status summary
#
# AFTER RUNNING:
#   - kubectl context is set to kind-pulseops-gke
#   - PulseOps module can connect using auto-detect (kubeconfig)
#   - Mailpit Web UI: http://localhost:30001
#   - All workloads running in 'accessio' namespace
#
# =============================================================================
set -euo pipefail

CLUSTER_NAME="pulseops-gke"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFESTS_DIR="${SCRIPT_DIR}/k8s-manifests"

# ── Colors for output ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ═════════════════════════════════════════════════════════════════════════════
# STEP 1: Check Prerequisites
# ═════════════════════════════════════════════════════════════════════════════
log_info "Checking prerequisites..."

check_command() {
  if ! command -v "$1" &> /dev/null; then
    log_error "$1 is not installed. Please install it first."
    echo "  → $2"
    exit 1
  fi
  log_ok "$1 found: $(command -v $1)"
}

check_command "podman"  "https://podman.io/getting-started/installation"
check_command "kind"    "https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
check_command "kubectl" "https://kubernetes.io/docs/tasks/tools/"

# Check if Podman machine is running
if ! podman info &> /dev/null; then
  log_warn "Podman machine is not running. Starting it..."
  podman machine start || {
    log_error "Failed to start Podman machine. Run: podman machine start"
    exit 1
  }
fi
log_ok "Podman is running"

# ═════════════════════════════════════════════════════════════════════════════
# STEP 2: Create Kind Cluster
# ═════════════════════════════════════════════════════════════════════════════
log_info "Creating Kind cluster '${CLUSTER_NAME}'..."

# Check if cluster already exists
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  log_warn "Cluster '${CLUSTER_NAME}' already exists. Skipping creation."
  log_info "To recreate, run: kind delete cluster --name ${CLUSTER_NAME}"
else
  # Use Podman as the container runtime
  export KIND_EXPERIMENTAL_PROVIDER=podman

  kind create cluster \
    --config "${SCRIPT_DIR}/kind-cluster-config.yaml" \
    --name "${CLUSTER_NAME}" \
    --wait 60s

  log_ok "Kind cluster '${CLUSTER_NAME}' created successfully"
fi

# Set kubectl context
kubectl cluster-info --context "kind-${CLUSTER_NAME}" > /dev/null
log_ok "kubectl context set to kind-${CLUSTER_NAME}"

# ═════════════════════════════════════════════════════════════════════════════
# STEP 3: Deploy All Manifests
# ═════════════════════════════════════════════════════════════════════════════
log_info "Deploying manifests from ${MANIFESTS_DIR}..."

# Apply in order (namespace first, then workloads, then services)
log_info "Creating namespace..."
kubectl apply -f "${MANIFESTS_DIR}/namespace.yaml"
log_ok "Namespace 'accessio' created"

log_info "Deploying sample workloads..."
kubectl apply -f "${MANIFESTS_DIR}/sample-workloads.yaml"
log_ok "Sample workloads deployed (Deployments + StatefulSets)"

log_info "Deploying CronJobs..."
kubectl apply -f "${MANIFESTS_DIR}/sample-cronjobs.yaml"
log_ok "Sample CronJobs deployed"

log_info "Deploying Dataflow job simulations..."
kubectl apply -f "${MANIFESTS_DIR}/sample-dataflow-jobs.yaml"
log_ok "Dataflow job simulations deployed"

log_info "Deploying Pub/Sub emulator..."
kubectl apply -f "${MANIFESTS_DIR}/pubsub-emulator.yaml"
log_ok "Pub/Sub emulator deployed"

log_info "Deploying Mailpit (email testing)..."
kubectl apply -f "${MANIFESTS_DIR}/mailpit.yaml"
log_ok "Mailpit deployed"

# ═════════════════════════════════════════════════════════════════════════════
# STEP 4: Wait for Pods to be Ready
# ═════════════════════════════════════════════════════════════════════════════
log_info "Waiting for pods to be ready (timeout: 120s)..."

kubectl wait --for=condition=ready pod \
  --all \
  --namespace=accessio \
  --timeout=120s 2>/dev/null || {
    log_warn "Some pods are not ready yet. Check with: kubectl get pods -n accessio"
  }

# ═════════════════════════════════════════════════════════════════════════════
# STEP 5: Print Summary
# ═════════════════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Local GKE Simulation — Setup Complete"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

log_info "Cluster Nodes:"
kubectl get nodes

echo ""
log_info "Workloads (Deployments):"
kubectl get deployments -n accessio

echo ""
log_info "Workloads (StatefulSets):"
kubectl get statefulsets -n accessio

echo ""
log_info "CronJobs:"
kubectl get cronjobs -n accessio

echo ""
log_info "Dataflow Simulations (Jobs):"
kubectl get jobs -n accessio -l pulseops.io/type=dataflow

echo ""
log_info "Services:"
kubectl get services -n accessio

echo ""
log_info "All Pods:"
kubectl get pods -n accessio -o wide

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Access Points:"
echo "  - kubectl context:    kind-${CLUSTER_NAME}"
echo "  - Mailpit Web UI:     http://localhost:30001"
echo "  - Pub/Sub Emulator:   pubsub-emulator:8085 (cluster-internal)"
echo ""
echo "  Unified Cluster Configuration (Local & Production):"
echo "  - Same UI for both local and production"
echo "  - Auto-detection handles authentication automatically"
echo "  - Local: Uses kubeconfig (~/.kube/config)"
echo "  - Production: Uses in-cluster service account token"
echo ""
echo "  Next Steps:"
echo "  1. Start PulseOps: npm run dev"
echo "  2. Enable Google GKE module in Module Manager"
echo "  3. Go to Settings → Cluster Configuration"
echo "     - Auth Mode: Auto-detect (recommended)"
echo "     - Kubeconfig Path: ~/.kube/config (or leave empty)"
echo "     - GCP Project ID: (optional, for reference)"
echo "     - GCP Region: (optional, for reference)"
echo "     - Cluster Name: (optional, for reference)"
echo "  4. Click 'Test Connection' to verify connectivity"
echo "  5. Click 'Save Configuration'"
echo "  6. Go to Settings → Data Management → Load Default Data"
echo "  7. Enable the Poller in Settings → Poller Configuration"
echo "  8. View the Dashboard — all components should appear!"
echo ""
echo "  NOTE: Same configuration works for production GKE!"
echo "═══════════════════════════════════════════════════════════════════════"
