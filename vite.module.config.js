// ============================================================================
// vite.module.config.js — PulseOps V3 Module Build Configuration
//
// PURPOSE: Builds a single plug-and-play module as a standalone ES module
// bundle for hot-drop deployment. The output is placed in:
//   dist-modules/<moduleId>/manifest.js
//
// USAGE:
//   npm run build:module -- --module=servicenow
//   node scripts/build-module.js servicenow
//
// ARCHITECTURE (Hot-Drop):
//   The host application (PlatformDashboard) imports the bundle via:
//     GET /api/modules/bundle/<moduleId>/manifest.js
//   and calls:
//     const manifest = (await import(bundleUrl)).default;
//   This is the zero-downtime, zero-rebuild deployment model.
//
// DUAL-MODE LOADING:
//   DEV:  moduleRegistry.js loads /src/modules/<id>/ui/manifest.jsx directly
//         via Vite's dev server — full alias resolution, HMR, React dedup.
//         This build output is NOT used in dev mode.
//   PROD: This build produces a self-contained manifest.js with ALL
//         dependencies bundled (React, lucide-react, etc.) so browsers
//         can load it via dynamic import() without import maps or CDNs.
// ============================================================================

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── The module ID and entry are passed via env vars from build-module.js ──────
const MODULE_ID = process.env.VITE_MODULE_ID || 'servicenow';
// VITE_MODULE_ENTRY is set by build-module.js pointing to src/modules/<id>/ui/manifest.jsx
const MODULE_ENTRY = process.env.VITE_MODULE_ENTRY
  || path.resolve(__dirname, `src/modules/${MODULE_ID}/ui/manifest.jsx`);
const OUT_DIR = path.resolve(__dirname, `dist-modules/${MODULE_ID}`);

export default defineConfig({
  plugins: [react()],

  // ── Path aliases matching the main vite.config.js ─────────────────────────
  resolve: {
    alias: {
      '@src':     path.resolve(__dirname, 'src'),
      '@config':  path.resolve(__dirname, 'src/client/config'),
      '@core':    path.resolve(__dirname, 'src/client/core'),
      '@modules': path.resolve(__dirname, 'src/modules'),
      '@shared':  path.resolve(__dirname, 'src/client/shared'),
      '@layouts': path.resolve(__dirname, 'src/client/layouts'),
    },
  },

  build: {
    // ── Output directory per module ────────────────────────────────────────
    outDir: OUT_DIR,
    emptyOutDir: true,

    // ── ES module library mode — output: manifest.js ──────────────────────
    lib: {
      entry:    MODULE_ENTRY,
      formats:  ['es'],
      fileName: () => 'manifest.js',
    },

    // ── Bundle ALL dependencies into the manifest ──────────────────────────
    // In production, the manifest.js must be fully self-contained so browsers
    // can load it via dynamic import() without import maps or external CDNs.
    //
    // DEV MODE:  This bundle is NOT used. moduleRegistry.js loads the source
    //            manifest.jsx directly via Vite's dev server, which handles
    //            React deduplication and alias resolution natively.
    //
    // PROD MODE: The self-contained bundle is served via:
    //            GET /api/modules/bundle/<id>/manifest.js
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },

    // ── Build options ──────────────────────────────────────────────────────
    sourcemap: false,
    minify:    'esbuild',

    // Keep comments (file headers) in the output for auditability
    terserOptions: {
      format: { comments: 'some' },
    },
  },
});
