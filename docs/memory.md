# PulseOps V2 — Development Memory

> **Auto-updated by Cascade after each work session.**
> Last updated: 2026-06-28 (Session 6)

---

## 1. Project Overview

PulseOps V2 is an enterprise modular operations platform with a plug-and-play module architecture and Kubernetes-ready stateless deployment. The platform consists of:

- **Frontend (UI)**: React + Vite + TailwindCSS at `src/`
- **Backend (API)**: Express + pg (node-postgres) at `api/`
- **Hot-Drop Modules**: Built independently → dropped into `dist-modules/` → discovered at runtime

### Key URLs
> **Centralized Configuration**: All URLs and ports defined in `src/config/urls.json` and `api/src/config/urls.json`

- UI Dev Server: `http://localhost:1001`
- API Server: `http://localhost:4001`
- Swagger: `http://localhost:4001/api-docs`
- Configuration files: `src/config/urls.json`, `api/src/config/urls.json`
- Vite config references: `vite.config.js` imports from `urls.json`
- API config references: `api/src/config/index.js` imports from `urls.json`

### Default Credentials
- Email: `admin@test.com`
- Password: `Infosys@123`

---

## 2. Architecture

### Core System vs Modules
| Type | Example | Location | Loaded How | Can Remove? |
|------|---------|----------|------------|-------------|
| **Core System** | Admin (Dashboard, ModuleManager, LogManager, Settings) | `src/core/views/` | Hardcoded in PlatformDashboard | No |
| **Add-on Module** | Custom hot-drop modules | `src/modules/<id>/` or `dist-modules/<id>/` | Dynamic `import()` from URL at runtime | Yes |

### Folder Structure (V2 Key Difference from V1)
- `src/config/` — Global frontend config (urls.json, uiElementsText.json, app.json). **NOT inside shared/**.
- `src/core/` — App bootstrap (App.jsx), PlatformDashboard (single orchestrator for core + modules).
- `src/core/views/` — Native core Admin views (AdminDashboard, ModuleManager, LogManager, Settings). **Admin is NOT a module — it is core system.**
- `src/layouts/` — Global layout components (AppShell, TopMenu, LeftSideNavBar, RightLogsView, MainContent). **Elevated to top-level, NOT in shared/**.
- `src/shared/` — Design system components, services, hooks. NO config files, NO layouts.
- `src/modules/` — Self-contained pluggable add-on modules ONLY. **No core/admin module here.**
- `api/` — Stateless Express backend.
- `dist-modules/` — Compiled hot-drop module bundles.

### Import Aliases
**Frontend (jsconfig.json + vite.config.js):**
- `@config/*` → `src/config/*`
- `@core/*` → `src/core/*`
- `@modules/*` → `src/modules/*`
- `@shared/*` → `src/shared/*`
- `@shared` → `src/shared/index.js` (barrel export)
- `@layouts/*` → `src/layouts/*`
- `@layouts` → `src/layouts/index.js` (barrel export)

**Backend (api/package.json `imports`):**
- `#config/*` → `./src/config/*`
- `#shared/*` → `./src/shared/*`
- `#core/*` → `./src/core/*`
- `#root/*` → `./src/*`

---

## 3. Completed Tasks

| # | Task | Status |
|---|------|--------|
| T1 | Repository scaffolding (frontend + backend + testing + rules) | DONE |
| T2 | Update design tokens to teal theme (brand colors) | DONE |
| T3 | Update Button component to match login button styling | DONE |
| T4 | Fix LoginForm button gradient rendering | DONE |
| T5 | Create reusable Button component with LoginForm gradient theme | DONE |
| T6 | Create ButtonShowcase for visual testing | DONE |
| T7 | Theming consistency analysis and documentation | DONE |
| T8 | App Shell Architecture (TopMenu, LeftSideNavBar, RightLogsView, MainContent, AppShell) | DONE |
| T9 | Native Core Views (AdminDashboard, ModuleManager, LogManager, Settings) | DONE |
| T10 | Settings UI with 5 ConfigLayout tabs (DB Config, DB Objects, Log Settings, Log Config, Auth) | DONE |
| T11 | App.jsx rewrite with core routes + dynamic module catch-all inside AppShell | DONE |
| T12 | PlatformDashboard refactor to pure dynamic module orchestrator | DONE |
| T13 | @layouts alias added to .windsurfrules, jsconfig.json, vite.config.js | DONE |
| T14 | globalText.json expanded with coreNav, coreViews, topNav, sideNav, rightPanel sections | DONE |
| T15 | CSS animations (fade-in, scale-in, slide-down) + scrollbar-hide utility | DONE |
| T16 | Architecture correction: Admin is core system, NOT a module. Deleted src/modules/admin/ | DONE |
| T17 | TopMenu rewrite to V1 design: white bg, gradient accent line, dynamic module tabs | DONE |
| T18 | LeftSideNavBar rewrite to V1 design: header+collapse at top, gradient active state | DONE |
| T19 | AppShell rewrite: module-driven props-only, matches V1 AppShell exactly | DONE |
| T20 | PlatformDashboard: single orchestrator — core Admin views + dynamic module views | DONE |
| T21 | App.jsx: thin auth wrapper, URL-driven PlatformDashboard orchestrator | DONE |
| T22 | moduleRegistry.js: dynamic-only (no core modules), V1-style getAllManifests API | DONE |

## Recent Updates (2026-06-28 — Session 6: SuperAdmin + RBAC + Settings Overhaul)

### SuperAdmin Authentication (Backend)
- **`api/src/config/DefaultSuperAdmin.json`** — SuperAdmin credential store (bcrypt-hashed password, requirePasswordChange flag, role: super_admin)
- **`api/src/core/routes/superAdminRoutes.js`** — Dedicated routes:
  - `POST /api/auth/superadmin/login` — Authenticates against JSON file (not database), returns JWT
  - `PATCH /api/auth/superadmin/password` — Updates hashed password in JSON file
  - `GET /api/auth/superadmin/profile` — Returns SuperAdmin profile (name, email, role)
- **`api/src/app.js`** — Mounts superAdminRoutes at `/api/auth`
- **`api/src/core/routes/authRoutes.js`** — Removed `json_file` provider entirely; regular users always authenticate against the database

### RBAC Schema (Backend)
- **`api/src/config/DefaultDatabaseSchema.json`** — Schema now includes RBAC tables: `system_roles`, `system_permissions`, `system_role_permissions`, `system_user_roles`
- **`api/src/core/database/databaseService.js`** — `createSchema()` creates RBAC tables + indexes; `loadDefaultData()` seeds roles (super_admin, admin, operator, user, viewer) and permissions
- **`api/src/config/auth-provider.json`** — Removed `json_file` from available providers; valid options: `database`, `social`

### Logging (Backend)
- **`api/src/core/routes/logRoutes.js`** — Renamed `/settings` → `/config`; added `enabled` flag check; `PUT /api/logs/config` for updating logging settings
- **`api/src/core/services/logService.js`** — Added `updateConfig(cfg)` method; `getConfig()` reloads from file; storage always `database`
- **`api/src/config/LogsConfig.json`** — Added `enabled` boolean flag and `captureOptions` + `management` sections

### SuperAdmin Login (Frontend)
- **`src/shared/components/SuperAdminLoginForm.jsx`** — Dark theme (slate-900), username "SuperAdmin" prefilled + read-only, password with show/hide, amber accent branding. Uses `createLogger` directly from `@shared/services/consoleLogger` (avoids circular import via barrel).
- **`src/shared/contexts/AuthContext.jsx`** — `AuthProvider` + `useAuthContext` hook. ROLE_PERMISSIONS matrix (super_admin → all, admin → broad, operator → operational, user → basic, viewer → read-only). Helpers: `hasRole`, `can`, `canAll`, `canAny`, `isSuperAdmin`.
- **`src/core/App.jsx`** — `BrowserRouter` at root. Routes: `/login/super-admin` → `SuperAdminLoginWrapper` (pre-auth outer route), `*` → `AppContent`. `AppContent` handles session check + both login flows. `AuthProvider` wraps `PlatformDashboard` when authenticated.
- **`src/shared/index.js`** — Exports: `SuperAdminLoginForm`, `AuthProvider`, `useAuthContext`

### Settings UI Restructure (Frontend)
- **`src/core/views/Settings.jsx`** — Complete restructure:
  - **Removed**: `LogSettingsTab` (file/database toggle — storage is always database now)
  - **New `DatabaseConnectionTab`**: Auto-checks DB connection on tab open (`initRan` guard), Re-check button, shows `ConnectionStatus`
  - **New `LogConfigTab`** (replaces old LogConfigTab + LogSettingsTab): enabled toggle, DB connection tester, log level selector (debug/info/warn/error), capture options (UI/API/Console/ModuleLogs toggles), management settings (maxUiEntries, maxApiEntries, pushIntervalMs). Saves via `PUT /api/logs/config`
  - **Updated `AuthSettingsTab`**: Removed `json_file` option. Only `database` + `social (Coming Soon)`. Now also loads current provider from API on mount.
  - **New `SuperAdminAuthTab`**: Profile card (fetched from `/api/auth/superadmin/profile`), 3-field password change form (current/new/confirm), regex validation (12+ chars, upper+lower+digit+special), `ConfirmationModal`.
  - **`DatabaseObjectsTab`** → relabeled "Database Setup" under SuperAdmin section
  - **Tab order**: `dbConnection` → `dbConfig` → `logConfig` → `authSettings` → `[SuperAdmin]` → `superAdminAuth` → `databaseSetup` → `[General]` → `generalSettings`
  - **Default tab**: `dbConnection`
- **`src/config/uiElementsText.json`** — New keys: `tabs.dbConnection`, `tabs.superAdminAuth`, `tabs.databaseSetup`; new sections: `dbConnection{}`, `superAdminAuth{}`, `databaseSetup{}`, `logConfig{}`; updated `authSettings.subtitle`; removed `json_file` from `authSettings.providers`

### Structured Logging (Frontend — Task 9)
All raw `console.log/warn/error` calls replaced with `createLogger` in:
- `LoginForm.jsx`, `TestConnection.jsx`, `moduleRegistry.js`, `TestPage.jsx`
- Only intentional raw console calls remain in `consoleLogger.js` and `uiLogger.js` (logger internals)

### consoleLogger Import Pattern
Components that are also exported from `@shared` barrel must import `createLogger` **directly**:
```js
import { createLogger } from '@shared/services/consoleLogger'; // avoids circular import
```

---

## Previous (2026-03-03 — Session 5: ConfirmationModal Restructuring & .windsurfrules Compliance)

### ConfirmationModal Reusable Pattern (Finding 9)
- **Restructured** `ConfirmationModal` to show action details FIRST, then ask for confirmation
- **New props**:
  - `actionDescription` — What action will be performed (e.g., "create the Database")
  - `actionTarget` — Where action will be performed (e.g., "Backend PostgreSQL")
  - `actionDetails` — Array of `{ label, value }` pairs showing what will be affected
- **Message format**: "This will [actionDescription] in [actionTarget]" followed by details box, then "Please confirm this action."
- **Icon moved to header left** — Displays variant-specific icon next to title in header
- **Reusable across all CRUD operations** — Every confirmation modal now follows the same structured format

### DatabaseManager .windsurfrules Compliance (Finding 10)
- **CRITICAL FIX**: Removed ALL hardcoded strings per `.windsurfrules` Section 1.4
- **Database config fetched from API**: `useEffect` fetches config from `urls.database.saveConfig` endpoint
  - Database name, schema, tables, defaultAdmin email all come from API
  - No database config stored in UI project
- **UI element labels**: `uiElementsText.json` → `uiText.admin.settings.databaseObjects.confirmations`
- **Messages**: `UIMessages.json` → `messages.database.confirmations`
- **All 6 CRUD modals now config-driven**:
  - Create Database, Delete Database, Initialize Schema, Load Default Data, Clean Default Data, Wipe Database
  - All titles, labels, descriptions, and values read from JSON files or API
  - Zero hardcoded strings remain

### Build Verified
- Frontend: `vite build` succeeds — 328.47 KB JS, 42.30 KB CSS
- Zero hardcoded strings in DatabaseManager.jsx
- Database config dynamically fetched from API on component mount

---

## Previous (2026-03-02 — Session 4: Integration Refinement)

### API Import Path Aliases (Finding 1)
- `api/package.json` — Added `imports` field with `#config`, `#shared`, `#core`, `#root` subpath aliases
- All API source files updated: zero relative imports (`./` or `../`) remain
- Files updated: server.js, app.js, auth.js, security.js, databaseService.js, healthRoutes.js, authRoutes.js, databaseRoutes.js, configRoutes.js

### Centralized API URLs (Finding 2)
- Created `api/src/config/urls.json` — All API endpoint paths in nested structure
- `api/src/app.js` — Route mounting and Swagger paths now read from urls.json
- `api/src/server.js` — Startup log URLs replaced with dynamic refs from urls.json

### Swagger Documentation (Finding 3)
- `api/src/config/swagger.json` — Complete rewrite with:
  - Relative `/api` server URL (no hardcoded localhost)
  - Full detailed documentation for every endpoint
  - Request/response schemas with datatypes, examples, formats
  - Security schemes for JWT Bearer + HttpOnly cookies

### Merged globalText.json → uiElementsText.json (Finding 5)
- All content from `globalText.json` merged into `uiElementsText.json`
- **globalText.json is now DEPRECATED — to be deleted**
- 9 files updated to import `uiText from '@config/uiElementsText.json'` instead of `globalText`
- Files: App.jsx, PlatformDashboard.jsx, Settings.jsx, AdminDashboard.jsx, LogManager.jsx, ModuleManager.jsx, TopMenu.jsx, LeftSideNavBar.jsx, RightLogsView.jsx
- Zero `globalText` references remain in the codebase

### Database ConnectionStatus Fix (Finding 6)
- `TestConnection.jsx` — Added `autoTest` prop for real-time connection check on mount
- Changed initial status from `loading` to `neutral` (no false "Connecting..." on idle)
- `Settings.jsx` `DatabaseConfigTab` — Simplified to use TestConnection's `autoTest={true}` with `initialConfig` from localStorage, removed duplicate auto-test logic

### CrudSummary Component (Finding 7)
- Created `src/shared/components/CrudSummary.jsx` — Standalone inline CRUD result display
- 4 statuses: idle, loading, success, error
- Props: title, message, details (label/value pairs), progress, onDismiss, variant (card/inline)
- Exported from `@shared` barrel

### Log Settings ConnectionStatus (Finding 8)
- `Settings.jsx` `LogSettingsTab` — Replaced "Current Mode" indicator with `ConnectionStatus` component
- Shows real-time log stats (file size, entries) fetched from `/api/logs/stats`
- Added `logs.stats` URL to both `src/config/urls.json` and `api/src/config/urls.json`

### Build Verified
- Frontend: `vite build` succeeds — 324.71 KB JS, 42.25 KB CSS

---

## Previous (2026-03-02 — Session 3: Full API + Security Implementation)

### API Config Files Created
- `api/src/config/DatabaseConfig.json` — PostgreSQL connection settings (host, port, database, schema, user, password, pool)
- `api/src/config/DefaultAdminUser.json` — Default admin user for JSON file auth (admin@test.com / Infosys@123)
- `api/src/config/auth-provider.json` — Active auth provider (json_file | database | social) with available providers
- `api/src/config/APIMessages.json` — All API success messages (no inline strings)
- `api/src/config/APIErrors.json` — All API error messages (no inline strings)
- `api/src/config/swagger.json` — OpenAPI 3.0 specification for all endpoints

### API Shared Utilities
- `api/src/shared/loadJson.js` — Load/save JSON config files (loadJson, saveJson, pre-loaded messages/errors)
- `api/src/shared/logger.js` — Upgraded from console placeholder to Winston structured logging

### API Security Middleware (Enterprise-Grade)
- `api/src/core/middleware/security.js` — Full rewrite:
  - Helmet.js HTTP security headers
  - Request ID (UUID) per request for distributed tracing
  - General rate limiter (100 req/15min)
  - Auth rate limiter (10 req/15min for login)
  - Recursive XSS input sanitizer (body/query/params)

### API Auth Middleware (Dual-Auth Protocol)
- `api/src/core/middleware/auth.js` — Full rewrite:
  - JWT access token generation/verification (jsonwebtoken)
  - JWT refresh token generation/verification (separate secret)
  - Password hashing with bcrypt (configurable rounds)
  - `authenticate` middleware: Bearer header first, HttpOnly cookie fallback
  - `requireRole` middleware: RBAC with logging
  - Expired vs invalid token differentiation

### API DatabaseService
- `api/src/core/database/databaseService.js` — Complete implementation:
  - Lazy singleton connection pool (pg)
  - Create/drop database
  - Test connection with latency + version info
  - Schema status check (schema exists, tables present, default data loaded)
  - Create schema: system_users, system_config, system_modules, system_logs
  - Load/clean default data (admin user with bcrypt hash, core modules)
  - Wipe database (drop schema cascade)
  - Database stats (table sizes)
  - Generic parameterized query
  - Graceful pool shutdown for K8s

### API Routes
- `api/src/core/routes/healthRoutes.js` — Liveness + readiness probes
- `api/src/core/routes/databaseRoutes.js` — 11 endpoints (test-connection, save-config, create-database, delete-database, schema-status, create-schema, load-default-data, clean-default-data, wipe, stats)
- `api/src/core/routes/authRoutes.js` — Multi-provider auth (json_file, database), login, refresh, logout, me, get/set auth config
- `api/src/core/routes/configRoutes.js` — CRUD for system_config table (JSONB key-value store)

### API App.js Rewrite
- Full 14-step middleware chain matching .windsurfrules Section 2.7
- Swagger UI at `/swagger-ui` with persist authorization
- Public routes: health, auth (with auth rate limiter), database
- Protected routes: config (JWT required)
- 404 handler, global error handler with structured logging

### API Config Loader Update
- `api/src/config/index.js` — Loads DatabaseConfig.json separately, adds CORS config, refresh secret, connection timeouts

### API Server Update
- `api/src/server.js` — Uses Winston logger, messages from JSON, graceful DB pool shutdown

### Frontend Changes
- `src/config/app.json` — Removed `coreAuth` section (credentials now in API's DefaultAdminUser.json)
- `src/core/App.jsx` — Rewritten: authenticates via API `/auth/login` endpoint, stores JWT in localStorage, HttpOnly cookies set by API, proper logout with API call
- `src/core/views/Settings.jsx` — Fixed all URL references to use nested urls.json structure (urls.database.testConnection, urls.database.saveConfig, etc.)
- `src/config/urls.json` — Added `saveConfig` endpoint under database
- `src/config/globalText.json` — Added auth.login messages (success, failed, networkError)
- `src/config/UIErrors.json` — Created: auth, database, config, validation, general error messages
- `src/config/UIMessages.json` — Created: auth, database, config, general success messages
- `src/config/uiElementsText.json` — Created: hierarchical UI element text (admin.settings.databaseConfiguration, etc.)

### API Dependencies Installed
- jsonwebtoken, bcryptjs, pg, express-rate-limit, winston, swagger-ui-express

### Build Verified
- Frontend: `vite build` succeeds — 324.91 KB JS, 41.64 KB CSS
- API: Starts successfully, all middleware loads, Swagger UI accessible

## Previous (2026-03-02 — Session 2)
- **Architecture Correction**: Admin is a CORE SYSTEM feature, NOT a module. Deleted `src/modules/admin/`
- **TopMenu V1 Design**: White background, gradient accent line, module tabs with icons, V1-matching user menu
- **Single Dashboard**: PlatformDashboard IS the dashboard — no separate AdminDashboard route
- **PlatformDashboard Orchestrator**: Single orchestrator handles BOTH core Admin views AND dynamic module views
- **Admin Tab**: Always first in TopMenu (hardcoded), its views defined in `CORE_ADMIN` constant in PlatformDashboard
- **Dynamic Module Tabs**: Appear after Admin when modules are enabled from Module Manager (hot-drop, zero downtime)
- **App.jsx Simplified**: Thin auth wrapper → BrowserRouter → PlatformDashboard
- **URL Pattern**: `/:moduleId/:viewId` for all navigation (core Admin = `/platform_admin/dashboard`)
- **LeftSideNavBar V1 Design**: Header with title + collapse toggle at top, gradient active state, badge support
- **AppShell V1 Design**: Module-driven props-only wrapper (TopMenu + SideNav + Main + RightPanel)
- **moduleRegistry.js**: Dynamic-only — no static core modules (Admin is core system, not a module)
- **Build Verified**: `vite build` succeeds — 311KB JS, 41KB CSS

### Previous (2026-03-02 — Session 1)
- App Shell Architecture built (layouts elevated to src/layouts/)
- Native Core Views created in src/core/views/
- Settings UI with 5 ConfigLayout tabs
- CSS animations and scrollbar utilities added

### Previous (2026-03-01)
- **Created Button.jsx**: Reusable button component with 5 variants (primary, secondary, danger, success, ghost)
- **LoginForm gradient theme**: All buttons use `from-brand-500 to-cyan-500` gradient matching LoginForm aesthetic
- **ButtonShowcase.jsx**: Comprehensive visual testing component showing all button variants, sizes, and states
- **Theming analysis**: Verified perfect alignment between index.css and tailwind.config.js color tokens

---

## 4. Important Patterns

### Design System Components
- **Button.jsx**: Primary variant uses gradient `from-brand-500 to-cyan-500` with teal theme colors
- Brand colors: teal (#14b8a6 for brand-500)
- Button styling matches login button: `transition-all`, `rounded-xl`, `font-bold`, shadow effects

### App Shell Layout Pattern (V1-matching)
- **AppShell.jsx** — Module-driven props-only wrapper: TopMenu + SideNav + Main + RightPanel
- **TopMenu.jsx** — White bg, gradient accent line, dynamic module tabs with icons, V1-style user dropdown, monitor toggle
- **LeftSideNavBar.jsx** — V1 SideNav: header with title + collapse toggle, gradient active state, badge support
- **RightLogsView.jsx** — Slide-out right panel for system logs and API calls (tabs + filter)
- All layout components are in `src/layouts/` and imported via `@layouts`

### Core Architecture (Admin is NOT a module)
- **Admin** is a core SYSTEM feature defined in `CORE_ADMIN` constant inside PlatformDashboard
- Admin views: Dashboard, ModuleManager, LogManager, Settings (all in `src/core/views/`)
- Admin tab is always first in TopMenu — hardcoded, cannot be disabled
- **Dynamic modules** appear as additional tabs after Admin when enabled
- **URL pattern**: `/:moduleId/:viewId` (e.g., `/platform_admin/dashboard`, `/auth/dashboard`)
- **PlatformDashboard** is the SINGLE orchestrator for BOTH core Admin views AND dynamic module views
- Authentication uses JSON file-based auth (app.json defaultAdmin) as default

### No Hardcoded Strings
- UI labels → `uiText.json` (per module) or `uiElementsText.json` (platform-wide)
- API URLs → `urls.json` (frontend: `src/config/urls.json`, API: `api/src/config/urls.json`)
- Module metadata → `constants.json`

### CRUD Patterns
- **ConfirmationModal**: 3-phase modal (Confirm → Progress → Summary) for destructive operations
- **CrudSummary**: Standalone inline component for operation results with progress + details
- UI text under `crud` key in `uiText.json`

### Module Manifest Contract
- Required fields: `id`, `name`, `version`, `description`, `icon`, `defaultView`, `navItems`, `getViews`
- Required navItems: `dashboard`, `config`, `reports`
- Metadata from `constants.json`, UI from `manifest.jsx`
- `moduleDetails` object required: features, author, license, dependencies

---

## 5. Tech Stack (Installed)

### Frontend
- React 19.2, ReactDOM 19.2
- Vite 7.3 (dev server + build)
- TailwindCSS 4 (via @tailwindcss/postcss + autoprefixer)
- react-router-dom (URL-driven routing)
- lucide-react (icon library)

### Backend (api/)
- Express 4.21
- cors 2.8, helmet 8.0, cookie-parser 1.4
- jsonwebtoken 9.x (JWT sign/verify)
- bcryptjs 3.x (password hashing)
- pg 8.x (node-postgres connection pool)
- express-rate-limit 7.x (rate limiting)
- winston 3.x (structured logging)
- swagger-ui-express 5.x (API explorer)
- nodemon 3.1 (dev)

### Testing
- Removed from V2 scaffold (no test harness tracked in repo at this stage)

---

## 6. Scaffolded File Inventory

### Root
- `.windsurfrules` — Enterprise coding standards (ported from V1, updated for V2)
- `.gitignore` — Node/React ignores
- `.env.example` — Env var template
- `jsconfig.json` — Path aliases (@config, @core, @modules, @shared)
- `vite.config.js` — Vite + aliases + proxy + vitest config
- `tailwind.config.js` — Design tokens mapping CSS vars to utilities
- `postcss.config.js` — @tailwindcss/postcss + autoprefixer
- `index.html` — Entry HTML
- `scripts/build-module.js` — Hot-drop module build script (placeholder)

### Frontend (src/)
- `main.jsx` — App bootstrap
- `index.css` — Design tokens (CSS variables) + Tailwind import + animations
- `config/urls.json` — All API URLs
- `config/uiElementsText.json` — Unified platform-wide UI strings (merged from globalText.json + original uiElementsText.json)
- `config/app.json` — App metadata + default credentials
- `core/App.jsx` — Thin auth wrapper + BrowserRouter → PlatformDashboard as single orchestrator
- `core/PlatformDashboard.jsx` — Single orchestrator for core Admin views + dynamic module views inside AppShell
- `core/views/AdminDashboard.jsx` — Native core dashboard view
- `core/views/ModuleManager.jsx` — Native module management view
- `core/views/LogManager.jsx` — Native system logs view
- `core/views/Settings.jsx` — Native settings view (ConfigLayout with 5 tabs: DB Config, DB Objects, Log Settings, Log Config, Auth)
- `layouts/AppShell.jsx` — Master layout wrapper (TopMenu + SideNav + MainContent + RightPanel)
- `layouts/TopMenu.jsx` — Global top navigation bar
- `layouts/LeftSideNavBar.jsx` — Collapsible left sidebar navigation
- `layouts/RightLogsView.jsx` — Right slide-out panel for logs and API calls
- `layouts/MainContent.jsx` — Scrollable main content area
- `layouts/index.js` — Layout barrel export
- `modules/moduleRegistry.js` — Dynamic-only module loading (no core modules, Admin is core system)
- `modules/_template/` — Full module template (manifest, constants, uiText, 3 views)
- `shared/index.js` — Barrel export
- `shared/components/Button.jsx` — Button with 5 variants
- `shared/components/LoginForm.jsx` — Login form with social auth placeholders
- `shared/components/ConfigLayout.jsx` — Vertical tabbed settings panel
- `shared/components/TestConnection.jsx` — Connection test form with status
- `shared/components/ConnectionStatus.jsx` — Connection status display
- `shared/components/DatabaseManager.jsx` — DB schema/data management
- `shared/components/LoggingConfig.jsx` — Logging configuration panel
- `shared/components/ConfirmationModal.jsx` — 3-phase CRUD modal
- `shared/components/CrudSummary.jsx` — Standalone inline CRUD result display
- `shared/components/StatsCount.jsx` — Horizontal count statistics
- `shared/services/apiClient.js` — HTTP client with auth support

### Frontend Config (src/config/)
- `app.json` — App metadata (coreAuth removed — credentials now in API)
- `urls.json` — All API URLs (nested: api, auth, database, modules, logs, config)
- `uiElementsText.json` — Unified UI text: platform, common, auth, login, coreNav, coreViews, topNav, sideNav, rightPanel, errors, admin, shared
- `UIErrors.json` — UI error messages (auth, database, config, validation, general)
- `UIMessages.json` — UI success messages (auth, database, config, general)
- `globalText.json` — **DEPRECATED: merged into uiElementsText.json, to be deleted**

### Backend (api/src/)
- `server.js` — Entry point with graceful shutdown + DB pool close + Winston logging
- `app.js` — Express factory with 14-step middleware chain (Helmet, RequestID, Cookie, CORS, RateLimit, JSON, Sanitizer, Logging, Swagger, Public Routes, Auth RateLimit, Protected Routes, 404, ErrorHandler)
- `config/index.js` — 12-factor config loader (loads app.json + DatabaseConfig.json)
- `config/app.json` — Server + auth config (database section removed, uses DatabaseConfig.json)
- `config/DatabaseConfig.json` — PostgreSQL connection settings (CRUD-able from UI)
- `config/DefaultAdminUser.json` — Default admin user for JSON file auth
- `config/auth-provider.json` — Active auth provider config (json_file | database | social)
- `config/APIMessages.json` — All API success messages (no inline strings)
- `config/APIErrors.json` — All API error messages (no inline strings)
- `config/swagger.json` — OpenAPI 3.0.3 specification with detailed endpoint docs, schemas, examples
- `config/urls.json` — Centralized API route paths (used by app.js for route mounting)
- `shared/loadJson.js` — JSON config loader/saver utility
- `shared/logger.js` — Winston structured logging
- `core/middleware/auth.js` — JWT + bcrypt + dual-auth (Bearer + HttpOnly cookie) + RBAC
- `core/middleware/security.js` — Helmet + rate limiting + request ID + XSS sanitization
- `core/database/databaseService.js` — PostgreSQL service (pool, schema, CRUD, seeding, stats)
- `core/routes/healthRoutes.js` — Liveness + readiness probes
- `core/routes/databaseRoutes.js` — 11 database management endpoints
- `core/routes/authRoutes.js` — Multi-provider auth (login, refresh, logout, me, config)
- `core/routes/configRoutes.js` — CRUD for system_config (JSONB key-value)
- `core/routes/index.js` — Legacy route registration (superseded by app.js direct mounting)

### Testing
- Removed from V2 scaffold (no Storybook / Vitest artifacts tracked)

---

## 7. Known Issues / Notes

- V2 uses `src/config/` for global config (V1 used `src/shared/config/`)
- V2 uses `uiElementsText.json` (merged from globalText.json) instead of V1's `src/shared/config/uiText.json`
- `globalText.json` is DEPRECATED and should be deleted
- API uses `#config`, `#shared`, `#core`, `#root` subpath imports (zero relative paths)
- **Centralized URL/Port Configuration**: All URLs and ports defined in `src/config/urls.json` and `api/src/config/urls.json`
  - Vite dev server on port 1001 (configured in `vite.config.js` via `urls.json`)
  - API on port 4001 (configured in `api/src/config/index.js` via `urls.json`)
  - Frontend origin for CORS: `http://localhost:1001` (from `urls.json`)
- Node.js 20.18 shows engine warnings for Vite 7 (needs 20.19+) but builds work
- Storybook 10 requires Node 20.19+; using Storybook 8 with `--legacy-peer-deps`
- Frontend build verified: `vite build` succeeds (311KB JS, 41KB CSS)
- API verified: Express app loads but port 4001 blocked if V1 API running
- Admin is core system, NOT a module — `src/modules/admin/` was deleted
