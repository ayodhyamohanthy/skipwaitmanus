import { useAuth } from "@/_core/auth";
import { MOBILE_LANDING_V2 } from "@shared/landingContent";
import GoalLandingV9 from "./GoalLandingV9";
import MobileLanding, { usePhoneViewport } from "./goal/landing/MobileLanding";
import HomeSignedIn from "./goal/home/HomeSignedIn";

/**
 * D-048-K-home (D-332): the Kit landing is deleted, not switched off. The goal page is the
 * only home. A signed-in visitor, and the auth-loading moment, render the goal account
 * router so the public landing never flashes first.
 *
 * MOBILE-landing-choice (D-414): behind MOBILE_LANDING_V2 (off), a signed-out phone gets the
 * one-screen role choice; desktop keeps GoalLandingV9.
 */
export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const phone = usePhoneViewport();
  if (isLoaded && !isSignedIn) return MOBILE_LANDING_V2 && phone ? <MobileLanding /> : <GoalLandingV9 />;
  return <HomeSignedIn />;
}
