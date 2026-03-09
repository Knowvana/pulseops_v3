// ============================================================================
// TestPage — PulseOps V3 Component Showcase
//
// PURPOSE: Visual testing page for all shared and reusable components.
// All components displayed in alphabetical order with interactive demos.
// ============================================================================
import React, { useState } from 'react';
import { 
  LogIn, Database, Settings, Shield, Sliders, AlertCircle, Clock, 
  CheckCircle2, Ticket, AlertTriangle, Save, Trash2, RefreshCw, 
  Server, Hash, Lock, Activity, Eye, BarChart3, Package 
} from 'lucide-react';
import { createLogger } from '@shared/services/consoleLogger';

// Shared Components (alphabetical)
import Button from '@shared/components/Button';
import ConfigLayout from '@shared/components/ConfigLayout';
import ConfigurationAlertModal from '@shared/components/ConfigurationAlertModal';
import ConnectionStatus from '@shared/components/ConnectionStatus';
import DatabaseManager from '@shared/components/DatabaseManager';
import LoggingConfig from '@shared/components/LoggingConfig';
import LoginForm from '@shared/components/LoginForm';
import PageLoader from '@shared/components/PageLoader';
import StatsCount from '@shared/components/StatsCount';
import TestConnection from '@shared/components/TestConnection';

// Reusable Components (alphabetical)
import {
  ActionButton,
  ConfirmDialog,
  ConnectionIndicator,
  DataCard,
  FormField,
  GradientSeparator,
  PageSpinner,
  ProgressBar,
  SetupRequiredOverlay,
  StatCard,
  StatusBadge,
  TabLayout,
  ToggleSwitch,
} from '@components';

const log = createLogger('TestPage.jsx');

export default function TestPage() {
  // State management
  const [progress, setProgress] = useState(65);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [toggleA, setToggleA] = useState(true);
  const [toggleB, setToggleB] = useState(false);
  const [formValues, setFormValues] = useState({ 
    host: 'localhost', 
    port: '5432', 
    password: '', 
    level: 'info' 
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  // State for StatsCount component - ticket counts simulation
  const [ticketCounts, setTicketCounts] = useState([
    { id: 'total-incidents', label: 'Total Incidents', value: 0, color: 'danger' },
    { id: 'open-incidents', label: 'Open Incidents', value: 0, color: 'danger' },
    { id: 'total-ritms', label: 'Total RITMs', value: 0, color: 'info' },
    { id: 'open-ritms', label: 'Open RITMs', value: 0, color: 'info' },
    { id: 'total-changes', label: 'Total Changes', value: 0, color: 'success' },
    { id: 'pending-changes', label: 'Pending Changes', value: 0, color: 'success' },
  ]);

  // Simulate progress animation for loading state
  React.useEffect(() => {
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) return 100;
        return prev + Math.random() * 30;
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Handler for LoginForm component demo
  const handleLogin = async (email, password) => {
    log.info('handleLogin', 'Login attempt', { email });
    await new Promise(resolve => setTimeout(resolve, 1500));
  };

  // Handler for TestConnection component demo - simulates database connection test
  const handleTestConnection = async (config) => {
    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate success/failure randomly for demo
    const isSuccess = Math.random() > 0.3;
    
    if (isSuccess) {
      return {
        success: true,
        message: 'Connected to PostgreSQL successfully',
        meta: 'Response: 45ms • Version: 14.2',
      };
    } else {
      throw new Error('Connection refused: Database does not exist');
    }
  };

  // Handler for saving configuration in TestConnection component
  const handleSaveConfig = async (config) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    log.info('handleSaveConfig', 'Configuration saved', { config });
  };

  // Handler for form field changes in reusable components
  const handleFormChange = (name, value) => {
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  // Handler for StatsCount component - simulates syncing ticket data from ServiceNow
  const handleSyncTickets = async () => {
    setIsSyncing(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate updated counts from ServiceNow
    setTicketCounts([
      { id: 'total-incidents', label: 'Total Incidents', value: Math.floor(Math.random() * 50) + 40, color: 'danger' },
      { id: 'open-incidents', label: 'Open Incidents', value: Math.floor(Math.random() * 30) + 15, color: 'danger' },
      { id: 'total-ritms', label: 'Total RITMs', value: Math.floor(Math.random() * 40) + 20, color: 'info' },
      { id: 'open-ritms', label: 'Open RITMs', value: Math.floor(Math.random() * 20) + 8, color: 'info' },
      { id: 'total-changes', label: 'Total Changes', value: Math.floor(Math.random() * 25) + 10, color: 'success' },
      { id: 'pending-changes', label: 'Pending Changes', value: Math.floor(Math.random() * 10) + 3, color: 'success' },
    ]);
    
    setIsSyncing(false);
    log.info('handleSync', 'Tickets synced successfully');
  };

  const handleLoginServiceNow = () => {
    setIsLoggedIn(true);
    log.info('handleLoginServiceNow', 'ServiceNow login opened');
  };

  // Database Manager state and handlers for DatabaseManager component demo
  const [dbStatus, setDbStatus] = useState({
    connected: true,
    exists: false,
    schemaInitialized: false,
    hasDefaultData: false,
  });
  const [isRefreshingDb, setIsRefreshingDb] = useState(false);

  // Database Manager handlers
  const handleCreateDatabase = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { database: 'pulseops_v2', created: true };
  };

  const handleDeleteDatabase = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { database: 'pulseops_v2', deleted: true };
  };

  const handleInitializeSchema = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { tables: ['users', 'roles', 'modules', 'logs'], initialized: true };
  };

  const handleLoadDefaultData = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { loaded: true };
  };

  const handleCleanDefaultData = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { cleaned: true };
  };

  const handleWipeDatabase = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { wiped: true };
  };

  const handleRefreshDbStatus = async () => {
    setIsRefreshingDb(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setDbStatus(prev => ({
      ...prev,
      exists: true,
      schemaInitialized: true,
      hasDefaultData: true,
    }));
    setIsRefreshingDb(false);
  };

  // Logging Config state and handlers for LoggingConfig component demo
  const [loggingConfig, setLoggingConfig] = useState({
    logLevel: 'debug',
    captureOptions: { console: true, api: true, ui: true, moduleLogs: true },
    logSyncLimit: 100,
    autoCleanup: true,
    maxInMemoryEntries: 600,
    moduleLogging: [
      { id: 'platform_admin', name: 'Platform Admin', enabled: true },
      { id: 'shift_roster', name: 'Shift Roster Planner', enabled: true },
    ],
  });
  const [isSavingLogging, setIsSavingLogging] = useState(false);

  // Handler for saving logging configuration in LoggingConfig component
  const handleSaveLoggingConfig = async (newConfig) => {
    setIsSavingLogging(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setLoggingConfig(newConfig);
    setIsSavingLogging(false);
    log.info('handleSaveLogging', 'Logging config saved', { config: newConfig });
  };

  // Sample tabs for ConfigLayout component demo
  const configTabs = [
    {
      id: 'database',
      label: 'Database',
      icon: Database,
      content: (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-surface-800">Database Configuration</h3>
          <p className="text-sm text-surface-500">Configure your PostgreSQL database connection.</p>
          <TestConnection
            title="PostgreSQL Connection"
            description="Configure and test database connection"
            icon={Database}
            fields={[
              { name: 'host', label: 'Host', placeholder: 'localhost', type: 'text', defaultValue: 'localhost' },
              { name: 'port', label: 'Port', placeholder: '5432', type: 'text', defaultValue: '5432' },
              { name: 'database', label: 'Database', placeholder: 'pulseops_v2', type: 'text', defaultValue: 'pulseops_v2' },
              { name: 'username', label: 'Username', placeholder: 'postgres', type: 'text', defaultValue: 'postgres' },
              { name: 'password', label: 'Password', placeholder: '••••••', type: 'password' },
            ]}
            onTest={handleTestConnection}
            onSave={handleSaveConfig}
          />
        </div>
      ),
    },
    {
      id: 'security',
      label: 'Security',
      icon: Shield,
      content: (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-surface-800">Security Settings</h3>
          <p className="text-sm text-surface-500">Configure authentication and authorization settings.</p>
          <div className="bg-surface-50 rounded-xl p-6 text-center">
            <Shield size={32} className="mx-auto text-surface-300 mb-2" />
            <p className="text-sm text-surface-600">Security configuration options coming soon</p>
          </div>
        </div>
      ),
    },
    {
      id: 'advanced',
      label: 'Advanced',
      icon: Sliders,
      separator: true,
      content: (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-surface-800">Advanced Settings</h3>
          <p className="text-sm text-surface-500">Advanced platform configuration options.</p>
          <div className="bg-surface-50 rounded-xl p-6 text-center">
            <Sliders size={32} className="mx-auto text-surface-300 mb-2" />
            <p className="text-sm text-surface-600">Advanced settings coming soon</p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-surface-800">PulseOps V3 — Component Test Page (Updated: 2:06 PM)</h1>
        <p className="text-sm text-surface-500 mt-1">Visual verification for all shared UI components. For reusable components, see the <code className="text-brand-600">ComponentShowcase</code> in the module template.</p>
        <p className="text-xs text-surface-400 mt-1">✓ File includes 13 numbered @components in alphabetical order below</p>
      </div>

      <div className="p-8 space-y-8 max-w-7xl mx-auto">
        {/* Button Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">Button.jsx - Button Component</h2>
          <p className="text-sm text-surface-600 mb-4">Primary button with gradient matching LoginForm</p>
          <div className="flex gap-4">
            <Button variant="primary" icon={<LogIn />}>
              Sign In
            </Button>
          </div>
        </section>

        {/* ConnectionStatus Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">ConnectionStatus.jsx - ConnectionStatus Component</h2>
          <p className="text-sm text-surface-600 mb-4">Reusable component for displaying connection states with Last Tested timestamp and status badges</p>
          <div className="space-y-4">
            <ConnectionStatus
              type="Database Connection"
              status="loading"
              message="Connecting to PostgreSQL..."
              progress={Math.min(loadingProgress, 100)}
              showBadge={true}
            />
            <ConnectionStatus
              type="Database Connection"
              status="success"
              message="Connected to PostgreSQL successfully"
              meta="Response: 45ms • Version: 14.2"
              lastTested="3/1/2026, 10:30:19 PM"
              showBadge={true}
            />
            <ConnectionStatus
              type="API Connection"
              status="error"
              message="Connection refused: Service unavailable"
              meta="Last attempt: 2 minutes ago"
              lastTested="3/1/2026, 10:25:45 PM"
              showBadge={true}
            />
            <ConnectionStatus
              type="External Service"
              status="warning"
              message="Connection established with high latency"
              meta="Response: 2500ms • Consider optimization"
              lastTested="3/1/2026, 10:28:10 PM"
              showBadge={true}
            />
            <ConnectionStatus
              type="Cache Server"
              status="neutral"
              message="Not configured"
              meta="Configure Redis connection in settings"
              showBadge={false}
            />
          </div>
        </section>

        {/* TestConnection Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">TestConnection.jsx - TestConnection Component</h2>
          <p className="text-sm text-surface-600 mb-4">Reusable component for testing service connections</p>
          <TestConnection
            title="Database Connection"
            description="Configure and test PostgreSQL connection"
            icon={Database}
            fields={[
              { name: 'host', label: 'Host', placeholder: 'localhost', type: 'text', defaultValue: 'localhost' },
              { name: 'port', label: 'Port', placeholder: '5432', type: 'text', defaultValue: '5432' },
              { name: 'database', label: 'Database', placeholder: 'pulseops_v2', type: 'text', defaultValue: 'pulseops_v2' },
              { name: 'username', label: 'Username', placeholder: 'postgres', type: 'text', defaultValue: 'postgres' },
              { name: 'password', label: 'Password', placeholder: '••••••', type: 'password' },
            ]}
            onTest={handleTestConnection}
            onSave={handleSaveConfig}
          />
        </section>

        {/* ConfigLayout Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">ConfigLayout.jsx - ConfigLayout Component</h2>
          <p className="text-sm text-surface-600 mb-6">Reusable tabbed configuration layout used by all modules</p>
          <ConfigLayout
            title="Module Configuration"
            subtitle="Configure module settings and connections"
            icon={Settings}
            tabs={configTabs}
            defaultTab="database"
          />
        </section>

        {/* StatsCount Component Test */}
        <section>
          <h2 className="text-xl font-bold text-surface-800 mb-4">StatsCount.jsx - StatsCount Component</h2>
          <p className="text-sm text-surface-600 mb-4">Reusable component for displaying count statistics in single-row layout matching ServiceNow dashboard</p>
          <StatsCount
            title="Ticket Counts"
            icon={Ticket}
            counts={ticketCounts}
            lastLoad="3/2/2026, 10:46:36 AM"
            autoSyncSchedule="Not Configured"
            onSync={handleSyncTickets}
            isSyncing={isSyncing}
          />
        </section>

        {/* DatabaseManager Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">DatabaseManager.jsx - DatabaseManager Component</h2>
          <p className="text-sm text-surface-600 mb-4">Reusable component for managing database schema, default data, and database operations</p>
          <DatabaseManager
            onCreateDatabase={handleCreateDatabase}
            onDeleteDatabase={handleDeleteDatabase}
            onInitializeSchema={handleInitializeSchema}
            onLoadDefaultData={handleLoadDefaultData}
            onCleanDefaultData={handleCleanDefaultData}
            onWipeDatabase={handleWipeDatabase}
            onRefreshStatus={handleRefreshDbStatus}
            dbStatus={dbStatus}
            isLoading={isRefreshingDb}
          />
        </section>

        {/* LoggingConfig Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">LoggingConfig.jsx - LoggingConfig Component</h2>
          <p className="text-sm text-surface-600 mb-4">Reusable component for configuring logging with module-wise controls and JSON/Database switching</p>
          <LoggingConfig
            config={loggingConfig}
            onSave={handleSaveLoggingConfig}
            isSaving={isSavingLogging}
          />
        </section>

        {/* PageLoader Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">PageLoader.jsx - PageLoader Component</h2>
          <p className="text-sm text-surface-600 mb-4">Universal loading spinner with brand gradient — inline variants</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-surface-200 rounded-xl p-4">
              <p className="text-xs font-bold text-surface-500 mb-2 text-center">Small</p>
              <PageLoader inline size="sm" />
            </div>
            <div className="border border-surface-200 rounded-xl p-4">
              <p className="text-xs font-bold text-surface-500 mb-2 text-center">Medium (default)</p>
              <PageLoader inline size="md" message="Loading..." />
            </div>
            <div className="border border-surface-200 rounded-xl p-4">
              <p className="text-xs font-bold text-surface-500 mb-2 text-center">Large</p>
              <PageLoader inline size="lg" message="Loading dashboard..." />
            </div>
          </div>
        </section>

        {/* ConfigurationAlertModal Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">ConfigurationAlertModal.jsx - ConfigurationAlertModal Component</h2>
          <p className="text-sm text-surface-600 mb-6">Reusable modal for configuration alerts with customizable icon, header, message, and action button. Supports error, warning, and info variants.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Error Variant Demo */}
            <div className="relative bg-surface-50/50 border border-surface-200 rounded-xl overflow-hidden">
              <div className="p-3 bg-surface-100 border-b border-surface-200">
                <p className="text-xs font-semibold text-surface-700">Error Variant</p>
              </div>
              <div className="p-4 min-h-[300px] flex items-center justify-center">
                <ConfigurationAlertModal
                  isOpen={true}
                  icon={AlertTriangle}
                  header="Database Not Configured"
                  messageDetail="The database schema has not been initialized. Please configure the database first from Platform Admin → Database Setup."
                  actionIcon={Settings}
                  actionText="Go to Database Setup"
                  onAction={() => log.info('ConfigurationAlertModal', 'Error variant action clicked')}
                  variant="error"
                />
              </div>
            </div>

            {/* Warning Variant Demo */}
            <div className="relative bg-surface-50/50 border border-surface-200 rounded-xl overflow-hidden">
              <div className="p-3 bg-surface-100 border-b border-surface-200">
                <p className="text-xs font-semibold text-surface-700">Warning Variant</p>
              </div>
              <div className="p-4 min-h-[300px] flex items-center justify-center">
                <ConfigurationAlertModal
                  isOpen={true}
                  icon={AlertTriangle}
                  header="Logs Not Enabled"
                  messageDetail="Database logging is currently disabled. Enable it from Platform Admin → Settings → Log Configuration."
                  actionIcon={Settings}
                  actionText="Go to Log Configuration"
                  onAction={() => log.info('ConfigurationAlertModal', 'Warning variant action clicked')}
                  variant="warning"
                />
              </div>
            </div>

            {/* Info Variant Demo */}
            <div className="relative bg-surface-50/50 border border-surface-200 rounded-xl overflow-hidden">
              <div className="p-3 bg-surface-100 border-b border-surface-200">
                <p className="text-xs font-semibold text-surface-700">Info Variant</p>
              </div>
              <div className="p-4 min-h-[300px] flex items-center justify-center">
                <ConfigurationAlertModal
                  isOpen={true}
                  icon={AlertCircle}
                  header="Configuration Required"
                  messageDetail="Some features require additional configuration. Please complete the setup wizard to enable all functionality."
                  actionIcon={Settings}
                  actionText="Open Setup Wizard"
                  onAction={() => log.info('ConfigurationAlertModal', 'Info variant action clicked')}
                  variant="info"
                />
              </div>
            </div>
          </div>
        </section>

        {/* LoginForm Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">LoginForm.jsx - LoginForm Component</h2>
          <p className="text-sm text-surface-600 mb-6">Full login form with gradient background and button</p>
          <LoginForm onLogin={handleLogin} />
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* REUSABLE COMPONENTS FROM @components (Alphabetical Order) ═════════════ */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}

        {/* 1. ActionButton Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">ActionButton.jsx — Universal Button Component</h2>
          <p className="text-sm text-surface-600 mb-4">Gradient button with variants, loading state, and icon support</p>
          <div className="flex flex-wrap gap-3">
            <ActionButton variant="primary" icon={<Save />} size="sm">Primary</ActionButton>
            <ActionButton variant="secondary" icon={<RefreshCw />} size="sm">Secondary</ActionButton>
            <ActionButton variant="danger" icon={<Trash2 />} size="sm">Danger</ActionButton>
            <ActionButton variant="success" icon={<CheckCircle2 />} size="sm">Success</ActionButton>
            <ActionButton variant="ghost" icon={<Settings />} size="sm">Ghost</ActionButton>
            <ActionButton variant="primary" size="sm" isLoading>Loading</ActionButton>
            <ActionButton variant="primary" size="sm" disabled>Disabled</ActionButton>
          </div>
        </section>

        {/* 2. ConfirmDialog Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">ConfirmDialog.jsx — Confirmation Modal</h2>
          <p className="text-sm text-surface-600 mb-4">Modal confirmation with async action and result summary</p>
          <ActionButton variant="danger" size="sm" icon={<Trash2 />} onClick={() => setShowConfirm(true)}>
            Open Confirm Dialog
          </ActionButton>
          <ConfirmDialog
            isOpen={showConfirm}
            onClose={() => setShowConfirm(false)}
            title="Delete Record"
            actionDescription="permanently delete this test record"
            actionTarget="Demo Item"
            actionDetails={[
              { label: 'ID', value: 'demo-001' },
              { label: 'Created', value: '2026-03-09' },
            ]}
            confirmLabel="Delete"
            action={async () => {
              await new Promise(r => setTimeout(r, 1500));
              return { deleted: true, id: 'demo-001' };
            }}
            buildSummary={(data) => [
              { label: 'Status', value: 'Deleted' },
              { label: 'ID', value: data.id },
            ]}
            variant="error"
          />
        </section>

        {/* 3. ConnectionIndicator Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">ConnectionIndicator.jsx — Connection Status Display</h2>
          <p className="text-sm text-surface-600 mb-4">Shows connection status with progress bar and metadata</p>
          <div className="space-y-3">
            <ConnectionIndicator
              type="Database Connection"
              status="success"
              message="Connected to PostgreSQL successfully"
              meta="Response: 12ms | PostgreSQL 15.2"
              lastTested="2:30 PM"
              progress={100}
              showBadge
            />
            <ConnectionIndicator
              type="API Connection"
              status="loading"
              message="Testing connection..."
              progress={progress}
              showBadge
            />
            <ConnectionIndicator
              type="ServiceNow"
              status="error"
              message="Connection refused — check instance URL"
              lastTested="2:28 PM"
              showBadge
            />
          </div>
        </section>

        {/* 4. DataCard Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">DataCard.jsx — Generic Card Container</h2>
          <p className="text-sm text-surface-600 mb-4">Reusable card with header, icon, and content</p>
          <div className="grid grid-cols-2 gap-3">
            <DataCard title="Server Info" icon={Server} subtitle="Runtime details">
              <div className="text-xs text-surface-600 space-y-1">
                <p>Node.js: v22.0.0</p>
                <p>Express: v4.21.0</p>
                <p>Uptime: 24h 12m</p>
              </div>
            </DataCard>
            <DataCard title="Quick Stats" icon={BarChart3} headerRight={<StatusBadge variant="success" label="Live" size="xs" />}>
              <div className="text-xs text-surface-600 space-y-1">
                <p>Active Users: 12</p>
                <p>Requests/min: 342</p>
              </div>
            </DataCard>
          </div>
        </section>

        {/* 5. FormField Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">FormField.jsx — Universal Form Input</h2>
          <p className="text-sm text-surface-600 mb-4">Text, password, number, select, and textarea fields</p>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Host" name="host" value={formValues.host} onChange={handleFormChange} icon={Server} />
            <FormField label="Port" name="port" type="number" value={formValues.port} onChange={handleFormChange} icon={Hash} />
            <FormField label="Password" name="password" type="password" value={formValues.password} onChange={handleFormChange} icon={Lock} />
            <FormField label="Log Level" name="level" type="select" value={formValues.level} onChange={handleFormChange} options={['debug', 'info', 'warn', 'error']} />
          </div>
        </section>

        {/* 6. GradientSeparator Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">GradientSeparator.jsx — Themed Divider Line</h2>
          <p className="text-sm text-surface-600 mb-4">Gradient dividers (horizontal and vertical)</p>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-surface-400 mb-2">Horizontal (thin / medium / thick)</p>
              <div className="space-y-3">
                <GradientSeparator thickness="thin" />
                <GradientSeparator thickness="medium" />
                <GradientSeparator thickness="thick" />
              </div>
            </div>
            <div>
              <p className="text-xs text-surface-400 mb-2">Vertical</p>
              <div className="flex items-center gap-4 h-16">
                <span className="text-xs text-surface-500">Left</span>
                <GradientSeparator orientation="vertical" thickness="medium" />
                <span className="text-xs text-surface-500">Right</span>
              </div>
            </div>
          </div>
        </section>

        {/* 7. PageSpinner Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">PageSpinner.jsx — Loading Spinner</h2>
          <p className="text-sm text-surface-600 mb-4">Full-page or section loading spinners</p>
          <div className="flex gap-8 items-start">
            <div className="text-center">
              <PageSpinner size="sm" message="Small" />
            </div>
            <div className="text-center">
              <PageSpinner size="md" message="Loading data..." />
            </div>
          </div>
        </section>

        {/* 8. ProgressBar Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">ProgressBar.jsx — Animated Progress Indicator</h2>
          <p className="text-sm text-surface-600 mb-4">Progress bars with percentage labels</p>
          <div className="space-y-4">
            <ProgressBar value={progress} variant="info" showLabel />
            <ProgressBar value={100} variant="success" showLabel />
            <ProgressBar value={35} variant="warning" showLabel height="h-3" />
            <ProgressBar value={15} variant="error" showLabel />
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-surface-500 w-10">{progress}%</span>
            </div>
          </div>
        </section>

        {/* 9. SetupRequiredOverlay Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">SetupRequiredOverlay.jsx — Setup Alert Overlay</h2>
          <p className="text-sm text-surface-600 mb-4">Overlay alert for missing configuration (DB not configured)</p>
          <ActionButton variant="secondary" size="sm" icon={<AlertTriangle />} onClick={() => setShowOverlay(true)}>
            Show Setup Required Overlay
          </ActionButton>
          {showOverlay && (
            <div className="relative h-48 mt-3 border border-surface-200 rounded-lg overflow-hidden">
              <SetupRequiredOverlay
                isOpen={true}
                icon={Database}
                header="Database Not Configured"
                messageDetail="The database schema has not been initialized. Please configure the database first."
                actionIcon={Settings}
                actionText="Go to Database Setup"
                onAction={() => setShowOverlay(false)}
                onClose={() => setShowOverlay(false)}
                variant="error"
              />
            </div>
          )}
        </section>

        {/* 10. StatCard Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">StatCard.jsx — Metric Display Card</h2>
          <p className="text-sm text-surface-600 mb-4">Cards showing metrics with icons and trends</p>
          <div className="grid grid-cols-4 gap-3">
            <StatCard icon={Activity} label="Total Logs" value="12,345" variant="info" />
            <StatCard icon={CheckCircle2} label="Successful" value="11,890" variant="success" trend="+2.3%" />
            <StatCard icon={AlertTriangle} label="Warnings" value="412" variant="warning" trend="-5" />
            <StatCard icon={AlertCircle} label="Errors" value="43" variant="error" trend="+12" />
          </div>
        </section>

        {/* 11. StatusBadge Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">StatusBadge.jsx — Compact Status Indicator</h2>
          <p className="text-sm text-surface-600 mb-4">Status pills with icons and variants</p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant="success" label="Connected" icon={CheckCircle2} />
            <StatusBadge variant="warning" label="Connecting..." icon={Clock} pulse />
            <StatusBadge variant="error" label="Failed" icon={AlertTriangle} />
            <StatusBadge variant="info" label="Active" icon={Activity} />
            <StatusBadge variant="neutral" label="Idle" />
          </div>
        </section>

        {/* 12. TabLayout Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">TabLayout.jsx — Horizontal Tab Layout</h2>
          <p className="text-sm text-surface-600 mb-4">Horizontal tabs with icon support</p>
          <TabLayout
            orientation="horizontal"
            tabs={[
              { id: 'tab1', label: 'General', icon: Settings, content: () => <p className="text-sm text-surface-500 p-3">General settings content here.</p> },
              { id: 'tab2', label: 'Advanced', icon: Sliders, content: () => <p className="text-sm text-surface-500 p-3">Advanced settings content here.</p> },
              { id: 'tab3', label: 'Monitoring', icon: Eye, content: () => <p className="text-sm text-surface-500 p-3">Monitoring content here.</p> },
            ]}
            defaultTab="tab1"
          />
        </section>

        {/* 13. ToggleSwitch Component Test */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">ToggleSwitch.jsx — On/Off Toggle</h2>
          <p className="text-sm text-surface-600 mb-4">Toggle switches with labels and descriptions</p>
          <div className="space-y-3">
            <ToggleSwitch label="Enable Logging" description="Write logs to the database" enabled={toggleA} onToggle={setToggleA} icon={Database} />
            <ToggleSwitch label="API Monitoring" description="Track all API requests and responses" enabled={toggleB} onToggle={setToggleB} icon={Activity} />
            <ToggleSwitch label="Disabled Toggle" description="Cannot be changed" enabled={false} disabled />
          </div>
        </section>
      </div>
    </div>
  );
}
