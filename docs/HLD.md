# PulseOps V3 — High Level Design (HLD)

## 1. System Overview

PulseOps V3 is an enterprise modular operations platform built as a **unified monorepo**. It combines a React frontend, Express API server, and pluggable modules into a single codebase with one `package.json` and one `node_modules/`.

The platform follows a **Microkernel + Micro-Frontend** architecture where the core platform provides authentication, database management, logging, and settings, while add-on modules (e.g., ServiceNow) can be hot-dropped at runtime without restart.

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                            │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  AppShell  │  │  TopMenu │  │  LeftNav │  │ RightLogsView │  │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│        └──────────────┴─────────────┴────────────────┘          │
│                         │                                       │
│        ┌────────────────┼────────────────┐                      │
│        ▼                ▼                ▼                      │
│  ┌──────────┐    ┌───────────┐    ┌────────────┐               │
│  │Core Views│    │  Modules  │    │  Reusable   │               │
│  │(Settings,│    │(ServiceNow│    │ Components  │               │
│  │ Logs,    │    │ _template)│    │(Button,Modal│               │
│  │Dashboard)│    └───────────┘    │ ConfigLayout│               │
│  └──────────┘                     └────────────┘               │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP (Vite Proxy /api → :4001)
┌─────────────────────────▼───────────────────────────────────────┐
│                     API Server (Express)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │   Auth   │  │ Database │  │   Logs   │  │ Module Gateway │  │
│  │  Routes  │  │  Routes  │  │  Routes  │  │ (dynamic load) │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬────────┘  │
│       └──────────────┴─────────────┴────────────────┘           │
│                          │                                      │
│  ┌──────────────┐  ┌─────▼──────┐  ┌─────────────────────────┐ │
│  │  Middleware   │  │  Database  │  │  Module API Routes      │ │
│  │(JWT,Helmet,  │  │  Service   │  │  (servicenow, _template)│ │
│  │ RateLimit)   │  │  (pg)      │  └─────────────────────────┘ │
│  └──────────────┘  └─────┬──────┘                               │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                   ┌────────▼────────┐
                   │   PostgreSQL    │
                   │  (pulseops DB)  │
                   └─────────────────┘
```

## 3. Folder Tree

```
pulseops_v3/
│
├── package.json                    # Unified dependencies (React + Express + pg)
├── vite.config.js                  # UI dev server, build, path aliases (@shared, @config, etc.)
├── vite.module.config.js           # Module-specific build config
├── tailwind.config.js              # Design tokens: brand, surface, success, warning, danger
├── postcss.config.js               # PostCSS + Tailwind plugin chain
├── index.html                      # SPA entry point
├── docker-compose-pgsql.yml        # Local PostgreSQL + pgAdmin containers
│
├── src/
│   ├── main.jsx                    # React DOM root mount
│   ├── index.css                   # Global styles, CSS custom properties
│   │
│   ├── client/                     # ═══ FRONTEND (React + Vite + Tailwind) ═══
│   │   ├── config/                 # UI configuration (JSON, single source of truth)
│   │   │   ├── urls.json           # All API endpoints + UI routes + server ports
│   │   │   ├── uiElementsText.json # All UI text strings (zero hardcoded strings)
│   │   │   ├── app.json            # App metadata (name, version)
│   │   │   ├── UIErrors.json       # Client-side error messages
│   │   │   └── UIMessages.json     # Client-side success/info messages
│   │   │
│   │   ├── core/                   # Platform core views
│   │   │   ├── App.jsx             # Root component, router, auth gates
│   │   │   ├── PlatformDashboard.jsx # Landing dashboard
│   │   │   └── views/
│   │   │       ├── Settings.jsx    # Settings page (7 tabs: DB, Logs, Auth, etc.)
│   │   │       ├── LogManager.jsx  # Logs page (LogViewer, LogStats, filters)
│   │   │       ├── ModuleManager.jsx # Module install/enable/disable UI
│   │   │       └── AdminDashboard.jsx # Platform admin dashboard
│   │   │
│   │   ├── layouts/                # App shell and navigation
│   │   │   ├── AppShell.jsx        # Main layout wrapper
│   │   │   ├── LeftSideNavBar.jsx  # Sidebar navigation
│   │   │   ├── TopMenu.jsx         # Top bar with module tabs
│   │   │   ├── RightLogsView.jsx   # Slide-out logs panel
│   │   │   └── MainContent.jsx     # Content area wrapper
│   │   │
│   │   └── shared/                 # Design system + services
│   │       ├── index.js            # Barrel export (import { Button } from '@shared')
│   │       ├── components/         # UI components
│   │       │   ├── Button.jsx
│   │       │   ├── ConfigLayout.jsx
│   │       │   ├── ConfigurationAlertModal.jsx
│   │       │   ├── ConfirmationModal.jsx
│   │       │   ├── ConnectionStatus.jsx
│   │       │   ├── CrudSummary.jsx
│   │       │   ├── DatabaseManager.jsx
│   │       │   ├── LogStats.jsx
│   │       │   ├── LogViewer.jsx
│   │       │   ├── LoggingConfig.jsx
│   │       │   ├── LoginForm.jsx
│   │       │   ├── PageLoader.jsx
│   │       │   ├── StatsCount.jsx
│   │       │   ├── SuperAdminLoginForm.jsx
│   │       │   ├── TestConnection.jsx
│   │       │   └── TestPage.jsx
│   │       ├── services/           # UILogService, TimezoneService, consoleLogger
│   │       ├── contexts/           # AuthContext (JWT state, login/logout)
│   │       └── hooks/              # Custom React hooks
│   │
│   ├── apiserver/                  # ═══ BACKEND (Node.js + Express) ═══
│   │   ├── app.js                  # Express factory (middleware, routes, Swagger)
│   │   ├── server.js               # HTTP listener entry point
│   │   ├── config/                 # API configuration (JSON files)
│   │   │   ├── urls.json           # API endpoint paths
│   │   │   ├── app.json            # API metadata
│   │   │   ├── DatabaseConfig.json # PostgreSQL connection config
│   │   │   ├── DefaultSuperAdmin.json # SuperAdmin credentials
│   │   │   ├── DefaultAdminUser.json  # Default admin user seed data
│   │   │   ├── LogsConfig.json     # Logging configuration
│   │   │   ├── ModulesConfig.json  # Module registry state
│   │   │   ├── auth-provider.json  # Auth provider setting (json_file / database)
│   │   │   ├── GeneralSettings.json # Timezone, locale
│   │   │   ├── ServiceNowConfig.json # ServiceNow module config
│   │   │   ├── APIErrors.json      # API error messages
│   │   │   ├── APIMessages.json    # API success messages
│   │   │   ├── swagger.json        # OpenAPI spec
│   │   │   └── index.js            # Config loader barrel
│   │   ├── core/
│   │   │   ├── database/
│   │   │   │   ├── databaseService.js        # PostgreSQL pool, schema CRUD
│   │   │   │   └── DefaultDatabaseSchema.json # Schema definition (single source of truth)
│   │   │   ├── middleware/
│   │   │   │   ├── auth.js         # JWT authentication middleware
│   │   │   │   └── requestId.js    # Request correlation ID
│   │   │   ├── routes/             # Core API routes
│   │   │   │   ├── authRoutes.js
│   │   │   │   ├── databaseRoutes.js
│   │   │   │   ├── logRoutes.js
│   │   │   │   ├── superAdminRoutes.js
│   │   │   │   ├── configRoutes.js
│   │   │   │   ├── generalSettingsRoutes.js
│   │   │   │   ├── healthRoutes.js
│   │   │   │   ├── modulesRoutes.js
│   │   │   │   └── index.js
│   │   │   ├── modules/            # Module gateway (dynamic route loader)
│   │   │   └── services/           # Core business logic (logService, etc.)
│   │   └── shared/
│   │       ├── logger.js           # Winston structured logger
│   │       └── loadJson.js         # JSON file read/write utility
│   │
│   ├── modules/                    # ═══ PLUGGABLE MODULES ═══
│   │   ├── moduleRegistry.js       # Frontend module discovery + lazy loading
│   │   ├── _template/              # Module scaffold (copy to create new modules)
│   │   │   ├── api/
│   │   │   │   └── index.js        # Express router + lifecycle hooks
│   │   │   ├── ui/
│   │   │   │   ├── manifest.jsx    # Module contract with platform
│   │   │   │   └── config/         # Module-specific config JSONs
│   │   │   └── README.md
│   │   └── servicenow/             # ServiceNow ITSM integration module
│   │       ├── api/                # Express routes + service logic
│   │       ├── ui/                 # React views + manifest
│   │       └── README.md
│   │
│   └── ReusableComponents/         # ═══ CROSS-CUTTING REUSABLE COMPONENTS ═══
│       ├── index.js                # Barrel export
│       ├── theme.js                # Common theme definition
│       ├── README.md               # Component catalog
│       └── *.jsx                   # Individual components
│
├── dist-modules/                   # Compiled module bundles (K8s PV mount point)
├── docs/                           # Architecture documentation
│   ├── readme.md                   # Project README
│   ├── HLD.md                      # This file — High Level Design
│   └── DLD.md                      # Detailed Low Level Design
└── scripts/
    └── build-module.js             # Module build script
```

## 4. Core Architecture Patterns

### 4.1 Unified Monorepo
- **Single `package.json`** manages all dependencies (React, Express, pg, etc.)
- **Single `node_modules/`** — no separate installs for UI vs API
- **Vite** handles frontend dev server and build; Node.js runs the API directly

### 4.2 Microkernel Architecture
- **Core platform** provides: authentication, database management, logging, settings, module gateway
- **Modules** are self-contained packages (UI + API + config) that plug into the core
- **Module Gateway** dynamically loads/unloads module API routes at runtime
- **Module Registry** discovers and lazy-loads module UI manifests

### 4.3 Zero-Downtime Hot-Dropping
1. Developer builds a module: `npm run build:module -- <module-id>`
2. Output drops into `dist-modules/<module-id>/`
3. Module Scanner detects the new bundle (constants.json + manifest.js + api/)
4. Module Gateway loads API routes; Module Registry loads UI manifest
5. No server restart required — routes and views are dynamically registered

### 4.4 Authentication Flow
```
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│  Browser     │  login   │  API Server │  verify  │  PostgreSQL │
│  (React SPA) │────────▶│  (Express)  │────────▶│  OR JSON    │
│              │◀────────│             │◀────────│  file       │
│              │  JWT     │             │  user    │             │
│              │ (cookie) │             │  record  │             │
└─────────────┘          └─────────────┘          └─────────────┘
```
- **SuperAdmin**: Authenticates against `DefaultSuperAdmin.json` (no DB needed)
- **Regular Users**: Authenticate against PostgreSQL `system_users` table
- **JWT** stored in HttpOnly cookie + optional Bearer token header
- **RBAC**: `super_admin` → `admin` → `operator` → `user` → `viewer`

### 4.5 Configuration-Driven Design
- **Zero hardcoded strings** — All UI text in `uiElementsText.json`
- **Zero hardcoded URLs** — All endpoints in `urls.json`
- **Zero hardcoded errors** — All error/success messages in JSON config files
- **Database schema** defined in `DefaultDatabaseSchema.json` (single source of truth)

### 4.6 Module Contract
Every module must provide a `manifest.jsx` exporting:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique module identifier |
| `name` | Yes | Display name |
| `version` | Yes | Semantic version |
| `icon` | Yes | Lucide React icon component |
| `navItems` | Yes | Sidebar navigation items |
| `getViews()` | Yes | Returns `{ viewId: Component }` map |
| `getConfigTabs()` | No | Config tab definitions |
| `roles` | No | Allowed RBAC roles |

## 5. Data Flow

### 5.1 Request Flow
```
Browser → Vite Dev Proxy (/api/*) → Express → JWT Middleware → Route Handler → Service → PostgreSQL
                                                                                      ↓
Browser ← JSON Response ←──────── Express ← Route Handler ← Service ← Query Result ──┘
```

### 5.2 Logging Flow
```
UI Event → UILogService (buffer) → POST /api/logs/ui → logService → PostgreSQL (system_logs)
API Request → Express Middleware → logService → PostgreSQL (system_logs)
```
Both UI and API logs write to the same `pulseops.system_logs` table with a `log_type` discriminator.

## 6. Security Architecture

| Layer | Mechanism |
|-------|-----------|
| **Transport** | HTTPS (production), Vite proxy (dev) |
| **Headers** | Helmet.js (CSP, HSTS, X-Frame-Options, etc.) |
| **Authentication** | JWT in HttpOnly cookie, 15-min expiry, refresh tokens |
| **Authorization** | RBAC middleware checks role hierarchy per route |
| **Rate Limiting** | express-rate-limit on auth endpoints |
| **Secrets** | Credentials in JSON config files (never in env for dev), bcrypt for passwords |
| **CORS** | Configured per environment |

## 7. Deployment Architecture

### Local Development
```
npm run dev → concurrently → Vite (:1001) + Node.js (:4001)
docker-compose -f docker-compose-pgsql.yml up → PostgreSQL (:5432) + pgAdmin (:5050)
```

### Production (Kubernetes)
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Ingress     │────▶│  UI Pod      │     │  API Pod(s)  │
│  Controller  │     │  (Nginx +    │────▶│  (Node.js)   │
│              │     │   dist/)     │     │  Stateless   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                     ┌──────────────┐     ┌──────▼───────┐
                     │  PV (modules)│     │  PostgreSQL  │
                     │  dist-modules│     │  (StatefulSet│
                     └──────────────┘     │   or RDS)    │
                                          └──────────────┘
```
- API pods are **stateless** — horizontal scaling via replicas
- Module bundles stored on **Persistent Volume** shared across pods
- Health probes: `GET /api/health` (liveness) + `GET /api/health/readiness` (readiness)

## 8. Design System

The platform uses a **greenish-teal gradient theme** as its default:

| Token | Color | Usage |
|-------|-------|-------|
| `brand-50` to `brand-900` | Teal/Green | Primary brand color, buttons, links, active states |
| `surface-50` to `surface-900` | Slate/Gray | Backgrounds, borders, text |
| `success-*` | Green | Success states, connected indicators |
| `warning-*` | Amber | Loading, caution states |
| `danger-*` | Red | Errors, destructive actions |

All components in `ReusableComponents/` use this theme by default and are fully customizable via props.
