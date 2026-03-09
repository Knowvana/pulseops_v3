// ============================================================================
// FormField — PulseOps V3 Reusable Component
//
// PURPOSE: Universal form field with label, input, validation error, and
// optional icon. Supports text, password, number, select, and textarea types.
//
// USAGE:
//   import { FormField } from '@components';
//   <FormField label="Host" name="host" value={config.host} onChange={handleChange} />
//   <FormField label="Port" name="port" type="number" icon={Hash} />
//   <FormField label="Level" name="level" type="select" options={['info','warn','error']} />
//
// TYPES: text, password, number, select, textarea
// ============================================================================
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function FormField({
  label,
  name,
  value = '',
  onChange,
  type = 'text',
  placeholder = '',
  icon: Icon,
  error,
  required = false,
  disabled = false,
  options = [],
  rows = 3,
  className = '',
}) {
  const [showPassword, setShowPassword] = useState(false);

  const inputBase =
    'w-full px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-all disabled:bg-surface-50 disabled:text-surface-400';

  const handleChange = (e) => {
    if (onChange) onChange(name, e.target.value);
  };

  const resolvedType = type === 'password' ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-surface-600">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Icon size={14} className="text-surface-400" />
          </div>
        )}

        {type === 'select' ? (
          <select
            name={name}
            value={value}
            onChange={handleChange}
            disabled={disabled}
            className={`${inputBase} ${Icon ? 'pl-9' : ''}`}
          >
            {options.map(opt => {
              const optValue = typeof opt === 'string' ? opt : opt.value;
              const optLabel = typeof opt === 'string' ? opt : opt.label;
              return (
                <option key={optValue} value={optValue}>{optLabel}</option>
              );
            })}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            name={name}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            className={`${inputBase} resize-none ${Icon ? 'pl-9' : ''}`}
          />
        ) : (
          <input
            name={name}
            type={resolvedType}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            className={`${inputBase} ${Icon ? 'pl-9' : ''} ${type === 'password' ? 'pr-9' : ''}`}
          />
        )}

        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 font-medium">{error}</p>
      )}
    </div>
  );
}
