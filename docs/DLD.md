# PulseOps V3 — Detailed Low Level Design (DLD)

## 1. Frontend Architecture

### 1.1 Entry Point (`src/main.jsx`)
- Mounts `<App />` into `#root` DOM element
- Wraps with `<BrowserRouter>` for client-side routing
- Imports global styles from `index.css`

### 1.2 App Component (`src/client/core/App.jsx`)
- **Router configuration** — Defines all routes using `react-router-dom` v7
- **Auth gating** — Wraps protected routes with `<AuthProvider>`
- **Module integration** — Dynamically renders module views from `moduleRegistry.js`
- **Layout wrapping** — Uses `<AppShell>` for authenticated pages

### 1.3 Layout System

| Component | File | Responsibility |
|-----------|------|---------------|
| `AppShell` | `layouts/AppShell.jsx` | Main layout wrapper: sidebar + top menu + content area |
| `LeftSideNavBar` | `layouts/LeftSideNavBar.jsx` | Sidebar navigation with module nav items |
| `TopMenu` | `layouts/TopMenu.jsx` | Top bar with module tabs, user menu, notifications |
| `RightLogsView` | `layouts/RightLogsView.jsx` | Slide-out real-time logs panel |
| `MainContent` | `layouts/MainContent.jsx` | Scrollable content area wrapper |

### 1.4 Core Views

#### Settings.jsx (57KB — largest view)
Contains 7 tab components rendered via `ConfigLayout`:

| Tab Component | Tab ID | Functionality |
|---------------|--------|--------------|
| `DatabaseConfigTab` | `dbConfig` | PostgreSQL host/port/user/password/database config + test connection |
| `LogConfigTabNew` | `logConfig` | Enable/disable logging, log level, capture options, management |
| `AuthSettingsTab` | `authSettings` | Auth provider toggle (json_file / database) |
| `SuperAdminAuthTab` | `superAdminAuth` | Change SuperAdmin password |
| `DatabaseSetupTab` | `databaseSetup` | Create schema, seed data, manage DB objects |
| `GeneralSettingsTab` | `generalSettings` | Timezone, locale preferences |

Each tab:
- Loads its own state on mount via `useEffect`
- Uses `useCallback` for API calls
- Passes data to shared components (`TestConnection`, `ConnectionStatus`, `ConfirmationModal`)

#### LogManager.jsx (19KB)
- Fetches log stats from `/api/logs/stats`
- Renders `LogViewer` for browsing logs
- Renders `LogStats` for summary metrics
- Shows `ConfigurationAlertModal` when database is not configured
- Client-side search, filtering, and pagination

#### ModuleManager.jsx (20KB)
- Two tabs: Available modules + Installed modules
- Scans `dist-modules/` via `/api/modules/scan`
- Install/enable/disable/remove module lifecycle
- Real-time status indicators

### 1.5 Shared Components (Design System)

| Component | File | Purpose | Key Props |
|-----------|------|---------|-----------|
| `Button` | `Button.jsx` | Primary action button | `variant`, `size`, `icon`, `isLoading`, `onClick` |
| `ConfigLayout` | `ConfigLayout.jsx` | Vertical tab layout for settings | `tabs[]`, `defaultTab` |
| `ConfigurationAlertModal` | `ConfigurationAlertModal.jsx` | Overlay alert for missing config | `variant`, `header`, `messageDetail`, `onAction` |
| `ConfirmationModal` | `ConfirmationModal.jsx` | Confirm/cancel dialog with summary | `title`, `actionDescription`, `action()`, `buildSummary()` |
| `ConnectionStatus` | `ConnectionStatus.jsx` | DB connection status with progress bar | `status`, `message`, `progress`, `showBadge` |
| `CrudSummary` | `CrudSummary.jsx` | Summary of create/update/delete operations | `data`, `columns` |
| `DatabaseManager` | `DatabaseManager.jsx` | Schema creation and management UI | `onSchemaCreate`, `onSeed` |
| `LogStats` | `LogStats.jsx` | Log count and storage metrics | `stats` |
| `LogViewer` | `LogViewer.jsx` | Paginated log table with detail panel | `logs[]`, `pageSize`, `onSearch` |
| `LoggingConfig` | `LoggingConfig.jsx` | Log configuration form | `config`, `onSave` |
| `LoginForm` | `LoginForm.jsx` | Standard user login form | `onSubmit` |
| `PageLoader` | `PageLoader.jsx` | Full-page loading spinner | `message` |
| `StatsCount` | `StatsCount.jsx` | Stat card with icon and count | `label`, `value`, `icon`, `trend` |
| `SuperAdminLoginForm` | `SuperAdminLoginForm.jsx` | SuperAdmin login with prefilled username | `onSubmit` |
| `TestConnection` | `TestConnection.jsx` | Connection config form + test button | `fields[]`, `onTest`, `onSave`, `onTestResult` |
| `TestPage` | `TestPage.jsx` | Component showcase for development | — |

### 1.6 Services

| Service | File | Responsibility |
|---------|------|---------------|
| `UILogService` | `services/UILogService.js` | Buffers UI logs and pushes to `/api/logs/ui` |
| `TimezoneService` | `services/timezoneService.js` | Timezone formatting and conversion |
| `consoleLogger` | `services/consoleLogger.js` | `createLogger(source)` → structured console logging |

### 1.7 Context

| Context | File | State Provided |
|---------|------|---------------|
| `AuthContext` | `contexts/AuthContext.jsx` | `user`, `isAuthenticated`, `login()`, `logout()`, `refresh()` |

---

## 2. Backend Architecture

### 2.1 Express Application (`src/apiserver/app.js`)

Middleware chain (applied in order):
1. `requestId` — Generates unique correlation ID per request
2. `helmet()` — Security headers
3. `cors()` — Cross-origin configuration
4. `express.json()` — Body parsing
5. `cookieParser()` — JWT cookie parsing
6. `rateLimit` — Rate limiting on auth endpoints
7. Route mounting (see 2.3)
8. Swagger UI on `/api-docs`

### 2.2 Server (`src/apiserver/server.js`)

- Reads port from `config/urls.json`
- Calls `createApp()` from `app.js`
- Starts HTTP listener
- Graceful shutdown on SIGTERM/SIGINT

### 2.3 Route Architecture

| Route File | Mount Path | Auth Required | Purpose |
|-----------|-----------|--------------|---------|
| `healthRoutes.js` | `/api/health` | No | Liveness + readiness probes |
| `authRoutes.js` | `/api/auth` | Partial | Login, logout, refresh, me, provider |
| `superAdminRoutes.js` | `/api/auth/superadmin` | Partial | SuperAdmin login, profile, password |
| `databaseRoutes.js` | `/api/database` | Yes | Config CRUD, connection test, schema, stats |
| `logRoutes.js` | `/api/logs` | Yes | Log CRUD, stats, config |
| `configRoutes.js` | `/api/system/config` | Yes | System configuration |
| `generalSettingsRoutes.js` | `/api/settings` | Yes | General settings (timezone, locale) |
| `modulesRoutes.js` | `/api/modules` | Yes | Module lifecycle (scan, install, enable, disable) |

Module routes are dynamically mounted by the Module Gateway at `/api/<moduleId>/*`.

### 2.4 Database Service (`src/apiserver/core/database/databaseService.js`)

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `getPool()` | Returns singleton PostgreSQL connection pool |
| `testConnection()` | Tests DB connectivity, returns latency + version |
| `createSchema()` | Reads `DefaultDatabaseSchema.json` and creates tables/indexes |
| `seedData()` | Seeds default admin user and RBAC roles |
| `getSchemaStatus()` | Returns list of existing tables and their row counts |
| `dropSchema()` | Drops all managed tables (for reset) |

**Schema Definition** (`DefaultDatabaseSchema.json`):
- Single source of truth for all database tables
- Tables: `system_users`, `system_roles`, `user_roles`, `system_logs`, `system_config`
- Schema: `pulseops` (PostgreSQL schema namespace)
- Includes column definitions, constraints, indexes, and seed data references

### 2.5 Authentication Middleware (`src/apiserver/core/middleware/auth.js`)

```
Request → Extract JWT (cookie or Bearer header)
        → Verify signature + expiry
        → Decode payload (userId, role, authMethod)
        → Attach req.user
        → Next() or 401 Unauthorized
```

- SuperAdmin tokens include `authMethod: 'json_file'`
- Regular user tokens include `authMethod: 'database'`
- Role hierarchy enforced in route handlers, not middleware

### 2.6 Log Service (`src/apiserver/core/services/logService.js`)

| Function | Purpose |
|----------|---------|
| `insertUILogs(logs[])` | Batch insert UI logs into `system_logs` |
| `insertAPILog(log)` | Insert single API log |
| `getUILogs(filters)` | Query UI logs with pagination + filters |
| `getAPILogs(filters)` | Query API logs with pagination + filters |
| `getAllStats()` | Aggregate log counts by type |
| `deleteLogs(type)` | Delete logs by type or all |

All logs use `log_type` discriminator: `'ui_log'` or `'api_log'`.

### 2.7 Module System

#### Module Gateway (`src/apiserver/core/modules/`)

| Component | Purpose |
|-----------|---------|
| `moduleGateway.js` | Registers/unregisters module API routes at runtime |
| `moduleScanner.js` | Scans `dist-modules/` for compiled module bundles |
| `dynamicRouteLoader.js` | Dynamically imports module `api/index.js` and mounts routes |

#### Module Lifecycle

```
Scan → Discover (constants.json) → Install (register in ModulesConfig.json)
     → Enable (load API routes + mark active) → Disable (unload routes)
     → Remove (unregister from config)
```

#### Module API Contract (`api/index.js`)

```javascript
export default {
  router,                    // Express Router instance
  onEnable: async () => {},  // Called when module is enabled
  onDisable: async () => {}, // Called when module is disabled
};
```

### 2.8 Shared Utilities

| Utility | File | Purpose |
|---------|------|---------|
| `logger` | `shared/logger.js` | Winston logger with structured JSON output |
| `loadJson` / `saveJson` | `shared/loadJson.js` | Read/write JSON config files from `config/` |

---

## 3. Module Architecture (ServiceNow Example)

### 3.1 Structure
```
src/modules/servicenow/
├── api/
│   ├── index.js              # Express router + onEnable/onDisable hooks
│   ├── servicenowRoutes.js   # Route handlers
│   ├── servicenowService.js  # Business logic, ServiceNow Table API client
│   └── config/               # Module API config
├── ui/
│   ├── manifest.jsx          # Module manifest (contract with platform)
│   ├── config/
│   │   ├── constants.json    # Module metadata (id, name, version)
│   │   ├── uiText.json       # All UI strings
│   │   ├── urls.json         # Module API endpoints
│   │   ├── uiErrors.json     # Error messages
│   │   └── uiMessages.json   # Success messages
│   └── components/
│       ├── ServiceNowDashboard.jsx   # Dashboard view
│       ├── ServiceNowIncidents.jsx   # Incident list view
│       ├── ServiceNowReports.jsx     # Reports view
│       └── config/                   # Config tab components
└── README.md
```

### 3.2 API Endpoints (mounted at `/api/servicenow/`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/config` | Get connection config (token redacted) |
| PUT | `/config` | Save connection + SLA + sync settings |
| POST | `/config/test` | Test ServiceNow connectivity |
| GET | `/stats` | Dashboard statistics |
| GET | `/incidents` | Paginated + filtered incidents |
| POST | `/sync` | Manual data synchronization |
| GET | `/reports` | SLA compliance + volume reports |

### 3.3 Data Flow
```
ServiceNow Instance (Table API)
        │ HTTPS + Basic Auth
        ▼
servicenowService.js (fetch + normalize + cache)
        │ In-memory cache (5-min TTL)
        ▼
servicenowRoutes.js (Express handlers)
        │ JSON response
        ▼
React Views (Dashboard, Incidents, Reports)
```

---

## 4. Reusable Components Architecture

### 4.1 Location
`src/ReusableComponents/` — Cross-cutting components used by core UI, modules, and templates.

### 4.2 Theme System
All reusable components share a common theme defined in `theme.js`:
- **Default gradient**: Teal/green brand gradient (`brand-400` → `brand-600`)
- **Status colors**: Success (green), Warning (amber), Error (red), Info (brand)
- **Surface colors**: Slate-based neutrals for backgrounds and borders
- Components accept `variant` prop to switch between status color schemes

### 4.3 Import Pattern
```javascript
import { ActionButton, StatusBadge, ProgressBar } from '@components';
```

### 4.4 Component Design Principles
1. **Props-driven** — All behavior controlled via props, no internal API calls
2. **Theme-aware** — Uses common theme tokens, supports variant overrides
3. **Composable** — Components can be combined to build complex UI
4. **Zero hardcoded text** — Labels and messages passed as props
5. **Accessible** — Proper ARIA attributes, keyboard navigation

---

## 5. Configuration File Reference

### 5.1 Frontend Config (`src/client/config/`)

| File | Purpose | Key Fields |
|------|---------|------------|
| `urls.json` | All API endpoints + UI routes | `server`, `auth`, `database`, `logs`, `modules`, `UIRoutes` |
| `uiElementsText.json` | All UI text strings | Nested by view/component |
| `app.json` | App metadata | `name`, `version` |
| `UIErrors.json` | Client error messages | Error code → message map |
| `UIMessages.json` | Client success messages | Message key → text map |

### 5.2 Backend Config (`src/apiserver/config/`)

| File | Purpose | Mutable at Runtime? |
|------|---------|-------------------|
| `DatabaseConfig.json` | PostgreSQL connection | Yes (via Settings) |
| `DefaultSuperAdmin.json` | SuperAdmin credentials | Yes (password change) |
| `DefaultAdminUser.json` | Default admin seed data | No |
| `LogsConfig.json` | Logging enabled/level/options | Yes (via Settings) |
| `ModulesConfig.json` | Module registry state | Yes (install/enable/disable) |
| `auth-provider.json` | Auth provider setting | Yes (via Settings) |
| `GeneralSettings.json` | Timezone, locale | Yes (via Settings) |
| `ServiceNowConfig.json` | ServiceNow connection | Yes (via module config) |
| `APIErrors.json` | API error messages | No |
| `APIMessages.json` | API success messages | No |
| `swagger.json` | OpenAPI specification | No |

---

## 6. Database Schema

**Schema namespace**: `pulseops`

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `system_users` | User accounts | `id`, `email`, `password_hash`, `name`, `status` |
| `system_roles` | RBAC role definitions | `id`, `name`, `level`, `description` |
| `user_roles` | User-role assignments | `user_id`, `role_id` |
| `system_logs` | Unified UI + API logs | `id`, `log_type`, `level`, `source`, `message`, `session_id`, `correlation_id` |
| `system_config` | Key-value system config | `key`, `value`, `category` |

Schema is defined in `DefaultDatabaseSchema.json` and created dynamically by `databaseService.js`.

---

## 7. API Response Format

All API responses follow a consistent envelope:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error description",
    "code": "MACHINE_READABLE_CODE",
    "requestId": "correlation-id"
  }
}
```

---

## 8. Build System

### 8.1 UI Build (Vite)
```bash
npm run build    # Outputs to dist/
```
- Tree-shaking, code splitting, asset optimization
- Path aliases resolved at build time

### 8.2 Module Build
```bash
npm run build:module -- <module-id>    # Outputs to dist-modules/<module-id>/
```
- Uses `vite.module.config.js`
- Outputs: `manifest.js` (compiled UI), `constants.json` (metadata), `api/` (copied as-is)
- External dependencies (React, react-router-dom) are excluded from bundle

### 8.3 API
No build step — Node.js runs ES modules directly via `--experimental-specifier-resolution=node`.
