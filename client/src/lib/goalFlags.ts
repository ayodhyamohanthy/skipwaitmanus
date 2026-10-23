// Cost flag only; it moves with the D-132 enable (D-146).
export const ASK_LEVEL_COST_CLIENT = import.meta.env.VITE_ASK_LEVEL_COST === "true";

// Compatibility re-export for planFamilyFlagsOff.test.ts until the D-132 enable (D-164).
export { PLAN_FAMILY_V2_CLIENT } from "./planFamilyFlag";
