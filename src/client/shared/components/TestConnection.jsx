// ============================================================================
// TestConnection — PulseOps V2 Design System
//
// PURPOSE: Reusable component for testing connections to external services.
// Displays connection configuration form, test button, and uses ConnectionStatus
// to show results. Can be used by any module to test database, API, or service
// connections.
//
// USAGE:
//   import { TestConnection } from '@shared';
//   <TestConnection
//     title="Database Connection"
//     description="Configure and test PostgreSQL connection"
//     fields={[
//       { name: 'host', label: 'Host', placeholder: 'localhost', type: 'text' },
//       { name: 'port', label: 'Port', placeholder: '5432', type: 'text' },
//       { name: 'database', label: 'Database', placeholder: 'mydb', type: 'text' },
//       { name: 'username', label: 'Username', placeholder: 'postgres', type: 'text' },
//       { name: 'password', label: 'Password', placeholder: '••••••', type: 'password' }
//     ]}
//     onTest={async (config) => {
//       // Return { success: true, message: '...', meta: '...' } or throw error
//       const result = await testDatabaseConnection(config);
//       return result;
//     }}
//     onSave={async (config) => {
//       await saveConfiguration(config);
//     }}
//   />
//
// PROPS:
//   title       — Connection title (e.g., "Database Connection")
//   description — Description text
//   icon        — Lucide icon component (optional)
//   fields      — Array of { name, label, placeholder, type, defaultValue? }
//   onTest      — Async function to test connection, returns { success, message, meta? }
//   onSave      — Async function to save configuration (optional)
//   initialConfig — Initial configuration object (optional)
//
// ARCHITECTURE: Fully reusable, accepts any field configuration. Uses
// ConnectionStatus component to display test results.
// ============================================================================
import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, Save, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button, ConfirmationModal } from '@shared';
import ConnectionStatus from '@shared/components/ConnectionStatus';
import TimezoneService from '@shared/services/timezoneService';
import { createLogger } from '@shared/services/consoleLogger';
import uiText from '@config/uiElementsText.json';
import messages from '@config/UIMessages.json';

const log = createLogger('TestConnection.jsx');
const connMessages = messages.connection;
const connText = uiText.shared?.testConnection || {};
const dbConfigText = uiText.admin?.settings?.databaseConfiguration || {};

export default function TestConnection({
  title = connText.defaultTitle || 'Connection Test',
  description = connText.defaultDescription || '',
  icon: Icon = Database,
  fields = [],
  onTest,
  onSave,
  onTestResult,
  initialConfig = {},
  autoTest = false,
}) {
  const [config, setConfig] = useState(() => {
    const initial = {};
    fields.forEach(field => {
      initial[field.name] = initialConfig[field.name] || field.defaultValue || '';
    });
    return initial;
  });

  // Sync config state when initialConfig arrives async from API
  useEffect(() => {
    const hasValues = Object.values(initialConfig).some(v => v !== '' && v !== undefined);
    if (hasValues) {
      setConfig(prev => {
        const updated = { ...prev };
        fields.forEach(field => {
          if (initialConfig[field.name] !== undefined && initialConfig[field.name] !== '') {
            updated[field.name] = initialConfig[field.name];
          }
        });
        return updated;
      });
    }
  }, [initialConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const [connectionStatus, setConnectionStatus] = useState({
    type: title,
    status: 'neutral',
    message: connMessages.readyToTest,
    meta: null,
    lastTested: null,
  });
  const [lastTestedTime, setLastTestedTime] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState({});
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = React.useRef(null);

  const handleFieldChange = (name, value) => {
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleTest = async () => {
    if (!onTest) return;
    log.info('handleTest', `Testing connection for: ${title}`, { config });

    setIsTesting(true);
    setProgress(0);
    
    // Animate progress from 0 to 100 over 2 seconds using interval
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress += 5; // Increment by 5% every 100ms = 100% in 2 seconds
      if (currentProgress >= 100) {
        currentProgress = 100;
        clearInterval(progressInterval);
      }
      setProgress(currentProgress);
    }, 100);
    
    setConnectionStatus({
      type: title,
      status: 'loading',
      message: connMessages.testing,
      meta: null,
      lastTested: null,
    });
    
    // Notify parent of loading state
    if (onTestResult) {
      onTestResult({
        status: 'loading',
        message: connMessages.testing,
        meta: null,
        lastTested: null,
        progress: 0,
      });
    }

    try {
      const result = await onTest(config);
      
      // Add minimum delay to show progress animation (at least 2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const timeString = TimezoneService.formatCurrentTime();
      setLastTestedTime(timeString);
      
      // Ensure progress is at 100%
      setProgress(100);
      
      if (result.success) {
        log.info('handleTest', `Connection test successful — ${title}`, { message: result.message, meta: result.meta });
        setConnectionStatus({
          type: title,
          status: 'success',
          message: result.message || connMessages.success,
          meta: result.meta || null,
          lastTested: timeString,
        });
        
        // Notify parent of success
        if (onTestResult) {
          onTestResult({
            status: 'success',
            message: result.message || connMessages.success,
            meta: result.meta || null,
            lastTested: timeString,
            progress: 100,
          });
        }
      } else {
        log.warn('handleTest', `Connection test failed — ${title}`, { message: result.message });
        setConnectionStatus({
          type: title,
          status: 'error',
          message: result.message || connMessages.failed,
          meta: result.meta || null,
          lastTested: timeString,
        });
        
        // Notify parent of failure
        if (onTestResult) {
          onTestResult({
            status: 'error',
            message: result.message || connMessages.failed,
            meta: result.meta || null,
            lastTested: timeString,
            progress: 100,
          });
        }
      }
    } catch (error) {
      const timeString = TimezoneService.formatCurrentTime();
      setLastTestedTime(timeString);
      log.error('handleTest', `Connection test error — ${title}`, { message: error.message });
      
      // Complete progress to 100% on error
      setProgress(100);
      
      setConnectionStatus({
        type: title,
        status: 'error',
        message: error.message || connMessages.testFailed,
        meta: null,
        lastTested: timeString,
      });
      
      // Notify parent of error
      if (onTestResult) {
        onTestResult({
          status: 'error',
          message: error.message || connMessages.testFailed,
          meta: null,
          lastTested: timeString,
          progress: 100,
        });
      }
    } finally {
      // Clear progress animation interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setIsTesting(false);
      // Reset progress after a delay
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const handleSaveAction = async () => {
    if (!onSave) return;
    log.info('handleSaveAction', `Saving configuration for: ${title}`, { config });
    await onSave(config);
    return {
      host: config.host || '',
      port: config.port || '',
      database: config.database || '',
    };
  };

  const handleSaveSuccess = () => {
    log.info('handleSaveSuccess', `Configuration saved — ${title}`);
    setSaveMessage({ type: 'success', text: connMessages.configSaved });
    setTimeout(() => setSaveMessage(null), 5000);
  };

  // Auto-test on mount when autoTest prop is true (ref guard prevents StrictMode double-fire)
  const autoTestRan = React.useRef(false);
  useEffect(() => {
    if (autoTest && onTest && !autoTestRan.current) {
      autoTestRan.current = true;
      log.debug('autoTest', `Auto-test triggered on mount — ${title}`);
      const runAutoTest = async () => {
        setIsTesting(true);
        setConnectionStatus({
          type: title,
          status: 'loading',
          message: connMessages.testing,
          meta: null,
          lastTested: null,
        });
        try {
          const result = await onTest(config);
          const timeString = TimezoneService.formatCurrentTime();
          setLastTestedTime(timeString);
          if (result.success) {
            setConnectionStatus({
              type: title,
              status: 'success',
              message: result.message || connMessages.success,
              meta: result.meta || null,
              lastTested: timeString,
            });
          } else {
            setConnectionStatus({
              type: title,
              status: 'error',
              message: result.message || connMessages.failed,
              meta: result.meta || null,
              lastTested: timeString,
            });
          }
        } catch (error) {
          const timeString = TimezoneService.formatCurrentTime();
          setLastTestedTime(timeString);
          setConnectionStatus({
            type: title,
            status: 'error',
            message: error.message || connMessages.testFailed,
            meta: null,
            lastTested: timeString,
          });
        } finally {
          setIsTesting(false);
        }
      };
      runAutoTest();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePasswordVisibility = (fieldName) => {
    setShowPasswords(prev => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  return (
    <div className="space-y-6">
      {/* Database Configuration Label */}
      <div className="flex items-center gap-2">
        <Database size={16} className="text-surface-600" />
        <span className="text-sm font-semibold text-surface-800">{dbConfigText.title}</span>
      </div>

      {/* Configuration Fields */}
      <div className="space-y-3">
        {fields.map((field) => {
          const isPassword = field.type === 'password';
          const showPassword = showPasswords[field.name];
          const inputType = isPassword && !showPassword ? 'password' : 'text';

          return (
            <div key={field.name}>
              <label className="block text-xs font-semibold text-surface-600 mb-1">
                {field.label}
              </label>
              <div className="relative">
                <input
                  type={inputType}
                  value={config[field.name]}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 text-sm border-2 border-surface-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-500 transition-all"
                />
                {isPassword && (
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility(field.name)}
                    className="absolute inset-y-0 right-2 flex items-center text-surface-400 hover:text-surface-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {onTest && (
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw />}
            onClick={handleTest}
            isLoading={isTesting}
          >
            {isTesting ? connMessages.testing : (connText.testButton || 'Test Connection')}
          </Button>
        )}
        {onSave && (
          <Button
            variant="primary"
            size="sm"
            icon={<Save />}
            onClick={() => {
              const emptyFields = fields.filter(f => !config[f.name]?.toString().trim());
              if (emptyFields.length > 0) {
                const names = emptyFields.map(f => f.label).join(', ');
                setValidationError(`${connMessages.validationEmpty || 'Required fields cannot be empty'}: ${names}`);
                log.warn('saveValidation', `Save blocked — empty required fields: ${names}`);
                setTimeout(() => setValidationError(null), 5000);
                return;
              }
              setValidationError(null);
              setShowSaveModal(true);
            }}
          >
            {connText.saveButton || 'Save Configuration'}
          </Button>
        )}
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-rose-50 border border-rose-200 text-rose-700">
          <AlertTriangle size={14} />
          {validationError}
        </div>
      )}

      {/* Save Success/Error Message — shown above Save button, not in ConnectionStatus */}
      {saveMessage && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
          saveMessage.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>
          <CheckCircle2 size={14} />
          {saveMessage.text}
        </div>
      )}

      {/* Save Configuration Confirmation Modal */}
      {onSave && (
        <ConfirmationModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          title={connText.saveButton}
          actionDescription={connMessages.saveDescription}
          actionTarget={connMessages.saveTarget}
          actionDetails={
            fields.map(f => ({
              label: f.label,
              value: f.type === 'password' ? '••••••••' : (config[f.name] || ''),
            }))
          }
          confirmLabel={connText.saveButton}
          action={handleSaveAction}
          onSuccess={handleSaveSuccess}
          variant="info"
          buildSummary={(data) => [
            ...(fields
              .filter(f => f.name !== 'password' && f.name !== 'schema' && f.name !== 'username' && f.name !== 'port')
              .map(f => ({ label: f.label, value: data?.[f.name] || config[f.name] || '' }))),
            { label: connMessages.statusLabel, value: connMessages.configSaved },
          ]}
        />
      )}
    </div>
  );
}
