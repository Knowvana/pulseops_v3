// ============================================================================
// JSON Loader Utility — PulseOps V2 API
//
// PURPOSE: Load JSON config files using fs.readFileSync. Provides a reusable
// utility for loading any JSON file from the config directory, plus pre-loaded
// exports for commonly used config files (messages, errors).
//
// USAGE:
//   import { loadJson, messages, errors } from '../shared/loadJson.js';
//   const customConfig = loadJson('MyConfig.json');
//
// WHY: Avoids experimental Node.js import assertions for JSON modules.
// All API messages and errors come from JSON files — no inline strings.
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.resolve(__dirname, '../config');

/**
 * Load and parse a JSON file from the config directory.
 * @param {string} relativePath - Path relative to api/src/config/
 * @returns {Object} Parsed JSON object
 */
export function loadJson(relativePath) {
  const fullPath = path.resolve(configDir, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

/**
 * Write a JSON object back to a config file.
 * @param {string} relativePath - Path relative to api/src/config/
 * @param {Object} data - Object to serialize and write
 */
export function saveJson(relativePath, data) {
  const fullPath = path.resolve(configDir, relativePath);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
}

// Pre-loaded config exports for convenience
export const messages = loadJson('APIMessages.json');
export const errors = loadJson('APIErrors.json');
