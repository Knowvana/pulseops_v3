// ============================================================================
// App — PulseOps V2 Root Component
//
// PURPOSE: Root component that handles authentication and routes between
// the login form and the PlatformDashboard.
//
// ARCHITECTURE:
//   - Single LoginForm handles all logins (regular users + SuperAdmin)
//   - If username === 'SuperAdmin' → routes to /api/auth/superadmin/login (JSON auth)
//   - Otherwise → routes to /api/auth/login (database auth)
//   - On authentication, PlatformDashboard renders with AuthProvider (RBAC)
//
// DEPENDENCIES:
//   - react-router-dom            → BrowserRouter, Routes, Route, useNavigate
//   - @shared                     → LoginForm, UILogService, createLogger
//   - @shared/contexts/AuthContext → AuthProvider for RBAC
//   - @core/PlatformDashboard      → Single orchestrator for authenticated UI
//   - @config/urls.json            → API endpoint URLs
// ============================================================================
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { LoginForm, UILogService, createLogger } from '@shared';
import { AuthProvider } from '@shared/contexts/AuthContext';
import PlatformDashboard from '@core/PlatformDashboard';
import urls from '@config/urls.json';
import messages from '@config/UIMessages.json';

const log = createLogger('App.jsx');

const authMessages = messages.auth;

// ── Shared API call helper ────────────────────────────────────────────────────
// Wraps fetch so callers receive either a resolved result or a thrown Error
// with a human-readable message derived from the HTTP status + response body.
async function callLoginApi(url, body) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch {
    // true network failure — server unreachable
    throw new Error(authMessages.serverUnavailable);
  }

  let result;
  try { result = await response.json(); } catch { result = null; }

  if (!response.ok) {
    // Use the message from the API body when available
    const apiMsg = result?.error?.message;
    if (response.status === 503) throw new Error(apiMsg || authMessages.dbUnavailable);
    if (response.status === 401) throw new Error(apiMsg || authMessages.loginFailed);
    if (response.status === 403) throw new Error(apiMsg || authMessages.loginFailed);
    throw new Error(apiMsg || authMessages.loginFailed);
  }

  return result;
}

// ── AppContent — uses router hooks, rendered inside BrowserRouter ─────────────
function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState({});
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [saInfo, setSaInfo] = useState(null);
  const sessionCheckRan = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  // On mount, check if existing session cookie is still valid via /auth/me
  useEffect(() => {
    if (sessionCheckRan.current) return;
    sessionCheckRan.current = true;
    log.info('mount', 'Application mounted — checking existing session cookie');
    const checkSession = async () => {
      try {
        // Fetch SA info (public) so we can detect login by username OR email
        const saRes = await fetch(urls.superAdmin.info);
        if (saRes.ok) {
          const saResult = await saRes.json();
          if (saResult?.success) setSaInfo(saResult.data);
        }
      } catch { /* non-critical — fall back to username-only detection */ }
      try {
        log.debug('checkSession', 'Sending session check request', { url: urls.auth.me });
        const response = await fetch(urls.auth.me, { credentials: 'include' });
        if (response.ok) {
          const result = await response.json();
          if (result?.success && result?.data) {
            log.info('checkSession', `Session restored — user: ${result.data.email}, role: ${result.data.role}`);
            setUser(result.data);
            UILogService.setUserEmail(result.data.email);
            setIsAuthenticated(true);
          } else {
            log.info('checkSession', 'No valid session — showing login form');
          }
        } else {
          log.info('checkSession', `Session check returned HTTP ${response.status} — showing login form`);
        }
      } catch {
        log.info('checkSession', 'Session check failed (no server?) — showing login form');
      } finally {
        setIsCheckingSession(false);
      }
    };
    checkSession();
  }, []);

  // ── Unified login — detects SuperAdmin by username, routes to correct endpoint
  const handleLogin = useCallback(async (emailOrUsername, password) => {
    const lower = emailOrUsername.trim().toLowerCase();
    const isSuperAdmin = lower === (saInfo?.username || 'superadmin').toLowerCase()
                      || lower === (saInfo?.email || '').toLowerCase();
    log.info('handleLogin', isSuperAdmin ? 'SuperAdmin login attempt' : `Login attempt — ${emailOrUsername}`);

    const apiUrl = isSuperAdmin ? urls.superAdmin.login : urls.auth.login;
    const body   = isSuperAdmin
      ? { usernameOrEmail: emailOrUsername, password }
      : { email: emailOrUsername, password };

    const result = await callLoginApi(apiUrl, body);
    if (result?.success && result.data?.user) {
      log.info('handleLogin', `Login successful — ${result.data.user.email}`, { role: result.data.user.role });
      setUser(result.data.user);
      UILogService.setUserEmail(result.data.user.email);
      setIsAuthenticated(true);
      navigate('/');
      return;
    }
    throw new Error(result?.error?.message || authMessages.loginFailed);
  }, [navigate, saInfo]);

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    log.info('handleLogout', 'Logout initiated');
    try {
      await fetch(urls.auth.logout, { method: 'POST', credentials: 'include' });
      log.info('handleLogout', 'Logout successful — clearing session');
    } catch (err) {
      log.warn('handleLogout', 'Logout API failed — clearing UI state anyway', { message: err.message });
    }
    UILogService.setUserEmail(null);
    setIsAuthenticated(false);
    setUser({});
    log.info('handleLogout', 'User logged out');
  }, []);

  // Loading spinner while checking session
  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 via-brand-50 to-cyan-50">
        <div className="w-8 h-8 border-3 border-brand-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const defaultUsername = location.pathname === '/login/super-admin' ? 'SuperAdmin' : undefined;
    return <LoginForm key={location.pathname} onLogin={handleLogin} defaultUsername={defaultUsername} />;
  }

  return (
    <AuthProvider user={user}>
      <Routes>
        <Route path="/:moduleId/:viewId" element={<PlatformDashboard user={user} onLogout={handleLogout} />} />
        <Route path="/:moduleId" element={<PlatformDashboard user={user} onLogout={handleLogout} />} />
        <Route path="/" element={<PlatformDashboard user={user} onLogout={handleLogout} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
