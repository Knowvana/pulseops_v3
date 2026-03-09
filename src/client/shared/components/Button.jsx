// ============================================================================
// Button Component — PulseOps V3
//
// PURPOSE: Backward-compatible wrapper around ActionButton from @components.
// Existing code that imports Button from @shared continues to work.
//
// NEW CODE should import ActionButton directly from @components:
//   import { ActionButton } from '@components';
//
// PROPS: Same as ActionButton (variant, size, icon, isLoading, disabled, className)
// ============================================================================
import { ActionButton } from '@components';

export default ActionButton;
