// ============================================================================
// ConfigurationAlertModal — PulseOps V3
//
// PURPOSE: Backward-compatible wrapper around SetupRequiredOverlay from
// @components. Existing code that imports ConfigurationAlertModal from
// @shared continues to work — all props are forwarded to SetupRequiredOverlay.
//
// NEW CODE should import SetupRequiredOverlay directly from @components:
//   import { SetupRequiredOverlay } from '@components';
//
// PROPS: Same as SetupRequiredOverlay (isOpen, icon, header, messageDetail,
//        actionIcon, actionText, onAction, onClose, variant)
// ============================================================================
import { SetupRequiredOverlay } from '@components';

export default SetupRequiredOverlay;
