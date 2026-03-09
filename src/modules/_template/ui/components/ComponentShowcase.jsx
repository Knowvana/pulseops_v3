// ============================================================================
// ComponentShowcase — PulseOps V3 Module Template
//
// PURPOSE: Demonstrates all reusable components from @components with live
// interactive examples. Module developers can reference this page to see
// how each component works and how to use it in their own views.
//
// USAGE: Included as a view in the module template manifest.
// ============================================================================
import React, { useState } from 'react';
import {
  Save, Trash2, RefreshCw, Database, Server, AlertTriangle,
  Settings, Activity, Wifi, WifiOff, Loader, CheckCircle,
  XCircle, Hash, Lock, BarChart3, Eye, Sliders,
} from 'lucide-react';

import {
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
} from '@components';

// ── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-surface-800 uppercase tracking-wider">{title}</h3>
      <div className={theme.card + ' p-4'}>{children}</div>
    </div>
  );
}

export default function ComponentShowcase() {
  const [progress, setProgress] = useState(65);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [toggleA, setToggleA] = useState(true);
  const [toggleB, setToggleB] = useState(false);
  const [formValues, setFormValues] = useState({ host: 'localhost', port: '5432', password: '', level: 'info' });

  const handleFormChange = (name, value) => setFormValues(prev => ({ ...prev, [name]: value }));

  return (
    <div className="p-6 space-y-8 max-w-4xl animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-surface-800">Component Showcase</h1>
        <p className="text-sm text-surface-500 mt-1">
          Interactive reference for all reusable components from <code className="text-brand-600">@components</code>.
          Copy any example into your module views.
        </p>
      </div>

      {/* ── ActionButton ─────────────────────────────────────────────────── */}
      <Section title="ActionButton">
        <div className="flex flex-wrap gap-3">
          <ActionButton variant="primary" icon={<Save />} size="sm">Primary</ActionButton>
          <ActionButton variant="secondary" icon={<RefreshCw />} size="sm">Secondary</ActionButton>
          <ActionButton variant="danger" icon={<Trash2 />} size="sm">Danger</ActionButton>
          <ActionButton variant="success" icon={<CheckCircle />} size="sm">Success</ActionButton>
          <ActionButton variant="ghost" icon={<Settings />} size="sm">Ghost</ActionButton>
          <ActionButton variant="primary" size="sm" isLoading>Loading</ActionButton>
          <ActionButton variant="primary" size="sm" disabled>Disabled</ActionButton>
        </div>
        <p className="text-xs text-surface-400 mt-3">
          <code>{'<ActionButton variant="primary" icon={<Save />}>Save</ActionButton>'}</code>
        </p>
      </Section>

      {/* ── StatusBadge ──────────────────────────────────────────────────── */}
      <Section title="StatusBadge">
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant="success" label="Connected" icon={CheckCircle} />
          <StatusBadge variant="warning" label="Connecting..." icon={Loader} pulse />
          <StatusBadge variant="error" label="Failed" icon={XCircle} />
          <StatusBadge variant="info" label="Active" icon={Activity} />
          <StatusBadge variant="neutral" label="Idle" />
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <StatusBadge variant="success" label="XS" size="xs" />
          <StatusBadge variant="info" label="Small" size="sm" />
          <StatusBadge variant="warning" label="Medium" size="md" />
        </div>
      </Section>

      {/* ── ProgressBar ──────────────────────────────────────────────────── */}
      <Section title="ProgressBar">
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
      </Section>

      {/* ── ConnectionIndicator ──────────────────────────────────────────── */}
      <Section title="ConnectionIndicator">
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
      </Section>

      {/* ── StatCard ─────────────────────────────────────────────────────── */}
      <Section title="StatCard">
        <div className="grid grid-cols-4 gap-3">
          <StatCard icon={Activity} label="Total Logs" value="12,345" variant="info" />
          <StatCard icon={CheckCircle} label="Successful" value="11,890" variant="success" trend="+2.3%" />
          <StatCard icon={AlertTriangle} label="Warnings" value="412" variant="warning" trend="-5" />
          <StatCard icon={XCircle} label="Errors" value="43" variant="error" trend="+12" />
        </div>
      </Section>

      {/* ── FormField ────────────────────────────────────────────────────── */}
      <Section title="FormField">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Host" name="host" value={formValues.host} onChange={handleFormChange} icon={Server} />
          <FormField label="Port" name="port" type="number" value={formValues.port} onChange={handleFormChange} icon={Hash} />
          <FormField label="Password" name="password" type="password" value={formValues.password} onChange={handleFormChange} icon={Lock} />
          <FormField label="Log Level" name="level" type="select" value={formValues.level} onChange={handleFormChange} options={['debug', 'info', 'warn', 'error']} />
        </div>
        <FormField label="Notes" name="notes" type="textarea" value="" onChange={() => {}} placeholder="Enter notes..." className="mt-3" />
        <FormField label="With Error" name="err" value="" onChange={() => {}} error="This field is required" className="mt-3" required />
      </Section>

      {/* ── ToggleSwitch ─────────────────────────────────────────────────── */}
      <Section title="ToggleSwitch">
        <div className="space-y-3">
          <ToggleSwitch label="Enable Logging" description="Write logs to the database" enabled={toggleA} onToggle={setToggleA} icon={Database} />
          <ToggleSwitch label="API Monitoring" description="Track all API requests and responses" enabled={toggleB} onToggle={setToggleB} icon={Activity} />
          <ToggleSwitch label="Disabled Toggle" description="Cannot be changed" enabled={false} disabled />
        </div>
      </Section>

      {/* ── DataCard ─────────────────────────────────────────────────────── */}
      <Section title="DataCard">
        <div className="grid grid-cols-2 gap-3">
          <DataCard title="Server Info" icon={Server} subtitle="Runtime details">
            <div className="text-xs text-surface-600 space-y-1">
              <p>Node.js: v22.0.0</p>
              <p>Express: v4.21.0</p>
              <p>Uptime: 24h 12m</p>
            </div>
          </DataCard>
          <DataCard
            title="Quick Stats"
            icon={BarChart3}
            headerRight={<StatusBadge variant="success" label="Live" size="xs" />}
          >
            <div className="text-xs text-surface-600 space-y-1">
              <p>Active Users: 12</p>
              <p>Requests/min: 342</p>
            </div>
          </DataCard>
        </div>
      </Section>

      {/* ── TabLayout ────────────────────────────────────────────────────── */}
      <Section title="TabLayout (Horizontal)">
        <TabLayout
          orientation="horizontal"
          tabs={[
            { id: 'tab1', label: 'General', icon: Settings, content: () => <p className="text-sm text-surface-500 p-3">General settings content here.</p> },
            { id: 'tab2', label: 'Advanced', icon: Sliders, content: () => <p className="text-sm text-surface-500 p-3">Advanced settings content here.</p> },
            { id: 'tab3', label: 'Monitoring', icon: Eye, content: () => <p className="text-sm text-surface-500 p-3">Monitoring content here.</p> },
          ]}
          defaultTab="tab1"
        />
      </Section>

      {/* ── GradientSeparator ────────────────────────────────────────────── */}
      <Section title="GradientSeparator">
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
      </Section>

      {/* ── PageSpinner ──────────────────────────────────────────────────── */}
      <Section title="PageSpinner">
        <div className="flex gap-8 items-start">
          <div className="text-center">
            <PageSpinner size="sm" message="Small" />
          </div>
          <div className="text-center">
            <PageSpinner size="md" message="Loading data..." />
          </div>
        </div>
      </Section>

      {/* ── ConfirmDialog ────────────────────────────────────────────────── */}
      <Section title="ConfirmDialog">
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
      </Section>

      {/* ── SetupRequiredOverlay ─────────────────────────────────────────── */}
      <Section title="SetupRequiredOverlay">
        <ActionButton variant="secondary" size="sm" icon={<AlertTriangle />} onClick={() => setShowOverlay(true)}>
          Show Setup Required Overlay
        </ActionButton>
        <p className="text-xs text-surface-400 mt-2">
          Used in LogManager when database is not configured. Renders inside its parent container.
        </p>
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
      </Section>
    </div>
  );
}
