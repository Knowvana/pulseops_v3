// ============================================================================
// Theme — PulseOps V3 Reusable Components
//
// PURPOSE: Common theme definition for all reusable components. Defines the
// default greenish-teal gradient theme, status variants, and shared styling
// tokens. All ReusableComponents use these tokens for consistent appearance.
//
// USAGE:
//   import { theme, gradients, variants } from '@components/theme';
// ============================================================================

// ── Brand Gradient (Default Theme — Teal/Green) ─────────────────────────────
export const gradients = {
  brand:   'bg-gradient-to-r from-brand-500 to-brand-600',
  brandLight: 'bg-gradient-to-r from-brand-50 to-cyan-50',
  brandSubtle: 'bg-gradient-to-br from-brand-100 to-cyan-100',
  success: 'bg-gradient-to-r from-emerald-500 to-green-600',
  successLight: 'bg-gradient-to-r from-emerald-50 to-green-50',
  warning: 'bg-gradient-to-r from-amber-500 to-orange-500',
  warningLight: 'bg-gradient-to-r from-amber-50 to-orange-50',
  error:   'bg-gradient-to-r from-red-500 to-rose-600',
  errorLight: 'bg-gradient-to-r from-red-50 to-rose-50',
  info:    'bg-gradient-to-r from-brand-400 to-cyan-500',
  infoLight: 'bg-gradient-to-r from-brand-50 to-cyan-50',
  surface: 'bg-gradient-to-r from-surface-50 to-slate-50',
};

// ── Status Variants ─────────────────────────────────────────────────────────
// Used by StatusBadge, ProgressBar, AlertOverlay, ConnectionIndicator, etc.
export const variants = {
  success: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    icon: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
    button: 'bg-emerald-500 hover:bg-emerald-600',
    gradient: gradients.success,
    gradientLight: gradients.successLight,
    ring: 'ring-emerald-200',
    progressBg: 'bg-emerald-200',
    progressFill: 'bg-emerald-500',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    icon: 'text-amber-600',
    iconBg: 'bg-amber-100',
    button: 'bg-amber-500 hover:bg-amber-600',
    gradient: gradients.warning,
    gradientLight: gradients.warningLight,
    ring: 'ring-amber-200',
    progressBg: 'bg-amber-200',
    progressFill: 'bg-amber-500',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: 'text-red-600',
    iconBg: 'bg-red-100',
    button: 'bg-red-500 hover:bg-red-600',
    gradient: gradients.error,
    gradientLight: gradients.errorLight,
    ring: 'ring-red-200',
    progressBg: 'bg-red-200',
    progressFill: 'bg-red-500',
  },
  info: {
    bg: 'bg-brand-50',
    border: 'border-brand-200',
    text: 'text-brand-700',
    icon: 'text-brand-600',
    iconBg: 'bg-brand-100',
    button: 'bg-brand-500 hover:bg-brand-600',
    gradient: gradients.brand,
    gradientLight: gradients.brandLight,
    ring: 'ring-brand-200',
    progressBg: 'bg-brand-200',
    progressFill: 'bg-brand-500',
  },
  neutral: {
    bg: 'bg-surface-50',
    border: 'border-surface-200',
    text: 'text-surface-700',
    icon: 'text-surface-500',
    iconBg: 'bg-surface-100',
    button: 'bg-surface-500 hover:bg-surface-600',
    gradient: gradients.surface,
    gradientLight: gradients.surface,
    ring: 'ring-surface-200',
    progressBg: 'bg-surface-200',
    progressFill: 'bg-surface-500',
  },
};

// ── Shared Tokens ───────────────────────────────────────────────────────────
export const theme = {
  // Card containers
  card: 'bg-white rounded-xl border border-surface-200 shadow-sm',
  cardHover: 'bg-white rounded-xl border border-surface-200 shadow-sm hover:shadow-md transition-shadow',

  // Text hierarchy
  heading: 'text-base font-bold text-surface-800',
  subheading: 'text-sm font-semibold text-surface-700',
  body: 'text-sm text-surface-600',
  caption: 'text-xs text-surface-400',
  label: 'text-xs font-semibold text-surface-500 uppercase tracking-wider',

  // Layout
  section: 'space-y-4',
  row: 'flex items-center gap-2',
  stack: 'flex flex-col gap-2',

  // Transitions
  transition: 'transition-all duration-200 ease-in-out',
  fadeIn: 'animate-fade-in',

  // Overlay / Backdrop
  overlay: 'absolute inset-0 z-50 flex items-center justify-center bg-surface-50/90 backdrop-blur-sm',
  overlayFixed: 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm',

  // Badge
  badge: 'px-2.5 py-0.5 rounded-full text-xs font-semibold',

  // Icon container
  iconBox: 'w-10 h-10 rounded-xl flex items-center justify-center',
  iconBoxLg: 'w-14 h-14 rounded-2xl flex items-center justify-center',
};

export default { theme, gradients, variants };
