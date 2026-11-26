import { z } from "zod";

const flagValue = z.string().optional();
const groupPlanFlagInputSchema = z.strictObject({
  GROUP_PLAN_ENABLED: flagValue,
  GROUP_DELEGATED_SEND_ENABLED: flagValue,
});

/** Validated server capabilities; unknown and non-string config fields are rejected. */
export const groupPlanFlagsSchema = groupPlanFlagInputSchema
  .superRefine((flags, context) => {
    if (flags.GROUP_DELEGATED_SEND_ENABLED === "true" && flags.GROUP_PLAN_ENABLED !== "true") {
      context.addIssue({
        code: "custom",
        path: ["GROUP_PLAN_ENABLED"],
        message: "GROUP_DELEGATED_SEND_ENABLED requires GROUP_PLAN_ENABLED to be exactly true.",
      });
    }
  })
  .transform(flags => ({
    groupPlanEnabled: flags.GROUP_PLAN_ENABLED === "true",
    delegatedSendEnabled:
      flags.GROUP_PLAN_ENABLED === "true" && flags.GROUP_DELEGATED_SEND_ENABLED === "true",
  }));

export type GroupPlanFlags = z.infer<typeof groupPlanFlagsSchema>;

/** Parse only the two declared server flags; do not pass the full process.env object. */
export function readGroupPlanFlags(
  env: Readonly<Record<string, string | undefined>> = {
    GROUP_PLAN_ENABLED: process.env.GROUP_PLAN_ENABLED,
    GROUP_DELEGATED_SEND_ENABLED: process.env.GROUP_DELEGATED_SEND_ENABLED,
  },
): GroupPlanFlags {
  return groupPlanFlagsSchema.parse(env);
}
