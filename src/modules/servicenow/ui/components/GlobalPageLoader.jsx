// ============================================================================
// GlobalPageLoader — PulseOps V3 ServiceNow Module
//
// PURPOSE: Context-based global page loader overlay. Any component within the
// ServiceNow module can call showLoader(message) / hideLoader() to display
// a full-page loading overlay with a branded spinner and optional message.
//
// USAGE:
//   // Wrap your module root:
//   <PageLoaderProvider>
//     <YourComponent />
//   </PageLoaderProvider>
//
//   // Inside any child component:
//   const { showLoader, hideLoader } = usePageLoader();
//   showLoader('Fetching incidents...');
//   await doWork();
//   hideLoader();
//
// DEPENDENCIES:
//   - React context API
//   - Tailwind CSS
// ============================================================================

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const PageLoaderContext = createContext(null);

export function usePageLoader() {
  const ctx = useContext(PageLoaderContext);
  if (!ctx) {
    // Fallback no-ops if used outside provider
    return { showLoader: () => {}, hideLoader: () => {}, isLoading: false };
  }
  return ctx;
}

export function PageLoaderProvider({ children }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const countRef = useRef(0); // support nested show/hide calls

  const showLoader = useCallback((msg = 'Loading...') => {
    countRef.current += 1;
    setMessage(msg);
    setLoading(true);
  }, []);

  const hideLoader = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    if (countRef.current === 0) {
      setLoading(false);
      setMessage('');
    }
  }, []);

  return (
    <PageLoaderContext.Provider value={{ showLoader, hideLoader, isLoading: loading }}>
      {children}
      {loading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="relative">
              <div className="w-10 h-10 border-[3px] rounded-full border-brand-200 border-t-brand-600 animate-spin" />
              <div
                className="absolute inset-0 w-10 h-10 border-[3px] rounded-full border-transparent border-r-brand-300 animate-spin"
                style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}
              />
            </div>
            {message && (
              <p className="text-sm font-medium text-surface-600 animate-pulse max-w-xs text-center">
                {message}
              </p>
            )}
          </div>
        </div>
      )}
    </PageLoaderContext.Provider>
  );
}

export default PageLoaderProvider;
