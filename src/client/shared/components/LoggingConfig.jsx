// ============================================================================
// LoggingConfig — PulseOps V2 Design System
//
// PURPOSE: Reusable component for configuring logging across the platform.
// Matches PulseOps V1 AdminSettingsLogging design exactly.
//
// USAGE:
//   import { LoggingConfig } from '@shared';
//   <LoggingConfig
//     config={{
//       logLevel: 'debug',
//       captureOptions: { console: true, api: true, ui: true, moduleLogs: true },
//       logSyncLimit: 100,
//       autoCleanup: true,
//       maxInMemoryEntries: 600,
//       moduleLogging: [
//         { id: 'platform_admin', name: 'Platform Admin', enabled: true }
//       ]
//     }}
//     onSave={async (newConfig) => await saveConfig(newConfig)}
//     isSaving={false}
//   />
//
// ARCHITECTURE: Fully reusable and config-based. Exact match to V1 design.
// ============================================================================
import React, { useState } from 'react';
import { Save, Monitor, Server, Eye, Package, Bug, Info, AlertTriangle, AlertCircle, Check } from 'lucide-react';
import { Button } from '@shared';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

function ToggleRow({ label, description, enabled, onToggle, icon: Icon }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {Icon && <Icon size={14} className="text-surface-500" />}
      <div className="text-xs font-semibold text-surface-700 text-center">{label}</div>
      <div
        className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${enabled ? 'bg-brand-500' : 'bg-surface-300'}`}
        onClick={onToggle}
      >
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      {description && <div className="text-xs text-surface-400 text-center leading-tight">{description}</div>}
    </div>
  );
}

export default function LoggingConfig({
  config = {
    logLevel: 'debug',
    captureOptions: { console: true, api: true, ui: true, moduleLogs: true },
    logSyncLimit: 100,
    autoCleanup: true,
    maxInMemoryEntries: 600,
    moduleLogging: [],
  },
  onSave,
  isSaving = false,
}) {
  const [localConfig, setLocalConfig] = useState(config);

  const handleLogLevelChange = (level) => {
    setLocalConfig(prev => ({ ...prev, logLevel: level }));
  };

  const handleCaptureOptionToggle = (option) => {
    setLocalConfig(prev => ({
      ...prev,
      captureOptions: {
        ...prev.captureOptions,
        [option]: !prev.captureOptions[option],
      },
    }));
  };

  const handleModuleToggle = (moduleId) => {
    setLocalConfig(prev => ({
      ...prev,
      moduleLogging: prev.moduleLogging.map(m =>
        m.id === moduleId ? { ...m, enabled: !m.enabled } : m
      ),
    }));
  };

  const handleSave = async () => {
    await onSave?.(localConfig);
  };

  const getLevelIcon = (level) => {
    if (level === 'debug') return Bug;
    if (level === 'info') return Info;
    if (level === 'warn') return AlertTriangle;
    return AlertCircle;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h3 className="text-base font-bold text-surface-800 mb-1">Logging Configuration</h3>
        <p className="text-sm text-surface-400">Control what gets logged across the platform.</p>
      </div>

      {/* Log Level and Capture Options in one Card */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm overflow-hidden">
        <div className="flex flex-wrap gap-6">
          {/* Log Level Section */}
          <div className="flex-1 min-w-[280px]">
            <h5 className="text-xs font-bold uppercase tracking-wider text-surface-400 mb-3 text-center">Log Level</h5>
            <p className="text-xs text-surface-500 mb-3 text-center">Only logs at or above this level will be captured.</p>
            <div className="flex items-center gap-1">
              {LOG_LEVELS.map((level) => {
                const LevelIcon = getLevelIcon(level);
                return (
                  <button
                    key={level}
                    onClick={() => handleLogLevelChange(level)}
                    className={`inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
                      localConfig.logLevel === level
                        ? 'bg-green-100 text-green-700 ring-1 ring-green-300'
                        : 'bg-surface-50 text-surface-400 hover:bg-surface-100'
                    }`}
                  >
                    <LevelIcon size={12} className="mr-1" />
                    {level}
                    {localConfig.logLevel === level && <Check size={12} className="ml-1 text-green-700" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vertical Separator — hidden on small screens */}
          <div className="hidden lg:block w-1 bg-gradient-to-b from-transparent via-purple-400 to-transparent shadow-lg" />

          {/* Log Capture Options Section */}
          <div className="flex-1 min-w-[320px] text-center">
            <h5 className="text-xs font-bold uppercase tracking-wider text-surface-400 mb-3">Log Capture Options</h5>
            <div className="flex items-center justify-center gap-3">
              <ToggleRow 
                icon={Monitor} 
                label="Console Output" 
                description="Mirror logs to the browser developer console" 
                enabled={localConfig.captureOptions.console} 
                onToggle={() => handleCaptureOptionToggle('console')} 
              />
              <div className="w-px h-16 bg-gradient-to-b from-transparent via-brand-400 to-transparent shadow-lg shrink-0" />
              <ToggleRow 
                icon={Server} 
                label="API Logs" 
                description="Track all backend API requests and responses" 
                enabled={localConfig.captureOptions.api} 
                onToggle={() => handleCaptureOptionToggle('api')} 
              />
              <div className="w-px h-16 bg-gradient-to-b from-transparent via-brand-400 to-transparent shadow-lg shrink-0" />
              <ToggleRow 
                icon={Eye} 
                label="UI Logs" 
                description="Capture UI interaction and navigation events" 
                enabled={localConfig.captureOptions.ui} 
                onToggle={() => handleCaptureOptionToggle('ui')} 
              />
              <div className="w-px h-16 bg-gradient-to-b from-transparent via-brand-400 to-transparent shadow-lg shrink-0" />
              <ToggleRow 
                icon={Package} 
                label="Module Logs" 
                description="Enable logging for specific modules" 
                enabled={localConfig.captureOptions.moduleLogs} 
                onToggle={() => handleCaptureOptionToggle('moduleLogs')} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Log Management Card */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm overflow-hidden">
        <h4 className="text-xs font-bold uppercase tracking-wider text-surface-400 mb-3 text-center">Log Management</h4>
        <div className="h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent mb-6"></div>
        <div className="flex flex-wrap gap-6">
          {/* Log Sync to Database */}
          <div className="flex-1 min-w-[200px]">
            <h5 className="text-xs font-bold uppercase tracking-wider text-surface-400 mb-3">Log Sync to Database</h5>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-600 mb-1">Log Sync Limit</label>
                <input
                  type="number"
                  value={localConfig.logSyncLimit}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, logSyncLimit: Math.max(10, parseInt(e.target.value) || 100) }))}
                  min={10}
                  max={1000}
                  step={10}
                  className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
                <p className="text-xs text-surface-400 mt-1">This is the value after which the UI pushes the logs to database in batches.</p>
              </div>
            </div>
          </div>

          {/* Vertical Separator — hidden on small screens */}
          <div className="hidden md:block w-1 bg-gradient-to-b from-transparent via-purple-400 to-transparent shadow-lg" />

          {/* Log Retention */}
          <div className="flex-1 min-w-[200px]">
            <h5 className="text-xs font-bold uppercase tracking-wider text-surface-400 mb-3">Log Retention</h5>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-surface-700">Auto Cleanup</div>
                  <div
                    className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${localConfig.autoCleanup ? 'bg-brand-500' : 'bg-surface-300'}`}
                    onClick={() => setLocalConfig(prev => ({ ...prev, autoCleanup: !prev.autoCleanup }))}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${localConfig.autoCleanup ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </div>
                <p className="text-xs text-surface-400 mt-1">Automatically cleanup oldest entries when retention limit is reached.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-600 mb-1">Max In-Memory Entries</label>
                <input
                  type="number"
                  value={localConfig.maxInMemoryEntries}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, maxInMemoryEntries: Math.max(100, parseInt(e.target.value) || 100) }))}
                  min={100}
                  max={10000}
                  step={100}
                  className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
                <p className="text-xs text-surface-400 mt-1">Oldest entries are discarded when the buffer is full.</p>
              </div>
            </div>
          </div>

          {/* Vertical Separator — hidden on small screens */}
          <div className="hidden md:block w-1 bg-gradient-to-b from-transparent via-purple-400 to-transparent shadow-lg" />

          {/* Module-wise Logging */}
          <div className="flex-1 min-w-[200px]">
            <h5 className="text-xs font-bold uppercase tracking-wider text-surface-400 mb-3">Module-wise Logging</h5>
            <p className="text-xs text-surface-500 mb-3">Enable or disable logging per module:</p>
            <div className="space-y-2">
              {localConfig.moduleLogging.map((mod) => (
                <div key={mod.id} className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-surface-700">{mod.name}</div>
                  <div
                    className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${mod.enabled ? 'bg-brand-500' : 'bg-surface-300'}`}
                    onClick={() => handleModuleToggle(mod.id)}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${mod.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="md"
          icon={<Save size={16} />}
          onClick={handleSave}
          disabled={isSaving}
        >
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
