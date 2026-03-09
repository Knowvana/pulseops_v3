// ============================================================================
// SuperAdminLoginForm — PulseOps V2
//
// PURPOSE: Login form for the single SuperAdmin account.
// Username field is prefilled with "SuperAdmin" and locked (read-only).
// Authenticates via POST /api/auth/superadmin/login (JSON file auth).
//
// USAGE:
//   <SuperAdminLoginForm onLogin={handleSuperAdminLogin} />
//
// ROUTE: /login/super-admin  (accessed directly via URL)
//
// DEPENDENCIES:
//   - @config/uiElementsText.json → All UI labels
//   - @config/UIMessages.json     → Error messages
//   - @shared/components/Button   → Consistent button theming
// ============================================================================
import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, Loader, AlertCircle, Info } from 'lucide-react';
import Button from '@shared/components/Button';
import { createLogger } from '@shared/services/consoleLogger';
import uiText from '@config/uiElementsText.json';
import messages from '@config/UIMessages.json';

const log = createLogger('SuperAdminLoginForm.jsx');
const loginText  = uiText.superAdminLogin || {};
const authMessages = messages.auth;

export default function SuperAdminLoginForm({ onLogin }) {
  const [password, setPassword] = useState('Infosys@123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  log.debug('mount', 'SuperAdmin login page accessed');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      log.warn('handleSubmit', 'Validation failed — password empty');
      setError(loginText.passwordRequired || 'Password is required.');
      return;
    }

    try {
      log.info('handleSubmit', 'SuperAdmin login form submitted');
      setLoading(true);
      await onLogin(password);
      log.info('handleSubmit', 'SuperAdmin login successful');
    } catch (err) {
      log.error('handleSubmit', 'SuperAdmin login failed', { message: err.message });
      setError(err.message || authMessages.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl mb-4">
            <ShieldCheck size={32} className="text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            {loginText.title || 'Super Administrator'}
          </h1>
          <p className="text-slate-400 text-sm">
            {loginText.subtitle || 'Platform SuperAdmin — Restricted Access'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 shadow-2xl">

          {/* Notice strip */}
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-6">
            <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300">
              {loginText.notice || 'SuperAdmin access is restricted. For standard access, use the regular login page.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>

            {/* Username field — prefilled and locked */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                {loginText.usernameLabel || 'Username'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value="SuperAdmin"
                  readOnly
                  className="w-full px-4 py-3 bg-slate-700/40 border border-slate-600/50 rounded-xl text-slate-400 text-sm font-mono cursor-not-allowed select-none"
                  tabIndex={-1}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                  {loginText.lockedBadge || 'Fixed'}
                </span>
              </div>
            </div>

            {/* Password field */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                {loginText.passwordLabel || 'Password'}
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={loginText.passwordPlaceholder || 'Enter SuperAdmin password'}
                  autoComplete="current-password"
                  autoFocus
                  className="w-full pl-10 pr-10 py-3 bg-slate-700/60 border border-slate-600 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-wait text-slate-900 font-semibold rounded-xl text-sm transition-all"
            >
              {loading ? (
                <Loader size={16} className="animate-spin" />
              ) : (
                <ShieldCheck size={16} />
              )}
              {loading
                ? (loginText.signingIn || 'Authenticating…')
                : (loginText.signInButton || 'Sign In as SuperAdmin')}
            </button>

          </form>
        </div>

        {/* Back link */}
        <p className="text-center mt-6 text-sm text-slate-500">
          {loginText.backText || 'Not a SuperAdmin?'}{' '}
          <a href="/" className="text-slate-400 hover:text-white underline underline-offset-2 transition-colors">
            {loginText.backLink || 'Go to regular login'}
          </a>
        </p>

      </div>
    </div>
  );
}
