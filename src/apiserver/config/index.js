// ============================================================================
// Config Loader — PulseOps V2 API
//
// PURPOSE: Merges environment variables with JSON defaults from app.json
// and DatabaseConfig.json. Follows 12-factor app principles — env vars
// take precedence over JSON file values.
//
// CONFIG FILES LOADED:
//   - app.json           → Server, auth, CDN settings
//   - DatabaseConfig.json → Database connection settings (separate for CRUD)
//
// USAGE: import { config } from './config/index.js';
//
// ARCHITECTURE: This file is the SINGLE source of truth for all runtime
// configuration. Modules and middleware import from here — never from
// individual JSON files directly (except loadJson utility for messages).
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load JSON defaults
const appJsonPath = path.join(__dirname, 'app.json');
const dbJsonPath = path.join(__dirname, 'DatabaseConfig.json');
const urlsJsonPath = path.join(__dirname, 'urls.json');
const defaults = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
const dbDefaults = JSON.parse(fs.readFileSync(dbJsonPath, 'utf-8'));
const urlsDefaults = JSON.parse(fs.readFileSync(urlsJsonPath, 'utf-8'));

/**
 * Re-read DatabaseConfig.json from disk and update config.db in place.
 * Called after POST /database/save-config to pick up changes immediately.
 */
export function reloadDbConfig() {
  const fresh = JSON.parse(fs.readFileSync(dbJsonPath, 'utf-8'));
  config.db.host = process.env.DB_HOST || fresh.host;
  config.db.port = parseInt(process.env.DB_PORT || fresh.port, 10);
  config.db.name = process.env.DB_NAME || fresh.database;
  config.db.user = process.env.DB_USER || fresh.user;
  config.db.password = process.env.DB_PASSWORD || fresh.password;
  config.db.schema = process.env.DB_SCHEMA || fresh.schema;
  config.db.ssl = process.env.DB_SSL === 'true' || fresh.ssl || false;
  config.db.poolSize = parseInt(process.env.DB_POOL_SIZE || fresh.poolSize, 10);
  config.db.idleTimeoutMillis = parseInt(process.env.DB_IDLE_TIMEOUT || fresh.idleTimeoutMillis, 10);
  config.db.connectionTimeoutMillis = parseInt(process.env.DB_CONN_TIMEOUT || fresh.connectionTimeoutMillis, 10);
}

export const config = {
  // Server (centralized in urls.json)
  port: parseInt(process.env.PORT || urlsDefaults.server.api.port, 10),
  nodeEnv: process.env.NODE_ENV || defaults.nodeEnv,
  frontendOrigin: process.env.FRONTEND_ORIGIN || urlsDefaults.server.ui.url,
  apiPrefix: process.env.API_PREFIX || urlsDefaults.apiPrefix,

  // Database (from DatabaseConfig.json, overridable by env vars)
  db: {
    host: process.env.DB_HOST || dbDefaults.host,
    port: parseInt(process.env.DB_PORT || dbDefaults.port, 10),
    name: process.env.DB_NAME || dbDefaults.database,
    user: process.env.DB_USER || dbDefaults.user,
    password: process.env.DB_PASSWORD || dbDefaults.password,
    schema: process.env.DB_SCHEMA || dbDefaults.schema,
    ssl: process.env.DB_SSL === 'true' || dbDefaults.ssl || false,
    poolSize: parseInt(process.env.DB_POOL_SIZE || dbDefaults.poolSize, 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || dbDefaults.idleTimeoutMillis, 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT || dbDefaults.connectionTimeoutMillis, 10),
  },

  // Auth
  auth: {
    jwtSecret: process.env.JWT_SECRET || defaults.auth.jwtSecret,
    accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY || defaults.auth.accessTokenExpiry,
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || defaults.auth.refreshTokenExpiry,
    refreshSecret: process.env.REFRESH_SECRET || (defaults.auth.jwtSecret + '_refresh'),
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || defaults.auth.bcryptRounds, 10),
    jwtExpiresInSeconds: parseInt(process.env.JWT_EXPIRES_IN_SECONDS || defaults.auth.jwtExpiresInSeconds || 86400, 10),
    defaultPassword: process.env.DEFAULT_PASSWORD || 'Infosys@123',
  },

  // CORS
  cors: {
    origin: process.env.FRONTEND_ORIGIN
      ? process.env.FRONTEND_ORIGIN.split(',').map(s => s.trim())
      : [
          urlsDefaults.server.ui.url,
          'http://localhost:1001',
          'http://localhost:1002',
          'http://localhost:1003',
          'http://localhost:5173',
          'http://127.0.0.1:1001',
          'http://127.0.0.1:1002',
          'http://127.0.0.1:5173',
        ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },

  // CDN
  cdnBaseUrl: process.env.CDN_BASE_URL || defaults.cdnBaseUrl,
};
