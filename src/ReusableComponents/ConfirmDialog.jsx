// ============================================================================
// ConfirmDialog — PulseOps V3 Reusable Component
//
// PURPOSE: Modal confirmation dialog with customizable title, description,
// action details summary, and confirm/cancel buttons. Supports async actions
// with loading states and result summaries.
//
// USAGE:
//   import { ConfirmDialog } from '@components';
//   <ConfirmDialog
//     isOpen={showConfirm}
//     onClose={() => setShowConfirm(false)}
//     title="Delete Item"
//     actionDescription="permanently delete this record"
//     actionTarget="User Record"
//     actionDetails={[{ label: 'Name', value: 'John Doe' }]}
//     confirmLabel="Delete"
//     action={async () => await deleteItem(id)}
//     variant="error"
//   />
//
// VARIANTS: info, error, warning
// ============================================================================
import React, { useState } from 'react';
import { X, CheckCircle, AlertTriangle, Loader } from 'lucide-react';
import { variants as themeVariants, theme } from './theme';

const PHASES = { confirm: 'confirm', running: 'running', success: 'success', error: 'error' };

export default function ConfirmDialog({
  isOpen,
  onClose,
  title = 'Confirm Action',
  actionDescription = 'perform this action',
  actionTarget = '',
  actionDetails = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  action,
  onSuccess,
  buildSummary,
  variant = 'info',
}) {
  const [phase, setPhase] = useState(PHASES.confirm);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const v = themeVariants[variant] || themeVariants.info;

  const handleConfirm = async () => {
    if (!action) return;
    setPhase(PHASES.running);
    try {
      const res = await action();
      setResult(res);
      setPhase(PHASES.success);
      if (onSuccess) onSuccess(res);
    } catch (err) {
      setErrorMsg(err?.message || 'Action failed');
      setPhase(PHASES.error);
    }
  };

  const handleClose = () => {
    setPhase(PHASES.confirm);
    setResult(null);
    setErrorMsg('');
    if (onClose) onClose();
  };

  const summaryItems = phase === PHASES.success && buildSummary && result ? buildSummary(result) : [];

  return (
    <div className={theme.overlayFixed} onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-surface-200 w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b border-surface-100 ${v.bg}`}>
          <h3 className={`text-base font-bold ${v.text}`}>{title}</h3>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-surface-100 transition-colors">
            <X size={16} className="text-surface-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {phase === PHASES.confirm && (
            <>
              <p className="text-sm text-surface-600">
                Are you sure you want to <strong>{actionDescription}</strong>
                {actionTarget && <> for <strong>{actionTarget}</strong></>}?
              </p>
              {actionDetails.length > 0 && (
                <div className="bg-surface-50 rounded-lg p-3 space-y-1.5">
                  {actionDetails.map((d, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-surface-500">{d.label}</span>
                      <span className="font-medium text-surface-700">{d.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {phase === PHASES.running && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader size={28} className={`animate-spin ${v.icon}`} />
              <p className="text-sm text-surface-500">Processing...</p>
            </div>
          )}

          {phase === PHASES.success && (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle size={28} className="text-emerald-500" />
              <p className="text-sm font-medium text-emerald-700">Action completed successfully</p>
              {summaryItems.length > 0 && (
                <div className="bg-emerald-50 rounded-lg p-3 w-full space-y-1.5">
                  {summaryItems.map((s, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-surface-500">{s.label}</span>
                      <span className="font-medium text-surface-700">{s.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {phase === PHASES.error && (
            <div className="flex flex-col items-center gap-3 py-4">
              <AlertTriangle size={28} className="text-red-500" />
              <p className="text-sm font-medium text-red-700">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-surface-100 bg-surface-50">
          {phase === PHASES.confirm && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${v.button}`}
              >
                {confirmLabel}
              </button>
            </>
          )}
          {(phase === PHASES.success || phase === PHASES.error) && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
