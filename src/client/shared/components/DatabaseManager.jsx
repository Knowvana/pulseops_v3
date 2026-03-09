// ============================================================================
// DatabaseManager — PulseOps V2 Design System
//
// PURPOSE: Reusable component for managing database schema, default data,
// and database operations. Allows modules to setup their database schema,
// delete database, manage default data, and perform wipe operations.
//
// USAGE:
//   import { DatabaseManager } from '@shared';
//   <DatabaseManager
//     onCreateDatabase={async () => await createDb()}
//     onDeleteDatabase={async () => await deleteDb()}
//     onInitializeSchema={async () => await initSchema()}
//     onLoadDefaultData={async () => await loadData()}
//     onCleanDefaultData={async () => await cleanData()}
//     onWipeDatabase={async () => await wipeDb()}
//     onRefreshStatus={async () => await checkStatus()}
//     dbStatus={{ connected: true, exists: true, schemaInitialized: true, hasDefaultData: false }}
//   />
//
// PROPS:
//   onCreateDatabase      — Async function to create database (required)
//   onDeleteDatabase      — Async function to delete database (required)
//   onInitializeSchema    — Async function to initialize schema (required)
//   onLoadDefaultData     — Async function to load default data (required)
//   onCleanDefaultData    — Async function to clean default data (required)
//   onWipeDatabase        — Async function to wipe database (required)
//   onRefreshStatus       — Async function to refresh status (required)
//   dbStatus              — Object with { connected, exists, schemaInitialized, hasDefaultData } (required)
//   isLoading             — Loading state (optional)
//
// ARCHITECTURE: Fully reusable and config-based. Uses ConfirmationModal for
// all destructive operations. All text and actions passed as props.
// ============================================================================
import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, AlertTriangle, CheckCircle2, Download, Trash2 } from 'lucide-react';
import { Button, ConfirmationModal, createLogger } from '@shared';
import uiText from '@config/uiElementsText.json';
import messages from '@config/UIMessages.json';
import urls from '@config/urls.json';

const log = createLogger('DatabaseManager.jsx');

export default function DatabaseManager({
  onCreateDatabase,
  onDeleteDatabase,
  onInitializeSchema,
  onLoadDefaultData,
  onCleanDefaultData,
  onWipeDatabase,
  onRefreshStatus,
  dbStatus = { connected: false, exists: false, schemaInitialized: false, hasDefaultData: false },
  isLoading = false,
}) {
  const [modalState, setModalState] = useState({ type: null, open: false });
  const [dbConfig, setDbConfig] = useState({ database: '', schema: '', tables: [], defaultAdmin: { email: '' } });

  const initRan = React.useRef(false);
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    log.info('mount', 'Page accessed — loading database configuration from API');
    const fetchDbConfig = async () => {
      try {
        // Fetch database config
        const configResponse = await fetch(urls.database.config, { credentials: 'include' });
        const configResult = await configResponse.json();
        
        // Fetch schema definition
        const schemaResponse = await fetch(urls.database.schema + '/definition', { credentials: 'include' });
        const schemaResult = await schemaResponse.json();
        
        if (configResult?.data) {
          setDbConfig({
            database: configResult.data.database || '',
            schema: configResult.data.schema || '',
            tables: schemaResult?.data?.tables?.map(t => t.name) || configResult.data.tables || [],
            defaultAdmin: configResult.data.defaultAdmin || { email: '' },
          });
          log.info('mount', 'Database config and schema loaded from API', { 
            database: configResult.data.database, 
            schema: configResult.data.schema, 
            tables: schemaResult?.data?.totalTables || configResult.data.tables?.length || 0 
          });
        }
      } catch (error) {
        log.error('mount', 'Failed to fetch database config', { message: error.message });
      }
    };
    fetchDbConfig();
  }, []);

  const confirmText = uiText.admin.settings.databaseObjects.confirmations;
  const dbMessages = messages.database.confirmations;
  const dbObjMessages = messages.dbObjects;

  const openModal = (type) => {
    log.info('openModal', `Modal opened — action: ${type}`, { database: dbConfig.database, schema: dbConfig.schema });
    setModalState({ type, open: true });
  };
  const closeModal = () => {
    log.debug('closeModal', `Modal closed — action: ${modalState.type}`);
    setModalState({ type: null, open: false });
  };

  const handleSuccess = async () => {
    log.info('handleSuccess', `Operation completed — action: ${modalState.type}`);
    closeModal();
    log.debug('handleSuccess', 'Refreshing database status after successful operation');
    await onRefreshStatus?.();
  };

  return (
    <div className="space-y-6">
      {/* Database Instance Status */}
      {!dbStatus.connected && dbStatus.connectionError ? (
        /* Connection Failed — show section title + error details, block all operations */
        <div className="bg-gradient-to-r from-rose-50 via-red-50 to-rose-50 rounded-xl border border-rose-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-rose-100 to-red-100 rounded-lg">
                <Database size={16} className="text-rose-600" />
              </div>
              <h4 className="text-xs font-bold text-surface-700">{dbObjMessages.dbInstance}</h4>
            </div>
            <span className="text-xs font-bold text-rose-600">{dbObjMessages.connectionFailed}</span>
          </div>
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-100/60 border border-rose-200">
            <AlertTriangle size={14} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] text-rose-700 leading-relaxed">{dbStatus.connectionError}</p>
              <p className="text-[11px] text-rose-600 mt-1">{dbObjMessages.connectionFailedHint}</p>
            </div>
          </div>
        </div>
      ) : !dbStatus.connected || !dbStatus.exists ? (
        /* Database not found — allow Create Database only if connection to server works */
        <div className="bg-gradient-to-r from-pink-50 via-rose-50 to-pink-50 rounded-xl border border-pink-200 p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 bg-gradient-to-br from-pink-100 to-rose-100 rounded-lg shrink-0">
              <AlertTriangle size={16} className="text-pink-600" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-pink-800 mb-1">{dbObjMessages.dbNotFound}</h4>
              <p className="text-[11px] text-pink-700 leading-relaxed">
                {dbObjMessages.dbNotFoundHint}
              </p>
            </div>
          </div>
          <Button 
            variant="primary" 
            size="sm" 
            icon={<Database />} 
            onClick={() => openModal('createDb')}
            className="bg-pink-600 hover:bg-pink-700"
          >
            {dbObjMessages.createDatabase}
          </Button>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-emerald-50/50 to-teal-50/30 rounded-xl border border-emerald-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg">
                <Database size={16} className="text-emerald-600" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-surface-700">{dbObjMessages.dbInstance}</h4>
                <p className="text-[11px] text-surface-500">{dbObjMessages.dbReady}</p>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-600">{dbObjMessages.exists}</span>
          </div>
        </div>
      )}

      {/* Schema Status */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-surface-400">Schema Status</h4>
          <span className={`text-xs font-bold ${dbStatus.schemaInitialized ? 'text-emerald-600' : 'text-amber-600'}`}>
            {dbStatus.schemaInitialized ? 'Initialized' : 'Not Initialized'}
          </span>
        </div>

        {!dbStatus.schemaInitialized ? (
          <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 rounded-xl border border-amber-200 p-4 mb-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg shrink-0">
                <AlertTriangle size={16} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-800 mb-1">Schema Not Initialized</p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  Initialize the database schema to create required tables and structures.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-emerald-50 border border-emerald-200 mb-3">
            <CheckCircle2 size={14} className="text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">Schema is ready</span>
          </div>
        )}

        {!dbStatus.schemaInitialized && (
          <div className="flex items-center gap-2">
            <Button 
              variant="primary" 
              size="sm" 
              icon={<Database />} 
              onClick={() => openModal('initSchema')}
              disabled={!dbStatus.connected || !dbStatus.exists}
            >
              Initialize Schema
            </Button>
          </div>
        )}
      </div>

      {/* Default Data */}
      <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-surface-400">Default Data</h4>
          <span className={`text-xs font-bold ${dbStatus.hasDefaultData ? 'text-emerald-600' : 'text-amber-600'}`}>
            {dbStatus.hasDefaultData ? 'Loaded' : 'Not Loaded'}
          </span>
        </div>
        <p className="text-xs text-surface-500 mb-3">
          Load default data including admin users, roles, and initial configuration.
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant={dbStatus.hasDefaultData ? 'secondary' : 'primary'}
            size="sm"
            icon={<Download />}
            onClick={() => openModal('loadData')}
            disabled={!dbStatus.connected || !dbStatus.schemaInitialized}
          >
            {dbStatus.hasDefaultData ? 'Reload Default Data' : 'Load Default Data'}
          </Button>
          {dbStatus.hasDefaultData && (
            <Button 
              variant="ghost" 
              size="sm" 
              icon={<Trash2 />} 
              onClick={() => openModal('cleanData')}
              className="text-rose-600 hover:bg-rose-50"
            >
              Clean Data
            </Button>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-gradient-to-r from-rose-50/50 to-red-50/30 rounded-xl border border-rose-200 p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-gradient-to-br from-rose-100 to-red-100 rounded-lg shrink-0">
            <AlertTriangle size={16} className="text-rose-600" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-1">Danger Zone</h4>
            <p className="text-xs text-surface-500">Destructive operations that cannot be undone</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="danger" 
            size="sm" 
            icon={<Trash2 />} 
            onClick={() => openModal('wipeDb')}
            disabled={!dbStatus.connected || !dbStatus.exists || !dbStatus.schemaInitialized}
          >
            Wipe Database
          </Button>
          <Button 
            variant="danger" 
            size="sm" 
            icon={<Trash2 />} 
            onClick={() => openModal('deleteDb')}
            disabled={!dbStatus.connected || !dbStatus.exists}
          >
            Delete Database
          </Button>
        </div>
      </div>

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={modalState.open && modalState.type === 'createDb'}
        onClose={closeModal}
        title={confirmText.createDatabase.title}
        actionDescription={dbMessages.createDatabase.actionDescription}
        actionTarget={dbMessages.createDatabase.actionTarget}
        actionDetails={[
          { label: uiText.admin.settings.databaseConfiguration.fields.database.label, value: dbConfig.database },
          { label: uiText.admin.settings.databaseConfiguration.fields.schema.label, value: dbConfig.schema }
        ]}
        confirmLabel={confirmText.createDatabase.confirmLabel}
        action={onCreateDatabase}
        onSuccess={handleSuccess}
        variant="info"
        buildSummary={(data) => [
          { label: uiText.admin.settings.databaseConfiguration.fields.database.label, value: data?.database || dbConfig.database },
          { label: 'Status', value: messages.database.databaseCreated },
        ]}
      />

      <ConfirmationModal
        isOpen={modalState.open && modalState.type === 'deleteDb'}
        onClose={closeModal}
        title={confirmText.deleteDatabase.title}
        actionDescription={dbMessages.deleteDatabase.actionDescription}
        actionTarget={dbMessages.deleteDatabase.actionTarget}
        actionDetails={[
          { label: uiText.admin.settings.databaseConfiguration.fields.database.label, value: dbConfig.database },
          { label: confirmText.deleteDatabase.warningLabel, value: dbMessages.deleteDatabase.warningMessage }
        ]}
        confirmLabel={confirmText.deleteDatabase.confirmLabel}
        action={onDeleteDatabase}
        onSuccess={handleSuccess}
        variant="danger"
        buildSummary={(data) => [
          { label: uiText.admin.settings.databaseConfiguration.fields.database.label, value: data?.database || dbConfig.database },
          { label: 'Status', value: messages.database.databaseDeleted },
        ]}
      />

      <ConfirmationModal
        isOpen={modalState.open && modalState.type === 'initSchema'}
        onClose={closeModal}
        title={confirmText.initializeSchema.title}
        actionDescription={dbMessages.initializeSchema.actionDescription}
        actionTarget={dbMessages.initializeSchema.actionTarget}
        actionDetails={[
          { label: uiText.admin.settings.databaseConfiguration.fields.schema.label, value: dbConfig.schema },
          { label: `${confirmText.initializeSchema.tablesLabel} (${dbConfig.tables.length})`, value: dbConfig.tables.join(', ') }
        ]}
        confirmLabel={confirmText.initializeSchema.confirmLabel}
        action={onInitializeSchema}
        onSuccess={handleSuccess}
        variant="schema"
        buildSummary={(data) => [
          { label: confirmText.initializeSchema.summaryTablesLabel, value: data?.tables?.join(', ') || dbConfig.tables.join(', ') },
          { label: 'Status', value: messages.database.schemaCreated },
        ]}
      />

      <ConfirmationModal
        isOpen={modalState.open && modalState.type === 'loadData'}
        onClose={closeModal}
        title={confirmText.loadDefaultData.title}
        actionDescription={dbMessages.loadDefaultData.actionDescription}
        actionTarget={dbMessages.loadDefaultData.actionTarget}
        actionDetails={[
          { label: confirmText.loadDefaultData.adminUserLabel, value: dbConfig.defaultAdmin.email },
          { label: confirmText.loadDefaultData.includesLabel, value: dbMessages.loadDefaultData.includesMessage }
        ]}
        confirmLabel={confirmText.loadDefaultData.confirmLabel}
        action={onLoadDefaultData}
        onSuccess={handleSuccess}
        variant="info"
        buildSummary={() => [
          { label: 'Status', value: messages.database.defaultDataLoaded },
        ]}
      />

      <ConfirmationModal
        isOpen={modalState.open && modalState.type === 'cleanData'}
        onClose={closeModal}
        title={confirmText.cleanDefaultData.title}
        actionDescription={dbMessages.cleanDefaultData.actionDescription}
        actionTarget={dbMessages.cleanDefaultData.actionTarget}
        actionDetails={[
          { label: confirmText.cleanDefaultData.scopeLabel, value: dbMessages.cleanDefaultData.scopeMessage },
          { label: confirmText.cleanDefaultData.impactLabel, value: dbMessages.cleanDefaultData.impactMessage }
        ]}
        confirmLabel={confirmText.cleanDefaultData.confirmLabel}
        action={onCleanDefaultData}
        onSuccess={handleSuccess}
        variant="warning"
        buildSummary={() => [
          { label: 'Status', value: messages.database.defaultDataCleaned },
        ]}
      />

      <ConfirmationModal
        isOpen={modalState.open && modalState.type === 'wipeDb'}
        onClose={closeModal}
        title={confirmText.wipeDatabase.title}
        actionDescription={dbMessages.wipeDatabase.actionDescription}
        actionTarget={dbMessages.wipeDatabase.actionTarget}
        actionDetails={[
          { label: uiText.admin.settings.databaseConfiguration.fields.schema.label, value: dbConfig.schema },
          { label: confirmText.wipeDatabase.impactLabel, value: dbMessages.wipeDatabase.impactMessage }
        ]}
        confirmLabel={confirmText.wipeDatabase.confirmLabel}
        action={onWipeDatabase}
        onSuccess={handleSuccess}
        variant="danger"
        buildSummary={() => [
          { label: 'Status', value: messages.database.databaseWiped },
        ]}
      />
    </div>
  );
}
