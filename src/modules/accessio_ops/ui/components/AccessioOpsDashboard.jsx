// ============================================================================
// AccessioOpsDashboard — Accessio Operations Module Dashboard
//
// PURPOSE: Main dashboard view for the Accessio Operations module.
// Skeleton — features will be added incrementally.
//
// USED BY: manifest.jsx → getViews() → dashboard
// ============================================================================
import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import uiText from '../config/uiText.json';

const t = uiText.dashboard;

export default function AccessioOpsDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">{t.title}</h1>
        <p className="text-surface-500">{t.subtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-surface-200 p-12 text-center">
        <LayoutDashboard size={48} className="mx-auto mb-4 text-surface-300" />
        <p className="text-surface-500">{t.placeholder}</p>
      </div>
    </div>
  );
}
