// ============================================================================
// GradientSeparator — PulseOps V3 Reusable Component
//
// PURPOSE: Themed gradient divider line used to visually separate sections.
// Supports horizontal and vertical orientations with brand gradient colors.
//
// USAGE:
//   import { GradientSeparator } from '@components';
//   <GradientSeparator />                           // horizontal
//   <GradientSeparator orientation="vertical" />    // vertical
//
// ============================================================================
import React from 'react';

export default function GradientSeparator({
  orientation = 'horizontal',
  thickness = 'thin',
  className = '',
}) {
  const thicknessMap = {
    thin: orientation === 'horizontal' ? 'h-px' : 'w-px',
    medium: orientation === 'horizontal' ? 'h-0.5' : 'w-0.5',
    thick: orientation === 'horizontal' ? 'h-1' : 'w-1',
  };

  const t = thicknessMap[thickness] || thicknessMap.thin;

  if (orientation === 'vertical') {
    return (
      <div
        className={`${t} h-full bg-gradient-to-b from-transparent via-brand-400 to-transparent shadow-sm ${className}`}
      />
    );
  }

  return (
    <div
      className={`w-full ${t} bg-gradient-to-r from-transparent via-brand-400 to-transparent shadow-sm ${className}`}
    />
  );
}
