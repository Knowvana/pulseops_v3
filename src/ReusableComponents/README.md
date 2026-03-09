# ReusableComponents — PulseOps V3

## Purpose

Shared reusable components that can be used across modules, UI, and API layers.

This directory is for cross-cutting components that don't belong to a specific module
or to the platform core. Examples:

- **Data visualization** components (charts, graphs)
- **Form builders** (dynamic form generation from JSON schemas)
- **Export utilities** (CSV, PDF export)
- **Notification components** (toast, alerts)

## Guidelines

- Components here MUST be generic and not tied to any specific module
- Import via relative path or a dedicated alias if configured
- Follow the same coding standards as `src/client/shared/`
- Include JSDoc and file headers per `.windsurfrules`

## Note

For platform-level shared components (Button, ConfigLayout, ConfirmationModal, etc.),
use `src/client/shared/` instead. This directory is specifically for components that
bridge module boundaries or serve utility purposes across the entire application.
