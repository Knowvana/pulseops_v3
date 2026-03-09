# PulseOps V3

Enterprise modular operations platform with plug-and-play module architecture, RBAC, and Kubernetes-ready stateless deployment.

## Architecture

- **Unified Monorepo** — Single `package.json`, single `node_modules/` for both UI (React) and API (Express)
- **Microkernel + Micro-Frontend** — Core platform statically bundled; add-on modules hot-dropped at runtime
- **Zero-Downtime Hot-Dropping** — Build → drop into `dist-modules/` → auto-discover → load API routes + UI — no restart
- **K8s-Ready** — Stateless API, horizontal scaling, health/readiness probes, Docker Compose for local dev
- **Dual-Auth** — SuperAdmin authenticates via JSON file (no DB needed); regular users authenticate against PostgreSQL with RBAC
- **Self-Contained Modules** — Each module packages its own UI, API, and config; communicates with the platform via a manifest contract

## Local Development URLs

> All URLs and ports are centralized in `src/client/config/urls.json` (UI) and `src/apiserver/config/urls.json` (API)

| Service | URL | Credentials |
|---------|-----|-------------|
| **Frontend (Vite)** | http://localhost:1001 | — |
| **API Server** | http://localhost:4001 | — |
| **Swagger Docs** | http://localhost:4001/api-docs | — |
| **PostgreSQL** | localhost:5432 | `postgres` / `Infosys@123` |
| **pgAdmin** | http://localhost:5050 | `admin@domain.com` / `Infosys@123` |

## Authentication

| Type | URL | Credentials | Notes |
|------|-----|-------------|--------|
| **SuperAdmin Login** | http://localhost:1001/login/super-admin | `SuperAdmin` / `Infosys@123` | Authenticates against JSON file — works without a database |
| **Regular Users** | http://localhost:1001 | `admin@test.com` / `Infosys@123` | Authenticates against PostgreSQL `system_users` table |
| **RBAC Roles** | — | — | `super_admin` → `admin` → `operator` → `user` → `viewer` |

## Quick Start

```bash
# Install all dependencies (UI + API in one package.json)
npm install

# Start both frontend + API concurrently
npm run dev

# Or start separately
npm run dev:ui          # Frontend on :1001
npm run dev:api         # API on :4001
npm run dev:api:watch   # API with file-watch auto-restart
```

## First-Time Setup

1. Navigate to `http://localhost:1001/login/super-admin`
2. Log in with SuperAdmin credentials
3. Go to **Settings → Database Connection** to verify DB connectivity
4. Go to **Settings → Database Configuration** to configure PostgreSQL
5. Go to **Settings → Database Setup** to create schema and seed default data
6. Go to **Settings → Authentication** to switch to database auth provider

## Project Structure

```
pulseops_v3/
├── package.json                # Unified — ALL deps (React + Express + pg)
├── vite.config.js              # UI dev server + build + path aliases
├── vite.module.config.js       # Module build config
├── tailwind.config.js          # Design tokens (brand, surface, status colors)
├── index.html                  # SPA entry
├── src/
│   ├── main.jsx                # React entry point
│   ├── index.css               # Global styles + CSS custom properties
│   ├── client/                 # ── Frontend (React + Vite + Tailwind) ──
│   │   ├── config/             # UI config (urls.json, uiElementsText.json, app.json)
│   │   ├── core/               # App.jsx, PlatformDashboard, core views (Settings, LogManager, ModuleManager)
│   │   ├── layouts/            # AppShell, LeftSideNavBar, TopMenu, RightLogsView
│   │   └── shared/             # Design system components, services, contexts, hooks
│   ├── apiserver/              # ── Backend (Node.js + Express) ──
│   │   ├── app.js              # Express factory
│   │   ├── server.js           # HTTP server entry
│   │   ├── config/             # API config (DatabaseConfig, auth-provider, Swagger, etc.)
│   │   ├── core/               # Middleware, routes, database service, module gateway
│   │   └── shared/             # Logger (Winston), loadJson utility
│   ├── modules/                # ── Pluggable Modules (UI + API + Config) ──
│   │   ├── moduleRegistry.js   # Frontend module loader/discovery
│   │   ├── _template/          # Module template (copy to create new modules)
│   │   └── servicenow/         # ServiceNow integration module
│   └── ReusableComponents/     # ── Cross-cutting reusable components ──
│       └── README.md           # Component catalog and usage guide
├── dist-modules/               # Compiled hot-drop module bundles (K8s PV mount)
├── docs/                       # Architecture docs (HLD, DLD, README)
└── scripts/                    # Build scripts (build-module.js)
```

## Settings Tabs

| Tab | Description |
|-----|-------------|
| **Database Connection** | Auto-checks DB connectivity on open |
| **Database Configuration** | Configure PostgreSQL host/port/credentials |
| **Log Configuration** | Enable/disable DB logging, log level, capture options |
| **Authentication** | Switch auth provider (database / social) |
| **SuperAdmin Auth** | Change SuperAdmin password |
| **Database Setup** | Create schema, seed RBAC data, manage objects |
| **General Settings** | Timezone and display preferences |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 7, TailwindCSS 3, Lucide Icons, react-router-dom 7 |
| **Backend** | Node.js, Express 4, PostgreSQL (pg), Winston |
| **Security** | Helmet.js, JWT (HttpOnly cookies + Bearer), bcrypt, rate limiting |
| **Deployment** | Docker, Docker Compose, Kubernetes |

## Vite Path Aliases

| Alias | Resolves To |
|-------|-------------|
| `@src` | `src/` |
| `@config` | `src/client/config/` |
| `@core` | `src/client/core/` |
| `@shared` | `src/client/shared/` |
| `@layouts` | `src/client/layouts/` |
| `@modules` | `src/modules/` |
| `@components` | `src/ReusableComponents/` |

## Node.js Import Aliases (API)

| Alias | Resolves To |
|-------|-------------|
| `#config/*` | `src/apiserver/config/*` |
| `#shared/*` | `src/apiserver/shared/*` |
| `#core/*` | `src/apiserver/core/*` |
| `#root/*` | `src/apiserver/*` |
| `#modules/*` | `src/modules/*` |
