# ServiceNow Module — PulseOps V3

## Overview

ServiceNow ITSM integration module providing incident management, SLA tracking,
sync scheduling, and compliance reporting.

## Directory Structure

```
src/modules/servicenow/
├── api/                              # Backend (Express routes)
│   ├── index.js                      # Router + lifecycle hooks
│   └── config/                       # Module API config
├── ui/                               # Frontend (React)
│   ├── manifest.jsx                  # Module manifest (platform contract)
│   ├── config/
│   │   ├── constants.json            # Module metadata
│   │   ├── uiText.json              # All UI text strings
│   │   ├── urls.json                # Module API endpoints
│   │   ├── uiErrors.json           # Error messages
│   │   └── uiMessages.json         # Success messages
│   └── components/
│       ├── ServiceNowDashboard.jsx   # Dashboard view
│       ├── ServiceNowIncidents.jsx   # Incidents list view
│       ├── ServiceNowReports.jsx     # Reports view
│       └── config/
│           ├── ServiceNowConnectionTab.jsx  # Connection config
│           ├── ServiceNowSlaTab.jsx         # SLA thresholds config
│           └── ServiceNowSyncTab.jsx        # Sync settings config
└── README.md                         # This file
```

## Features

- Dashboard with live incident stats and SLA breach alerts
- Incident list with priority/state filtering and search
- SLA compliance reports and incident volume analytics
- Connection configuration for ServiceNow Table API
- SLA threshold configuration per priority level
- Sync schedule configuration with manual trigger
- In-memory incident cache with configurable TTL

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servicenow/config` | Get module configuration |
| PUT | `/api/servicenow/config` | Update module configuration |
| POST | `/api/servicenow/config/test` | Test ServiceNow connection |
| GET | `/api/servicenow/stats` | Get dashboard statistics |
| GET | `/api/servicenow/incidents` | Get incident list (with filters) |
| POST | `/api/servicenow/sync` | Trigger manual data sync |

## Build & Deploy

```bash
npm run build:module -- servicenow
# Output: dist-modules/servicenow/
```
