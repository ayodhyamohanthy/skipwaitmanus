import GoalSignIn from "@/pages/GoalSignIn";
import GoalSignInPage from "@/pages/goal/sign-in/GoalSignInPage";
import { useLocationSearch } from "@/pages/goal/sign-in/useLocationSearch";

export default function SignIn() {
  const search = useLocationSearch();
  return new URLSearchParams(search).get("passkeys") === "manage" ? <GoalSignIn /> : <GoalSignInPage />;
}
