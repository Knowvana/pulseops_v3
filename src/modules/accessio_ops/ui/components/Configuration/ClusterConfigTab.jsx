// ============================================================================
// Accessio Operations Module — Cluster Connection Configuration Tab
//
// PURPOSE: React component for configuring Kubernetes cluster connection.
//
// ARCHITECTURE: VB.NET Forms style component with explicit event handlers
//   - State variables: Like form-level variables in VB.NET
//   - Event handlers: Like event subs in VB.NET  
//   - Lifecycle: Like Page_Load/Unload in VB.NET
//   - Helper methods: Like private methods in VB.NET
//
// API ENDPOINTS:
//   - GET  /api/accessio_ops/cluster     → Load cluster config
//   - PUT  /api/accessio_ops/cluster     → Save cluster config
//   - POST /api/accessio_ops/cluster/test → Test cluster connection
// ============================================================================

import React from 'react';
import {
  CheckCircle2, AlertCircle, Loader2, Shield,
  Save, RefreshCw, Server, Clock,
} from 'lucide-react';
import TimezoneService from '@shared/services/timezoneService';
import { createLogger } from '@shared';
import { ApiClient } from '@shared';

// Create logger instance (like logging in VB.NET)
const log = createLogger('ClusterConfigTab');

export default function ClusterConfigTab() {
  // ============================================================================
  // 1. State Variables (like form-level variables in VB.NET)
  // ============================================================================

  // Connection status variables (like form controls in VB.NET)
  const [connecting, setConnecting] = React.useState(false);
  const [isConnected, setIsConnected] = React.useState(false);
  const [isFailed, setIsFailed] = React.useState(false);
  const [testError, setTestError] = React.useState(null);
  const [clusterInfo, setClusterInfo] = React.useState(null);

  // Time display variables (like timer controls in VB.NET)
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const [lastTestedAt, setLastTestedAt] = React.useState(null);

  // Form state variables (like text boxes in VB.NET)
  const [saving, setSaving] = React.useState(false);
  const [saveResult, setSaveResult] = React.useState(null);
  const [hasToken, setHasToken] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  // Form data variables (like form fields in VB.NET) - initialized with empty values
  const [form, setForm] = React.useState({
    apiServerUrl: '',
    serviceAccountToken: '',
    projectId: '',
    region: '',
    clusterName: '',
  });

  // ============================================================================
  // 2. Event Handlers (like event subs in VB.NET)
  // ============================================================================

  // Timer_Tick event handler (like Timer_Tick in VB.NET)
  function handleTimerTick() {
    // Get current system time (like DateTime.Now in VB.NET)
    const currentSystemTime = new Date();
    
    // Update component state (like updating a Label control in VB.NET)
    setCurrentTime(currentSystemTime);
  }

  // Timezone_Changed event handler (like SelectedIndexChanged in VB.NET)
  function handleTimezoneChanged() {
    // Get current system time when timezone changes
    const currentSystemTime = new Date();
    
    // Update component state to trigger re-render with new timezone
    setCurrentTime(currentSystemTime);
  }

  // Test_Connection_Click event handler (like Button_Click in VB.NET)
  async function handleTestConnectionClick() {
    try {
      // Validate required fields first (like validation in VB.NET)
      if (!form.apiServerUrl.trim()) {
        setTestError('API Server URL is required for testing connection');
        return;
      }

      // Show loading state (like disabling button in VB.NET)
      setConnecting(true);
      setTestError(null);
      setIsFailed(false);

      // Log test start (like writing to event log in VB.NET)
      log.info('ClusterConfig', `Testing cluster connection - API: ${form.apiServerUrl}, Project: ${form.projectId}, HasToken: ${!!form.serviceAccountToken}`);

      // Prepare test data (like preparing parameters in VB.NET)
      // Note: Token is NOT sent - API loads it from storage (like GKE pattern)
      const testData = {
        apiServerUrl: form.apiServerUrl,
        projectId: form.projectId,
        region: form.region,
        clusterName: form.clusterName,
        // serviceAccountToken is NOT included - API handles it internally
      };

      // Call test API endpoint (like calling Web Service in VB.NET)
      const response = await ApiClient.post('/api/accessio_ops/cluster/test', testData);

      if (response.success && response.data) {
        // Update connection status (like updating status in VB.NET)
        setIsConnected(true);
        setLastTestedAt(new Date());
        setClusterInfo(response.data.clusterInfo || {
          platform: 'Kubernetes',
          apiServer: form.apiServerUrl,
          nodes: response.data.nodes || 0,
          namespaces: response.data.namespaces || 0,
          pods: response.data.pods || 0,
        });
        setHasToken(form.serviceAccountToken.length > 0);

        // Log successful test (like writing to event log in VB.NET)
        log.info('ClusterConfig', `Cluster connection test successful - Nodes: ${response.data.nodes}, Pods: ${response.data.pods}, API: ${form.apiServerUrl}`);
      } else {
        // Handle test failure (like error handling in VB.NET)
        setIsConnected(false);
        setIsFailed(true);
        setTestError(response.error?.message || 'Connection test failed');
        
        // Log test failure (like writing to event log in VB.NET)
        log.error('ClusterConfig', `Cluster connection test failed - Error: ${response.error?.message}, API: ${form.apiServerUrl}, HasToken: ${!!form.serviceAccountToken}`);
      }
    } catch (error) {
      // Handle exception (like Try-Catch in VB.NET)
      setIsConnected(false);
      setIsFailed(true);
      setTestError('Failed to test connection. Please check your configuration.');
      
      // Log error (like writing to event log in VB.NET)
      log.error('ClusterConfig', 'Exception during connection test', {
        error: error.message,
        stack: error.stack
      });
    } finally {
      // Hide loading state (like enabling button in VB.NET)
      setConnecting(false);
    }
  }

  // Save_Configuration_Click event handler (like Button_Click in VB.NET)
  async function handleSaveConfigurationClick() {
    try {
      // Validate required fields (like validation in VB.NET)
      if (!form.apiServerUrl.trim()) {
        setSaveResult({ success: false, message: 'API Server URL is required' });
        return;
      }
      
      if (!form.serviceAccountToken.trim() && !hasToken) {
        setSaveResult({ success: false, message: 'Service Account Token is required' });
        return;
      }
      
      if (!form.projectId.trim()) {
        setSaveResult({ success: false, message: 'Project ID is required' });
        return;
      }
      
      if (!form.clusterName.trim()) {
        setSaveResult({ success: false, message: 'Cluster Name is required' });
        return;
      }

      // Show loading state (like disabling button in VB.NET)
      setSaving(true);
      setSaveResult(null);

      // Call save method (like calling save routine in VB.NET)
      const result = await saveConfigurationToApi();
      
      // Update save result state (like updating UI in VB.NET)
      setSaveResult(result);

      // If save successful, load configuration to refresh hasToken flag
      if (result.success) {
        await loadConfiguration();
      }
    } catch (error) {
      // Handle exception (like Try-Catch in VB.NET)
      
      setSaveResult({
        success: false,
        message: 'Failed to save configuration. Please try again.',
      });
    } finally {
      // Hide loading state (like hiding progress bar in VB.NET)
      setSaving(false);
    }
  }

  // Form_Field_Changed event handler (like TextBox_TextChanged in VB.NET)
  function handleFormFieldChange(fieldName, fieldValue) {
    // Update form state (like updating form controls in VB.NET)
    setForm(prevForm => ({
      ...prevForm,
      [fieldName]: fieldValue,
    }));
  }

  // ============================================================================
  // 3. API Methods (like Web Service calls in VB.NET)
  // ============================================================================

  // Load_Configuration method (like loading data from database in VB.NET)
  async function loadConfiguration() {
    try {
      // Log start of operation (like writing to event log in VB.NET)
      log.info('ClusterConfig', 'Loading cluster configuration from API');
      
      // Show loading state (like showing progress bar in VB.NET)
      setIsLoading(true);
      
      // Call API endpoint (like calling Web Service in VB.NET)
      const response = await ApiClient.get('/api/accessio_ops/cluster');
      
      if (response.success && response.data) {
        // Update form with loaded data (like binding data to controls in VB.NET)
        setForm({
          apiServerUrl: response.data.apiServerUrl || '',
          serviceAccountToken: '', // Always empty - never expose token to frontend
          projectId: response.data.projectId || '',
          region: response.data.region || '',
          clusterName: response.data.clusterName || '',
        });
        
        // Update connection status if available
        if (response.data.connectionStatus) {
          setIsConnected(response.data.connectionStatus === 'connected');
          setLastTestedAt(response.data.lastTestedAt ? new Date(response.data.lastTestedAt) : null);
        }
        
        // Set hasToken flag from server (security: token never exposed to frontend)
        setHasToken(response.data.hasToken || false);
        
        // Log successful load (like writing to event log in VB.NET)
        log.info('ClusterConfig', `Cluster configuration loaded successfully - API: ${response.data.apiServerUrl}, Project: ${response.data.projectId}, HasToken: ${response.data.hasToken}`);
      } else {
        // Log warning for empty response (like writing to event log in VB.NET)
        log.warn('ClusterConfig', 'No configuration data found, using empty form');
      }
    } catch (error) {
      // Log error (like error handling in VB.NET)
      log.error('ClusterConfig', 'Failed to load cluster configuration', { 
        error: error.message,
        stack: error.stack 
      });
      
      // Show error message (like MessageBox in VB.NET)
      setTestError('Failed to load configuration. Please try again.');
    } finally {
      // Hide loading state (like hiding progress bar in VB.NET)
      setIsLoading(false);
    }
  }

  // Save_Configuration method (like saving to database in VB.NET)
  async function saveConfigurationToApi() {
    try {
      // Log start of operation (like writing to event log in VB.NET)
      log.info('ClusterConfig', 'Saving cluster configuration to API');
      
      // Prepare data for API (like preparing data for database in VB.NET)
      // Note: Token is only sent if user entered a new one (like GKE pattern)
      const configData = {
        apiServerUrl: form.apiServerUrl,
        projectId: form.projectId,
        region: form.region,
        clusterName: form.clusterName,
        lastTestedAt: lastTestedAt ? lastTestedAt.toISOString() : null,
      };
      
      // Only include token if user entered a new one (preserve existing token)
      if (form.serviceAccountToken) {
        configData.serviceAccountToken = form.serviceAccountToken;
      }
      
      // Call API endpoint (like calling Web Service in VB.NET)
      const response = await ApiClient.put('/api/accessio_ops/cluster', configData);
      
      if (response.success) {
        // Log successful save (like writing to event log in VB.NET)
        log.info('ClusterConfig', 'Cluster configuration saved successfully', { 
          apiServerUrl: configData.apiServerUrl,
          projectId: configData.projectId,
          tokenUpdated: !!form.serviceAccountToken
        });
        
        // Return success result
        return {
          success: true,
          message: 'Cluster configuration saved successfully',
        };
      } else {
        // Log error response (like writing to event log in VB.NET)
        log.error('ClusterConfig', 'API returned error response', { 
          error: response.error,
          message: response.message 
        });
        
        // Return error result
        return {
          success: false,
          message: response.error?.message || 'Failed to save configuration',
        };
      }
    } catch (error) {
      // Log error (like error handling in VB.NET)
      log.error('ClusterConfig', 'Failed to save cluster configuration', { 
        error: error.message,
        stack: error.stack 
      });
      
      // Return error result
      return {
        success: false,
        message: 'Failed to save configuration. Please try again.',
      };
    }
  }

  // ============================================================================
  // 4. Component Lifecycle (like Page_Load/Unload in VB.NET)
  // ============================================================================

  // Component mounted (like Page_Load event)
  React.useEffect(() => {
    // Load configuration on component mount (like loading data in Form_Load)
    loadConfiguration();
    
    // Start timer (like Timer.Enabled = True in VB.NET)
    const timer = setInterval(handleTimerTick, 1000);
    
    // Subscribe to timezone changes (like AddHandler in VB.NET)
    const unsubscribe = TimezoneService.subscribe(handleTimezoneChanged);
    
    // Cleanup on unmount (like Page_Unload in VB.NET)
    return () => {
      clearInterval(timer);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ============================================================================
  // 5. Helper Methods (like private methods in VB.NET)
  // ============================================================================

  // Get formatted current time (like formatting function in VB.NET)
  function getFormattedCurrentTime() {
    // Use global timezone service (like shared utility in VB.NET)
    return TimezoneService.formatTimeWithLabel(currentTime.toISOString());
  }

  // Get formatted last tested time (like formatting function in VB.NET)
  function getFormattedLastTestedTime() {
    if (!lastTestedAt) return null;
    
    // Format with timezone (like DateTime.ToString in VB.NET)
    return TimezoneService.formatTimeWithLabel(lastTestedAt.toISOString());
  }

  // Get connection status class (like conditional formatting in VB.NET) - Match GKE colors
  function getConnectionStatusClass() {
    if (isConnected) {
      return 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200';
    } else if (isFailed) {
      return 'bg-gradient-to-r from-rose-50 to-red-50 border-rose-200';
    } else {
      return 'bg-gradient-to-r from-slate-50 to-gray-50 border-surface-200';
    }
  }

  // Get connection status icon (like conditional icons in VB.NET)
  function getConnectionStatusIcon() {
    if (connecting || isLoading) return Loader2;
    if (isConnected) return CheckCircle2;
    if (isFailed) return AlertCircle;
    return Server;
  }

  // Get status message (like status label in VB.NET) - Match GKE format
  function getStatusMessage() {
    if (isLoading) return 'Loading configuration...';
    if (connecting) return 'Testing...';
    if (isConnected) return 'Connected';
    if (isFailed) return 'Disconnected';
    return 'Not Tested';
  }

  // ============================================================================
  // 6. Render Method (like form rendering in VB.NET)
  // ============================================================================

  return (
    <div className="space-y-6 animate-fade-in p-5">

      {/* ── Connection Status Banner (like StatusStrip in VB.NET) ───────────────── */}
      <div
        className={`rounded-2xl border shadow-sm p-5 ${getConnectionStatusClass()}`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {/* Status icon (like PictureBox in VB.NET) */}
            <div className="mt-0.5">
              {React.createElement(getConnectionStatusIcon(), {
                size: 20,
                className: connecting
                  ? 'animate-spin text-brand-600'
                  : isConnected
                  ? 'text-emerald-600'
                  : isFailed
                  ? 'text-rose-600'
                  : 'text-slate-600',
              })}
            </div>

            {/* Status content (like Label controls in VB.NET) */}
            <div className="flex-1">
              <p className="text-sm font-semibold text-surface-800">
                Connection Status:{' '}
                <span className={
                  isConnected 
                    ? 'text-emerald-600' 
                    : isFailed 
                    ? 'text-rose-600' 
                    : connecting 
                    ? 'text-brand-600' 
                    : 'text-slate-600'
                }>
                  {connecting
                    ? 'Testing...'
                    : isConnected
                      ? 'Connected'
                      : isFailed
                        ? 'Disconnected'
                        : 'Not Tested'}
                </span>
              </p>

              {/* Error message display (like ErrorProvider in VB.NET) */}
              {testError && !connecting && (
                <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                  {testError}
                </div>
              )}

              {/* Cluster information (like DataGrid in VB.NET) - Match GKE layout */}
              {clusterInfo && !connecting && (
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">Cluster Name:</span>{' '}
                    {clusterInfo.clusterName || 'N/A'}
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">Server Version:</span>{' '}
                    {clusterInfo.serverVersion || 'N/A'}
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">Platform:</span>{' '}
                    {clusterInfo.platform || 'N/A'}
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">API Server:</span>{' '}
                    {clusterInfo.apiServer || 'N/A'}
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">Nodes:</span>{' '}
                    {clusterInfo.nodes ?? 0} (Ready: {clusterInfo.nodesReady ?? 0})
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">Namespaces:</span>{' '}
                    {clusterInfo.namespaces ?? 0}
                  </p>
                  <p className="text-xs text-surface-600">
                    <span className="font-medium text-surface-700">Pods:</span>{' '}
                    {clusterInfo.pods ?? 0} (Running: {clusterInfo.podsRunning ?? 0})
                  </p>
                </div>
              )}

              {/* Current Time */}
              <div className="mt-2 flex items-center gap-1.5 text-xs text-surface-400">
                <Clock size={12} />
                <span>Current Time: {getFormattedCurrentTime()}</span>
              </div>
            </div>
          </div>

          {/* Test Connection button and Last Tested container */}
          <div className="flex flex-col items-end">
            {/* Test Connection button */}
            <button
              onClick={handleTestConnectionClick}
              disabled={connecting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {connecting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {connecting ? 'Testing...' : 'Test Connection'}
            </button>

            {/* Last Tested - below button, aligned left */}
            {getFormattedLastTestedTime() && !connecting && (
              <p className="text-xs text-surface-400 mt-2 text-left">
                Last Tested: {getFormattedLastTestedTime()}
              </p>
            )}
          </div>
        </div>

        {/* Inline progress bar */}
        {connecting && (
          <div className="mb-3">
            <div className="w-full bg-surface-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full animate-pulse w-2/3" />
            </div>
            <p className="text-xs text-surface-400 mt-1">Testing cluster connectivity...</p>
          </div>
        )}
      </div>

      {/* ── Configuration Form (like Form controls in VB.NET) ───────────────────── */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5">
        <h3 className="text-lg font-semibold text-surface-900 mb-4">Cluster Configuration</h3>

        <div className="space-y-4">
          {/* API Server URL (like TextBox in VB.NET) */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              API Server URL
            </label>
            <input
              type="text"
              value={form.apiServerUrl}
              onChange={(e) => handleFormFieldChange('apiServerUrl', e.target.value)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="https://cluster-api.example.com"
            />
            <p className="text-xs text-surface-500 mt-1">
              Enter the Kubernetes API server URL
            </p>
          </div>

          {/* Service Account Token (like TextBox with PasswordChar in VB.NET) */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1 flex items-center gap-1.5">
              <Shield size={14} className="text-surface-500" />
              Service Account Token
            </label>
            <textarea
              value={form.serviceAccountToken}
              onChange={(e) => handleFormFieldChange('serviceAccountToken', e.target.value)}
              placeholder={hasToken
                ? '••••••••••••••••••••••••••••••••'
                : 'Paste your service account token here...'}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none font-mono text-xs"
              style={{ WebkitTextSecurity: form.serviceAccountToken ? 'disc' : 'none' }}
            />
            <p className="text-xs text-surface-400 mt-1">
              {hasToken && !form.serviceAccountToken
                ? 'Token is stored securely on the server. Enter a new token to replace it.'
                : 'Bearer token for Kubernetes API authentication. Stored securely on the server.'}
            </p>
          </div>

          {/* Project ID (like TextBox in VB.NET) */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Project ID
            </label>
            <input
              type="text"
              value={form.projectId}
              onChange={(e) => handleFormFieldChange('projectId', e.target.value)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="my-project"
            />
            <p className="text-xs text-surface-500 mt-1">
              Google Cloud project ID or cluster project name
            </p>
          </div>

          {/* Region (like ComboBox in VB.NET) */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Region
            </label>
            <input
              type="text"
              value={form.region}
              onChange={(e) => handleFormFieldChange('region', e.target.value)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="us-central1"
            />
            <p className="text-xs text-surface-500 mt-1">
              Cluster region or zone
            </p>
          </div>

          {/* Cluster Name (like TextBox in VB.NET) */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Cluster Name
            </label>
            <input
              type="text"
              value={form.clusterName}
              onChange={(e) => handleFormFieldChange('clusterName', e.target.value)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="my-cluster"
            />
            <p className="text-xs text-surface-500 mt-1">
              Name of the Kubernetes cluster
            </p>
          </div>
        </div>

        {/* Save result message (like MessageBox in VB.NET) */}
        {saveResult && (
          <div
            className={`mt-4 p-3 rounded-lg text-sm ${
              saveResult.success
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {saveResult.message}
          </div>
        )}

        {/* Action buttons (like Button controls in VB.NET) */}
        <div className="flex items-center gap-3 pt-4 flex-wrap">
          <button
            onClick={handleSaveConfigurationClick}
            disabled={saving || !isConnected}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save Configuration
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
