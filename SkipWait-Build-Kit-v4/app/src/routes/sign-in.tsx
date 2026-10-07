import { createFileRoute } from "@tanstack/react-router";
import { SignInPage } from "@/components/sign-in-page";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/sign-in")({
  head: () => pageMeta("Sign in", "Sign in to SkipWait to ask for or offer a free, private job referral."),
  component: SignInPage,
});