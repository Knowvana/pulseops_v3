// ============================================================================
// ProgressModal — Reusable progress overlay for ServiceNow module
//
// PURPOSE: Shows a centered modal overlay with a spinner while data is loading,
// and a success/failure message label upon completion.
//
// USAGE:
//   <ProgressModal
//     visible={true}
//     message="Fetching incidents from ServiceNow..."
//     result={{ type: 'success', text: 'Loaded 142 incidents.' }}  // null while loading
//     onDismiss={() => setVisible(false)}
//   />
// ============================================================================

import React, { useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

export default function ProgressModal({ visible, message, result, onDismiss }) {
  // Auto-dismiss success after 3s
  useEffect(() => {
    if (result?.type === 'success' && onDismiss) {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [result, onDismiss]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-xl p-6 w-full max-w-sm mx-4 relative">
        {/* Close button */}
        {result && onDismiss && (
          <button
            onClick={onDismiss}
            className="absolute top-3 right-3 p-1 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
          >
            <X size={14} />
          </button>
        )}

        <div className="flex flex-col items-center text-center gap-3">
          {/* Loading state */}
          {!result && (
            <>
              <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
                <Loader2 size={24} className="text-brand-600 animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-800">{message || 'Loading...'}</p>
                <p className="text-xs text-surface-400 mt-1">Please wait while we fetch data from ServiceNow.</p>
              </div>
            </>
          )}

          {/* Success state */}
          {result?.type === 'success' && (
            <>
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={24} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-700">Success</p>
                <p className="text-xs text-surface-600 mt-1">{result.text}</p>
              </div>
            </>
          )}

          {/* Error state */}
          {result?.type === 'error' && (
            <>
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
                <AlertCircle size={24} className="text-rose-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-rose-700">Failed</p>
                <p className="text-xs text-surface-600 mt-1">{result.text}</p>
              </div>
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="mt-2 px-4 py-1.5 rounded-lg text-xs font-semibold bg-surface-100 text-surface-700 hover:bg-surface-200 transition-colors"
                >
                  Dismiss
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
