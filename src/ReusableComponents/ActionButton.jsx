// ============================================================================
// ActionButton — PulseOps V3 Reusable Component
//
// PURPOSE: Universal action button with gradient theme, loading states,
// multiple variants, and icon support. Used across all UI, modules, and API.
//
// USAGE:
//   import { ActionButton } from '@components';
//   <ActionButton variant="primary" icon={<Save />}>Save</ActionButton>
//   <ActionButton variant="danger" size="sm" isLoading>Deleting...</ActionButton>
//
// VARIANTS: primary, secondary, danger, ghost, success
// SIZES: sm, md, lg
// ============================================================================
import React from 'react';
import { Loader } from 'lucide-react';

const ActionButton = React.forwardRef(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      icon,
      isLoading = false,
      disabled = false,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center gap-2 font-bold transition-all outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

    const sizeStyles = {
      sm: 'px-3 py-2 text-sm rounded-lg',
      md: 'px-4 py-3 text-base rounded-xl',
      lg: 'px-6 py-4 text-lg rounded-xl',
    };

    const variantStyles = {
      primary:
        'bg-gradient-to-r from-brand-500 to-cyan-500 text-white hover:from-brand-600 hover:to-cyan-600 shadow-lg shadow-brand-200 hover:shadow-xl hover:shadow-brand-200 focus:ring-brand-500',
      secondary:
        'border-2 border-brand-500 text-brand-600 bg-white hover:bg-brand-50 shadow-sm hover:shadow-md focus:ring-brand-500',
      danger:
        'bg-gradient-to-r from-red-500 to-rose-500 text-white hover:from-red-600 hover:to-rose-600 shadow-lg shadow-rose-200 hover:shadow-xl hover:shadow-rose-200 focus:ring-red-500',
      ghost:
        'text-surface-600 hover:bg-surface-100 hover:text-surface-800 focus:ring-surface-400',
      success:
        'bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-600 hover:to-green-600 shadow-lg shadow-emerald-200 hover:shadow-xl hover:shadow-emerald-200 focus:ring-emerald-500',
    };

    const iconSize = { sm: 16, md: 18, lg: 20 };
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader size={iconSize[size]} className="animate-spin" />
        ) : (
          icon && React.cloneElement(icon, { size: iconSize[size] })
        )}
        {children}
      </button>
    );
  }
);

ActionButton.displayName = 'ActionButton';

export default ActionButton;
