// ============================================================================
// Google GKE Module — Config Loader
//
// PURPOSE: Loads all JSON configuration files for the Google GKE module and
// exports them as named constants. Uses readFileSync so this works on every
// Node.js version without requiring import-assertion or import-attribute support.
//
// HOW IT WORKS:
//   1. Determines the directory of this file using import.meta.url
//   2. Creates a generic 'load' function that reads and parses JSON files
//   3. Exports each config object as a named constant
//
// WHY THIS FILE EXISTS:
//   - Centralizes all config loading in one place
//   - Prevents each route/service file from having its own JSON loading logic
//   - Makes it easy to swap config sources (e.g., from file to DB) later
//
// USAGE IN OTHER FILES:
//   import { gkeUrls, apiErrors, apiMessages } from '#modules/google_gke/api/config/index.js';
//
//   // Then use like:
//   const routePath = gkeUrls.routes.workloads;          // "/workloads"
//   const errMsg = apiErrors.workloads.fetchFailed;       // "Failed to fetch workloads: {message}"
//   const successMsg = apiMessages.poller.started;        // "Cluster poller started..."
//
// PATTERN: Identical to HealthCheck module's config/index.js
// ============================================================================
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── Resolve the directory path of THIS file ──────────────────────────────────
// import.meta.url gives us the file:// URL of this module.
// fileURLToPath converts it to an OS-native path (e.g., C:\...\config\index.js)
// dirname strips the filename, leaving just the directory path.
const __dir = dirname(fileURLToPath(import.meta.url));

// ── Generic JSON loader ──────────────────────────────────────────────────────
// Reads a JSON file from this directory synchronously and returns parsed object.
// Synchronous is fine here — this runs once at module load time, not per-request.
const load = (file) => JSON.parse(readFileSync(join(__dir, file), 'utf8'));

// ── Export all config objects ────────────────────────────────────────────────
// Each export name follows the pattern: [modulePrefix][ConfigType]
// - gkeUrls:      All API route paths (used by route files)
// - apiErrors:    All error message templates (used by route handlers)
// - apiMessages:  All success/info message templates (used by route handlers)
export const gkeUrls     = load('urls.json');
export const apiErrors   = load('APIErrors.json');
export const apiMessages = load('APIMessages.json');
