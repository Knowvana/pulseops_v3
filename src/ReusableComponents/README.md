# ReusableComponents — PulseOps V3

## Purpose

Cross-cutting reusable UI components shared across the platform core, all modules, and the module template. Every component uses the common **brand gradient theme** (teal/green) and is fully customizable via props.

## Import

```javascript
import { ActionButton, StatusBadge, ProgressBar } from '@components';
```

The `@components` alias resolves to `src/ReusableComponents/` (configured in `vite.config.js` and `jsconfig.json`).

## Component Catalog

| Component | File | Purpose |
|-----------|------|---------|
| **ActionButton** | `ActionButton.jsx` | Universal button with gradient variants, loading state, icon support |
| **StatusBadge** | `StatusBadge.jsx` | Compact pill/badge showing status (Connected, Failed, etc.) |
| **ProgressBar** | `ProgressBar.jsx` | Animated progress bar with percentage label |
| **SetupRequiredOverlay** | `SetupRequiredOverlay.jsx` | Overlay alert for missing config (DB not configured, etc.) |
| **ConfirmDialog** | `ConfirmDialog.jsx` | Modal confirmation with async action, loading, and result summary |
| **StatCard** | `StatCard.jsx` | Metric card with icon, value, label, and trend indicator |
| **ConnectionIndicator** | `ConnectionIndicator.jsx` | Connection status display with progress bar and metadata |
| **PageSpinner** | `PageSpinner.jsx` | Full-page or section loading spinner |
| **TabLayout** | `TabLayout.jsx` | Vertical or horizontal tab layout with icon support |
| **FormField** | `FormField.jsx` | Universal form field (text, password, number, select, textarea) |
| **DataCard** | `DataCard.jsx` | Generic card container with header, icon, and content area |
| **ToggleSwitch** | `ToggleSwitch.jsx` | On/off toggle with label and description |
| **GradientSeparator** | `GradientSeparator.jsx` | Themed gradient divider (horizontal/vertical) |

## Theme

All components share a common theme defined in `theme.js`:

```javascript
import { theme, gradients, variants } from '@components/theme';
```

- **`gradients`** — Predefined gradient classes: `brand`, `success`, `warning`, `error`, `info`, `surface`
- **`variants`** — Full color sets per status: `bg`, `border`, `text`, `icon`, `button`, `progressBg`, `progressFill`
- **`theme`** — Shared layout tokens: `card`, `heading`, `caption`, `overlay`, `badge`, `iconBox`

### Default Theme Colors

| Token | Color | Usage |
|-------|-------|-------|
| `brand-*` | Teal/Green | Primary — buttons, links, active states |
| `surface-*` | Slate/Gray | Backgrounds, borders, text |
| `success-*` / `emerald-*` | Green | Success, connected |
| `warning-*` / `amber-*` | Amber/Orange | Loading, caution |
| `danger-*` / `red-*` | Red | Errors, destructive |

## Usage Examples

### ActionButton
```jsx
<ActionButton variant="primary" icon={<Save />}>Save Changes</ActionButton>
<ActionButton variant="danger" size="sm" isLoading>Deleting...</ActionButton>
<ActionButton variant="ghost" icon={<RefreshCw />}>Refresh</ActionButton>
```

### StatusBadge
```jsx
<StatusBadge variant="success" label="Connected" />
<StatusBadge variant="warning" label="Connecting..." icon={Loader} pulse />
<StatusBadge variant="error" label="Failed" icon={AlertTriangle} />
```

### ProgressBar
```jsx
<ProgressBar value={75} variant="info" showLabel />
<ProgressBar value={100} variant="success" height="h-3" />
```

### SetupRequiredOverlay
```jsx
<SetupRequiredOverlay
  isOpen={!isDatabaseConfigured}
  icon={Database}
  header="Database Not Configured"
  messageDetail="Please configure the database first."
  actionIcon={Settings}
  actionText="Go to Database Setup"
  onAction={() => navigate('/platform_admin/Settings?tab=databaseSetup')}
  variant="error"
/>
```

### ConnectionIndicator
```jsx
<ConnectionIndicator
  type="Database"
  status="success"
  message="Connected to PostgreSQL"
  meta="Latency: 12ms | v15.2"
  lastTested="2:30 PM"
  progress={100}
  showBadge
/>
```

### ConfirmDialog
```jsx
<ConfirmDialog
  isOpen={showConfirm}
  onClose={() => setShowConfirm(false)}
  title="Delete Record"
  actionDescription="permanently delete this user"
  confirmLabel="Delete"
  action={async () => await deleteUser(id)}
  variant="error"
/>
```

### FormField
```jsx
<FormField label="Host" name="host" value={config.host} onChange={handleChange} icon={Server} />
<FormField label="Password" name="password" type="password" value={config.password} onChange={handleChange} />
<FormField label="Level" name="level" type="select" options={['info','warn','error']} />
```

### DataCard
```jsx
<DataCard title="Server Status" icon={Server} subtitle="Current metrics">
  <p>Uptime: 99.9%</p>
</DataCard>
```

### ToggleSwitch
```jsx
<ToggleSwitch label="Enable Logging" enabled={cfg.enabled} onToggle={(v) => setCfg({...cfg, enabled: v})} />
```

### TabLayout
```jsx
<TabLayout
  tabs={[
    { id: 'general', label: 'General', icon: Settings, content: () => <GeneralTab /> },
    { id: 'advanced', label: 'Advanced', icon: Sliders, content: () => <AdvancedTab /> },
  ]}
  defaultTab="general"
  orientation="vertical"
/>
```

## Guidelines

- Components MUST be generic — no module-specific logic
- All text passed via props — zero hardcoded strings
- Use `variant` prop for color scheme switching
- Follow `.windsurfrules` coding standards
- Include JSDoc file headers in all component files
