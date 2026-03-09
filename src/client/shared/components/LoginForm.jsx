// ============================================================================
// LoginForm Component — PulseOps V2
//
// PURPOSE: Unified login form with gradient background matching original design.
// Uses Button component for consistent theming across the application.
//
// USAGE:
//   import { LoginForm } from '@shared';
//   <LoginForm onLogin={handleLogin} isLoading={false} />
// ============================================================================
import React, { useState, useEffect, useRef } from 'react';
import { Mail, Lock, Eye, EyeOff, LogIn, Loader, AlertCircle, Database } from 'lucide-react';
import Button from '@shared/components/Button';
import { createLogger } from '@shared/services/consoleLogger';
import uiText from '@config/uiElementsText.json';
import messages from '@config/UIMessages.json';
import urls from '@config/urls.json';

const log = createLogger('LoginForm.jsx');
const loginText = uiText.login;
const authMessages = messages.auth;

export default function LoginForm({ onLogin, isLoading = false, defaultUsername }) {
  log.debug('mount', 'Login page accessed');
  // TODO: Remove default credentials before production deployment
  const [email, setEmail] = useState(defaultUsername || 'admin@test.com');
  const [password, setPassword] = useState('Infosys@123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const dbCheckRan = useRef(false);

  // Check DB availability on mount
  useEffect(() => {
    if (dbCheckRan.current) return;
    dbCheckRan.current = true;
    (async () => {
      try {
        const res = await fetch(urls.database.status);
        const json = await res.json();
        if (json.success && json.data) {
          setDbUnavailable(!json.data.dbAvailable || !json.data.schemaInitialized);
        }
      } catch {
        // API unreachable — don't block login (SuperAdmin may still work)
        log.warn('dbCheck', 'DB status check failed — API may be unreachable');
      }
    })();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      log.warn('handleSubmit', 'Validation failed — email or password empty');
      setError(loginText.validationError);
      return;
    }

    try {
      log.info('handleSubmit', 'Login form submitted', { email });
      setLoading(true);
      await onLogin(email, password);
      log.info('handleSubmit', 'Login successful — redirecting');
    } catch (err) {
      log.error('handleSubmit', 'Login failed', { message: err.message });
      setError(err.message || authMessages.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider) => {
    log.info('handleSocialLogin', `Social login attempted — provider: ${provider} (not available)`);
    setError(`${provider}${loginText.socialComingSoon}`);
  };

  const isProcessing = isLoading || loading;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 via-brand-50 to-cyan-50 p-4">
      {/* Background decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-200/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-200/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-200/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-brand-500 to-cyan-500 rounded-2xl shadow-lg shadow-brand-200 mb-4">
            <span className="text-white text-2xl font-bold">P</span>
          </div>
          <h1 className="text-3xl font-bold text-surface-800">{uiText.platform.name}</h1>
          <p className="text-surface-500 mt-2">{loginText.subtitle}</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl shadow-surface-200/50 border border-white/50 p-8">
          {/* DB Unavailable Warning */}
          {dbUnavailable && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <Database size={18} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-amber-800 font-semibold">Database Not Available</p>
                <p className="text-xs text-amber-600 mt-1">
                  The database is not configured or unreachable. Only SuperAdmin login is available.
                  Set up the database from Settings → Database Setup after logging in.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
              <AlertCircle size={18} className="text-rose-500 mt-0.5 shrink-0" />
              <p className="text-sm text-rose-700 font-medium">{error}</p>
            </div>
          )}

          {/* Email Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-surface-700 mb-2">{loginText.emailLabel}</label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={loginText.emailPlaceholder}
                  className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-surface-200 bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition-all text-surface-800 font-medium placeholder:text-surface-400"
                  disabled={isProcessing}
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-surface-700 mb-2">{loginText.passwordLabel}</label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={loginText.passwordPlaceholder}
                  className="w-full pl-11 pr-12 py-3 rounded-xl border-2 border-surface-200 bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition-all text-surface-800 font-medium placeholder:text-surface-400"
                  disabled={isProcessing}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                  disabled={isProcessing}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={isProcessing}
              isLoading={isProcessing}
              icon={isProcessing ? undefined : <LogIn />}
            >
              {isProcessing ? loginText.loadingButton : loginText.submitButton}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-surface-200" />
            <span className="text-xs text-surface-400 font-semibold uppercase tracking-wider">{loginText.dividerLabel}</span>
            <div className="flex-1 h-px bg-surface-200" />
          </div>

          {/* Social Auth Buttons — OpenID Connect placeholders */}
          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => handleSocialLogin(loginText.socialProviders[0].label)} disabled className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-surface-200 rounded-xl hover:bg-surface-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span className="text-sm font-semibold text-surface-600 hidden sm:inline">{loginText.socialProviders[0].label}</span>
            </button>
            <button onClick={() => handleSocialLogin(loginText.socialProviders[1].label)} disabled className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-surface-200 rounded-xl hover:bg-surface-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
                <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
                <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
              </svg>
              <span className="text-sm font-semibold text-surface-600 hidden sm:inline">{loginText.socialProviders[1].label}</span>
            </button>
            <button onClick={() => handleSocialLogin(loginText.socialProviders[2].label)} disabled className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-surface-200 rounded-xl hover:bg-surface-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="w-5 h-5 text-surface-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              <span className="text-sm font-semibold text-surface-600 hidden sm:inline">{loginText.socialProviders[2].label}</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-surface-300 mt-4">{loginText.superAdminHint}</p>
        <p className="text-center text-sm text-surface-400 mt-2">{loginText.poweredBy}</p>
      </div>
    </div>
  );
}
