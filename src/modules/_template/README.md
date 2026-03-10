# Module Template — PulseOps V3

## Quick Start

1. Copy this entire `_template/` directory to `src/modules/<your-module-id>/`
2. Find-and-replace `_template` with your module ID in all files
3. Update `ui/config/constants.json` with your module's metadata
4. Update `ui/config/uiText.json` with your module's UI text
5. Define your tables in `database/Schema.json`
6. Add your seed data in `database/DefaultData.json`
7. Implement your views in `ui/components/`
8. Add your API routes in `api/index.js` (between the CUSTOM ROUTES markers)
9. Update `ui/manifest.jsx` with your views, nav items, and config tabs
10. Build: `npm run build:module -- <your-module-id>`

## Directory Structure

```
src/modules/<your-module-id>/
├── api/                              # Backend (Express routes)
│   └── index.js                      # Router + lifecycle hooks + data management endpoints
├── database/                         # Module database definitions
│   ├── Schema.json                   # Table, column, index definitions (provisioned on install)
│   └── DefaultData.json              # Seed rows (loaded via Data Management tab)
├── ui/                               # Frontend (React)
│   ├── manifest.jsx                  # Module manifest (contract with platform)
│   ├── config/                       # JSON config ONLY (no .jsx files!)
│   │   ├── constants.json            # Module metadata (id, name, version, etc.)
│   │   ├── uiText.json              # All UI text strings (zero hardcoded)
│   │   ├── urls.json                 # Module API endpoint URLs
│   │   ├── uiErrors.json            # Module error messages
│   │   └── uiMessages.json          # Module success messages
│   └── components/                   # React components
│       ├── <Module>Dashboard.jsx     # Main dashboard view
│       ├── <Module>Reports.jsx       # Reports view
│       ├── ComponentShowcase.jsx     # Reusable component reference (can remove)
│       └── settings/                 # Settings tab components (JSX)
│           ├── DataManagementTab.jsx # DB tables, default data, delete (works out-of-box)
│           └── <Module>GeneralTab.jsx
└── README.md
```

> **IMPORTANT**: The `ui/config/` folder must contain **only JSON files**. All JSX
> components for configuration tabs belong in `ui/components/settings/`.

## Module Manifest Contract

Your `manifest.jsx` MUST export an object with:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique module identifier |
| `name` | Yes | Display name |
| `version` | Yes | Semantic version |
| `description` | Yes | Human-readable description |
| `icon` | Yes | Lucide React icon component |
| `navItems` | Yes | Sidebar nav items (MUST include dashboard, reports, config) |
| `getViews()` | Yes | Returns `{ viewId: ComponentReference }` map |
| `getConfigTabs()` | No | Returns config tab definitions |
| `roles` | No | Allowed roles array |
| `order` | No | Sort order in top nav |

## Build & Deploy

```bash
# Build the module (from project root)
npm run build:module -- <your-module-id>

# Output goes to: dist-modules/<your-module-id>/
#   ├── manifest.js      (compiled UI bundle — Vite library mode)
#   ├── constants.json    (for moduleScanner discovery)
#   ├── api/              (copied as-is from src/modules/<id>/api/)
#   └── database/         (copied as-is — Schema.json + DefaultData.json)
```

> **NEVER** edit files in `dist-modules/` directly. Always edit under `src/modules/`
> and rebuild. The build script copies `api/` and `database/` folders as-is.

## Database Schema — `database/Schema.json`

If your module needs database tables, define them in `database/Schema.json`. The platform
uses the same JSON format as its own `DefaultDatabaseSchema.json`.

```json
{
  "_meta": {
    "moduleId": "your-module",
    "version": "1.0.0",
    "description": "What this schema is for"
  },
  "tables": [
    {
      "name": "your_table_name",
      "description": "What this table stores",
      "columns": [
        { "name": "id",          "type": "BIGSERIAL PRIMARY KEY" },
        { "name": "name",        "type": "VARCHAR(255) NOT NULL" },
        { "name": "status",      "type": "VARCHAR(20) DEFAULT 'active'" },
        { "name": "config",      "type": "JSONB DEFAULT '{}'" },
        { "name": "created_at",  "type": "TIMESTAMPTZ DEFAULT NOW()" },
        { "name": "updated_at",  "type": "TIMESTAMPTZ DEFAULT NOW()" }
      ],
      "indexes": [
        { "name": "idx_your_table_status", "columns": ["status"], "unique": false }
      ]
    }
  ],
  "seedData": {
    "your_table_name": [
      { "name": "Default Item", "description": "Seeded on schema creation" }
    ]
  }
}
```

### Schema Lifecycle

| Action | Trigger | What Happens |
|--------|---------|--------------|
| **Install** | User clicks Install in Module Manager | Platform detects `Schema.json`, shows preview dialog, creates tables + indexes + seed data in a transaction |
| **Enable** | User clicks Enable | API routes loaded dynamically, `onEnable()` hook called |
| **Disable** | User clicks Disable | API routes unloaded, `onDisable()` hook called |
| **Remove** | User clicks Remove | Platform shows delete dialog, drops all tables, removes module |

### Column Types

Use standard PostgreSQL types in the `type` field:

| Type | Example |
|------|---------|
| `BIGSERIAL PRIMARY KEY` | Auto-increment primary key |
| `VARCHAR(255) NOT NULL` | Required text up to 255 chars |
| `TEXT` | Unlimited text |
| `INTEGER DEFAULT 0` | Integer with default |
| `NUMERIC(6,2)` | Decimal (e.g., hours) |
| `BOOLEAN DEFAULT FALSE` | Boolean flag |
| `JSONB DEFAULT '{}'` | JSON object column |
| `TIMESTAMPTZ DEFAULT NOW()` | Timestamp with timezone |

## Default Data — `database/DefaultData.json`

Seed data that users can load via the **Data Management** settings tab. Each top-level
key (except `_meta`) maps to a table name from `Schema.json`. The value is an array of
row objects whose keys must match column names.

```json
{
  "_meta": {
    "moduleId": "your-module",
    "version": "1.0.0",
    "description": "Default seed data loaded via POST /api/<moduleId>/data/defaults"
  },
  "your_table_name": [
    { "name": "Config A", "status": "active" },
    { "name": "Config B", "status": "active" }
  ]
}
```

### How it works

1. User navigates to **Configuration → Data Management** tab
2. Clicks **Load Default Data**
3. UI calls `POST /api/<moduleId>/data/defaults`
4. API reads `DefaultData.json`, inserts rows using `ON CONFLICT DO NOTHING` (idempotent)
5. All inserts happen in a single transaction — if any fail, everything rolls back
6. UI refreshes the table grid to show updated row counts

## API Endpoints — `api/index.js`

The template API includes these routes out-of-the-box:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/status` | Health check |
| `GET` | `/config` | Module configuration |
| `GET` | `/schema/info` | Live DB table status (existence, row counts, init date) |
| `POST` | `/data/defaults` | Seed rows from `DefaultData.json` into DB tables |
| `DELETE` | `/data/reset` | Drop all tables from `Schema.json` (irreversible) |

### Platform Imports in API

```js
// Node.js subpath imports (defined in root package.json)
import DatabaseService from '#core/database/databaseService.js';  // DB queries
import { config as appConfig } from '#config';                     // Platform config
```

### Adding Custom Routes

Add your routes between the `CUSTOM ROUTES` markers in `api/index.js`:

```js
// Example: GET /api/<moduleId>/items
router.get('/items', async (req, res) => {
  try {
    const result = await DatabaseService.query(
      `SELECT * FROM ${dbSchema}.your_table ORDER BY created_at DESC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});
```

## Data Management UI — `settings/DataManagementTab.jsx`

A fully functional settings tab included in the template. It works **out-of-the-box**
with any `Schema.json` + `DefaultData.json` — no customisation needed.

### Features

- **Schema Status** — Shows each table from `Schema.json` with live status (Exists/Missing),
  row count, column count, index count, and schema initialization date
- **Load Default Data** — Button to seed rows from `DefaultData.json` (disabled until schema
  is initialized)
- **Delete Module Data** — Danger zone button to drop all tables with confirmation dialog

### Customisation

The only thing you need to change is the API URL prefix in the component:

```js
// In DataManagementTab.jsx — change '_template' to your module ID
const moduleApi = {
  schemaInfo:   '/api/<your-module-id>/schema/info',
  loadDefaults: '/api/<your-module-id>/data/defaults',
  deleteData:   '/api/<your-module-id>/data/reset',
};
```

## Reusable Components

The template includes a **Component Showcase** view (`ui/components/ComponentShowcase.jsx`)
with live interactive examples of every reusable component.

Available components (import from `@components`):

| Component | Purpose |
|-----------|---------|
| `ActionButton` | Universal button with gradient variants, loading, icons |
| `StatusBadge` | Compact status pill (Connected, Failed, etc.) |
| `ProgressBar` | Animated progress bar with percentage label |
| `SetupRequiredOverlay` | Overlay for missing config (DB not configured) |
| `ConfirmDialog` | Modal confirmation with async action and result summary |
| `StatCard` | Metric card with icon, value, label, trend |
| `ConnectionIndicator` | Connection status with progress bar and metadata |
| `PageSpinner` | Full-page or section loading spinner |
| `TabLayout` | Vertical or horizontal tab layout |
| `FormField` | Universal form field (text, password, number, select, textarea) |
| `DataCard` | Generic card container with header and content |
| `ToggleSwitch` | On/off toggle with label and description |
| `GradientSeparator` | Themed gradient divider line |

```jsx
import { ActionButton, StatusBadge, ConfirmDialog } from '@components';
import { theme, gradients, variants } from '@components/theme';
```

## Checklist: Creating a New Module

- [ ] Copy `_template/` → `src/modules/<your-id>/`
- [ ] Find-and-replace `_template` with `<your-id>` in ALL files
- [ ] Update `ui/config/constants.json` — id, name, shortName, version, description
- [ ] Update `ui/config/uiText.json` — all user-visible strings
- [ ] Update `ui/config/urls.json` — API endpoint URLs
- [ ] Define tables in `database/Schema.json`
- [ ] Add seed data in `database/DefaultData.json`
- [ ] Implement dashboard view in `ui/components/`
- [ ] Implement reports view in `ui/components/`
- [ ] Add custom API routes in `api/index.js`
- [ ] Update `ui/manifest.jsx` — views, nav items, config tabs
- [ ] Build: `npm run build:module -- <your-id>`
- [ ] Test: Install → Enable → verify UI + API + database

## Key Rules

- **All metadata** comes from `ui/config/constants.json` — never hardcode in manifest
- **All UI text** comes from `ui/config/uiText.json` — zero hardcoded strings
- **All imports** within the module use **relative paths** (self-contained)
- **Platform imports** use `@shared`, `@config`, `@components` aliases (resolved by Vite)
- **API routes** are relative — mounted on `/api/<moduleId>/*` by moduleGateway
- **Database tables** defined in `database/Schema.json` — provisioned on install
- **Default data** defined in `database/DefaultData.json` — loaded via Data Management tab
- **Never edit `dist-modules/`** — always edit `src/modules/` and rebuild
