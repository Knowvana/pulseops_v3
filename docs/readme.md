# PulseOps V2

Enterprise modular operations platform with plug-and-play module architecture, RBAC, and Kubernetes-ready stateless deployment.

## Architecture

- **Microkernel + Micro-Frontend** — Core modules statically bundled, add-on modules hot-dropped at runtime
- **Zero-Downtime Hot-Dropping** — Build, drop, discover, load — no restart required
- **K8s-Ready** — Stateless API, horizontal scaling, health/readiness probes
- **Dual-Auth** — SuperAdmin authenticates via JSON file; regular users authenticate against PostgreSQL with RBAC

## Local Development URLs

> **Note**: All URLs and ports are centralized in `src/config/urls.json` and `api/src/config/urls.json`

| Service | URL | Credentials |
|---------|-----|-------------|
| **Frontend** | http://localhost:1001 | - |
| **API** | http://localhost:4001 | - |
| **Swagger** | http://localhost:4001/api-docs | - |
| **PostgreSQL** | localhost:5432 | `postgres` / `Infosys@123` |
| **pgAdmin** | http://localhost:5050 | `admin@domain.com` / `Infosys@123` |

## Authentication

### SuperAdmin Login
- **URL**: `http://localhost:1001/login/super-admin`
- **Username**: `SuperAdmin` (prefilled, read-only)
- **Default Password**: See `api/src/config/DefaultSuperAdmin.json`
- Authenticates against JSON file — works without a database

### Regular Users
- **URL**: `http://localhost:1001` (standard login page)
- **Default Dev Credentials**: `admin@test.com` / `Infosys@123`
- Authenticates against PostgreSQL `system_users` table
- Requires database to be initialized first (via Settings → Database Setup)

### RBAC Roles
`super_admin` → `admin` → `operator` → `user` → `viewer`

## Quick Start

```bash
# Install frontend dependencies
npm install

# Install API dependencies
cd api && npm install && cd ..

# Start both (frontend + API)
npm run dev

# Or start separately
npm run dev:ui    # Frontend on :1001
npm run dev:api   # API on :4001
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
pulseops_v2/
├── api/                    # Backend (Node.js + Express)
│   └── src/
│       ├── config/         # Backend config (JSON files, Swagger)
│       ├── core/           # Middleware, routes, database, services
│       └── shared/         # Logger (Winston), utilities
├── src/                    # Frontend (React + Vite + Tailwind)
│   ├── config/             # Global frontend config (urls, text, app)
│   ├── core/               # App bootstrap, platform dashboard, core views
│   ├── layouts/            # App shell, navigation components
│   ├── modules/            # Pluggable add-on modules
│   └── shared/             # Design system, services, contexts, hooks
├── dist-modules/           # Compiled hot-drop module bundles
├── docs/                   # Architecture docs + development memory
└── scripts/                # Build scripts
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
| **Deployment** | Docker, Kubernetes |
