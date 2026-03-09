// ============================================================================
// TopMenu — PulseOps V2 Layout
//
// PURPOSE: Global top navigation bar. White background with gradient accent
// line. Displays the app brand, module tabs (Admin always first, then
// dynamic modules), user menu dropdown, and system monitor toggle.
// Module-agnostic — receives all data and callbacks via props.
//
// DESIGN: Matches V1 TopNav exactly — white bg, gradient accent line,
// uppercase bold tabs with bottom highlight, avatar user menu.
//
// USED BY: AppShell.jsx
//
// DEPENDENCIES:
//   - @config/uiElementsText.json → UI labels
//   - lucide-react            → Icons
// ============================================================================
import React, { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown, MonitorDot, Settings } from 'lucide-react';
import uiText from '@config/uiElementsText.json';

const txt = uiText.topNav;

export default function TopMenu({
  appName = 'PulseOps',
  modules = [],
  activeModuleId,
  onSwitchModule,
  onLogout,
  user,
  onToggleRightPanel,
  isRightPanelOpen = false,
}) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAuthenticated = !!user;

  return (
    <>
      {/* Top gradient accent line */}
      <div className="h-0.5 w-full bg-gradient-to-r from-brand-400 via-teal-400 to-emerald-400" />

      <header className="bg-white/90 backdrop-blur-2xl border-b border-surface-200/80 sticky top-0 z-[60] shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="w-full flex items-center h-14">

          {/* Left section — Brand, matches sidebar width */}
          <div className="flex items-center w-60 shrink-0 h-full px-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-teal-500 flex items-center justify-center shadow-sm shadow-brand-200">
                <span className="text-white text-sm font-extrabold">
                  {(appName || 'P').charAt(0)}
                </span>
              </div>
              <span className="text-lg font-bold text-surface-800 hidden sm:block tracking-tight">
                {appName}
              </span>
            </div>
          </div>

          {/* Main navigation area — Module tabs */}
          <div className="flex-1 flex items-center justify-between px-6 h-full">
            {isAuthenticated && modules.length > 0 ? (
              <nav className="flex items-center h-full">
                {modules.map((mod, index) => {
                  const isActive = mod.id === activeModuleId;
                  const isLast = index === modules.length - 1;
                  const ModIcon = mod.icon || MonitorDot;

                  return (
                    <React.Fragment key={mod.id}>
                      <button
                        onClick={() => onSwitchModule(mod.id)}
                        className={`
                          relative h-full px-4 flex items-center text-[13px] font-bold uppercase tracking-wider transition-all duration-200 group
                          ${isActive
                            ? 'text-brand-700 bg-brand-50/30'
                            : 'text-surface-500 hover:text-surface-900 hover:bg-surface-50/50'
                          }
                        `}
                      >
                        <ModIcon
                          size={18}
                          className={`mr-2.5 transition-colors ${isActive ? 'text-brand-600' : 'text-surface-400 group-hover:text-brand-500'}`}
                        />
                        {mod.name}

                        {/* Bottom gradient border highlighter */}
                        {isActive && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-teal-400 rounded-t-md shadow-[0_-2px_8px_rgba(20,184,166,0.3)]" />
                        )}
                        {!isActive && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-300 scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-center rounded-t-md" />
                        )}
                      </button>

                      {/* Vertical separator */}
                      {!isLast && (
                        <div className="h-6 w-px bg-gradient-to-b from-surface-200 via-surface-200 to-transparent mx-1" />
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>
            ) : (
              <div />
            )}

            {/* Right actions — User menu + Monitor toggle */}
            <div className="flex items-center gap-2">
              {/* User menu dropdown */}
              {isAuthenticated && (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg hover:bg-surface-50 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-teal-400 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">
                        {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-surface-700 hidden lg:block max-w-[120px] truncate">
                      {user.name || user.email}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-surface-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isUserMenuOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl border border-surface-200 shadow-xl shadow-surface-200/50 py-1.5 animate-slide-down z-50">
                      <div className="px-4 py-2.5 border-b border-surface-100">
                        <p className="text-sm font-semibold text-surface-800 truncate">
                          {user.name || user.email || 'User'}
                        </p>
                        <p className="text-xs text-surface-400 truncate">{user.email}</p>
                        {user.role && (
                          <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-brand-50 text-brand-600">
                            {user.role.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => { setIsUserMenuOpen(false); onLogout?.(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <LogOut size={15} />
                        {txt.userMenu.signOutLabel}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* System monitor toggle */}
              {onToggleRightPanel && (
                <div className="pl-1 ml-1 border-l border-surface-200 h-8 flex items-center">
                  <button
                    onClick={onToggleRightPanel}
                    className={`
                      flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                      transition-all duration-200
                      ${isRightPanelOpen
                        ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200'
                        : 'text-surface-400 hover:text-surface-600 hover:bg-surface-100'
                      }
                    `}
                    title={txt.buttons.monitor}
                  >
                    <MonitorDot size={16} />
                    <span className="hidden md:inline">{txt.buttons.monitor}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
