#!/bin/bash
# =============================================================================
# Google GKE Module — Local GKE Simulation Teardown Script
#
# PURPOSE: Cleanly removes the local Kind cluster and all associated resources.
# This is the reverse of setup-local-gke.sh.
#
# USAGE:
#   chmod +x teardown-local-gke.sh
#   ./teardown-local-gke.sh
#
# WHAT THIS SCRIPT DOES:
#   1. Deletes the Kind cluster (removes all nodes, pods, services)
#   2. Removes the kubectl context entry
#   3. Optionally prunes Podman container images
#
# =============================================================================
set -euo pipefail

CLUSTER_NAME="pulseops-gke"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Tearing down local GKE simulation: ${CLUSTER_NAME}"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Check if cluster exists
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  log_info "Deleting Kind cluster '${CLUSTER_NAME}'..."
  export KIND_EXPERIMENTAL_PROVIDER=podman
  kind delete cluster --name "${CLUSTER_NAME}"
  log_ok "Cluster '${CLUSTER_NAME}' deleted"
else
  log_warn "Cluster '${CLUSTER_NAME}' does not exist. Nothing to delete."
fi

echo ""
log_ok "Teardown complete."
echo ""
echo "  To recreate, run: ./setup-local-gke.sh"
echo ""
