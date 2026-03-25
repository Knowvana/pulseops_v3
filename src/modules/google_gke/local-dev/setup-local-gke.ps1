# =============================================================================
# Google GKE Module — Local GKE Simulation Setup Script (Windows PowerShell)
#
# PURPOSE: Windows version of setup-local-gke.sh. Automates the creation of
# a local Kubernetes cluster using Kind with Podman on Windows.
#
# PREREQUISITES:
#   1. Podman Desktop installed and running
#   2. Kind installed: winget install Kubernetes.kind
#   3. kubectl installed: winget install Kubernetes.kubectl
#
# USAGE:
#   .\setup-local-gke.ps1
#
# =============================================================================
$ErrorActionPreference = "Stop"

$CLUSTER_NAME = "pulseops-gke"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Definition
$MANIFESTS_DIR = Join-Path $SCRIPT_DIR "k8s-manifests"

function Log-Info  { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Log-Ok    { param($msg) Write-Host "[OK]    $msg" -ForegroundColor Green }
function Log-Warn  { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Log-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

# ═════════════════════════════════════════════════════════════════════════════
# STEP 1: Check Prerequisites
# ═════════════════════════════════════════════════════════════════════════════
Log-Info "Checking prerequisites..."

function Check-Command {
    param($Name, $InstallUrl)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Log-Error "$Name is not installed. Install from: $InstallUrl"
        exit 1
    }
    Log-Ok "$Name found"
}

Check-Command "podman"  "https://podman-desktop.io/"
Check-Command "kind"    "https://kind.sigs.k8s.io/docs/user/quick-start/"
Check-Command "kubectl" "https://kubernetes.io/docs/tasks/tools/"

# ═════════════════════════════════════════════════════════════════════════════
# STEP 2: Create Kind Cluster
# ═════════════════════════════════════════════════════════════════════════════
Log-Info "Creating Kind cluster '$CLUSTER_NAME'..."

$existingClusters = kind get clusters 2>$null
if ($existingClusters -match $CLUSTER_NAME) {
    Log-Warn "Cluster '$CLUSTER_NAME' already exists. Skipping creation."
    Log-Info "To recreate, run: kind delete cluster --name $CLUSTER_NAME"
} else {
    $env:KIND_EXPERIMENTAL_PROVIDER = "podman"

    kind create cluster `
        --config "$SCRIPT_DIR\kind-cluster-config.yaml" `
        --name $CLUSTER_NAME `
        --wait 60s

    Log-Ok "Kind cluster '$CLUSTER_NAME' created successfully"
}

kubectl cluster-info --context "kind-$CLUSTER_NAME" | Out-Null
Log-Ok "kubectl context set to kind-$CLUSTER_NAME"

# ═════════════════════════════════════════════════════════════════════════════
# STEP 3: Deploy All Manifests
# ═════════════════════════════════════════════════════════════════════════════
Log-Info "Deploying manifests..."

Log-Info "Creating namespace..."
kubectl apply -f "$MANIFESTS_DIR\namespace.yaml"
Log-Ok "Namespace 'accessio' created"

Log-Info "Deploying sample workloads..."
kubectl apply -f "$MANIFESTS_DIR\sample-workloads.yaml"
Log-Ok "Sample workloads deployed"

Log-Info "Deploying CronJobs..."
kubectl apply -f "$MANIFESTS_DIR\sample-cronjobs.yaml"
Log-Ok "Sample CronJobs deployed"

Log-Info "Deploying Dataflow job simulations..."
kubectl apply -f "$MANIFESTS_DIR\sample-dataflow-jobs.yaml"
Log-Ok "Dataflow simulations deployed"

Log-Info "Deploying Pub/Sub emulator..."
kubectl apply -f "$MANIFESTS_DIR\pubsub-emulator.yaml"
Log-Ok "Pub/Sub emulator deployed"

Log-Info "Deploying Mailpit..."
kubectl apply -f "$MANIFESTS_DIR\mailpit.yaml"
Log-Ok "Mailpit deployed"

# ═════════════════════════════════════════════════════════════════════════════
# STEP 4: Wait for Pods
# ═════════════════════════════════════════════════════════════════════════════
Log-Info "Waiting for pods to be ready (timeout: 120s)..."

try {
    kubectl wait --for=condition=ready pod --all --namespace=accessio --timeout=120s 2>$null
} catch {
    Log-Warn "Some pods may not be ready yet. Check: kubectl get pods -n accessio"
}

# ═════════════════════════════════════════════════════════════════════════════
# STEP 5: Summary
# ═════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host "  Local GKE Simulation - Setup Complete" -ForegroundColor Cyan
Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host ""

Log-Info "Cluster Nodes:"
kubectl get nodes

Write-Host ""
Log-Info "All Pods:"
kubectl get pods -n accessio -o wide

Write-Host ""
Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host "  Access Points:"
Write-Host "  - kubectl context:    kind-$CLUSTER_NAME"
Write-Host "  - Mailpit Web UI:     http://localhost:30001"
Write-Host ""
Write-Host "  Next Steps:"
Write-Host "  1. Start PulseOps: npm run dev"
Write-Host "  2. Enable Google GKE module in Module Manager"
Write-Host "  3. Settings > Cluster Configuration > Auto-detect > Test > Save"
Write-Host "  4. Settings > Data Management > Load Default Data"
Write-Host "  5. Settings > Poller Configuration > Enable > Save"
Write-Host "  6. View the Dashboard!"
Write-Host "=======================================================================" -ForegroundColor Cyan
