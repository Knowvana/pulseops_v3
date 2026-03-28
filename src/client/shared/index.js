// ============================================================================
// Shared Module — Barrel Export (PulseOps V2)
//
// PURPOSE: SINGLE entry point for all shared components, layouts, hooks,
// services, and utilities. Every module imports from '@shared' — never
// from deep relative paths.
//
// USAGE:
//   import { Button, Card } from '@shared';
// ============================================================================

// --- Components (Design System) ---
export { default as Button } from '@shared/components/Button';
export { default as LoginForm } from '@shared/components/LoginForm';
export { default as SuperAdminLoginForm } from '@shared/components/SuperAdminLoginForm';
export { default as TestPage } from '@shared/components/TestPage';
export { default as ConfigLayout, useConfigLayout } from '@shared/components/ConfigLayout';
export { default as ConnectionStatus } from '@shared/components/ConnectionStatus';
export { default as TestConnection } from '@shared/components/TestConnection';
export { default as StatsCount } from '@shared/components/StatsCount';
export { default as ConfirmationModal } from '@shared/components/ConfirmationModal';
export { default as CrudSummary } from '@shared/components/CrudSummary';
export { default as DatabaseManager } from '@shared/components/DatabaseManager';
export { default as LoggingConfig } from '@shared/components/LoggingConfig';
export { default as LogStats } from '@shared/components/LogStats';
export { default as LogViewer } from '@shared/components/LogViewer';
export { default as ConfigurationAlertModal } from '@shared/components/ConfigurationAlertModal';
export { default as PageLoader } from '@shared/components/PageLoader';

// --- Services ---
export { default as UILogService } from '@shared/services/UILogService';
export { default as TimezoneService } from '@shared/services/timezoneService';
export { createLogger } from '@shared/services/consoleLogger';
export { default as ApiClient } from '@shared/services/apiClient';

// --- Hooks ---
// (Add hooks as they are created)

// --- Contexts ---
export { AuthProvider, useAuthContext } from '@shared/contexts/AuthContext';

// --- ReusableComponents (re-exported for convenience) ---
// Prefer importing directly from '@components' in new code.
export {
  ActionButton,
  StatusBadge,
  ProgressBar,
  SetupRequiredOverlay,
  ConfirmDialog,
  StatCard,
  ConnectionIndicator,
  PageSpinner,
  TabLayout,
  FormField,
  DataCard,
  ToggleSwitch,
  GradientSeparator,
  theme,
  gradients,
  variants,
} from '@components';
