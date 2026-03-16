// ============================================================================
// Settings — PulseOps V2 Core
//
// PURPOSE: Native core view for platform-wide settings. Uses ConfigLayout
// with vertical tabs: DB Connection, DB Configuration, Log Configuration,
// Authentication, SuperAdmin Auth, Database Setup, and General Settings.
// This is NOT a dynamic module — it is a hard-routed core view.
//
// ROUTE: /settings
//
// ARCHITECTURE: Reads all text from uiElementsText.json. Uses shared components
// exclusively. No inline hardcoded strings.
//
// DEPENDENCIES:
//   - @config/uiElementsText.json → All UI labels
//   - @config/urls.json           → API endpoints
//   - @shared → ConfigLayout, TestConnection, DatabaseManager,
//               Button, ConfirmationModal, ConnectionStatus
// ============================================================================
import React, { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Settings as SettingsIcon, Database, Layers, ScrollText,
  Shield, Globe, AlertTriangle, RefreshCw, Save, Globe2,
  ShieldCheck, Lock, Eye, EyeOff, ToggleLeft, ToggleRight,
  Plug, Monitor, Server, Package
} from 'lucide-react';
import { ConfigLayout, TestConnection, DatabaseManager, Button, ConfirmationModal, ConnectionStatus, TimezoneService, createLogger } from '@shared';
import uiText from '@config/uiElementsText.json';
import uiMessages from '@config/UIMessages.json';
import urls from '@config/urls.json';

const log = createLogger('Settings.jsx');

const viewText = uiText.coreViews.settings;
const tabText = viewText.tabs;
const authText = viewText.authSettings;
const connectionText = viewText.connectionStatus;

// ── Database Configuration Tab ──────────────────────────────────────────────
function DatabaseConfigTab() {
  const dbFieldsConfig = uiText.admin.settings.databaseConfiguration.fields;
  const dbFields = [
    { name: 'host', label: dbFieldsConfig.host.label, placeholder: dbFieldsConfig.host.placeholder, type: 'text' },
    { name: 'port', label: dbFieldsConfig.port.label, placeholder: dbFieldsConfig.port.placeholder, type: 'text' },
    { name: 'database', label: dbFieldsConfig.database.label, placeholder: dbFieldsConfig.database.placeholder, type: 'text' },
    { name: 'schema', label: dbFieldsConfig.schema.label, placeholder: dbFieldsConfig.schema.placeholder, type: 'text' },
    { name: 'username', label: dbFieldsConfig.username.label, placeholder: dbFieldsConfig.username.placeholder, type: 'text' },
    { name: 'password', label: dbFieldsConfig.password.label, placeholder: dbFieldsConfig.password.placeholder, type: 'password' },
  ];

  const [savedConfig, setSavedConfig] = useState({});
  const [connStatus, setConnStatus] = useState({ status: 'loading', message: connectionText.testing, meta: null, lastTested: null });
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = React.useRef(null);
  const initRan = React.useRef(false);

  const checkConnection = useCallback(async () => {
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
    
    setConnStatus({ status: 'loading', message: connectionText.testing, meta: null, lastTested: null });
    try {
      const response = await fetch(urls.database.connection, { credentials: 'include' });
      
      // Add minimum delay to show progress animation (at least 2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const result = await response.json();
      const timeString = TimezoneService.formatCurrentTime();
      
      // Ensure progress is at 100%
      setProgress(100);
      
      if (result?.success) {
        const data = result.data || {};
        const parts = [];
        if (data.latencyMs != null) parts.push(`${connectionText.responseTime} ${data.latencyMs}ms`);
        if (data.dbType) parts.push(`${connectionText.dbType} ${data.dbType}`);
        if (data.dbVersion) parts.push(`${connectionText.version} ${data.dbVersion.split(',')[0].replace('PostgreSQL ', '')}`);
        setConnStatus({ status: 'success', message: connectionText.connected, meta: parts.join(` ${connectionText.metaSeparator} `) || null, lastTested: timeString });
      } else {
        setConnStatus({ status: 'error', message: result?.error?.message || connectionText.failed, meta: null, lastTested: timeString });
      }
    } catch (err) {
      // Ensure progress is at 100% on error
      setProgress(100);
      setConnStatus({ status: 'error', message: err.message || connectionText.failed, meta: null, lastTested: TimezoneService.formatCurrentTime() });
    } finally {
      // Clear progress animation interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      // Reset progress after a delay
      setTimeout(() => setProgress(0), 1000);
    }
  }, []);

  // Load saved config from API on mount (no hardcoded defaults)
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('DatabaseConfigTab', 'Tab accessed — loading saved configuration + checking connection');
    checkConnection();
    const loadConfig = async () => {
      try {
        const response = await fetch(urls.database.config, { credentials: 'include' });
        if (response.ok) {
          const result = await response.json();
          if (result?.data) {
            setSavedConfig({
              host: result.data.host || '',
              port: result.data.port ? String(result.data.port) : '',
              database: result.data.database || '',
              schema: result.data.schema || '',
              username: result.data.user || '',
            });
            log.info('DatabaseConfigTab', 'Config loaded from API', { host: result.data.host, database: result.data.database });
          }
        }
      } catch (err) {
        log.error('DatabaseConfigTab', 'Failed to load saved config', { message: err.message });
      }
    };
    loadConfig();
  }, []);

  const handleTest = useCallback(async (config) => {
    log.info('DatabaseConfigTab:handleTest', 'Testing connection', { host: config.host, port: config.port, database: config.database });
    try {
      const response = await fetch(urls.database.testConfig, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config),
      });
      const result = await response.json();

      if (result?.success) {
        const latency = result.data?.latencyMs || 0;
        const dbVersion = result.data?.dbVersion || '';
        const dbType = result.data?.dbType || '';
        const versionShort = dbVersion ? dbVersion.split(',')[0].replace('PostgreSQL ', '') : '';
        const parts = [`${connectionText.responseTime} ${latency}ms`];
        if (dbType) parts.push(`${connectionText.dbType} ${dbType}`);
        if (versionShort) parts.push(`${connectionText.version} ${versionShort}`);
        const metaText = parts.join(` ${connectionText.metaSeparator} `);
        log.info('DatabaseConfigTab:handleTest', 'Connection test successful', { latency, dbType, version: versionShort });
        return {
          success: true,
          message: result.data?.message || connectionText.connected,
          meta: metaText,
        };
      }

      log.warn('DatabaseConfigTab:handleTest', 'Connection test failed', { message: result?.error?.message });
      return { success: false, message: result?.error?.message || connectionText.failed };
    } catch (err) {
      log.error('DatabaseConfigTab:handleTest', 'Connection test error', { message: err.message });
      return { success: false, message: err.message || connectionText.failed };
    }
  }, []);

  const handleTestResult = useCallback((result) => {
    setProgress(result.progress || 0);
    setConnStatus({
      status: result.status,
      message: result.message,
      meta: result.meta || null,
      lastTested: result.lastTested || null,
    });
  }, []);

  const handleSave = useCallback(async (config) => {
    log.info('DatabaseConfigTab:handleSave', 'Saving configuration', { host: config.host, database: config.database });
    const response = await fetch(urls.database.config, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(config),
    });
    const result = await response.json();
    if (!result?.success) {
      log.error('DatabaseConfigTab:handleSave', 'Save failed', { message: result?.error?.message });
      throw new Error(result?.error?.message || uiText.errors.serverError);
    }
    log.info('DatabaseConfigTab:handleSave', 'Configuration saved successfully');
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Live Connection Status (auto-checked on tab open) */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-surface-800">{connectionText.type} Status</p>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} onClick={checkConnection} isLoading={connStatus.status === 'loading'}>
            {viewText.dbConnection?.recheckButton || 'Re-check'}
          </Button>
        </div>
        <ConnectionStatus
          type={connectionText.type}
          status={connStatus.status}
          message={connStatus.message}
          meta={connStatus.meta}
          lastTested={connStatus.lastTested}
          icon={Database}
          progress={progress}
          showBadge
        />
      </div>
      {/* Configuration Form */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
        <TestConnection
          title={tabText.dbConfig}
          description={viewText.subtitle}
          icon={Database}
          fields={dbFields}
          onTest={handleTest}
          onSave={handleSave}
          onTestResult={handleTestResult}
          initialConfig={savedConfig}
        />
      </div>
    </div>
  );
}

// ── Database Connection Tab (auto-check on open) ──────────────────────────
function DatabaseConnectionTab() {
  const connText = viewText.dbConnection || {};
  const [status, setStatus] = useState({ status: 'loading', message: connectionText.testing, meta: null, lastTested: null });
  const initRan = React.useRef(false);

  const checkConnection = useCallback(async () => {
    log.info('DatabaseConnectionTab:checkConnection', 'Checking database connection');
    setStatus({ status: 'loading', message: connectionText.testing, meta: null, lastTested: null });
    try {
      const response = await fetch(urls.database.connection, { credentials: 'include' });
      const result = await response.json();
      const timeString = TimezoneService.formatCurrentTime();
      if (result?.success) {
        const data = result.data || {};
        const parts = [];
        if (data.latencyMs != null) parts.push(`${connectionText.responseTime} ${data.latencyMs}ms`);
        if (data.dbType) parts.push(`${connectionText.dbType} ${data.dbType}`);
        if (data.dbVersion) parts.push(`${connectionText.version} ${data.dbVersion.split(',')[0].replace('PostgreSQL ', '')}`);
        setStatus({
          status: 'success',
          message: connectionText.connected,
          meta: parts.join(` ${connectionText.metaSeparator} `) || null,
          lastTested: timeString,
        });
        log.info('DatabaseConnectionTab:checkConnection', 'Connection OK', { latency: data.latencyMs });
      } else {
        const errMsg = result?.error?.message || connectionText.failed;
        setStatus({ status: 'error', message: errMsg, meta: null, lastTested: timeString });
        log.warn('DatabaseConnectionTab:checkConnection', `Connection failed: ${errMsg}`);
      }
    } catch (err) {
      setStatus({ status: 'error', message: err.message || connectionText.failed, meta: null, lastTested: TimezoneService.formatCurrentTime() });
      log.error('DatabaseConnectionTab:checkConnection', 'Connection error', { message: err.message });
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('DatabaseConnectionTab', 'Tab opened — auto-checking database connection');
    checkConnection();
  }, [checkConnection]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-surface-800 mb-1">{connText.title || tabText.dbConnection}</h3>
          <p className="text-sm text-surface-400">{connText.subtitle}</p>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={checkConnection} isLoading={status.status === 'loading'}>
          {connText.recheckButton}
        </Button>
      </div>
      <ConnectionStatus
        type={connectionText.type}
        status={status.status}
        message={status.message}
        meta={status.meta}
        lastTested={status.lastTested}
        icon={Database}
        showBadge
      />
    </div>
  );
}

// ── Database Objects Tab (used as Database Setup under SuperAdmin) ──────────
function DatabaseObjectsTab() {
  const [dbStatus, setDbStatus] = useState({
    connected: false, exists: false, schemaInitialized: false, hasDefaultData: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const initRan = React.useRef(false);

  const checkStatus = useCallback(async () => {
    log.info('DatabaseObjectsTab:checkStatus', 'Checking database connection and schema status');
    setIsLoading(true);
    try {
      // Step 1: Test actual DB connection with server config
      const connResponse = await fetch(urls.database.connection, { credentials: 'include' });
      const connResult = await connResponse.json();

      if (!connResult?.success) {
        // Connection failed — check if it's because DB doesn't exist
        const errMsg = connResult?.error?.message || connectionText.failed;
        const errCode = connResult?.error?.code || 'CONNECTION_FAILED';
        log.warn('DatabaseObjectsTab:checkStatus', `Connection test failed: ${errMsg}`, { code: errCode });
        
        // If DB doesn't exist, we can still show the Create Database button
        // Only show connection error if it's a real connection issue (not just missing DB)
        const isDbNotExist = errCode === 'DB_NOT_EXIST';
        
        setDbStatus({
          connected: !isDbNotExist,  // Connected to server but DB doesn't exist
          exists: false,              // Database doesn't exist
          schemaInitialized: false,
          hasDefaultData: false,
          connectionError: isDbNotExist ? null : errMsg,  // Only show error if not DB_NOT_EXIST
        });
        setIsLoading(false);
        return;
      }

      log.info('DatabaseObjectsTab:checkStatus', 'Connection test passed — checking schema status');

      // Step 2: Connection succeeded — now check schema status
      const response = await fetch(urls.database.schema, { credentials: 'include' });
      const result = await response.json();
      if (result?.success && result?.data) {
        const status = {
          connected: true,
          exists: result.data.connected !== false,
          schemaInitialized: result.data.initialized !== false,
          hasDefaultData: result.data.hasDefaultData !== false,
          connectionError: null,
        };
        setDbStatus(status);
        log.info('DatabaseObjectsTab:checkStatus', 'Schema status loaded', status);
      } else {
        setDbStatus({ connected: true, exists: true, schemaInitialized: false, hasDefaultData: false, connectionError: null });
        log.warn('DatabaseObjectsTab:checkStatus', 'Schema status returned no data');
      }
    } catch (err) {
      setDbStatus({ connected: false, exists: false, schemaInitialized: false, hasDefaultData: false, connectionError: err.message });
      log.error('DatabaseObjectsTab:checkStatus', 'Failed to check status', { message: err.message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initRan.current) {
      initRan.current = true;
      log.info('DatabaseObjectsTab', 'Tab accessed — loading database objects status');
      checkStatus();
    }
  }, [checkStatus]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-surface-800 mb-1">{viewText.databaseSetup?.title || tabText.databaseSetup}</h3>
          <p className="text-sm text-surface-400">{viewText.subtitle}</p>
        </div>
        <Button variant="primary" size="sm" icon={<RefreshCw />} onClick={checkStatus} isLoading={isLoading}>
          Refresh All
        </Button>
      </div>
      <DatabaseManager
        onCreateDatabase={async () => {
          log.info('DatabaseObjectsTab', 'Creating database');
          const res = await fetch(urls.database.instance, { method: 'POST', credentials: 'include' });
          const result = await res.json();
          if (!result?.success) { log.error('DatabaseObjectsTab', 'Create database failed', { message: result?.error?.message }); throw new Error(result?.error?.message || uiText.errors.serverError); }
          log.info('DatabaseObjectsTab', 'Database created successfully', result.data);
          return result.data;
        }}
        onDeleteDatabase={async () => {
          log.info('DatabaseObjectsTab', 'Deleting database');
          const res = await fetch(urls.database.instance, { method: 'DELETE', credentials: 'include' });
          const result = await res.json();
          if (!result?.success) { log.error('DatabaseObjectsTab', 'Delete database failed', { message: result?.error?.message }); throw new Error(result?.error?.message || uiText.errors.serverError); }
          log.info('DatabaseObjectsTab', 'Database deleted successfully', result.data);
          return result.data;
        }}
        onInitializeSchema={async () => {
          log.info('DatabaseObjectsTab', 'Initializing schema');
          const res = await fetch(urls.database.schema, { method: 'POST', credentials: 'include' });
          const result = await res.json();
          if (!result?.success) { log.error('DatabaseObjectsTab', 'Schema init failed', { message: result?.error?.message }); throw new Error(result?.error?.message || uiText.errors.serverError); }
          log.info('DatabaseObjectsTab', 'Schema initialized successfully', result.data);
          return result.data;
        }}
        onLoadDefaultData={async () => {
          log.info('DatabaseObjectsTab', 'Loading default data');
          const res = await fetch(urls.database.schemaSeed, { method: 'POST', credentials: 'include' });
          const result = await res.json();
          if (!result?.success) { log.error('DatabaseObjectsTab', 'Load default data failed', { message: result?.error?.message }); throw new Error(result?.error?.message || uiText.errors.serverError); }
          log.info('DatabaseObjectsTab', 'Default data loaded successfully', result.data);
          return result.data;
        }}
        onCleanDefaultData={async () => {
          log.info('DatabaseObjectsTab', 'Cleaning default data');
          const res = await fetch(urls.database.schemaSeed, { method: 'DELETE', credentials: 'include' });
          const result = await res.json();
          if (!result?.success) { log.error('DatabaseObjectsTab', 'Clean default data failed', { message: result?.error?.message }); throw new Error(result?.error?.message || uiText.errors.serverError); }
          log.info('DatabaseObjectsTab', 'Default data cleaned successfully', result.data);
          return result.data;
        }}
        onWipeDatabase={async () => {
          log.info('DatabaseObjectsTab', 'Wiping database');
          const res = await fetch(urls.database.schema, { method: 'DELETE', credentials: 'include' });
          const result = await res.json();
          if (!result?.success) { log.error('DatabaseObjectsTab', 'Wipe database failed', { message: result?.error?.message }); throw new Error(result?.error?.message || uiText.errors.serverError); }
          log.info('DatabaseObjectsTab', 'Database wiped successfully', result.data);
          return result.data;
        }}
        onRefreshStatus={checkStatus}
        dbStatus={dbStatus}
        isLoading={isLoading}
      />
    </div>
  );
}

// ── Log Configuration Tab (DB-only: enabled toggle, level, capture, management) ───
function LogConfigTabNew() {
  const lcText = viewText.logConfig || {};
  const [cfg, setCfg] = useState({
    enabled: true,
    defaultLevel: 'info',
    captureOptions: { uiLogs: true, apiLogs: true, consoleLogs: false, moduleLogs: true },
    management: { maxUiEntries: 1000, maxApiEntries: 500, pushIntervalMs: 30000 },
    moduleLogsEnabled: {},
    suppressConsolePaths: [],
  });
  const [installedModules, setInstalledModules] = useState([]);
  const [dbStatus, setDbStatus] = useState({ status: 'idle', message: '' });
  const [dbProgress, setDbProgress] = useState(0);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const initRan = React.useRef(false);

  function ToggleRow({ label, description, enabled, onToggle, icon: Icon }) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          {Icon && <Icon size={16} className="text-surface-500" />}
          <div className="text-xs font-semibold text-surface-700">{label}</div>
        </div>
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

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('LogConfigTab', 'Tab accessed — loading log configuration');
    const load = async () => {
      try {
        // Fetch log config and installed modules in parallel
        const [cfgRes, modRes] = await Promise.all([
          fetch(urls.logs.config, { credentials: 'include' }),
          fetch(urls.modules.list, { credentials: 'include' }),
        ]);
        const cfgResult = await cfgRes.json();
        const modResult = await modRes.json();

        // Process installed modules (non-core, enabled)
        let modules = [];
        if (modResult?.success && Array.isArray(modResult.data)) {
          modules = modResult.data
            .filter(m => m.installed && m.enabled && !m.isCore)
            .map(m => ({ key: m.name, label: m.name, description: m.description || '' }));
        }
        setInstalledModules(modules);

        if (cfgResult?.success && cfgResult?.data) {
          const d = cfgResult.data;
          // Auto-populate moduleLogsEnabled for any installed module not yet in config
          const existingMap = d.moduleLogsEnabled || {};
          const mergedMap = { ...existingMap };
          for (const mod of modules) {
            if (!(mod.key in mergedMap)) mergedMap[mod.key] = true;
          }
          setCfg({
            enabled: d.enabled !== false,
            defaultLevel: d.defaultLevel || 'info',
            captureOptions: d.captureOptions || { uiLogs: true, apiLogs: true, consoleLogs: false, moduleLogs: true },
            management: d.management || { maxUiEntries: 1000, maxApiEntries: 500, pushIntervalMs: 30000 },
            moduleLogsEnabled: mergedMap,
            suppressConsolePaths: d.suppressConsolePaths || [],
          });
          log.info('LogConfigTab', 'Config loaded', { enabled: d.enabled, level: d.defaultLevel, modules: modules.length });
        }
      } catch (err) {
        log.error('LogConfigTab', 'Failed to load config', { message: err.message });
      }
    };
    load();
    // Auto-check database connection on page load
    testDbConnection();
  }, []);

  const testDbConnection = useCallback(async () => {
    log.info('LogConfigTab:testDbConnection', 'Testing DB connection for logging');
    setDbProgress(0);
    
    // Animate progress from 0 to 100 over 2 seconds using interval
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress += 5; // Increment by 5% every 100ms = 100% in 2 seconds
      if (currentProgress >= 100) {
        currentProgress = 100;
        clearInterval(progressInterval);
      }
      setDbProgress(currentProgress);
    }, 100);
    
    setDbStatus({ status: 'loading', message: connectionText.testing, lastTested: null });
    try {
      const res = await fetch(urls.database.connection, { credentials: 'include' });
      
      // Add minimum delay to show progress animation (at least 2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const result = await res.json();
      const timeString = TimezoneService.formatCurrentTime();
      
      // Ensure progress is at 100%
      setDbProgress(100);
      
      if (result?.success) {
        setDbStatus({ status: 'success', message: connectionText.connected, lastTested: timeString });
        log.info('LogConfigTab:testDbConnection', 'DB connection OK for logging');
      } else {
        const errMsg = result?.error?.message || lcText.dbNotReady || connectionText.failed;
        setDbStatus({ status: 'error', message: errMsg, lastTested: timeString });
        log.warn('LogConfigTab:testDbConnection', 'DB connection failed', { error: result?.error?.code });
      }
    } catch (err) {
      setDbProgress(100);
      setDbStatus({ status: 'error', message: err.message || connectionText.failed, lastTested: TimezoneService.formatCurrentTime() });
      log.error('LogConfigTab:testDbConnection', 'Test failed', { message: err.message });
    } finally {
      // Reset progress after a delay
      setTimeout(() => setDbProgress(0), 1000);
    }
  }, []);

  const handleSaveAction = useCallback(async () => {
    log.info('LogConfigTab:handleSaveAction', 'Saving log configuration', cfg);
    const res = await fetch(urls.logs.config, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(cfg),
    });
    const result = await res.json();
    if (!result?.success) {
      log.error('LogConfigTab:handleSaveAction', 'Save failed', { message: result?.error?.message });
      throw new Error(result?.error?.message || 'Save failed');
    }
    log.info('LogConfigTab:handleSaveAction', 'Log configuration saved');
    return { enabled: cfg.enabled, level: cfg.defaultLevel };
  }, [cfg]);

  const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-base font-bold text-surface-800 mb-1">{lcText.title || tabText.logConfig}</h3>
        <p className="text-sm text-surface-400">{lcText.subtitle}</p>
      </div>

      {/* Enable Database Logging & Database Connection */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm space-y-6">
        {/* Enable Database Logging */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-surface-800">{lcText.enabledLabel}</p>
            <p className="text-xs text-surface-500 mt-0.5">{lcText.enabledDesc}</p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${cfg.enabled ? 'bg-brand-500' : 'bg-surface-300'}`}
              onClick={() => {
                if (!cfg.enabled && dbStatus.status !== 'success') {
                  return;
                }
                setCfg(prev => ({ ...prev, enabled: !prev.enabled }));
              }}
              title={dbStatus.status !== 'success' ? lcText.dbNotReady : undefined}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${cfg.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <Button variant="primary" size="sm" className="font-normal" icon={<Plug size={13} />} onClick={testDbConnection} isLoading={dbStatus.status === 'loading'}>
              {lcText.refreshConnectionButton}
            </Button>
          </div>
        </div>

        {/* Database Connection */}
        <div>
          {dbStatus.status !== 'idle' && (
            <ConnectionStatus
              type={connectionText.type}
              status={dbStatus.status}
              message={dbStatus.message}
              lastTested={dbStatus.lastTested}
              icon={Database}
              progress={dbProgress}
              showBadge
            />
          )}
        </div>
      </div>

      {/* Log Level */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm space-y-2">
        <p className="text-sm font-semibold text-surface-800">{lcText.logLevelLabel}</p>
        <p className="text-xs text-surface-400">{lcText.logLevelDesc}</p>
        <div className="flex gap-2 flex-wrap mt-2">
          {LOG_LEVELS.map(level => (
            <button
              key={level}
              type="button"
              onClick={() => setCfg(prev => ({ ...prev, defaultLevel: level }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                cfg.defaultLevel === level
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Capture Options */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
        <div className="text-center">
          <h5 className="text-xs font-bold uppercase tracking-wider text-surface-400 mb-3">Log Capture Options</h5>
          <div className="flex justify-center gap-2">
            <ToggleRow
              icon={Monitor}
              label="Console Output"
              description="Mirror logs to the browser developer console"
              enabled={cfg.captureOptions.consoleLogs}
              onToggle={() => setCfg(prev => ({ ...prev, captureOptions: { ...prev.captureOptions, consoleLogs: !prev.captureOptions.consoleLogs } }))}
            />
            <div className="w-1 h-16 bg-gradient-to-b from-transparent via-brand-400 to-transparent shadow-lg" />
            <ToggleRow
              icon={Server}
              label="API Logs"
              description="Track all backend API requests and responses"
              enabled={cfg.captureOptions.apiLogs}
              onToggle={() => setCfg(prev => ({ ...prev, captureOptions: { ...prev.captureOptions, apiLogs: !prev.captureOptions.apiLogs } }))}
            />
            <div className="w-1 h-16 bg-gradient-to-b from-transparent via-brand-400 to-transparent shadow-lg" />
            <ToggleRow
              icon={Eye}
              label="UI Logs"
              description="Capture UI interaction and navigation events"
              enabled={cfg.captureOptions.uiLogs}
              onToggle={() => setCfg(prev => ({ ...prev, captureOptions: { ...prev.captureOptions, uiLogs: !prev.captureOptions.uiLogs } }))}
            />
            <div className="w-1 h-16 bg-gradient-to-b from-transparent via-brand-400 to-transparent shadow-lg" />
            <ToggleRow
              icon={Package}
              label="Module Logs"
              description="Enable logging for specific modules"
              enabled={cfg.captureOptions.moduleLogs}
              onToggle={() => setCfg(prev => ({ ...prev, captureOptions: { ...prev.captureOptions, moduleLogs: !prev.captureOptions.moduleLogs } }))}
            />
          </div>
        </div>
      </div>

      {/* Module Logs — Enable / Disable (dynamic from installed modules) */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm space-y-4">
        <div>
          <p className="text-sm font-semibold text-surface-800">Module Logs</p>
          <p className="text-xs text-surface-400 mt-0.5">Enable or disable logging per installed module. Disabled modules produce no terminal or database logs. The global Log Level above controls the threshold for all enabled modules.</p>
        </div>
        {installedModules.length === 0 ? (
          <p className="text-xs text-surface-400 italic">No add-on modules installed.</p>
        ) : (
          <div className="space-y-1">
            {installedModules.map(mod => {
              const isEnabled = cfg.moduleLogsEnabled?.[mod.key] !== false;
              return (
                <div key={mod.key} className="flex items-center justify-between py-2.5 border-b border-surface-100 last:border-0">
                  <div>
                    <p className="text-xs font-semibold text-surface-700">{mod.label}</p>
                    <p className="text-[10px] text-surface-400">{mod.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold ${isEnabled ? 'text-emerald-600' : 'text-surface-400'}`}>
                      {isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <div
                      className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${isEnabled ? 'bg-brand-500' : 'bg-surface-300'}`}
                      onClick={() => setCfg(prev => ({ ...prev, moduleLogsEnabled: { ...prev.moduleLogsEnabled, [mod.key]: !isEnabled } }))}
                    >
                      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Terminal Console Suppression */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm space-y-3">
        <div>
          <p className="text-sm font-semibold text-surface-800">Terminal Console — Suppress Noisy Paths</p>
          <p className="text-xs text-surface-400 mt-0.5">When enabled, requests to the listed API paths will NOT print to the terminal console, reducing noise from frequent background calls (e.g. log push).</p>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-surface-100">
          <div>
            <p className="text-xs font-semibold text-surface-700">Suppress <code className="bg-surface-100 px-1 rounded">/api/logs</code> from Terminal</p>
            <p className="text-[10px] text-surface-400">Hides POST /api/logs/ui and /api/logs/api push entries from terminal output</p>
          </div>
          <div
            className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${
              cfg.suppressConsolePaths?.includes('/api/logs') ? 'bg-brand-500' : 'bg-surface-300'
            }`}
            onClick={() => setCfg(prev => ({
              ...prev,
              suppressConsolePaths: prev.suppressConsolePaths?.includes('/api/logs')
                ? prev.suppressConsolePaths.filter(p => p !== '/api/logs')
                : [...(prev.suppressConsolePaths || []), '/api/logs'],
            }))}
          >
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
              cfg.suppressConsolePaths?.includes('/api/logs') ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </div>
        </div>
        
      </div>

      {/* Management Settings */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-surface-800">{lcText.managementLabel}</p>
        {[
          { key: 'maxUiEntries',  label: lcText.maxUiLabel },
          { key: 'maxApiEntries', label: lcText.maxApiLabel },
          { key: 'pushIntervalMs', label: lcText.pushIntervalLabel },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center gap-4">
            <label className="text-xs text-surface-600 w-48 shrink-0">{label}</label>
            <input
              type="number"
              value={cfg.management[key] || ''}
              onChange={(e) => setCfg(prev => ({ ...prev, management: { ...prev.management, [key]: Number(e.target.value) } }))}
              className="w-32 px-3 py-1.5 text-sm border border-surface-200 rounded-lg bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
        ))}
      </div>

      <Button variant="primary" size="md" icon={<Save size={15} />} onClick={() => setShowSaveModal(true)} isLoading={isSaving}>
        {lcText.saveButton}
      </Button>

      <ConfirmationModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="Save Log Configuration"
        actionDescription="update the database logging configuration"
        actionTarget="Log Configuration"
        actionDetails={[
          { label: 'Logging Enabled', value: cfg.enabled ? 'Yes' : 'No' },
          { label: 'Log Level', value: cfg.defaultLevel },
        ]}
        confirmLabel="Save"
        action={handleSaveAction}
        onSuccess={() => log.info('LogConfigTab', 'Save confirmed')}
        variant="info"
        buildSummary={(data) => [
          { label: 'Logging', value: data?.enabled ? 'Enabled' : 'Disabled' },
          { label: 'Level', value: data?.level },
          { label: 'Status', value: 'Saved successfully' },
        ]}
      />
    </div>
  );
}

// Alias keeps the name consistent with the tabs array reference
const LogConfigTab = LogConfigTabNew;

// ── Authentication Settings Tab (database + social only, no json_file) ───────
function AuthSettingsTab() {
  const [currentProvider, setCurrentProvider] = useState('database');
  const [selectedProvider, setSelectedProvider] = useState('database');
  const [dbReady, setDbReady] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const initRan = React.useRef(false);

  const PROVIDER_ICONS = { database: Database, social: Globe };
  const providerIds = ['database', 'social'];

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('AuthSettingsTab', 'Tab accessed — loading current auth provider');
    const load = async () => {
      try {
        const [provRes, dbRes] = await Promise.allSettled([
          fetch(urls.auth.provider, { credentials: 'include' }),
          fetch(urls.database.schema, { credentials: 'include' }),
        ]);
        if (provRes.status === 'fulfilled') {
          const r = await provRes.value.json();
          if (r?.success && r?.data?.provider) {
            setCurrentProvider(r.data.provider);
            setSelectedProvider(r.data.provider);
            log.info('AuthSettingsTab', `Auth provider loaded: ${r.data.provider}`);
          }
        }
        if (dbRes.status === 'fulfilled') {
          const r = await dbRes.value.json();
          if (r?.success && r?.data?.initialized && r?.data?.hasDefaultData) {
            setDbReady(true);
          }
        }
      } catch (err) {
        log.warn('AuthSettingsTab', 'Failed to load auth provider', { message: err.message });
      }
    };
    load();
  }, []);

  const handleSwitchProvider = useCallback(async () => {
    log.info('AuthSettingsTab:handleSwitchProvider', `Switching provider: ${currentProvider} → ${selectedProvider}`);
    const response = await fetch(urls.auth.provider, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider: selectedProvider }),
    });
    const result = await response.json();
    if (!result?.success) {
      log.error('AuthSettingsTab:handleSwitchProvider', 'Switch failed', { message: result?.error?.message });
      throw new Error(result?.error?.message || uiText.errors.serverError);
    }
    log.info('AuthSettingsTab:handleSwitchProvider', `Provider switched to: ${selectedProvider}`);
    return { provider: selectedProvider, previous: currentProvider };
  }, [selectedProvider, currentProvider]);

  const handleSwitchSuccess = useCallback((result) => {
    log.info('AuthSettingsTab:handleSwitchSuccess', `Provider confirmed: ${result.provider}`);
    setCurrentProvider(result.provider);
  }, []);

  const hasChange = selectedProvider !== currentProvider;

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h3 className="text-base font-bold text-surface-800 mb-1">{authText.title}</h3>
        <p className="text-sm text-surface-400">{authText.subtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
        <div className="space-y-3">
          {providerIds.map(providerId => {
            const provTxt = authText.providers?.[providerId] || {};
            const Icon = PROVIDER_ICONS[providerId] || Shield;
            const isActive = providerId === currentProvider;
            const isSelected = providerId === selectedProvider;
            const isSocial = providerId === 'social';
            const isDbProvider = providerId === 'database';
            const isDisabled = isSocial || (isDbProvider && !dbReady);

            return (
              <button
                key={providerId}
                onClick={() => !isDisabled && setSelectedProvider(providerId)}
                disabled={isDisabled}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isDisabled
                    ? 'border-surface-100 bg-surface-50 cursor-not-allowed opacity-60'
                    : isSelected
                      ? 'border-brand-500 bg-brand-50/50'
                      : 'border-surface-200 hover:border-surface-300 cursor-pointer'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Icon size={18} className={`mt-0.5 shrink-0 ${isSelected && !isDisabled ? 'text-brand-600' : 'text-surface-400'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-surface-800">{provTxt.label || providerId}</p>
                      <p className="text-xs text-surface-500 mt-0.5">{provTxt.description}</p>
                      <p className="text-[11px] text-surface-400 mt-1">{provTxt.detail}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {isActive && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-brand-100 text-brand-700">
                        {authText.activeBadge}
                      </span>
                    )}
                    {isSocial && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-surface-200 text-surface-500">
                        {authText.comingSoonBadge}
                      </span>
                    )}
                    {isDbProvider && !dbReady && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-amber-100 text-amber-700">
                        {authText.dbNotReadyBadge || 'DB Not Ready'}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {hasChange && selectedProvider === 'database' && !dbReady && (
          <div className="flex items-start gap-2 p-3 mt-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">{authText.dbNotReadyWarning}</p>
              <p className="mt-0.5 text-amber-700">{authText.dbRequiredNote}</p>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => setShowModal(true)} disabled={!hasChange}>
            {authText.switchButton}
          </Button>
          {hasChange && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedProvider(currentProvider)}>
              {uiText.common.cancel}
            </Button>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={authText.crud?.switchProvider?.confirmLabel || 'Switch Auth Provider'}
        actionDescription={`switch authentication provider to ${authText.providers?.[selectedProvider]?.label || selectedProvider}`}
        actionTarget="Platform Authentication"
        actionDetails={[
          { label: 'Current Provider', value: authText.providers?.[currentProvider]?.label || currentProvider },
          { label: 'New Provider',     value: authText.providers?.[selectedProvider]?.label || selectedProvider },
        ]}
        confirmLabel={authText.crud?.switchProvider?.confirmLabel || 'Switch Provider'}
        action={handleSwitchProvider}
        onSuccess={handleSwitchSuccess}
        variant="warning"
        buildSummary={(data) => [
          { label: 'Provider',  value: authText.providers?.[data?.provider]?.label || data?.provider },
          { label: 'Previous',  value: authText.providers?.[data?.previous]?.label || data?.previous },
          { label: 'Status',    value: authText.crud?.switchProvider?.summarySuccess || 'Switched successfully' },
        ]}
      />
    </div>
  );
}

// ── SuperAdmin Auth Tab ──────────────────────────────────────────────────────
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?`~]).{12,}$/;

function SuperAdminAuthTab() {
  const saText = viewText.superAdminAuth || {};
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [profileInfo, setProfileInfo] = useState(null);
  const initRan = React.useRef(false);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('SuperAdminAuthTab', 'Tab accessed — loading SuperAdmin profile');
    const load = async () => {
      try {
        const res = await fetch(urls.superAdmin.profile, { credentials: 'include' });
        const result = await res.json();
        if (result?.success && result?.data) {
          setProfileInfo(result.data);
          log.info('SuperAdminAuthTab', 'SuperAdmin profile loaded', { email: result.data.email });
        }
      } catch (err) {
        log.warn('SuperAdminAuthTab', 'Could not load SuperAdmin profile', { message: err.message });
      }
    };
    load();
  }, []);

  const validate = useCallback(() => {
    if (!currentPassword || !newPassword || !confirmPassword) return null;
    if (newPassword !== confirmPassword) return saText.passwordMismatch;
    if (!PASSWORD_REGEX.test(newPassword)) return saText.passwordWeak;
    return true;
  }, [currentPassword, newPassword, confirmPassword, saText]);

  const handleSaveAction = useCallback(async () => {
    log.info('SuperAdminAuthTab:handleSaveAction', 'Updating SuperAdmin password');
    const response = await fetch(urls.superAdmin.password, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const result = await response.json();
    if (!result?.success) {
      log.error('SuperAdminAuthTab:handleSaveAction', 'Password update failed', { message: result?.error?.message });
      throw new Error(result?.error?.message || 'Password update failed');
    }
    log.info('SuperAdminAuthTab:handleSaveAction', 'SuperAdmin password updated successfully');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    return { status: 'updated' };
  }, [currentPassword, newPassword]);

  const validationResult = validate();
  const canSubmit = validationResult === true;
  const validationError = (validationResult !== null && validationResult !== true) ? validationResult : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-base font-bold text-surface-800 mb-1">{saText.title}</h3>
        <p className="text-sm text-surface-400">{saText.subtitle}</p>
      </div>

      {profileInfo && (
        <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-surface-500 mb-3">{saText.profileSection}</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <ShieldCheck size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-surface-800">{profileInfo.name || 'SuperAdmin'}</p>
              <p className="text-xs text-surface-500">{profileInfo.email}</p>
              <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-amber-100 text-amber-700">
                {profileInfo.role || 'super_admin'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm space-y-4">
        {[
          { label: saText.currentPasswordLabel, value: currentPassword, setter: setCurrentPassword, show: showCurrent, toggleShow: () => setShowCurrent(v => !v), placeholder: saText.currentPasswordPlaceholder },
          { label: saText.newPasswordLabel,     value: newPassword,     setter: setNewPassword,     show: showNew,     toggleShow: () => setShowNew(v => !v),     placeholder: saText.newPasswordPlaceholder },
          { label: saText.confirmPasswordLabel, value: confirmPassword, setter: setConfirmPassword, show: showConfirm, toggleShow: () => setShowConfirm(v => !v), placeholder: saText.confirmPasswordPlaceholder },
        ].map(({ label, value, setter, show, toggleShow, placeholder }) => (
          <div key={label}>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">{label}</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type={show ? 'text' : 'password'}
                value={value}
                onChange={(e) => setter(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-9 pr-9 py-2.5 text-sm border border-surface-200 rounded-lg bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <button type="button" onClick={toggleShow} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        ))}

        {validationError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <p>{validationError}</p>
          </div>
        )}
      </div>

      <Button variant="primary" size="md" icon={<Save size={15} />} onClick={() => setShowModal(true)} disabled={!canSubmit}>
        {saText.saveButton}
      </Button>

      <ConfirmationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={saText.crud?.updatePassword?.confirmLabel || 'Update SuperAdmin Password'}
        actionDescription="update the SuperAdmin account password"
        actionTarget="SuperAdmin Account"
        actionDetails={[{ label: 'Account', value: 'SuperAdmin' }]}
        confirmLabel="Update Password"
        action={handleSaveAction}
        onSuccess={() => log.info('SuperAdminAuthTab', 'Password update confirmed')}
        variant="warning"
        buildSummary={() => [
          { label: 'Account', value: 'SuperAdmin' },
          { label: 'Status',  value: saText.crud?.updatePassword?.summarySuccess || 'Password updated successfully' },
        ]}
      />
    </div>
  );
}

// ── General Settings Tab ─────────────────────────────────────────────────────
const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'IST — India Standard Time (UTC+05:30)' },
  { value: 'UTC', label: 'UTC — Coordinated Universal Time' },
  { value: 'America/New_York', label: 'EST/EDT — Eastern Time (US)' },
  { value: 'America/Chicago', label: 'CST/CDT — Central Time (US)' },
  { value: 'America/Los_Angeles', label: 'PST/PDT — Pacific Time (US)' },
  { value: 'Europe/London', label: 'GMT/BST — London' },
  { value: 'Europe/Berlin', label: 'CET/CEST — Central Europe' },
  { value: 'Asia/Dubai', label: 'GST — Gulf Standard Time (UTC+04:00)' },
  { value: 'Asia/Singapore', label: 'SGT — Singapore Time (UTC+08:00)' },
  { value: 'Asia/Tokyo', label: 'JST — Japan Standard Time (UTC+09:00)' },
  { value: 'Australia/Sydney', label: 'AEST/AEDT — Sydney' },
];

function GeneralSettingsTab() {
  const [settings, setSettings] = useState({ timezone: '', dateFormat: '', timeFormat: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const initRan = React.useRef(false);
  const gsMessages = uiMessages.generalSettings;

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('GeneralSettingsTab', 'Tab accessed — loading general settings from API');
    const load = async () => {
      try {
        const res = await fetch(urls.settings.get, { credentials: 'include' });
        const json = await res.json();
        if (json.success) {
          setSettings(json.data);
          log.info('GeneralSettingsTab', 'Settings loaded from API', json.data);
        }
      } catch (err) {
        log.error('GeneralSettingsTab', 'Failed to load settings', { message: err.message });
      }
      setIsLoading(false);
    };
    load();
  }, []);

  const handleSaveAction = useCallback(async () => {
    log.info('GeneralSettingsTab:handleSaveAction', 'Saving general settings', settings);
    const res = await fetch(urls.settings.save, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(settings),
    });
    const json = await res.json();
    if (!json.success) {
      log.error('GeneralSettingsTab:handleSaveAction', 'Save failed', { message: json?.error?.message });
      throw new Error(json?.error?.message || gsMessages.saveFailed);
    }
    log.info('GeneralSettingsTab:handleSaveAction', 'Settings saved successfully');
    return { timezone: settings.timezone, dateFormat: settings.dateFormat, timeFormat: settings.timeFormat };
  }, [settings]);

  const tzLabel = TIMEZONE_OPTIONS.find(tz => tz.value === settings.timezone)?.label || settings.timezone;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-base font-bold text-surface-800 mb-1">{tabText.generalSettings}</h3>
        <p className="text-sm text-surface-400">{gsMessages.subtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm space-y-5">
        {/* Timezone */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-surface-500 mb-2">{gsMessages.timezoneLabel}</label>
          <p className="text-xs text-surface-400 mb-2">{gsMessages.timezoneDescription}</p>
          <select
            value={settings.timezone}
            onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
            className="w-full max-w-md px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {TIMEZONE_OPTIONS.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          <p className="text-[10px] text-surface-400 mt-1">Current selection: <span className="font-semibold text-surface-600">{settings.timezone}</span></p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="md"
          icon={<Save size={16} />}
          onClick={() => setShowSaveModal(true)}
        >
          Save Settings
        </Button>
      </div>

      <ConfirmationModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title={gsMessages.confirmTitle}
        actionDescription={gsMessages.confirmDescription}
        actionTarget={gsMessages.confirmTarget}
        actionDetails={[
          { label: gsMessages.summaryTimezone, value: tzLabel },
        ]}
        confirmLabel="Save"
        action={handleSaveAction}
        onSuccess={(data) => { if (data?.timezone) TimezoneService.setTimezone(data.timezone); }}
        variant="info"
        buildSummary={(data) => [
          { label: gsMessages.summaryTimezone, value: TIMEZONE_OPTIONS.find(tz => tz.value === data?.timezone)?.label || data?.timezone },
          { label: gsMessages.summaryStatus, value: gsMessages.summarySuccess },
        ]}
      />
    </div>
  );
}

// ── Main Settings Component ─────────────────────────────────────────────────
export default function Settings() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'dbConfig'; // Use query param if provided, otherwise default to dbConfig
  
  const tabs = [
    { id: 'dbConfig',     label: tabText.dbConfig,     icon: Database,    content: () => <DatabaseConfigTab /> },
    { id: 'logConfig',    label: tabText.logConfig,    icon: ScrollText,  content: () => <LogConfigTab /> },
    { id: 'authSettings', label: tabText.authSettings, icon: Shield,      content: () => <AuthSettingsTab />, separator: true },
    // ── SuperAdmin section ──
    { id: 'superAdminAuth',  label: tabText.superAdminAuth,  icon: ShieldCheck, content: () => <SuperAdminAuthTab />, separator: true },
    { id: 'databaseSetup',   label: tabText.databaseSetup,   icon: Layers,      content: () => <DatabaseObjectsTab /> },
    // ── General section ──
    { id: 'generalSettings', label: tabText.generalSettings, icon: Globe2,      content: () => <GeneralSettingsTab />, separator: true },
  ];

  return (
    <ConfigLayout
      title={viewText.title}
      subtitle={viewText.subtitle}
      icon={SettingsIcon}
      tabs={tabs}
      defaultTab={defaultTab}
    />
  );
}
