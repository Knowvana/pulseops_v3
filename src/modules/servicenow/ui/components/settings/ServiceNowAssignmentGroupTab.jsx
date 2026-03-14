// ============================================================================
// ServiceNowAssignmentGroupTab — PulseOps V3 ServiceNow Module
//
// PURPOSE: Configuration tab for filtering incidents by assignment group.
// This tab is displayed after the Connection tab, ensuring the connection
// is established before users can search and select assignment groups.
//
// ARCHITECTURE:
//   - Fetches incident config on mount (StrictMode-guarded via useRef)
//   - Loads assignment group from existing config
//   - Provides live search dropdown for assignment groups from ServiceNow
//   - Saves via PUT /api/servicenow/config with assignmentGroup field
//   - Shows success/error messages with auto-dismiss
//
// USED BY: src/modules/servicenow/manifest.jsx → getConfigTabs()
//
// DEPENDENCIES:
//   - lucide-react                              → Icons
//   - @shared → createLogger, ApiClient, ConfirmationModal
//   - @modules/servicenow/config/uiText.json    → All UI labels
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Search, Loader2, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { createLogger, ConfirmationModal } from '@shared';
import ApiClient from '@shared/services/apiClient';
import { PageSpinner } from '@components';

const log = createLogger('ServiceNowAssignmentGroupTab.jsx');

const snApi = {
  incidentConfig: '/api/servicenow/config/incidents',
  assignmentGroup: '/api/servicenow/config/incidents/assignment-group',
  searchGroups:   '/api/servicenow/search/assignment-groups',
};

// ── Section message banner ─────────────────────────────────────────────────
function SectionMessage({ message }) {
  if (!message) return null;
  return (
    <div className={`mx-5 mt-4 mb-2 flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${
      message.type === 'success'
        ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
        : 'bg-rose-50 border border-rose-200 text-rose-700'
    }`}>
      <div className="flex-shrink-0">
        {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      </div>
      <span>{message.text}</span>
    </div>
  );
}

// ── Save button ────────────────────────────────────────────────────────────
function SaveButton({ saving, onClick, label = 'Save' }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
    >
      {saving ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
      {saving ? 'Saving...' : label}
    </button>
  );
}

export default function ServiceNowAssignmentGroupTab() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [assignmentGroup, setAssignmentGroup] = useState('');
  const [groupSearchText, setGroupSearchText] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState([]);
  const [groupSearching, setGroupSearching] = useState(false);
  const [groupSearchComplete, setGroupSearchComplete] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [groupResult, setGroupResult] = useState(null);
  const [savingGroup, setSavingGroup] = useState(false);
  const [showGroupConfirm, setShowGroupConfirm] = useState(false);
  const [currentConfig, setCurrentConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const groupDropdownRef = useRef(null);
  const groupInputRef = useRef(null);
  const initRan = useRef(false);

  // ── Auto-dismiss messages ─────────────────────────────────────────────────
  // Removed auto-dismiss for group messages per user request

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const configRes = await ApiClient.get(snApi.incidentConfig);
      if (configRes?.success) {
        setCurrentConfig(configRes.data);
        setAssignmentGroup(configRes.data.assignmentGroup || '');
      }
    } catch (err) {
      log.error('loadData', 'Failed to load config', { error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    loadData();
  }, [loadData]);

  // ── Assignment group live search (debounced) ───────────────────────────────
  useEffect(() => {
    const trimmed = groupSearchText.trim();
    if (!trimmed) {
      setGroupSearchResults([]);
      setGroupSearchComplete(false);
      return;
    }
    const timer = setTimeout(async () => {
      setGroupSearching(true);
      try {
        const res = await ApiClient.get(`${snApi.searchGroups}?q=${encodeURIComponent(trimmed)}`);
        if (res?.success) {
          setGroupSearchResults(res.data.groups || []);
          setGroupSearchComplete(true);
        }
      } catch { /* ignore */ }
      finally { setGroupSearching(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [groupSearchText]);

  // Close group dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target)) {
        setShowGroupDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Save: Assignment Group ────────────────────────────────────────────────
  const saveAssignmentGroup = useCallback(async () => {
    log.info('saveAssignmentGroup', 'Persisting assignment group selection', { assignmentGroup: assignmentGroup || 'ALL_GROUPS' });
    setSavingGroup(true);
    try {
      const res = await ApiClient.put(snApi.assignmentGroup, {
        assignmentGroup,
      });
      if (res?.success) {
        const storedGroup = assignmentGroup ?? '';
        log.info('saveAssignmentGroup', 'Assignment group saved to database', {
          storedGroup: storedGroup || 'ALL_GROUPS',
        });
        setGroupResult({ type: 'success', text: 'Assignment group saved successfully.' });
        return { assignmentGroup: storedGroup };
      }
      const errorMsg = res?.error?.message || 'Failed to save assignment group.';
      setGroupResult({ type: 'error', text: errorMsg });
      throw new Error(errorMsg);
    } catch (err) {
      log.error('saveAssignmentGroup', 'Save failed', { error: err.message });
      setGroupResult(prev => prev ?? { type: 'error', text: err.message || 'Failed to save assignment group.' });
      throw err;
    } finally {
      setSavingGroup(false);
    }
  }, [assignmentGroup]);

  return (
    <div className="space-y-6 animate-fade-in p-5">
      {loading && <PageSpinner modal message="Loading assignment group..." />}
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users size={20} className="text-brand-600" />
          <h2 className="text-lg font-bold text-surface-800">Assignment Group</h2>
        </div>
        <p className="text-sm text-surface-500">
          Filter all incident API calls to only fetch incidents from a specific assignment group. Leave empty to fetch from all groups.
        </p>
      </div>

      {/* Assignment Group Selection */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-surface-700">Select Assignment Group</h3>
            <p className="text-xs text-surface-400 mt-0.5">Search and select an assignment group from your ServiceNow instance.</p>
          </div>
          <SaveButton saving={savingGroup} onClick={() => setShowGroupConfirm(true)} label="Save Group" />
        </div>
        <div className="p-5">
          <div className="max-w-2xl" ref={groupDropdownRef}>
            <div className="grid gap-2 md:grid-cols-[360px,minmax(0,1fr)] md:items-center md:gap-4">
              <div className="relative w-full md:flex-none">
                {(groupSearchComplete && !groupSearching && groupSearchText.trim()) ? (
                  <CheckCircle2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none" />
                ) : (
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
                )}
                <input
                  ref={groupInputRef}
                  type="text"
                  value={assignmentGroup || groupSearchText}
                  onChange={e => {
                    setGroupSearchText(e.target.value);
                    setAssignmentGroup('');
                    setGroupSearchComplete(false);
                    setShowGroupDropdown(true);
                  }}
                  onFocus={() => setShowGroupDropdown(true)}
                  placeholder="Search assignment groups from ServiceNow..."
                  className="w-full pl-9 pr-9 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 placeholder-surface-400 focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none"
                />
                {groupSearching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-500 animate-spin pointer-events-none" />}
                {assignmentGroup && !groupSearching && (
                  <button onClick={() => { setAssignmentGroup(''); setGroupSearchText(''); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-rose-500 transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              {groupSearchText.trim() && (
                <div className="flex md:justify-start">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-400 px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                    {groupSearching
                      ? 'Searching…'
                      : `Found ${groupSearchResults.length} ${groupSearchResults.length === 1 ? 'Entry' : 'Entries'}`}
                    {!groupSearching && (
                      <span className="opacity-80">— "{groupSearchText.trim()}"</span>
                    )}
                  </span>
                </div>
              )}
            </div>
            {/* Fixed-position dropdown results */}
            {showGroupDropdown && groupSearchResults.length > 0 && groupInputRef.current && (
              <div 
                className="fixed z-50 bg-white rounded-lg border border-surface-200 shadow-lg max-h-[200px] overflow-y-auto"
                style={{
                  width: groupInputRef.current.offsetWidth,
                  left: groupInputRef.current.getBoundingClientRect().left,
                  top: groupInputRef.current.getBoundingClientRect().bottom + 4,
                }}
              >
                {groupSearchResults.map(g => (
                  <button key={g.sysId} onClick={() => {
                    setAssignmentGroup(g.name);
                    setGroupSearchText('');
                    setShowGroupDropdown(false);
                  }}
                    className="w-full text-left px-3 py-2.5 hover:bg-brand-50 transition-colors border-b border-surface-50 last:border-b-0 text-sm">
                    <span className="text-xs font-semibold text-surface-700">{g.name}</span>
                    {g.description && (
                      <span className="block text-[10px] text-surface-400 mt-0.5 truncate">{g.description}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {showGroupDropdown && groupSearchText && !groupSearching && groupSearchResults.length === 0 && groupInputRef.current && (
              <div 
                className="fixed z-50 bg-white rounded-lg border border-surface-200 shadow-lg px-3 py-3 text-xs text-surface-400 text-center"
                style={{
                  width: groupInputRef.current.offsetWidth,
                  left: groupInputRef.current.getBoundingClientRect().left,
                  top: groupInputRef.current.getBoundingClientRect().bottom + 4,
                }}
              >
                No groups found matching &quot;{groupSearchText}&quot;
              </div>
            )}
            {assignmentGroup && (
              <p className="text-[10px] text-emerald-600 mt-1.5 flex items-center gap-1">
                <CheckCircle2 size={10} /> Selected: <span className="font-semibold">{assignmentGroup}</span>
              </p>
            )}
          </div>
          <p className="text-[10px] text-surface-400 mt-3">
            Search for assignment groups from your ServiceNow instance. Leave empty to fetch incidents from all groups.
          </p>
        </div>
        <SectionMessage message={groupResult} />
      </div>

      {/* Assignment Group Confirmation Modal */}
      <ConfirmationModal
        isOpen={showGroupConfirm}
        onClose={() => setShowGroupConfirm(false)}
        title="Save Assignment Group"
        actionDescription="update the assignment group filter"
        actionTarget="ServiceNow configuration"
        actionDetails={[
          { label: 'Assignment Group', value: assignmentGroup || 'All Groups' },
          { label: 'Target Column', value: 'sn_incident_config.assignment_group' },
        ]}
        confirmLabel="Save Group"
        variant="info"
        action={saveAssignmentGroup}
        onSuccess={() => setShowGroupConfirm(false)}
        buildSummary={(result) => [
          { label: 'Assignment Group', value: result?.assignmentGroup || assignmentGroup || 'All Groups' },
          { label: 'Stored In', value: 'sn_incident_config.assignment_group' },
        ]}
      />
    </div>
  );
}
