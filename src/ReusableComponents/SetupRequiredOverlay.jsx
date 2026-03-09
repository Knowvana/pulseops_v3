// ============================================================================
// SetupRequiredOverlay — PulseOps V3 Reusable Component
//
// PURPOSE: Overlay alert displayed when a required setup step is missing
// (e.g., Database Not Configured, Logs Not Enabled). Shows an icon, header,
// detail message, and an action button to navigate to the setup page.
//
// USAGE:
//   import { SetupRequiredOverlay } from '@components';
//   <SetupRequiredOverlay
//     isOpen={!isDatabaseConfigured}
//     icon={Database}
//     header="Database Not Configured"
//     messageDetail="Please configure the database first."
//     actionIcon={Settings}
//     actionText="Go to Database Setup"
//     onAction={() => navigate('/platform_admin/Settings?tab=databaseSetup')}
//     variant="error"
//   />
//
// VARIANTS: error, warning, info
// POSITIONING: Uses absolute positioning to stay within parent container.
//              Wrap the parent container with `relative` to contain the overlay.
// ============================================================================
import React from 'react';
import { X } from 'lucide-react';
import { variants as themeVariants, theme } from './theme';

export default function SetupRequiredOverlay({
  isOpen,
  icon: IconComponent,
  header,
  messageDetail,
  actionIcon: ActionIconComponent,
  actionText,
  onAction,
  onClose,
  variant = 'error',
}) {
  if (!isOpen) return null;

  const variantStyles = {
    error: {
      iconBg: 'bg-red-50',
      iconColor: 'text-red-500',
      cardBorder: 'border-red-200',
      button: 'bg-red-500 hover:bg-red-600',
    },
    warning: {
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-500',
      cardBorder: 'border-amber-200',
      button: 'bg-amber-500 hover:bg-amber-600',
    },
    info: {
      iconBg: 'bg-brand-50',
      iconColor: 'text-brand-600',
      cardBorder: 'border-brand-200',
      button: 'bg-brand-500 hover:bg-brand-600',
    },
  };

  const styles = variantStyles[variant] || variantStyles.error;

  return (
    <div className={theme.overlay}>
      <div className={`bg-white border rounded-2xl shadow-xl p-8 max-w-md mx-4 text-center space-y-4 ${styles.cardBorder}`}>
        {/* Icon */}
        <div className={`${theme.iconBoxLg} ${styles.iconBg} mx-auto`}>
          {IconComponent && <IconComponent size={28} className={styles.iconColor} />}
        </div>

        {/* Header & Detail */}
        <div>
          <h3 className="text-lg font-bold text-surface-800 mb-1">{header}</h3>
          <p className="text-sm text-surface-500">{messageDetail}</p>
        </div>

        {/* Action Button */}
        {actionText && onAction && (
          <button
            onClick={onAction}
            className={`inline-flex items-center gap-2 px-5 py-2.5 ${styles.button} text-white text-sm font-semibold rounded-xl transition-colors`}
          >
            {ActionIconComponent && <ActionIconComponent size={15} />}
            {actionText}
          </button>
        )}

        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-lg hover:bg-surface-100 transition-colors"
          >
            <X size={16} className="text-surface-500" />
          </button>
        )}
      </div>
    </div>
  );
}
