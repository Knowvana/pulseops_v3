// ============================================================================
// GeneralSettingsTab — Accessio Operations Module Config
//
// PURPOSE: Module-wide configuration and default values.
// Skeleton — configuration options will be added as features are built.
//
// USED BY: manifest.jsx → getConfigTabs()
// ============================================================================
import React from 'react';
import { Settings } from 'lucide-react';
import uiText from '../../config/uiText.json';

const t = uiText.generalSettings;

export default function GeneralSettingsTab() {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-surface-200 p-5 shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-surface-800">{t.title}</h3>
        <p className="text-xs text-surface-500 -mt-3">{t.subtitle}</p>

        <div className="bg-surface-50 rounded-lg border border-surface-200 p-8 text-center">
          <Settings size={32} className="mx-auto mb-3 text-surface-300" />
          <p className="text-sm text-surface-500">{t.placeholderMessage}</p>
        </div>
      </div>
    </div>
  );
}
