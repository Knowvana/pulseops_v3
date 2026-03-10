// ============================================================================
// Module Template — Shared API Helpers
//
// PURPOSE: Shared utilities used across all route files in this module.
//   - Database file resolver (Schema.json, DefaultData.json)
//   - Platform constants (dbSchema, MODULE_ID)
//
// USED BY: All route files in api/routes/
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseService from '#core/database/databaseService.js';
import { config as appConfig } from '#config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Module constants ────────────────────────────────────────────────────────
// CHANGE THIS to your module ID
export const MODULE_ID = '_template';
export const dbSchema = appConfig.db.schema || 'pulseops';
export { DatabaseService };

// ── Database file resolver ──────────────────────────────────────────────────
// Locates Schema.json or DefaultData.json relative to this file.
// Works in both production (dist-modules/) and development (src/modules/).
export function resolveModuleDbFile(filename) {
  // Production path: dist-modules/<moduleId>/database/
  const distPath = path.resolve(__dirname, '..', '..', 'database', filename);
  if (fs.existsSync(distPath)) return distPath;
  // Dev fallback: src/modules/<moduleId>/database/
  const srcPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', MODULE_ID, 'database', filename);
  if (fs.existsSync(srcPath)) return srcPath;
  return null;
}

export const SCHEMA_JSON_FILE = 'Schema.json';
export const DEFAULT_DATA_FILE = 'DefaultData.json';
