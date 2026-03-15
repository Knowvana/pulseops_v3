// ============================================================================
// LeftSideNavBar — PulseOps V2 Layout
//
// PURPOSE: Left sidebar navigation rendered inside the AppShell. Displays
// the active module's nav items with icons, labels, and active highlight.
// Supports collapse/expand toggle for compact view. Module-agnostic —
// receives items[] and callbacks from PlatformDashboard via AppShell.
//
// DESIGN: Matches V1 SideNav exactly — header with title + collapse toggle
// at top, gradient active state, badge support, icon-only collapsed mode.
//
// USED BY: AppShell.jsx
//
// DEPENDENCIES:
//   - @config/uiElementsText.json → Collapse/expand labels
//   - lucide-react            → Chevron icons
// ============================================================================
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import uiText from '@config/uiElementsText.json';

const txt = uiText.sideNav;

export default function LeftSideNavBar({
  title,
  items = [],
  activeItemId,
  onSelectItem,
  collapsed: controlledCollapsed,
  onToggleCollapse,
  width = 240,
  onWidthChange,
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ 'section-4': true }); // Reports section (index 4) expanded by default
  const [isDragging, setIsDragging] = useState(false);
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const toggleCollapse = onToggleCollapse || (() => setInternalCollapsed(!internalCollapsed));

  // Toggle section expansion
  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  // Handle drag start on resizer
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  // Handle drag move with requestAnimationFrame for smooth performance
  React.useEffect(() => {
    if (!isDragging) return;

    let animationFrameId = null;
    let lastX = 0;

    const handleMouseMove = (e) => {
      lastX = e.clientX;
      
      // Use requestAnimationFrame to batch updates and prevent layout thrashing
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      
      animationFrameId = requestAnimationFrame(() => {
        const newWidth = lastX;
        // Constrain width between 180px (min) and 400px (max)
        if (newWidth >= 180 && newWidth <= 400) {
          onWidthChange?.(newWidth);
        }
      });
    };

    const handleMouseUp = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onWidthChange]);

  return (
    <aside 
      className={`
        flex flex-col bg-white border-r border-surface-200/80 relative
        transition-all duration-300 ease-in-out
        ${isDragging ? 'select-none' : ''}
      `}
      style={{ width: isCollapsed ? '64px' : `${width}px` }}
    >
      {/* Header with title and collapse toggle */}
      <div className={`flex items-center border-b border-surface-100 ${isCollapsed ? 'justify-center px-2 py-4' : 'justify-between px-5 pt-5 pb-3'}`}>
        {!isCollapsed && title && (
          <h2 className="text-xs font-bold uppercase tracking-wider text-surface-400">{title}</h2>
        )}
        <button
          onClick={toggleCollapse}
          className={`
            flex items-center gap-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-50 transition-colors
            ${isCollapsed ? 'p-2' : 'px-2 py-1.5'}
          `}
          title={isCollapsed ? txt.expandTooltip : txt.collapseTooltip}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={14} />}
          {!isCollapsed && (
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {txt.collapseLabel}
            </span>
          )}
        </button>
      </div>

      {/* Nav items — supports type: 'separator', type: 'header', and indent: true */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {items.map((item, idx) => {
          // ── Separator ──────────────────────────────────────────────
          if (item.type === 'separator') {
            return isCollapsed
              ? <div key={`sep-${idx}`} className="my-2 mx-2 border-t border-surface-200" />
              : <div key={`sep-${idx}`} className="my-2 mx-1 border-t border-surface-200" />;
          }

          // ── Section header ─────────────────────────────────────────
          if (item.type === 'header') {
            if (isCollapsed) return null;
            const sectionId = `section-${idx}`;
            const isExpanded = expandedSections[sectionId];
            
            return (
              <button
                key={`hdr-${idx}`}
                onClick={() => toggleSection(sectionId)}
                className="w-full flex items-center justify-between pt-3 pb-1 px-3 hover:bg-surface-50 rounded-lg transition-colors group"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400">
                  {item.label}
                </span>
                {isExpanded ? (
                  <ChevronUp size={12} className="text-surface-400 group-hover:text-surface-600" />
                ) : (
                  <ChevronDown size={12} className="text-surface-400 group-hover:text-surface-600" />
                )}
              </button>
            );
          }

          // ── Regular nav item ───────────────────────────────────────
          const Icon = item.icon;
          const isActive = item.id === activeItemId;
          const isIndented = item.indent;
          
          // Find the parent section for indented items
          let parentSectionId = null;
          let isVisible = true;
          
          if (isIndented) {
            // Look backwards for the nearest header
            for (let i = idx - 1; i >= 0; i--) {
              if (items[i].type === 'header') {
                parentSectionId = `section-${i}`;
                break;
              }
            }
            // Hide indented items if parent section is collapsed
            isVisible = expandedSections[parentSectionId];
          }

          // Don't render hidden indented items
          if (isIndented && !isVisible) return null;

          return (
            <button
              key={item.id}
              onClick={() => onSelectItem?.(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`
                w-full flex items-start gap-3 rounded-lg
                transition-all duration-200 group
                ${isCollapsed ? 'justify-center px-2 py-2.5' : isIndented ? 'pl-7 pr-3 py-2' : 'px-3 py-2.5'}
                ${isActive
                  ? 'bg-gradient-to-r from-brand-50 to-brand-50/50 text-brand-700 shadow-sm shadow-brand-100/50'
                  : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50'
                }
              `}
            >
              {Icon && (
                <Icon
                  size={isIndented ? 14 : 18}
                  className={`flex-shrink-0 mt-0.5 ${isActive ? 'text-brand-600' : 'text-surface-400 group-hover:text-surface-600'}`}
                />
              )}
              {!isCollapsed && (
                <span 
                  className={`${isIndented ? 'text-xs' : 'text-sm'} font-medium line-clamp-2 break-words text-left`}
                  title={item.label}
                >
                  {item.label}
                </span>
              )}
              {!isCollapsed && item.badge && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-600">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Draggable resizer handle — only visible when not collapsed */}
      {!isCollapsed && (
        <div
          onMouseDown={handleMouseDown}
          className={`
            absolute right-0 top-0 bottom-0 w-1 cursor-col-resize
            transition-all duration-200
            ${isDragging 
              ? 'bg-gradient-to-b from-brand-500 to-brand-600 shadow-lg' 
              : 'bg-surface-200 hover:bg-gradient-to-b hover:from-brand-400 hover:to-brand-500'
            }
          `}
          style={{ willChange: isDragging ? 'width' : 'auto' }}
          title="Drag to resize sidebar"
        />
      )}
    </aside>
  );
}
