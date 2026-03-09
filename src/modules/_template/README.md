# Module Template — PulseOps V3

## Quick Start

1. Copy this entire `_template/` directory to `src/modules/<your-module-id>/`
2. Update `ui/config/constants.json` with your module's metadata
3. Update `ui/config/uiText.json` with your module's UI text
4. Implement your views in `ui/components/`
5. Implement your API routes in `api/index.js`
6. Update `ui/manifest.jsx` with your views, nav items, and config tabs

## Directory Structure

```
src/modules/<your-module-id>/
├── api/                        # Backend (Express routes)
│   ├── index.js                # Router + lifecycle hooks (onEnable/onDisable)
│   └── config/                 # Module API config JSONs
├── ui/                         # Frontend (React)
│   ├── manifest.jsx            # Module manifest (contract with platform)
│   ├── config/                 # Module UI config JSONs
│   │   ├── constants.json      # Module metadata (id, name, version, etc.)
│   │   ├── uiText.json         # All UI text strings
│   │   ├── urls.json           # Module API endpoint URLs
│   │   ├── uiErrors.json       # Module error messages
│   │   └── uiMessages.json     # Module success messages
│   ├── components/             # View + config tab components
│   └── views/                  # (Optional) Separate view components
└── README.md                   # Module documentation
```

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
# Build the module
npm run build:module -- <your-module-id>

# Output goes to: dist-modules/<your-module-id>/
#   ├── manifest.js      (compiled UI bundle)
#   ├── constants.json    (for moduleScanner discovery)
#   └── api/              (copied as-is)
```

## Key Rules

- **All metadata** comes from `ui/config/constants.json` — never hardcode in manifest
- **All UI text** comes from `ui/config/uiText.json` — zero hardcoded strings
- **All imports** within the module use **relative paths** (self-contained)
- **Platform imports** use `@shared`, `@config` aliases (resolved by Vite)
- **API routes** are relative — mounted on `/api/<moduleId>/*` by moduleGateway
