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
  const [showDbAlert, setShowDbAlert] = useState(true);
  const [toggleA, setToggleA] = useState(true);
  const [toggleB, setToggleB] = useState(false);
  const [formValues, setFormValues] = useState({ 
    host: 'localhost', 
    port: '5432', 
    password: '', 
    level: 'info' 
  });

  // Handler for form field changes
  const handleFormChange = (name, value) => {
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  // Handler for login demo
  const handleLogin = async (email, password) => {
    log.info('handleLogin', 'Login attempt', { email });
    await new Promise(resolve => setTimeout(resolve, 1500));
  };

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-surface-800">PulseOps V3 — Component Test Page</h1>
        <p className="text-sm text-surface-500 mt-1">All shared and reusable components in alphabetical order</p>
      </div>

      <div className="p-8 space-y-8 max-w-7xl mx-auto">
        
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SHARED COMPONENTS (Alphabetical Order) ═══════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}

        {/* 1. Button.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">1. Button.jsx — Button Component</h2>
          <p className="text-sm text-surface-600 mb-4">Primary button with gradient</p>
          <div className="flex gap-4">
            <Button variant="primary" icon={<LogIn />}>Sign In</Button>
          </div>
        </section>

        {/* 2. ConfigLayout.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">2. ConfigLayout.jsx — Configuration Layout</h2>
          <p className="text-sm text-surface-600 mb-4">Tabbed configuration layout for modules</p>
          <ConfigLayout
            title="Module Configuration"
            subtitle="Configure module settings"
            icon={Settings}
            tabs={[
              {
                id: 'general',
                label: 'General',
                icon: Settings,
                content: () => (
                  <div className="p-4 text-sm text-surface-600">
                    <p>General configuration content here</p>
                  </div>
                ),
              },
              {
                id: 'advanced',
                label: 'Advanced',
                icon: Sliders,
                content: () => (
                  <div className="p-4 text-sm text-surface-600">
                    <p>Advanced configuration content here</p>
                  </div>
                ),
              },
            ]}
            defaultTab="general"
          />
        </section>

        {/* 3. ConfigurationAlertModal.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">3. ConfigurationAlertModal.jsx — Alert Modal</h2>
          <p className="text-sm text-surface-600 mb-4">Modal for configuration alerts with variants (simulates logs view database alert)</p>
          
          {/* Toggle to show/hide database alert */}
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={() => setShowDbAlert(!showDbAlert)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                showDbAlert
                  ? 'bg-red-100 text-red-700 border border-red-300'
                  : 'bg-green-100 text-green-700 border border-green-300'
              }`}
            >
              {showDbAlert ? '🔴 Database Not Available' : '🟢 Database Available'}
            </button>
            <span className="text-xs text-surface-500">Toggle to simulate database state</span>
          </div>

          {/* Conditional modal - shows when database is not available */}
          {showDbAlert && (
            <div className="relative bg-surface-50/50 border border-surface-200 rounded-xl overflow-hidden min-h-[300px] mb-4">
              <ConfigurationAlertModal
                isOpen={true}
                icon={Database}
                header="Database Not Configured"
                messageDetail="The database schema has not been initialized. Please configure the database first from Platform Admin → Database Setup."
                actionIcon={Settings}
                actionText="Go to Database Setup"
                onAction={() => {
                  log.info('ConfigurationAlertModal', 'Database setup action clicked');
                  setShowDbAlert(false);
                }}
                variant="error"
              />
            </div>
          )}

          {/* Static variant demos */}
          <p className="text-xs text-surface-400 mb-3">Other alert variants:</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="relative bg-surface-50/50 border border-surface-200 rounded-xl overflow-hidden min-h-[250px]">
              <ConfigurationAlertModal
                isOpen={true}
                icon={AlertTriangle}
                header="Logs Not Enabled"
                messageDetail="Database logging is currently disabled. Enable it from Platform Admin → Settings → Log Configuration."
                actionIcon={Settings}
                actionText="Configure"
                onAction={() => log.info('Alert clicked')}
                variant="warning"
              />
            </div>
            <div className="relative bg-surface-50/50 border border-surface-200 rounded-xl overflow-hidden min-h-[250px]">
              <ConfigurationAlertModal
                isOpen={true}
                icon={AlertCircle}
                header="Configuration Required"
                messageDetail="Complete the setup wizard to enable all functionality."
                actionIcon={Settings}
                actionText="Open Wizard"
                onAction={() => log.info('Alert clicked')}
                variant="info"
              />
            </div>
          </div>
        </section>

        {/* 4. ConnectionStatus.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">4. ConnectionStatus.jsx — Connection Status</h2>
          <p className="text-sm text-surface-600 mb-4">Display connection states with status badges</p>
          <div className="space-y-4">
            <ConnectionStatus
              type="Database Connection"
              status="success"
              message="Connected to PostgreSQL successfully"
              meta="Response: 45ms • Version: 14.2"
              lastTested="2:15 PM"
              showBadge={true}
            />
            <ConnectionStatus
              type="API Connection"
              status="error"
              message="Connection refused"
              lastTested="2:10 PM"
              showBadge={true}
            />
            <ConnectionStatus
              type="Cache Server"
              status="warning"
              message="High latency detected"
              meta="Response: 2500ms"
              lastTested="2:12 PM"
              showBadge={true}
            />
          </div>
        </section>

        {/* 5. DatabaseManager.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">5. DatabaseManager.jsx — Database Manager</h2>
          <p className="text-sm text-surface-600 mb-4">Manage database schema and operations</p>
          <DatabaseManager
            onCreateDatabase={() => log.info('Create database')}
            onDeleteDatabase={() => log.info('Delete database')}
            onInitializeSchema={() => log.info('Initialize schema')}
            onLoadDefaultData={() => log.info('Load default data')}
            onCleanDefaultData={() => log.info('Clean default data')}
            onWipeDatabase={() => log.info('Wipe database')}
            onRefreshStatus={() => log.info('Refresh status')}
            dbStatus={{ connected: true, schema: 'pulseops', tables: 15 }}
            isLoading={false}
          />
        </section>

        {/* 6. LoggingConfig.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">6. LoggingConfig.jsx — Logging Configuration</h2>
          <p className="text-sm text-surface-600 mb-4">Configure logging with module-wise controls</p>
          <LoggingConfig
            config={{
              storage: 'database',
              defaultLevel: 'info',
              captureOptions: { uiLogs: true, apiLogs: true, consoleLogs: false, moduleLogs: true },
              moduleLogging: [
                { id: 'servicenow', name: 'ServiceNow', enabled: true },
                { id: 'jira', name: 'Jira', enabled: true },
                { id: 'slack', name: 'Slack', enabled: false },
              ],
            }}
            onSave={(config) => log.info('Save config', config)}
            isSaving={false}
          />
        </section>

        {/* 7. LoginForm.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">7. LoginForm.jsx — Login Form</h2>
          <p className="text-sm text-surface-600 mb-4">Full login form with gradient background</p>
          <LoginForm onLogin={handleLogin} />
        </section>

        {/* 8. PageLoader.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">8. PageLoader.jsx — Page Loader</h2>
          <p className="text-sm text-surface-600 mb-4">Loading spinner with brand gradient</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-surface-200 rounded-xl p-4">
              <p className="text-xs font-bold text-surface-500 mb-2 text-center">Small</p>
              <PageLoader inline size="sm" />
            </div>
            <div className="border border-surface-200 rounded-xl p-4">
              <p className="text-xs font-bold text-surface-500 mb-2 text-center">Medium</p>
              <PageLoader inline size="md" message="Loading..." />
            </div>
            <div className="border border-surface-200 rounded-xl p-4">
              <p className="text-xs font-bold text-surface-500 mb-2 text-center">Large</p>
              <PageLoader inline size="lg" message="Loading dashboard..." />
            </div>
          </div>
        </section>

        {/* 9. StatsCount.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">9. StatsCount.jsx — Stats Count</h2>
          <p className="text-sm text-surface-600 mb-4">Display count statistics in single-row layout</p>
          <StatsCount
            title="Ticket Counts"
            icon={Ticket}
            counts={[
              { id: 'total', label: 'Total Incidents', value: 45, color: 'danger' },
              { id: 'open', label: 'Open Incidents', value: 12, color: 'danger' },
              { id: 'ritms', label: 'Total RITMs', value: 28, color: 'info' },
            ]}
            lastLoad="2:15 PM"
            autoSyncSchedule="Not Configured"
            onSync={() => log.info('Sync clicked')}
            isSyncing={false}
          />
        </section>

        {/* 10. TestConnection.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">10. TestConnection.jsx — Test Connection</h2>
          <p className="text-sm text-surface-600 mb-4">Test service connections with configuration</p>
          <TestConnection
            title="Database Connection"
            description="Configure and test PostgreSQL connection"
            icon={Database}
            fields={[
              { name: 'host', label: 'Host', placeholder: 'localhost', type: 'text', defaultValue: 'localhost' },
              { name: 'port', label: 'Port', placeholder: '5432', type: 'text', defaultValue: '5432' },
              { name: 'database', label: 'Database', placeholder: 'pulseops', type: 'text', defaultValue: 'pulseops' },
            ]}
            onTest={async () => ({ success: true, message: 'Connected successfully' })}
            onSave={async () => log.info('Save config')}
          />
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* REUSABLE COMPONENTS (Alphabetical Order) ═════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}

        {/* 11. ActionButton.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">11. ActionButton.jsx — Action Button</h2>
          <p className="text-sm text-surface-600 mb-4">Universal button with variants and loading states</p>
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

        {/* 12. ConfirmDialog.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">12. ConfirmDialog.jsx — Confirm Dialog</h2>
          <p className="text-sm text-surface-600 mb-4">Modal confirmation with async action</p>
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

        {/* 13. ConnectionIndicator.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">13. ConnectionIndicator.jsx — Connection Indicator</h2>
          <p className="text-sm text-surface-600 mb-4">Connection status with progress bar</p>
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

        {/* 14. DataCard.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">14. DataCard.jsx — Data Card</h2>
          <p className="text-sm text-surface-600 mb-4">Generic card container with header and content</p>
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

        {/* 15. FormField.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">15. FormField.jsx — Form Field</h2>
          <p className="text-sm text-surface-600 mb-4">Universal form input with types</p>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Host" name="host" value={formValues.host} onChange={handleFormChange} icon={Server} />
            <FormField label="Port" name="port" type="number" value={formValues.port} onChange={handleFormChange} icon={Hash} />
            <FormField label="Password" name="password" type="password" value={formValues.password} onChange={handleFormChange} icon={Lock} />
            <FormField label="Log Level" name="level" type="select" value={formValues.level} onChange={handleFormChange} options={['debug', 'info', 'warn', 'error']} />
          </div>
        </section>

        {/* 16. GradientSeparator.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">16. GradientSeparator.jsx — Gradient Separator</h2>
          <p className="text-sm text-surface-600 mb-4">Themed divider lines</p>
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

        {/* 17. PageSpinner.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">17. PageSpinner.jsx — Page Spinner</h2>
          <p className="text-sm text-surface-600 mb-4">Loading spinner for sections</p>
          <div className="flex gap-8 items-start">
            <div className="text-center">
              <PageSpinner size="sm" message="Small" />
            </div>
            <div className="text-center">
              <PageSpinner size="md" message="Loading data..." />
            </div>
          </div>
        </section>

        {/* 18. ProgressBar.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">18. ProgressBar.jsx — Progress Bar</h2>
          <p className="text-sm text-surface-600 mb-4">Animated progress indicator</p>
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

        {/* 19. SetupRequiredOverlay.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">19. SetupRequiredOverlay.jsx — Setup Required Overlay</h2>
          <p className="text-sm text-surface-600 mb-4">Overlay alert for missing configuration</p>
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

        {/* 20. StatCard.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">20. StatCard.jsx — Stat Card</h2>
          <p className="text-sm text-surface-600 mb-4">Metric display cards with trends</p>
          <div className="grid grid-cols-4 gap-3">
            <StatCard icon={Activity} label="Total Logs" value="12,345" variant="info" />
            <StatCard icon={CheckCircle2} label="Successful" value="11,890" variant="success" trend="+2.3%" />
            <StatCard icon={AlertTriangle} label="Warnings" value="412" variant="warning" trend="-5" />
            <StatCard icon={AlertCircle} label="Errors" value="43" variant="error" trend="+12" />
          </div>
        </section>

        {/* 21. StatusBadge.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">21. StatusBadge.jsx — Status Badge</h2>
          <p className="text-sm text-surface-600 mb-4">Compact status indicators</p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant="success" label="Connected" icon={CheckCircle2} />
            <StatusBadge variant="warning" label="Connecting..." icon={Clock} pulse />
            <StatusBadge variant="error" label="Failed" icon={AlertTriangle} />
            <StatusBadge variant="info" label="Active" icon={Activity} />
            <StatusBadge variant="neutral" label="Idle" />
          </div>
        </section>

        {/* 22. TabLayout.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">22. TabLayout.jsx — Tab Layout</h2>
          <p className="text-sm text-surface-600 mb-4">Horizontal tabs with icons</p>
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

        {/* 23. ToggleSwitch.jsx */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-surface-200">
          <h2 className="text-xl font-bold text-surface-800 mb-4">23. ToggleSwitch.jsx — Toggle Switch</h2>
          <p className="text-sm text-surface-600 mb-4">On/Off toggle with labels</p>
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
