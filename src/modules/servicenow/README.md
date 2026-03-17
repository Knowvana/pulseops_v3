# ServiceNow ITSM Integration Module — PulseOps V3

## Overview

Enterprise-grade ServiceNow ITSM integration module for PulseOps V3. Provides
live incident management, RITM tracking, SLA compliance reporting (resolution +
response), auto-acknowledge background polling, timezone-aware date handling,
and full configuration management — all as a **hot-deployable plug-and-play module**.

**Zero-downtime deployment**: Build once, drop the bundle, enable via Module Manager.
No platform rebuild. No server restart.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  PulseOps Platform (Core)                                   │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ PlatformDashboard│  │ moduleRegistry.js│                 │
│  │  (top nav tabs)  │──│  loadManifest()  │                 │
│  └──────────────────┘  └────────┬─────────┘                 │
│                                 │ dynamic import()          │
│  ┌──────────────────────────────▼─────────────────────────┐ │
│  │  ServiceNow Module (self-contained)                    │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐ │ │
│  │  │ manifest.jsx│  │  API Routes │  │ AutoAck Poller │ │ │
│  │  │  (UI entry) │  │  (Express)  │  │  (Background)  │ │ │
│  │  └──────┬──────┘  └──────┬──────┘  └───────┬────────┘ │ │
│  │         │                │                  │          │ │
│  │    React Views      REST API          setInterval      │ │
│  │    + DataTable      + Services        + DB dedup       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                    ServiceNow REST API
                    (Table API v2)
```

### Key Design Principles

- **Stateless API** — No in-memory caching. Safe for Kubernetes multi-pod deployments.
- **DB-only dedup** — Auto-acknowledge uses `sn_auto_acknowledge_log` table, not memory.
- **Zero hardcoded strings** — All UI text in `uiText.json`, API messages in `APIMessages.json`/`APIErrors.json`, URLs in `urls.json`.
- **Timezone-aware** — All SNOW dates parsed as UTC, converted to configured IANA timezone for display.
- **Module logger** — Structured logging via `moduleLogger.js` with synthetic context for background jobs.

---

## Directory Structure

```
src/modules/servicenow/
├── README.md                                    # This file
├── api/
│   ├── index.js                                 # Router + onEnable/onDisable lifecycle
│   ├── config/
│   │   ├── index.js                             # Config loader (urls, errors, messages)
│   │   ├── urls.json                            # SNOW table paths + internal route paths
│   │   ├── APIErrors.json                       # API error messages
│   │   ├── APIMessages.json                     # API success messages
│   │   ├── servicenow_connection.json           # Connection credentials (gitignored)
│   │   └── servicenow_defaults.json             # Default SLA + sync settings
│   ├── lib/
│   │   ├── SnowApiClient.js                     # HTTP client for SNOW REST API
│   │   ├── dateUtils.js                         # UTC parse, timezone conversion
│   │   └── moduleLogger.js                      # Structured Winston logger + DB persist
│   ├── routes/
│   │   ├── helpers.js                           # Shared utilities (config I/O, DB queries)
│   │   ├── configRoutes.js                      # GET/PUT /config, POST /config/test
│   │   ├── incidentRoutes.js                    # CRUD /incidents
│   │   ├── ritmRoutes.js                        # CRUD /ritms
│   │   ├── incidentConfigRoutes.js              # /config/incidents/*, /schema/*, /config/sla/*
│   │   ├── syncRoutes.js                        # /sync, /sync/status, /sync/schedule
│   │   ├── reportRoutes.js                      # /stats, /reports/*, /config/settings
│   │   ├── dataRoutes.js                        # /schema/info, /data/defaults, /data/reset
│   │   ├── autoAcknowledgeRoutes.js             # /config/auto-acknowledge, /auto-acknowledge/*
│   │   └── timezoneRoutes.js                    # /config/timezone/*
│   └── services/
│       ├── IncidentService.js                   # Incident CRUD operations
│       ├── RitmService.js                       # RITM CRUD operations
│       ├── ReportService.js                     # Stats, reports, SLA calculations
│       ├── SlaService.js                        # SLA threshold CRUD + business hour math
│       ├── TimezoneService.js                   # Timezone detection + effective TZ
│       └── AutoAcknowledgePoller.js             # Background poller (singleton timer)
├── database/
│   ├── Schema.json                              # DB table definitions (auto-provisioned)
│   └── DefaultData.json                         # Seed data (business hours, SLA defaults)
└── ui/
    ├── manifest.jsx                             # Module manifest (platform contract)
    ├── config/
    │   ├── constants.json                       # Module metadata (id, name, version)
    │   ├── uiText.json                          # All UI labels, messages, placeholders
    │   ├── uiErrors.json                        # Frontend error messages
    │   ├── uiMessages.json                      # Frontend success messages
    │   └── urls.json                            # Frontend API endpoint URLs
    ├── components/
    │   ├── DataTable.jsx                        # Reusable grid (sort, paginate, reorder)
    │   ├── ServiceNowDashboard.jsx              # Dashboard view
    │   ├── ServiceNowIncidents.jsx              # Incidents list (sort, filter, paginate)
    │   ├── ServiceNowTestIncidents.jsx          # Create/close test incidents
    │   ├── ServiceNowReports.jsx                # Analytics reports (tabbed)
    │   ├── ServiceNowSlaReport.jsx              # Resolution SLA report
    │   ├── ServiceNowResponseSlaReport.jsx      # Response SLA report
    │   └── settings/
    │       ├── ServiceNowConnectionTab.jsx      # Connection credentials
    │       ├── ServiceNowAssignmentGroupTab.jsx # Assignment group filter
    │       ├── ServiceNowBusinessHoursTab.jsx   # Business hours config
    │       ├── ServiceNowTimezoneTab.jsx        # Timezone config
    │       ├── ServiceNowIncidentConfigTab.jsx  # Column selection
    │       ├── ServiceNowSLAColumnMappingTab.jsx# SLA column mapping
    │       ├── ServiceNowAutoAcknowledgeTab.jsx # Auto-ack config
    │       ├── SLAThreshold.jsx                 # SLA threshold editor
    │       ├── ServiceNowSlaTab.jsx             # SLA thresholds list
    │       ├── ServiceNowSyncTab.jsx            # Sync schedule
    │       ├── ServiceNowConfigSettingsTab.jsx  # General settings
    │       └── ServiceNowDataManagementTab.jsx  # Schema/data management
    └── views/
        ├── IncidentSlaReportView.jsx            # Standalone SLA report view
        ├── IncidentResponseSlaReportView.jsx    # Standalone response SLA view
        ├── IncidentAnalyticsView.jsx            # Standalone analytics view
        └── RitmReportsView.jsx                  # Standalone RITM reports view
```

---

## Features

### Incident Management
- Live incident list from ServiceNow with priority/state/search filtering
- Server-side pagination and sorting via SNOW Table API
- Create, update, and close incidents (two-step resolve → close)
- Dynamic close code fetching from SNOW `sys_choice` table

### Auto-Acknowledge
- Background poller auto-acknowledges new incidents (state=1 → state=2)
- Configurable poll frequency, acknowledgment message
- Stateless DB-only dedup (safe for K8s pod restarts)
- Manual poll trigger + historical log viewer

### SLA Compliance
- Resolution SLA report with business-hour-aware calculations
- Response SLA report with configurable response column mapping
- Per-priority SLA thresholds (configurable via UI)
- Expected closure/response time calculation using business hours
- PDF download for all SLA reports

### Reporting & Analytics
- Dashboard with live stats (total, open, critical, resolved today)
- Incident analytics with breakdown by priority, state, category
- RITM reports with catalog item breakdown
- All grids use DataTable component (sort, paginate, column reorder, search)

### Configuration
- Connection credentials with live connectivity test
- Assignment group filtering (sys_id or name)
- Business hours configuration (per day-of-week)
- Timezone management (auto-detect from SNOW or manual override)
- Column selection for incident display
- SLA column mapping (created, closed, response columns)
- Sync schedule with manual trigger
- Data management (schema info, seed defaults, reset)

---

## API Endpoints

### Connection & Config
| Method | Path | Description |
|--------|------|-------------|
| GET | `/config` | Get connection config (password redacted) |
| PUT | `/config` | Save connection config |
| POST | `/config/test` | Test SNOW connectivity |
| GET | `/config/settings` | Get general settings |
| PUT | `/config/settings` | Save general settings |

### Incidents
| Method | Path | Description |
|--------|------|-------------|
| GET | `/incidents` | List incidents (filtered, paginated, sorted) |
| POST | `/incidents` | Create incident |
| PUT | `/incidents/:id` | Update incident |
| POST | `/incidents/:id/close` | Close incident (resolve → close) |
| GET | `/incidents/open` | List open incidents |

### RITMs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/ritms` | List RITMs |
| POST | `/ritms` | Create RITM |
| PUT | `/ritms/:id` | Update RITM |
| POST | `/ritms/:id/close` | Close RITM |

### Reports & Stats
| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Dashboard statistics |
| GET | `/reports/incidents` | Incident analytics report |
| GET | `/reports/ritms` | RITM report |
| GET | `/reports/sla` | SLA compliance summary |
| GET | `/reports/sla/incidents` | Resolution SLA detail report |
| GET | `/reports/sla/incidents/response` | Response SLA detail report |

### Auto-Acknowledge
| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/auto-acknowledge` | Get auto-ack config |
| PUT | `/config/auto-acknowledge` | Save config + restart poller |
| POST | `/auto-acknowledge/poll` | Trigger manual poll |
| POST | `/auto-acknowledge/test` | Test single incident |
| GET | `/auto-acknowledge/log` | Today's ack log |
| GET | `/auto-acknowledge/log/history` | Historical ack log |

### Configuration
| Method | Path | Description |
|--------|------|-------------|
| GET/PUT | `/config/incidents` | Incident display config |
| GET | `/config/incidents/columns` | Available SNOW columns |
| GET/PUT | `/config/incidents/sla-mapping` | SLA column mapping |
| GET/POST/PUT/DELETE | `/config/sla` | SLA thresholds CRUD |
| GET/PUT | `/config/timezone` | Timezone config |
| POST | `/sync` | Trigger manual sync |
| GET | `/sync/status` | Sync status |
| GET/PUT | `/sync/schedule` | Sync schedule config |

All endpoints are prefixed with `/api/servicenow/` by the dynamic route loader.

---

## Build & Deploy

```bash
# Build the module bundle
npm run build:module -- servicenow

# Output: dist-modules/servicenow/manifest.js
# The API server serves this at GET /api/modules/bundle/servicenow/manifest.js

# Enable via Module Manager UI or API:
POST /api/modules/servicenow/enable
```

### Dev Mode
In development, `moduleRegistry.js` loads `src/modules/servicenow/ui/manifest.jsx`
directly via Vite's dev server — full HMR, alias resolution, zero build step.

### Prod Mode
The built `manifest.js` is a self-contained ES module bundle. PlatformDashboard
loads it via `dynamic import()` with cache-busting version query parameter.

---

## Database Tables

Auto-provisioned from `database/Schema.json` when the module is first enabled:

| Table | Purpose |
|-------|---------|
| `sn_module_config` | Key-value config store (incident config, auto-ack, etc.) |
| `sn_sla_thresholds` | Per-priority SLA resolution/response targets |
| `sn_business_hours` | Business hours per day-of-week |
| `sn_auto_acknowledge_log` | Auto-acknowledge execution log (dedup source) |
