// ============================================================================
// ConfigurationAlertModal — PulseOps V2
//
// PURPOSE: Reusable modal component for displaying configuration alerts
// (e.g., Database Not Configured, Logs Not Enabled, etc.).
//
// FEATURES:
//   - Customizable icon, header, message detail, and action button
//   - Consistent styling with alert variants (error, warning, info)
//   - Backdrop blur and centered overlay
//   - Optional action button with custom icon and text
//   - Optional close button
//
// USAGE:
//   <ConfigurationAlertModal
//     isOpen={true}
//     icon={AlertTriangle}
//     header="Database Not Configured"
//     messageDetail="The database schema has not been initialized..."
//     actionIcon={SettingsIcon}
//     actionText="Go to Database Setup"
//     onAction={() => navigate('/platform_admin/DatabaseSetup')}
//     variant="error"
//   />
//
// PROPS:
//   - isOpen (bool): Whether modal is visible
//   - icon (React.Component): Lucide icon component for header
//   - header (string): Bold header text
//   - messageDetail (string): Detailed message text
//   - actionIcon (React.Component, optional): Icon for action button
//   - actionText (string, optional): Text for action button
//   - onAction (function, optional): Callback when action button clicked
//   - onClose (function, optional): Callback when close button clicked
//   - variant (string): "error" | "warning" | "info" (default: "error")
// ============================================================================
import React from 'react';
import { X } from 'lucide-react';

export default function ConfigurationAlertModal({
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

  // Variant-specific styling — distinct colors for each type
  const variantStyles = {
    error: {
      bgIcon: 'bg-red-50',
      borderIcon: 'border-red-200',
      textIcon: 'text-red-500',
      bgCard: 'border-red-200',
      bgButton: 'bg-red-500 hover:bg-red-600',
    },
    warning: {
      bgIcon: 'bg-amber-50',
      borderIcon: 'border-amber-200',
      textIcon: 'text-amber-500',
      bgCard: 'border-amber-200',
      bgButton: 'bg-amber-500 hover:bg-amber-600',
    },
    info: {
      bgIcon: 'bg-brand-50',
      borderIcon: 'border-brand-200',
      textIcon: 'text-brand-600',
      bgCard: 'border-brand-200',
      bgButton: 'bg-brand-500 hover:bg-brand-600',
    },
  };

  const styles = variantStyles[variant] || variantStyles.error;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-surface-50/90 backdrop-blur-sm">
      <div className={`bg-white border rounded-2xl shadow-xl p-8 max-w-md mx-4 text-center space-y-4 ${styles.bgCard}`}>
        {/* Icon */}
        <div className={`w-14 h-14 ${styles.bgIcon} rounded-2xl flex items-center justify-center mx-auto`}>
          {IconComponent && <IconComponent size={28} className={styles.textIcon} />}
        </div>

        {/* Header */}
        <div>
          <h3 className="text-lg font-bold text-surface-800 mb-1">{header}</h3>
          <p className="text-sm text-surface-500">{messageDetail}</p>
        </div>

        {/* Action Button */}
        {actionText && onAction && (
          <button
            onClick={onAction}
            className={`inline-flex items-center gap-2 px-5 py-2.5 ${styles.bgButton} text-white text-sm font-semibold rounded-xl transition-colors`}
          >
            {ActionIconComponent && <ActionIconComponent size={15} />}
            {actionText}
          </button>
        )}

        {/* Close Button (optional) */}
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
