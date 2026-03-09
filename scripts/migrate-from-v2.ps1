# ============================================================================
# PulseOps V3 — Migration Script (V2 → V3)
#
# PURPOSE: Copies all unchanged files from pulseops_v2 into the new V3
# enterprise directory structure. Skips files that already exist in V3
# (those were pre-created with modified content by Cascade).
#
# USAGE:
#   powershell -ExecutionPolicy Bypass -File scripts\migrate-from-v2.ps1
#
# Run this from the pulseops_v3 directory AFTER Cascade has created all
# modified config files (package.json, vite.config.js, etc.)
# ============================================================================

$V2 = "E:\MyDev\Knowvana\pulseops_v2"
$V3 = "E:\MyDev\Knowvana\pulseops_v3"

if (!(Test-Path $V2)) {
    Write-Host "ERROR: V2 directory not found at $V2" -ForegroundColor Red
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PulseOps V2 -> V3 Migration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ── Helper: Copy file only if destination doesn't exist ──────────────────────
function Copy-Safe {
    param([string]$Src, [string]$Dst)
    if (!(Test-Path $Src)) {
        Write-Host "  SKIP (not found): $Src" -ForegroundColor DarkYellow
        return
    }
    if (Test-Path $Dst) {
        Write-Host "  EXISTS (keeping v3): $(Split-Path $Dst -Leaf)" -ForegroundColor DarkGray
        return
    }
    $parent = Split-Path $Dst -Parent
    if (!(Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Copy-Item $Src $Dst -Force
    Write-Host "  COPIED: $(Split-Path $Dst -Leaf)" -ForegroundColor Green
}

# ── Helper: Copy directory tree (always overwrites, creates dirs) ────────────
function Copy-Tree {
    param([string]$Src, [string]$Dst)
    if (!(Test-Path $Src)) {
        Write-Host "  SKIP (not found): $Src" -ForegroundColor DarkYellow
        return
    }
    if (!(Test-Path $Dst)) { New-Item -ItemType Directory -Force -Path $Dst | Out-Null }
    Copy-Item "$Src\*" "$Dst\" -Recurse -Force
    Write-Host "  TREE: $Src -> $Dst" -ForegroundColor Green
}

# ── 1. Create directory structure ────────────────────────────────────────────
Write-Host "`n[1/6] Creating directory structure..." -ForegroundColor Yellow
$dirs = @(
    "scripts", "docs", "dist-modules",
    "src\client\core\views",
    "src\client\layouts",
    "src\client\shared\components",
    "src\client\shared\services",
    "src\client\shared\contexts",
    "src\client\shared\hooks",
    "src\client\shared\test",
    "src\client\config",
    "src\apiserver\config",
    "src\apiserver\shared",
    "src\apiserver\core\middleware",
    "src\apiserver\core\routes",
    "src\apiserver\core\database",
    "src\apiserver\core\modules",
    "src\apiserver\core\services",
    "src\modules\servicenow\api\config",
    "src\modules\servicenow\ui\config",
    "src\modules\servicenow\ui\components\config",
    "src\modules\_template\api\config",
    "src\modules\_template\ui\config",
    "src\modules\_template\ui\views",
    "src\modules\_template\ui\components",
    "src\ReusableComponents"
)
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path "$V3\$d" | Out-Null
}
Write-Host "  Created $(($dirs).Count) directories" -ForegroundColor Green

# ── 2. Copy root config files (exact copies) ────────────────────────────────
Write-Host "`n[2/6] Copying root files..." -ForegroundColor Yellow
Copy-Safe "$V2\tailwind.config.js"        "$V3\tailwind.config.js"
Copy-Safe "$V2\postcss.config.js"         "$V3\postcss.config.js"
Copy-Safe "$V2\.env.example"              "$V3\.env.example"
Copy-Safe "$V2\.windsurfrules"            "$V3\.windsurfrules"
Copy-Safe "$V2\architecture.txt"          "$V3\architecture.txt"
Copy-Safe "$V2\docker-compose-pgsql.yml"  "$V3\docker-compose-pgsql.yml"
Copy-Safe "$V2\kill-api.bat"              "$V3\kill-api.bat"
Copy-Safe "$V2\kill-port-4001.bat"        "$V3\kill-port-4001.bat"

# ── 3. Copy source trees ────────────────────────────────────────────────────
Write-Host "`n[3/6] Copying source trees..." -ForegroundColor Yellow

# src/ root files
Copy-Safe "$V2\src\index.css"  "$V3\src\index.css"
Copy-Safe "$V2\src\main.jsx"   "$V3\src\main.jsx"

# Frontend: src/* → src/client/*
Write-Host "  -- Frontend (src/ -> src/client/) --" -ForegroundColor DarkCyan
Copy-Tree "$V2\src\core"    "$V3\src\client\core"
Copy-Tree "$V2\src\layouts" "$V3\src\client\layouts"
Copy-Tree "$V2\src\shared"  "$V3\src\client\shared"
Copy-Tree "$V2\src\config"  "$V3\src\client\config"

# Backend: api/src/* → src/apiserver/*
Write-Host "  -- Backend (api/src/ -> src/apiserver/) --" -ForegroundColor DarkCyan
Copy-Safe "$V2\api\src\server.js" "$V3\src\apiserver\server.js"
Copy-Safe "$V2\api\src\app.js"    "$V3\src\apiserver\app.js"
Copy-Tree "$V2\api\src\config"    "$V3\src\apiserver\config"
Copy-Tree "$V2\api\src\shared"    "$V3\src\apiserver\shared"
Copy-Tree "$V2\api\src\core"      "$V3\src\apiserver\core"

# Backend modules (if any exist at api/src/modules/)
if (Test-Path "$V2\api\src\modules") {
    Copy-Tree "$V2\api\src\modules" "$V3\src\apiserver\modules"
}

# ── 4. Copy module files ────────────────────────────────────────────────────
Write-Host "`n[4/6] Copying module files..." -ForegroundColor Yellow

# ServiceNow API
Write-Host "  -- ServiceNow API --" -ForegroundColor DarkCyan
Copy-Tree "$V2\modules\servicenow\api" "$V3\src\modules\servicenow\api"

# ServiceNow UI config (constants.json + uiText.json → ui/config/)
Write-Host "  -- ServiceNow UI config --" -ForegroundColor DarkCyan
Copy-Safe "$V2\src\modules\servicenow\constants.json" "$V3\src\modules\servicenow\ui\config\constants.json"
Copy-Safe "$V2\src\modules\servicenow\uiText.json"    "$V3\src\modules\servicenow\ui\config\uiText.json"

# ServiceNow UI components → ui/components/
Write-Host "  -- ServiceNow UI components --" -ForegroundColor DarkCyan
Copy-Safe "$V2\src\modules\servicenow\components\ServiceNowDashboard.jsx"  "$V3\src\modules\servicenow\ui\components\ServiceNowDashboard.jsx"
Copy-Safe "$V2\src\modules\servicenow\components\ServiceNowIncidents.jsx"  "$V3\src\modules\servicenow\ui\components\ServiceNowIncidents.jsx"
Copy-Safe "$V2\src\modules\servicenow\components\ServiceNowReports.jsx"    "$V3\src\modules\servicenow\ui\components\ServiceNowReports.jsx"

# ServiceNow config tab components → ui/components/config/
if (Test-Path "$V2\src\modules\servicenow\components\config") {
    Copy-Tree "$V2\src\modules\servicenow\components\config" "$V3\src\modules\servicenow\ui\components\config"
}

# moduleRegistry.js (will be patched in step 5)
Copy-Safe "$V2\src\modules\moduleRegistry.js" "$V3\src\modules\moduleRegistry.js"

# Docs
if (Test-Path "$V2\docs") {
    Copy-Tree "$V2\docs" "$V3\docs"
}

# ── 5. Fix imports in copied files ──────────────────────────────────────────
Write-Host "`n[5/6] Patching imports for V3 structure..." -ForegroundColor Yellow

# 5a. ServiceNow view components: @modules/servicenow/uiText.json → ../config/uiText.json
$viewComponents = @(
    "$V3\src\modules\servicenow\ui\components\ServiceNowDashboard.jsx",
    "$V3\src\modules\servicenow\ui\components\ServiceNowIncidents.jsx",
    "$V3\src\modules\servicenow\ui\components\ServiceNowReports.jsx"
)
foreach ($f in $viewComponents) {
    if (Test-Path $f) {
        $content = Get-Content $f -Raw
        $content = $content.Replace(
            "import uiText from '@modules/servicenow/uiText.json'",
            "import uiText from '../config/uiText.json'"
        )
        Set-Content $f $content -NoNewline
        Write-Host "  PATCHED: $(Split-Path $f -Leaf) (uiText -> ../config/)" -ForegroundColor Magenta
    }
}

# 5b. ServiceNow config tab components: @modules/servicenow/uiText.json → ../../config/uiText.json
$configComponents = @(
    "$V3\src\modules\servicenow\ui\components\config\ServiceNowConnectionTab.jsx",
    "$V3\src\modules\servicenow\ui\components\config\ServiceNowSlaTab.jsx",
    "$V3\src\modules\servicenow\ui\components\config\ServiceNowSyncTab.jsx"
)
foreach ($f in $configComponents) {
    if (Test-Path $f) {
        $content = Get-Content $f -Raw
        $content = $content.Replace(
            "import uiText from '@modules/servicenow/uiText.json'",
            "import uiText from '../../config/uiText.json'"
        )
        Set-Content $f $content -NoNewline
        Write-Host "  PATCHED: $(Split-Path $f -Leaf) (uiText -> ../../config/)" -ForegroundColor Magenta
    }
}

# 5c. moduleRegistry.js: dev manifest path → ui/manifest.jsx
$regFile = "$V3\src\modules\moduleRegistry.js"
if (Test-Path $regFile) {
    $content = Get-Content $regFile -Raw
    # Fix the dev-mode manifest path to include ui/ subdirectory
    $content = $content.Replace(
        '${moduleId}/manifest.jsx',
        '${moduleId}/ui/manifest.jsx'
    )
    Set-Content $regFile $content -NoNewline
    Write-Host "  PATCHED: moduleRegistry.js (dev manifest -> ui/manifest.jsx)" -ForegroundColor Magenta
}

# 5d. moduleScanner.js: Update comment for v3 path (apiserver instead of api)
$scannerFile = "$V3\src\apiserver\core\modules\moduleScanner.js"
if (Test-Path $scannerFile) {
    $content = Get-Content $scannerFile -Raw
    $content = $content.Replace(
        "4 levels up from api/src/core/modules/",
        "4 levels up from src/apiserver/core/modules/"
    )
    Set-Content $scannerFile $content -NoNewline
    Write-Host "  PATCHED: moduleScanner.js (comment updated for v3 path)" -ForegroundColor Magenta
}

# ── 6. Summary ──────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Migration Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. cd $V3" -ForegroundColor White
Write-Host "  2. npm install" -ForegroundColor White
Write-Host "  3. npm run dev" -ForegroundColor White
Write-Host "`nPre-created V3 files (package.json, vite configs, etc.)" -ForegroundColor DarkGray
Write-Host "were NOT overwritten by this script.`n" -ForegroundColor DarkGray
