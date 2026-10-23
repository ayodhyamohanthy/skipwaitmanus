// Goal-UI primitives (D-048 phase 2). Nothing live imports this barrel in
// phase 2; phase 3 adds each moved surface (goalBoundary.test.ts pins it).
export { GOAL_NAV, goalNavFor, type GoalNavId, type GoalNavItem } from "./nav";
export { GoalNum } from "./GoalNum";
export { GoalKeycap, type GoalKeycapIcon } from "./GoalKeycap";
export { GoalButton, type GoalButtonProps } from "./GoalButton";
export { GoalIconButton, type GoalIconButtonProps } from "./GoalIconButton";
export { GoalVerifiedMark } from "./GoalVerifiedMark";
export { GoalStatus, GoalMiniStepper, GoalStepper, GOAL_STATUS_GLYPHS, type GoalStatusValue } from "./GoalStatus";
export { GoalFilterChip } from "./GoalFilterChip";
export { GoalSearchInput } from "./GoalSearchInput";
export { GoalReasonInput } from "./GoalReasonInput";
export { GoalField, GoalTextInput } from "./GoalField";
export { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "./GoalStates";
export { useOnlineStatus } from "./useOnlineStatus";
export { GoalShell, type GoalShellProps, type GoalShellCredits } from "./GoalShell";
export { GoalAppShell } from "./GoalAppShell";
export { GoalListRow, GoalListSection, GoalCompanyRow, GoalCompanyMark, GoalAvailability, type GoalListRowProps } from "./GoalListRow";
export { GoalDetailPane, type GoalDetailPaneProps } from "./GoalDetailPane";
export { GoalLockedPanel } from "./GoalLockedPanel";
export { GoalDecisionBar, type GoalDecisionBarProps } from "./GoalDecisionBar";
export { GoalPassReasons, type GoalPassReasonsProps } from "./GoalPassReasons";
export { GoalDrawer, useIsDesktop, type GoalDrawerProps } from "./GoalDrawer";
export { GoalSheet } from "./GoalSheet";
export { GoalNextStep } from "./GoalNextStep";
