// ============================================================================
// Accessio Operations Module — Config Loader
//
// Exports all JSON config objects using readFileSync so this works on every
// Node.js version (no import-assertion / import-attribute support needed).
//
// Import via: #modules/accessio_ops/api/config/index.js
// ============================================================================
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const load  = (file) => JSON.parse(readFileSync(join(__dir, file), 'utf8'));

export const aoUrls      = load('urls.json');
export const apiErrors   = load('APIErrors.json');
export const apiMessages = load('APIMessages.json');
