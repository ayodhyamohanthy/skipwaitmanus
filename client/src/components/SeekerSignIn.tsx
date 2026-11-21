import { Github } from "lucide-react";
import { GoalSeekerForm } from "@/pages/goal/sign-in/GoalSeekerForm";
import { GOAL_SEEKER_SOCIAL } from "@/pages/goal/sign-in/seekerSocial";
export { goalSeekerSocialUrl as seekerSocialUrl } from "@/pages/goal/sign-in/seekerSocial";

const MARKS = { google: "G", microsoft: "M", github: <Github />, linkedin: "in", slack: "S" } as const;
export const SEEKER_SOCIAL = GOAL_SEEKER_SOCIAL.map(item => ({ ...item, mark: MARKS[item.id] }));

/** Compatibility entry point. Every seeker sign-in now uses the released Goal password/link flow (D-049/D-354). */
export function SeekerSignIn({ returnTo = "/explore" }: { returnTo?: string; goal?: boolean }) {
  return <GoalSeekerForm returnTo={returnTo} />;
}
