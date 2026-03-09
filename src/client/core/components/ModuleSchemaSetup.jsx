// ============================================================================
// ModuleSchemaSetup — PulseOps V3 Core Component
//
// PURPOSE: Multi-step dialog shown when enabling a module that has a
// database/Schema.json. Walks the user through:
//   Phase 1 — Confirmation: Shows schema preview (tables, columns, indexes)
//   Phase 2 — Running: Creates tables via POST /modules/:id/schema
//   Phase 3 — Success: Shows summary (tables, indexes, seed rows created)
//   Phase 4 — Error: Shows error message with retry option
//
// USAGE:
//   <ModuleSchemaSetup
//     isOpen={showSchemaSetup}
//     moduleId="servicenow"
//     moduleName="ServiceNow"
//     schemaPreview={schemaData}       // from GET /modules/:id/schema
//     onComplete={() => { ... }}       // called after schema created + enable
//     onSkip={() => { ... }}           // called if user skips (no schema)
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
  AlertTriangle, X, ChevronDown, ChevronRight, Layers, Sprout
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
  onComplete,
  onSkip,
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

  const handleCreateSchema = async () => {
    setPhase(PHASES.running);
    try {
      const url = buildUrl(urls.modules.schema, moduleId);
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
        setPhase(PHASES.success);
      } else {
        setErrorMsg(json.error?.message || 'Schema creation failed');
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 bg-brand-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
              <Database size={16} className="text-brand-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-surface-800">Database Schema Setup</h3>
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
                The <strong>{moduleName}</strong> module requires database tables to be created before it can be enabled.
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
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Tables to Create</p>
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
                <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-brand-500" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-surface-700">Creating Database Tables...</p>
                <p className="text-xs text-surface-400 mt-1">
                  Setting up {tables.length} table(s) for {moduleName}
                </p>
              </div>
            </div>
          )}

          {/* ── Phase: Success ─────────────────────────────────────── */}
          {phase === PHASES.success && result && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-emerald-700">Schema Created Successfully</p>
                <p className="text-xs text-surface-500 mt-1">
                  All database objects for {moduleName} are ready.
                </p>
              </div>

              {/* Result Summary */}
              <div className="bg-emerald-50 rounded-lg p-4 w-full space-y-2">
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
                <p className="text-sm font-semibold text-red-700">Schema Creation Failed</p>
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
                onClick={handleCreateSchema}
                className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-brand-500 hover:bg-brand-600 transition-colors flex items-center gap-2"
              >
                <Database size={14} />
                Create Tables & Enable
              </button>
            </>
          )}
          {phase === PHASES.success && (
            <button
              onClick={handleComplete}
              className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-emerald-500 hover:bg-emerald-600 transition-colors flex items-center gap-2"
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
                className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-brand-500 hover:bg-brand-600 transition-colors"
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
