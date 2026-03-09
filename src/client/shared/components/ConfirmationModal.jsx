// ============================================================================
// ConfirmationModal — PulseOps V2 Design System
//
// PURPOSE: Universal 3-phase modal for any CRUD operation:
//   Phase 1: CONFIRM  — Ask the user to confirm the action.
//   Phase 2: PROGRESS — Show a progress bar while the action executes.
//   Phase 3: SUMMARY  — Show the result (success/error) with details + Close.
//
// USAGE:
//   import { ConfirmationModal } from '@shared';
//   <ConfirmationModal
//     isOpen={showModal}
//     onClose={() => setShowModal(false)}
//     title="Create Database"
//     actionDescription="create the Database"
//     actionTarget="Backend PostgreSQL"
//     actionDetails={[
//       { label: 'Schema', value: 'pulseops' },
//       { label: 'Database', value: 'pulseops_v2' }
//     ]}
//     confirmLabel="Create"
//     action={async () => await createDatabase()}
//     onSuccess={(result) => refreshStatus()}
//     variant="info"
//     buildSummary={(data) => [
//       { label: 'Database', value: data.database },
//       { label: 'Status', value: 'Created successfully' }
//     ]}
//   />
//
// PROPS:
//   isOpen              — boolean, controls visibility (required)
//   onClose             — function, called on close (required)
//   title               — string, modal header title (required)
//   actionDescription   — string, what action will be performed (e.g., 'create the Database') (required)
//   actionTarget        — string, where action will be performed (e.g., 'Backend PostgreSQL') (required)
//   actionDetails       — Array<{ label, value }>, details of what will be affected (required)
//   action              — async function, the CRUD operation to execute (required)
//   onSuccess           — function(result), called after successful action (optional)
//   variant             — 'danger' | 'warning' | 'info' (default: 'info')
//   buildSummary        — function(result) => Array<{ label, value }> (optional)
//   confirmLabel        — string, custom confirm button text (optional)
//
// ARCHITECTURE: Fully reusable across all modules for any CRUD operation.
// Manages phase state internally (confirm → progress → summary).
// ============================================================================
import React, { useState, useCallback, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2, X, Database } from 'lucide-react';
import { Button } from '@shared';

const PHASE = { CONFIRM: 'confirm', PROGRESS: 'progress', SUMMARY: 'summary' };

const VARIANT_CONFIG = {
  danger: { 
    icon: AlertTriangle, 
    iconColor: 'text-rose-600', 
    iconBg: 'bg-rose-50', 
    buttonVariant: 'danger', 
    progressColor: 'bg-rose-500' 
  },
  warning: { 
    icon: AlertTriangle, 
    iconColor: 'text-amber-600', 
    iconBg: 'bg-amber-50', 
    buttonVariant: 'primary', 
    progressColor: 'bg-amber-500' 
  },
  info: { 
    icon: Info, 
    iconColor: 'text-brand-600', 
    iconBg: 'bg-brand-50', 
    buttonVariant: 'primary', 
    progressColor: 'bg-brand-500' 
  },
  schema: { 
    icon: Database, 
    iconColor: 'text-indigo-600', 
    iconBg: 'bg-indigo-50', 
    buttonVariant: 'primary', 
    progressColor: 'bg-indigo-500' 
  },
};

export default function ConfirmationModal({
  isOpen,
  onClose,
  title,
  actionDescription,
  actionTarget,
  actionDetails = [],
  action,
  onSuccess,
  variant = 'info',
  buildSummary,
  confirmLabel,
}) {
  const [phase, setPhase] = useState(PHASE.CONFIRM);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const config = VARIANT_CONFIG[variant] || VARIANT_CONFIG.info;
  const IconComponent = config.icon;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase(PHASE.CONFIRM);
      setProgress(0);
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  // Progress bar animation during action
  useEffect(() => {
    if (phase !== PHASE.PROGRESS) return;
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) { clearInterval(interval); return 90; }
        return prev + Math.random() * 15;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [phase]);

  const handleConfirm = useCallback(async () => {
    setPhase(PHASE.PROGRESS);
    setProgress(5);
    try {
      const actionResult = await action();
      setProgress(100);
      setResult(actionResult);
      setError(null);
      setTimeout(() => {
        setPhase(PHASE.SUMMARY);
        onSuccess?.(actionResult);
      }, 400);
    } catch (err) {
      setProgress(100);
      setError(err.message || 'Operation failed.');
      setResult(null);
      setTimeout(() => setPhase(PHASE.SUMMARY), 400);
    }
  }, [action, onSuccess]);

  const handleClose = useCallback(() => {
    if (phase === PHASE.PROGRESS) return;
    onClose?.();
  }, [onClose, phase]);

  if (!isOpen) return null;

  const summaryFields = buildSummary && result ? buildSummary(result) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-scale-in">
        {/* Header with Icon on Left */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-10 h-10 rounded-lg ${config.iconBg} flex items-center justify-center shrink-0`}>
              <IconComponent size={20} className={config.iconColor} />
            </div>
            <h3 className="text-lg font-bold text-surface-800">{title}</h3>
          </div>
          {phase !== PHASE.PROGRESS && (
            <button
              onClick={handleClose}
              className="p-1 rounded-lg hover:bg-surface-100 transition-colors shrink-0"
            >
              <X size={18} className="text-surface-400" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {/* Phase 1: Confirm */}
          {phase === PHASE.CONFIRM && (
            <div className="flex flex-col gap-4">
              {/* Action Description with Details */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-surface-700">
                  This will <span className="font-bold text-surface-800">{actionDescription}</span>
                  {actionTarget && <span className="text-surface-600"> in <span className="font-semibold">{actionTarget}</span></span>}
                </p>
                
                {/* Action Details Box */}
                {actionDetails.length > 0 && (
                  <div className="bg-surface-50 rounded-lg p-3 space-y-2 border border-surface-200 ml-2">
                    {actionDetails.map((detail, idx) => (
                      <div key={idx} className="flex items-start text-xs">
                        <span className="text-surface-500 font-medium mr-2">{detail.label}:</span>
                        <span className="text-surface-800 font-semibold flex-1">{detail.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Confirmation Prompt */}
              <p className="text-sm text-surface-600 pt-2 border-t border-surface-200">
                Please confirm this action.
              </p>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-3 w-full pt-2">
                <Button variant="secondary" className="flex-1" onClick={handleClose}>
                  Cancel
                </Button>
                <Button variant={config.buttonVariant} className="flex-1" onClick={handleConfirm}>
                  {confirmLabel || 'Confirm'}
                </Button>
              </div>
            </div>
          )}

          {/* Phase 2: Progress */}
          {phase === PHASE.PROGRESS && (
            <div className="flex flex-col items-center text-center py-4">
              <Loader2 size={32} className="animate-spin text-brand-500 mb-4" />
              <p className="text-sm font-medium text-surface-700 mb-4">{title}...</p>
              <div className="w-full bg-surface-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ease-out ${config.progressColor}`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <p className="text-xs text-surface-400 mt-2">{Math.round(Math.min(progress, 100))}%</p>
            </div>
          )}

          {/* Phase 3: Summary */}
          {phase === PHASE.SUMMARY && (
            <div className="flex flex-col items-center text-center">
              {error ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mb-4">
                    <XCircle size={24} className="text-rose-600" />
                  </div>
                  <h3 className="text-sm font-bold text-rose-700 mb-2">Error</h3>
                  <p className="text-xs text-surface-500 mb-4 max-w-sm">{error}</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                    <CheckCircle2 size={24} className="text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-bold text-emerald-700 mb-2">Success</h3>
                  {summaryFields.length > 0 && (
                    <div className="w-full text-left bg-surface-50 rounded-lg p-3 mb-4 space-y-1.5">
                      {summaryFields.map((field, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="text-surface-500 font-medium">{field.label}</span>
                          <span className="text-surface-800 font-semibold">{field.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              <Button variant="secondary" className="w-full" onClick={handleClose}>
                Close
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
