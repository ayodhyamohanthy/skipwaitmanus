// Cost flag only; it moves with the D-132 enable (D-146).
export const ASK_LEVEL_COST_CLIENT = import.meta.env.VITE_ASK_LEVEL_COST === "true";

// Compatibility re-export: planFamilyFlagsOff.test.ts (byte-identical under
// D-134) asserts this module still exposes PLAN_FAMILY_V2_CLIENT. The flag's
// canonical home is planFamilyFlag.ts; the value is unchanged.
export { PLAN_FAMILY_V2_CLIENT } from "./planFamilyFlag";
