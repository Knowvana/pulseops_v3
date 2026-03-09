// ============================================================================
// TabLayout — PulseOps V3 Reusable Component
//
// PURPOSE: Vertical or horizontal tab layout with icon support. Used for
// Settings pages, module config tabs, and any multi-section UI.
//
// USAGE:
//   import { TabLayout } from '@components';
//   <TabLayout
//     tabs={[
//       { id: 'general', label: 'General', icon: Settings, content: () => <General /> },
//       { id: 'advanced', label: 'Advanced', icon: Sliders, content: () => <Advanced /> },
//     ]}
//     defaultTab="general"
//     orientation="vertical"
//   />
//
// ORIENTATION: vertical, horizontal
// ============================================================================
import React, { useState } from 'react';

export default function TabLayout({
  tabs = [],
  defaultTab,
  orientation = 'vertical',
  className = '',
}) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  const activeContent = tabs.find(t => t.id === activeTab);

  if (orientation === 'horizontal') {
    return (
      <div className={`space-y-4 ${className}`}>
        {/* Horizontal Tab Bar */}
        <div className="flex gap-1 border-b border-surface-200">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                  isActive
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-surface-400 hover:text-surface-600 hover:border-surface-300'
                }`}
              >
                {Icon && <Icon size={16} />}
                {tab.label}
              </button>
            );
          })}
        </div>
        {/* Content */}
        <div className="animate-fade-in">
          {activeContent?.content && activeContent.content()}
        </div>
      </div>
    );
  }

  // Vertical (default)
  return (
    <div className={`flex gap-6 ${className}`}>
      {/* Sidebar */}
      <div className="w-56 shrink-0 space-y-1">
        {tabs.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;
          return (
            <React.Fragment key={tab.id}>
              {tab.separator && idx > 0 && (
                <div className="my-2 border-t border-surface-200" />
              )}
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 shadow-sm'
                    : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50'
                }`}
              >
                {Icon && <Icon size={16} className={isActive ? 'text-brand-500' : 'text-surface-400'} />}
                {tab.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 animate-fade-in">
        {activeContent?.content && activeContent.content()}
      </div>
    </div>
  );
}
