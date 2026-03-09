// ============================================================================
// ConfigLayout — PulseOps V2 Design System
//
// PURPOSE: Reusable tabbed configuration panel with vertical tab list on the
// left and content area on the right. Used by all modules for Configuration
// and Settings views to maintain consistent UI across the platform.
//
// USAGE:
//   import { ConfigLayout } from '@shared';
//   <ConfigLayout
//     title="Module Configuration"
//     subtitle="Configure module settings"
//     icon={Settings}
//     tabs={[
//       { id: 'general', label: 'General', icon: Settings, content: <GeneralTab /> },
//       { id: 'advanced', label: 'Advanced', icon: Sliders, content: <AdvancedTab /> }
//     ]}
//     defaultTab="general"
//   />
//
// PROPS:
//   title      — Page title (string, optional)
//   subtitle   — Page subtitle (string, optional)
//   icon       — Lucide icon component for header (optional)
//   tabs       — Array of { id, label, icon, content, separator? } (required)
//   defaultTab — ID of initially active tab (optional, defaults to first tab)
//
// ARCHITECTURE: Fully reusable, accepts any number of tabs. Each module can
// pass its own tab configuration with custom content components.
// ============================================================================
import React, { useState } from 'react';

export default function ConfigLayout({ title, subtitle, icon: HeaderIcon, tabs = [], defaultTab }) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);
  const activeTabObj = tabs.find(t => t.id === activeTab);

  // Support both JSX elements and render functions for lazy rendering
  const activeContent = activeTabObj?.content
    ? (typeof activeTabObj.content === 'function' ? activeTabObj.content() : activeTabObj.content)
    : null;

  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden animate-fade-in">
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 bg-surface-50/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            {HeaderIcon && (
              <div className="p-2 rounded-lg bg-gradient-to-br from-brand-50 to-teal-50">
                <HeaderIcon size={20} className="text-brand-600" />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-surface-800">{title}</h2>
              {subtitle && <p className="text-xs text-surface-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Tab layout: vertical tabs left + content right */}
      <div className="flex gap-0">
        {/* Tab list */}
        <div className="w-64 shrink-0 border-r border-surface-100 bg-surface-50/30 py-3 overflow-y-auto">
          <nav className="flex flex-col gap-0.5 px-2">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = tab.id === activeTab;
              return (
                <React.Fragment key={tab.id}>
                  {tab.separator && <div className="my-2 mx-3 border-t border-surface-200" />}
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-left transition-all duration-150 ${isActive
                        ? 'bg-gradient-to-r from-brand-50 to-white text-brand-700 shadow-sm ring-1 ring-surface-200/60 font-semibold'
                        : 'text-surface-500 hover:text-surface-700 hover:bg-white/60'
                      }`}
                  >
                    {TabIcon && (
                      <TabIcon
                        size={16}
                        className={isActive ? 'text-brand-500' : 'text-surface-400'}
                      />
                    )}
                    <span className="text-sm truncate">{tab.label}</span>
                    {tab.badge && (
                      <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-brand-100 text-brand-600' : 'bg-surface-100 text-surface-400'
                      }`}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        {/* Active tab content — only the selected tab is mounted */}
        <div className="flex-1 overflow-y-auto px-6 py-5" key={activeTab}>
          {activeContent}
        </div>
      </div>
    </div>
  );
}
