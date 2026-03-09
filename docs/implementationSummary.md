# PulseOps V2 — Implementation Summary

> **Generated**: 2026-03-02  
> **Status**: Core platform implemented — API + UI end-to-end

---

## 1. What We Built

PulseOps V2 is an enterprise modular operations platform with:
- **React + Vite frontend** with hot-drop micro-frontend architecture
- **Express + PostgreSQL backend** with enterprise security
- **Dual-Auth Protocol** (JWT Bearer tokens + HttpOnly cookies)
- **Swagger API Explorer** for all endpoints
- **Zero hardcoded strings** — all text from JSON config files

---

## 2. End-to-End Flow: User → Browser → UI → API → Database

### Login Flow
```
User enters credentials in browser
  → LoginForm component captures email/password
  → App.jsx calls POST /api/auth/login (with credentials: 'include')
  → API auth middleware checks active provider (json_file or database)
    → json_file: validates against DefaultAdminUser.json
    → database: validates against system_users table (bcrypt hash compare)
  → On success: API generates JWT access + refresh tokens
  → API sets HttpOnly cookies (accessToken, refreshToken) on response
  → API also returns tokens in JSON body (for Swagger/Postman usage)
  → App.jsx stores accessToken in localStorage (for API tool auth)
  → App.jsx sets user state → renders PlatformDashboard
  → Browser navigates to /platform_admin/dashboard
```

### Database Configuration Flow
```
User navigates to Settings → Database Configuration tab
  → DatabaseConfigTab component renders TestConnection form
  → Auto-test on mount: POST /api/database/test-connection (with saved config)
  → ConnectionStatus shows connected/disconnected with latency + version
  → User edits fields and clicks "Test Connection"
    → POST /api/database/test-connection (with form values)
    → API creates temporary pg.Pool, runs SELECT version(), returns latency
  → User clicks "Save Configuration"
    → POST /api/database/save-config (with form values)
    → API writes to DatabaseConfig.json via saveJson utility
    → Config persisted for next API restart
```

### Database Objects Flow
```
User navigates to Settings → Database Objects tab
  → DatabaseObjectsTab checks GET /api/database/schema-status
  → Shows: connected?, schema initialized?, default data loaded?
  → User clicks "Create Database"
    → POST /api/database/create-database
    → API connects to 'postgres' DB, runs CREATE DATABASE "pulseops_v2"
  → User clicks "Create Schema"
    → POST /api/database/create-schema
    → API creates schema + 4 tables in a transaction:
      - system_users (auth), system_config (JSONB), system_modules (hot-drop), system_logs
  → User clicks "Load Default Data"
    → POST /api/database/load-default-data
    → API hashes admin password with bcrypt, inserts admin user + core modules
  → User clicks "Wipe Schema" (destructive, JWT required)
    → POST /api/database/wipe (Authorization: Bearer <token>)
    → API drops entire schema CASCADE
```

### Auth Provider Switching Flow
```
User navigates to Settings → Authentication tab
  → AuthSettingsTab shows provider cards (JSON File, Database, Social)
  → User selects "Database" provider → clicks "Switch Provider"
  → ConfirmationModal opens (3-phase: Confirm → Progress → Summary)
  → On confirm: POST /api/auth/config { provider: "database" }
    → API checks DB is initialized + has default data
    → API writes to auth-provider.json AND system_config table
  → Success: Summary modal shows provider changed
  → Next login will authenticate against PostgreSQL system_users table
```

---

## 3. Security Implementation

### Frontend Security
- **No credentials in frontend code** — coreAuth removed from app.json
- **JWT stored in localStorage** for API tool auth (Swagger/Postman)
- **HttpOnly cookies** set by API for browser session security (XSS-safe)
- **credentials: 'include'** on all fetch calls for cookie transmission
- **Authorization header** sent from localStorage for protected routes

### Backend Security (Middleware Chain Order)
1. **Helmet.js** — HTTP security headers (CSP, HSTS, XSS, clickjacking)
2. **Request ID** — UUID per request for distributed tracing
3. **Cookie Parser** — Parse HttpOnly cookies for dual-auth
4. **CORS** — Whitelist-based with credentials: true
5. **General Rate Limiter** — 100 requests / 15 minutes per IP
6. **JSON Body Parser** — 10MB limit
7. **Input Sanitizer** — Recursive XSS pattern stripping (script, iframe, event handlers)
8. **Request Logging** — Winston structured logging with duration tracking

### Authentication Security
- **JWT Access Tokens** — 24h expiry, signed with configurable secret
- **JWT Refresh Tokens** — 7d expiry, separate secret
- **bcrypt Password Hashing** — 12 rounds (configurable)
- **Dual-Auth Protocol** — Bearer header (API tools) + HttpOnly cookie (browser)
- **Token Differentiation** — Expired vs invalid tokens get different error codes
- **Auth Rate Limiting** — 10 login attempts / 15 minutes per IP
- **Role-Based Access Control** — requireRole middleware with audit logging

### Database Security
- **Parameterized Queries** — All SQL uses $1, $2, ... placeholders (no SQL injection)
- **Transactions** — Schema creation and data seeding use BEGIN/COMMIT/ROLLBACK
- **Connection Pooling** — Lazy singleton pg.Pool with configurable limits
- **Graceful Shutdown** — Pool closed on SIGTERM/SIGINT (K8s ready)

---

## 4. API Endpoints

### Health (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Liveness probe |
| GET | /api/health/readiness | Readiness probe (checks DB) |

### Authentication (Public + Protected)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/login | Public | Login with email/password |
| GET | /api/auth/config | Public | Get auth provider config |
| POST | /api/auth/config | JWT (super_admin) | Set auth provider |
| POST | /api/auth/refresh | Public | Refresh access token |
| POST | /api/auth/logout | JWT | Logout (clear cookies) |
| GET | /api/auth/me | JWT | Get current user profile |

### Database (Public + Protected)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/database/test-connection | Public | Test with server config |
| POST | /api/database/test-connection | Public | Test with custom config |
| POST | /api/database/save-config | Public | Save DB config to file |
| POST | /api/database/create-database | Public | Create database |
| DELETE | /api/database/delete-database | JWT | Drop database |
| GET | /api/database/schema-status | Public | Check schema state |
| POST | /api/database/create-schema | Public | Create schema + tables |
| POST | /api/database/load-default-data | Public | Seed admin + modules |
| DELETE | /api/database/load-default-data | Public | Clean default data |
| POST | /api/database/wipe | JWT | Drop schema CASCADE |
| GET | /api/database/stats | JWT | Table sizes |

### Configuration (Protected)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/config | JWT | List all config entries |
| GET | /api/config/:key | JWT | Get config by key |
| POST | /api/config | JWT (super_admin) | Create/update config |
| DELETE | /api/config/:key | JWT (super_admin) | Delete config |

### Swagger
- **UI**: http://localhost:4001/swagger-ui
- **JSON Spec**: http://localhost:4001/api-docs/swagger.json

---

## 5. Database Schema

All tables are created under the configurable schema (default: `pulseops`).

### system_users
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-increment ID |
| email | VARCHAR(255) UNIQUE | User email (login identifier) |
| password_hash | VARCHAR(255) | bcrypt hash |
| name | VARCHAR(255) | Display name |
| role | VARCHAR(50) | Role (super_admin, admin, user) |
| status | VARCHAR(20) | active / inactive |
| last_login | TIMESTAMPTZ | Last login timestamp |
| created_at | TIMESTAMPTZ | Record creation |
| updated_at | TIMESTAMPTZ | Last update |

### system_config
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-increment ID |
| key | VARCHAR(255) UNIQUE | Config key (e.g., auth_provider) |
| value | JSONB | Config value (any JSON structure) |
| description | TEXT | Human-readable description |
| created_at | TIMESTAMPTZ | Record creation |
| updated_at | TIMESTAMPTZ | Last update |

### system_modules
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-increment ID |
| module_id | VARCHAR(100) UNIQUE | Module identifier (e.g., platform_admin) |
| name | VARCHAR(255) | Display name |
| version | VARCHAR(50) | Semantic version |
| description | TEXT | Module description |
| is_core | BOOLEAN | Core module (cannot disable) |
| enabled | BOOLEAN | Module enabled state |
| schema_initialized | BOOLEAN | Module schema created |
| order | INTEGER | Sort order in navigation |
| installed_at | TIMESTAMPTZ | Installation timestamp |
| updated_at | TIMESTAMPTZ | Last update |

### system_logs
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-increment ID |
| level | VARCHAR(10) | Log level (info, warn, error, debug) |
| source | VARCHAR(100) | Log source (module/service) |
| message | TEXT | Log message |
| data | JSONB | Additional structured data |
| user_id | INTEGER | Associated user ID |
| created_at | TIMESTAMPTZ | Log timestamp |

---

## 6. Config File Architecture

### API Config Files (api/src/config/)
| File | Purpose | Mutable at Runtime? |
|------|---------|---------------------|
| app.json | Server port, auth secrets, CDN URL | No (restart needed) |
| DatabaseConfig.json | PostgreSQL connection settings | Yes (via /database/save-config) |
| DefaultAdminUser.json | Default admin user for JSON auth | No |
| auth-provider.json | Active auth provider | Yes (via /auth/config) |
| APIMessages.json | All API success messages | No |
| APIErrors.json | All API error messages | No |
| swagger.json | OpenAPI 3.0 specification | No |

### Frontend Config Files (src/config/)
| File | Purpose |
|------|---------|
| app.json | App name, version, core module IDs |
| urls.json | All API endpoint URLs (nested) |
| globalText.json | Platform-wide UI text |
| UIErrors.json | UI error messages |
| UIMessages.json | UI success messages |
| uiElementsText.json | Hierarchical UI element text |

---

## 7. File Inventory (New/Modified This Session)

### New API Files
- `api/src/config/DatabaseConfig.json`
- `api/src/config/DefaultAdminUser.json`
- `api/src/config/auth-provider.json`
- `api/src/config/APIMessages.json`
- `api/src/config/APIErrors.json`
- `api/src/config/swagger.json`
- `api/src/shared/loadJson.js`
- `api/src/core/database/databaseService.js`
- `api/src/core/routes/healthRoutes.js`
- `api/src/core/routes/databaseRoutes.js`
- `api/src/core/routes/authRoutes.js`
- `api/src/core/routes/configRoutes.js`

### Modified API Files
- `api/src/app.js` — Full rewrite with 14-step middleware chain
- `api/src/server.js` — Winston logging + graceful DB shutdown
- `api/src/config/index.js` — Loads DatabaseConfig.json, adds CORS config
- `api/src/config/app.json` — Removed database section, added jwtExpiresInSeconds
- `api/src/shared/logger.js` — Upgraded to Winston
- `api/src/core/middleware/auth.js` — Full JWT + bcrypt implementation
- `api/src/core/middleware/security.js` — Helmet + rate limiting + XSS sanitizer

### New Frontend Files
- `src/config/UIErrors.json`
- `src/config/UIMessages.json`
- `src/config/uiElementsText.json`

### Modified Frontend Files
- `src/config/app.json` — Removed coreAuth section
- `src/config/urls.json` — Added saveConfig endpoint
- `src/config/globalText.json` — Added auth.login messages
- `src/core/App.jsx` — API-based auth instead of hardcoded credentials
- `src/core/views/Settings.jsx` — Fixed all URL references to nested structure

---

## 8. Running the System

### Start API
```bash
cd api
npm run dev          # nodemon on port 4001
# or
node src/server.js   # direct start
```

### Start Frontend
```bash
npm run dev          # Vite on port 5173
```

### Default Credentials
- **Email**: admin@test.com
- **Password**: Infosys@123

### First-Time Setup (via UI)
1. Login with default credentials (JSON file auth)
2. Go to Settings → Database Configuration → enter PostgreSQL connection details → Test → Save
3. Go to Settings → Database Objects → Create Database → Create Schema → Load Default Data
4. Go to Settings → Authentication → Switch from "JSON File" to "Database" provider
5. All subsequent logins will authenticate against PostgreSQL

### Swagger
- Open http://localhost:4001/swagger-ui
- Click "Authorize" → paste Bearer token from login response
- Test all endpoints interactively
