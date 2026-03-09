// ============================================================================
// Build Module Script — PulseOps V3
//
// PURPOSE: CLI script to build individual add-on modules as standalone
// deployable packages into dist-modules/<moduleId>/. The output includes:
//   - manifest.js      → Compiled UI bundle (Vite library-mode ES module)
//   - constants.json   → Module metadata (for moduleScanner discovery)
//   - api/             → API routes + config (copied as-is for dynamic loading)
//
// MODULE SOURCE LAYOUT (src/modules/<moduleId>/):
//   src/modules/<moduleId>/          → 100% self-contained module
//     ├── api/                       → API routes + services + config (Node.js)
//     │   ├── config/                → Module-specific JSON configs
//     │   └── index.js               → API entry point (exports router + hooks)
//     ├── ui/                        → Frontend manifest + views + components
//     │   ├── config/
//     │   │   ├── constants.json     → Module metadata (id, name, version)
//     │   │   ├── uiText.json        → All UI labels and text
//     │   │   ├── urls.json          → Module API endpoint URLs
//     │   │   ├── uiErrors.json      → Module error messages
//     │   │   └── uiMessages.json    → Module success messages
//     │   ├── components/            → View + config components
//     │   └── manifest.jsx           → UI entry point (module contract)
//     └── README.md
//
// DIST OUTPUT (dist-modules/<moduleId>/):  → K8s PV mount point
//   dist-modules/<moduleId>/
//     ├── manifest.js                → Compiled UI bundle (self-contained)
//     ├── constants.json             → Module metadata (for moduleScanner)
//     └── api/                       → Copied from src/modules/<id>/api/
//         ├── config/
//         └── index.js
//
// USAGE:
//   node scripts/build-module.js <moduleId>
//   npm run build:module -- servicenow
//
// ZERO DOWNTIME: After building, the module appears in Module Manager → Available.
// Install → Enable → API routes loaded dynamically, UI manifest fetched via hot-drop.
// No platform rebuild. No server restart. No downtime.
// ============================================================================

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Parse arguments ──────────────────────────────────────────────────────────
const moduleId = process.argv[2];

if (!moduleId) {
  console.error('[build-module] ERROR: No module ID provided.');
  console.error('  Usage: node scripts/build-module.js <moduleId>');
  console.error('  Example: node scripts/build-module.js servicenow');
  process.exit(1);
}

// ── Resolve source paths ────────────────────────────────────────────────────
// Enterprise layout: src/modules/<moduleId>/ui/ + src/modules/<moduleId>/api/
// Each module is 100% self-contained under src/modules/<moduleId>/
const moduleSrc = path.join(ROOT, 'src', 'modules', moduleId);
const uiDir = path.join(moduleSrc, 'ui');
const apiDir = path.join(moduleSrc, 'api');
const uiEntry = path.join(uiDir, 'manifest.jsx');
const constantsSrc = path.join(uiDir, 'config', 'constants.json');

if (!fs.existsSync(uiEntry)) {
  console.error(`[build-module] ERROR: Module source not found.`);
  console.error(`  Expected: ${uiEntry}`);
  console.error(`  Module layout: src/modules/<moduleId>/ui/manifest.jsx`);
  process.exit(1);
}

console.log(`[build-module] Using enterprise layout: src/modules/${moduleId}/`);

// Output to project root dist-modules/ (K8s PV mount point)
const outDir = path.join(ROOT, 'dist-modules', moduleId);

console.log(`[build-module] Building module: ${moduleId}`);
console.log(`[build-module]   UI Entry:    ${uiEntry}`);
console.log(`[build-module]   API Dir:     ${apiDir || 'none (UI-only module)'}`);
console.log(`[build-module]   Output:      ${outDir}`);

// ── Validate UI entry point ──────────────────────────────────────────────────
if (!fs.existsSync(uiEntry)) {
  console.error(`[build-module] ERROR: manifest.jsx not found: ${uiEntry}`);
  process.exit(1);
}

// ── Clean output directory ───────────────────────────────────────────────────
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true });
}
fs.mkdirSync(outDir, { recursive: true });

// ── Step 1: Build UI bundle via vite.module.config.js ─────────────────────────
console.log(`[build-module] Step 1/3: Building UI bundle...`);
try {
  execSync(
    `npx vite build --config vite.module.config.js`,
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_MODULE_ID: moduleId,
        VITE_MODULE_ENTRY: uiEntry,
      },
    }
  );
  console.log(`[build-module] UI bundle built: ${outDir}/manifest.js`);
} catch (err) {
  console.error(`[build-module] ERROR: Vite build failed.`);
  process.exit(1);
}

// ── Step 2: Copy constants.json for moduleScanner discovery ──────────────────
console.log(`[build-module] Step 2/3: Copying constants.json...`);
if (fs.existsSync(constantsSrc)) {
  fs.copyFileSync(constantsSrc, path.join(outDir, 'constants.json'));
  console.log(`[build-module] constants.json copied to output.`);
} else {
  console.warn(`[build-module] WARN: constants.json not found: ${constantsSrc}`);
  console.warn(`[build-module]   moduleScanner may not discover this module.`);
}

// ── Step 3: Copy API directory (if module has server-side code) ───────────────
console.log(`[build-module] Step 3/3: Copying API directory...`);
if (fs.existsSync(apiDir) && fs.existsSync(path.join(apiDir, 'index.js'))) {
  const outApiDir = path.join(outDir, 'api');
  copyDirSync(apiDir, outApiDir);
  console.log(`[build-module] API directory copied to output.`);
} else {
  console.log(`[build-module] No API directory found — UI-only module.`);
}

// ── Step 4: Copy database directory (Schema.json for module DB provisioning) ──
const dbDir = path.join(moduleSrc, 'database');
if (fs.existsSync(dbDir)) {
  const outDbDir = path.join(outDir, 'database');
  copyDirSync(dbDir, outDbDir);
  console.log(`[build-module] Step 4/4: Database schema copied to output.`);
} else {
  console.log(`[build-module] Step 4/4: No database directory found — no module schema.`);
}

console.log(`\n[build-module] ✓ Module '${moduleId}' built successfully!`);
console.log(`[build-module]   Output: ${outDir}`);
console.log(`[build-module]   → manifest.js  (UI bundle)`);
console.log(`[build-module]   → constants.json (metadata)`);
if (fs.existsSync(path.join(outDir, 'api'))) {
  console.log(`[build-module]   → api/         (server routes)`);
}
if (fs.existsSync(path.join(outDir, 'database'))) {
  console.log(`[build-module]   → database/    (DB schema)`);
}

// ── Utility: Recursive directory copy ────────────────────────────────────────
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
