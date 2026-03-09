// ============================================================================
// Button Component — PulseOps V2 Design System
//
// PURPOSE: Reusable button with gradient theme matching LoginForm aesthetic.
// Supports multiple variants, sizes, loading states, and custom icons.
//
// USAGE:
//   import { Button } from '@shared';
//   <Button variant="primary" icon={<LogIn />}>Sign In</Button>
//   <Button variant="secondary" size="sm" isLoading>Processing...</Button>
//
// VARIANTS:
//   - primary: Brand gradient (teal to cyan) - default
//   - secondary: Outlined with brand border
//   - danger: Red gradient for destructive actions
//   - ghost: Transparent with hover effect
//
// ARCHITECTURE: Uses semantic color tokens from tailwind.config.js.
// All styling follows the brand gradient pattern from LoginForm.
// ============================================================================
import React from 'react';
import { Loader } from 'lucide-react';

const Button = React.forwardRef(
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
        'bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] text-white hover:from-[#0d9488] hover:to-[#0891b2] shadow-lg shadow-brand-200 hover:shadow-xl hover:shadow-brand-200 focus:ring-brand-500',
      secondary:
        'border-2 border-brand-500 text-brand-600 bg-white hover:bg-brand-50 shadow-sm hover:shadow-md focus:ring-brand-500',
      danger:
        'bg-gradient-to-r from-[#ef4444] to-[#f43f5e] text-white hover:from-[#dc2626] hover:to-[#e11d48] shadow-lg shadow-rose-200 hover:shadow-xl hover:shadow-rose-200 focus:ring-danger-500',
      ghost:
        'text-surface-600 hover:bg-surface-100 hover:text-surface-800 focus:ring-surface-400',
      success:
        'bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white hover:from-[#16a34a] hover:to-[#15803d] shadow-lg shadow-success-50 hover:shadow-xl hover:shadow-success-50 focus:ring-success-500',
    };

    const iconSize = {
      sm: 16,
      md: 18,
      lg: 20,
    };

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

Button.displayName = 'Button';

export default Button;
