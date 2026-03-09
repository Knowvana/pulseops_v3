// ============================================================================
// ModuleSchemaSetup — PulseOps V3 Core Component
//
// PURPOSE: Multi-step dialog for module schema operations:
//   CREATE MODE (install):
//     Phase 1 — Confirmation: Shows schema preview (tables, columns, indexes)
//     Phase 2 — Running: Creates tables via POST /modules/:id/schema
//     Phase 3 — Success: Shows summary (tables, indexes, seed rows created)
//   DELETE MODE (remove):
//     Phase 1 — Confirmation: Shows tables to be deleted
//     Phase 2 — Running: Deletes tables via DELETE /modules/:id/schema
//     Phase 3 — Success: Shows summary (tables dropped)
//   Phase 4 — Error: Shows error message with retry option
//
// USAGE:
//   <ModuleSchemaSetup
//     isOpen={showSchemaSetup}
//     moduleId="servicenow"
//     moduleName="ServiceNow"
//     schemaPreview={schemaData}       // from GET /modules/:id/schema
//     mode="create" | "delete"         // operation mode
//     onComplete={() => { ... }}       // called after operation completes
//     onClose={() => setShow(false)}
//   />
//
// DEPENDENCIES:
//   - @config/urls.json    → API endpoint URLs
//   - lucide-react         → Icons
// ============================================================================
import React, { useState } from 'react';
import {
  Database, Table2, Columns3, Hash, Loader2, CheckCircle2,
  AlertTriangle, X, ChevronDown, ChevronRight, Layers, Sprout, Trash2
} from 'lucide-react';
import urls from '@config/urls.json';

function buildUrl(template, id) {
  return template.replace('{id}', id);
}

const PHASES = { confirm: 'confirm', running: 'running', success: 'success', error: 'error' };

export default function ModuleSchemaSetup({
  isOpen,
  moduleId,
  moduleName,
  schemaPreview,
  mode = 'create',
  onComplete,
  onClose,
}) {
  const [phase, setPhase] = useState(PHASES.confirm);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedTable, setExpandedTable] = useState(null);

  if (!isOpen) return null;

  const tables = schemaPreview?.tables || [];
  const hasSeedData = schemaPreview?.hasSeedData || false;
  const seedTables = schemaPreview?.seedTables || [];
  const totalColumns = tables.reduce((sum, t) => sum + t.columnCount, 0);
  const totalIndexes = tables.reduce((sum, t) => sum + t.indexCount, 0);
  const isCreateMode = mode === 'create';

  const handleSchemaOperation = async () => {
    setPhase(PHASES.running);
    try {
      const url = buildUrl(urls.modules.schema, moduleId);
      const method = isCreateMode ? 'POST' : 'DELETE';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
        setPhase(PHASES.success);
      } else {
        setErrorMsg(json.error?.message || `Schema ${isCreateMode ? 'creation' : 'deletion'} failed`);
        setPhase(PHASES.error);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Network error');
      setPhase(PHASES.error);
    }
  };

  const handleClose = () => {
    setPhase(PHASES.confirm);
    setResult(null);
    setErrorMsg('');
    setExpandedTable(null);
    if (onClose) onClose();
  };

  const handleComplete = () => {
    setPhase(PHASES.confirm);
    setResult(null);
    setErrorMsg('');
    setExpandedTable(null);
    if (onComplete) onComplete();
  };

  const toggleTable = (tableName) => {
    setExpandedTable(expandedTable === tableName ? null : tableName);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-surface-200 w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b border-surface-100 shrink-0 ${
          isCreateMode ? 'bg-brand-50' : 'bg-red-50'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isCreateMode ? 'bg-brand-100' : 'bg-red-100'
            }`}>
              {isCreateMode
                ? <Database size={16} className="text-brand-600" />
                : <Trash2 size={16} className="text-red-600" />
              }
            </div>
            <div>
              <h3 className="text-sm font-bold text-surface-800">
                {isCreateMode ? 'Database Schema Setup' : 'Database Schema Removal'}
              </h3>
              <p className="text-xs text-surface-500">{moduleName} Module</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-surface-100 transition-colors">
            <X size={16} className="text-surface-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">

          {/* ── Phase: Confirm ────────────────────────────────────── */}
          {phase === PHASES.confirm && (
            <>
              <p className="text-sm text-surface-600">
                {isCreateMode
                  ? `The ${moduleName} module requires database tables to be created before it can be installed.`
                  : `Uninstalling the ${moduleName} module will delete all associated database tables and data.`
                }
              </p>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-50 rounded-lg p-3 text-center">
                  <Table2 size={16} className="text-brand-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-surface-800">{tables.length}</p>
                  <p className="text-[10px] uppercase tracking-wider text-surface-400 font-medium">Tables</p>
                </div>
                <div className="bg-surface-50 rounded-lg p-3 text-center">
                  <Columns3 size={16} className="text-blue-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-surface-800">{totalColumns}</p>
                  <p className="text-[10px] uppercase tracking-wider text-surface-400 font-medium">Columns</p>
                </div>
                <div className="bg-surface-50 rounded-lg p-3 text-center">
                  <Hash size={16} className="text-violet-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-surface-800">{totalIndexes}</p>
                  <p className="text-[10px] uppercase tracking-wider text-surface-400 font-medium">Indexes</p>
                </div>
              </div>

              {/* Table Details (expandable) */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
                  {isCreateMode ? 'Tables to Create' : 'Tables to Delete'}
                </p>
                {tables.map((t) => (
                  <div key={t.name} className="border border-surface-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleTable(t.name)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Layers size={14} className="text-brand-500" />
                        <span className="text-xs font-semibold text-surface-700">{t.name}</span>
                        <span className="text-[10px] text-surface-400">
                          {t.columnCount} cols · {t.indexCount} idx
                        </span>
                      </div>
                      {expandedTable === t.name
                        ? <ChevronDown size={14} className="text-surface-400" />
                        : <ChevronRight size={14} className="text-surface-400" />
                      }
                    </button>
                    {expandedTable === t.name && (
                      <div className="border-t border-surface-100 px-3 py-2 bg-surface-50 space-y-2">
                        {t.description && (
                          <p className="text-[11px] text-surface-500 italic">{t.description}</p>
                        )}
                        <div className="space-y-0.5">
                          {t.columns.map((col, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                              <span className="font-mono text-surface-700 w-40 truncate">{col.name}</span>
                              <span className="text-surface-400 truncate">{col.type}</span>
                            </div>
                          ))}
                        </div>
                        {t.indexes.length > 0 && (
                          <div className="pt-1 border-t border-surface-100 space-y-0.5">
                            <p className="text-[10px] font-semibold text-surface-400 uppercase">Indexes</p>
                            {t.indexes.map((idx, i) => (
                              <div key={i} className="flex items-center gap-2 text-[11px]">
                                <Hash size={10} className="text-violet-400" />
                                <span className="font-mono text-surface-600 truncate">{idx.name}</span>
                                {idx.unique && <span className="text-[9px] bg-violet-100 text-violet-600 px-1 rounded">UNIQUE</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Seed Data notice */}
              {hasSeedData && (
                <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <Sprout size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-emerald-700">
                    <span className="font-semibold">Seed data</span> will be inserted into: {seedTables.join(', ')}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Phase: Running ────────────────────────────────────── */}
          {phase === PHASES.running && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="relative">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                  isCreateMode ? 'bg-brand-50' : 'bg-red-50'
                }`}>
                  <Loader2 size={28} className={`animate-spin ${isCreateMode ? 'text-brand-500' : 'text-red-500'}`} />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-surface-700">
                  {isCreateMode ? 'Creating Database Tables...' : 'Deleting Database Tables...'}
                </p>
                <p className="text-xs text-surface-400 mt-1">
                  {isCreateMode
                    ? `Setting up ${tables.length} table(s) for ${moduleName}`
                    : `Removing ${tables.length} table(s) from ${moduleName}`
                  }
                </p>
              </div>
            </div>
          )}

          {/* ── Phase: Success ─────────────────────────────────────── */}
          {phase === PHASES.success && result && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                isCreateMode ? 'bg-emerald-50' : 'bg-orange-50'
              }`}>
                <CheckCircle2 size={28} className={isCreateMode ? 'text-emerald-500' : 'text-orange-500'} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-semibold ${isCreateMode ? 'text-emerald-700' : 'text-orange-700'}`}>
                  {isCreateMode ? 'Schema Created Successfully' : 'Schema Deleted Successfully'}
                </p>
                <p className="text-xs text-surface-500 mt-1">
                  {isCreateMode
                    ? `All database objects for ${moduleName} are ready.`
                    : `All database objects for ${moduleName} have been removed.`
                  }
                </p>
              </div>

              {/* Result Summary */}
              <div className={`rounded-lg p-4 w-full space-y-2 ${
                isCreateMode ? 'bg-emerald-50' : 'bg-orange-50'
              }`}>
                {isCreateMode ? (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-surface-500">Tables Created</span>
                      <span className="font-bold text-surface-700">{result.tablesCreated}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-surface-500">Indexes Created</span>
                      <span className="font-bold text-surface-700">{result.indexesCreated}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-surface-500">Seed Rows Inserted</span>
                      <span className="font-bold text-surface-700">{result.seedRowsInserted}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-xs">
                    <span className="text-surface-500">Tables Dropped</span>
                    <span className="font-bold text-surface-700">{result.tablesDropped}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Phase: Error ────────────────────────────────────────── */}
          {phase === PHASES.error && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
                <AlertTriangle size={28} className="text-red-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-red-700">
                  {isCreateMode ? 'Schema Creation Failed' : 'Schema Deletion Failed'}
                </p>
                <p className="text-xs text-surface-500 mt-1">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-surface-100 bg-surface-50 shrink-0">
          {phase === PHASES.confirm && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSchemaOperation}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 transition-colors ${
                  isCreateMode
                    ? 'bg-brand-500 hover:bg-brand-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {isCreateMode ? (
                  <>
                    <Database size={14} />
                    Create Tables & Install
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Delete Tables & Uninstall
                  </>
                )}
              </button>
            </>
          )}
          {phase === PHASES.success && (
            <button
              onClick={handleComplete}
              className={`px-5 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 transition-colors ${
                isCreateMode
                  ? 'bg-emerald-500 hover:bg-emerald-600'
                  : 'bg-orange-500 hover:bg-orange-600'
              }`}
            >
              <CheckCircle2 size={14} />
              Go to Module Manager
            </button>
          )}
          {phase === PHASES.error && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => setPhase(PHASES.confirm)}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${
                  isCreateMode
                    ? 'bg-brand-500 hover:bg-brand-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
