import { useAuth } from "@/_core/auth";
import GoalLandingV9 from "./GoalLandingV9";
import HomeSignedIn from "./goal/home/HomeSignedIn";

/**
 * D-048-K-home (D-332): the Kit landing is deleted, not switched off. The goal page is the
 * only home. A signed-in visitor, and the auth-loading moment, render the goal account
 * router so the public landing never flashes first.
 */
export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && !isSignedIn) return <GoalLandingV9 />;
  return <HomeSignedIn />;
}
