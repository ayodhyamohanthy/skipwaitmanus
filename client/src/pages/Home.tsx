import { useAuth } from "@/_core/auth";
import GoalLandingV9 from "./GoalLandingV9";
import HomeSignedIn from "./goal/home/HomeSignedIn";

export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || isSignedIn) return <HomeSignedIn />;
  return <GoalLandingV9 />;
}
