import { createFileRoute } from "@tanstack/react-router";
import { LaunchPage } from "@/components/launch-page";
import { pageMeta } from "@/lib/page-meta";
export const Route = createFileRoute("/")({ head: () => pageMeta("Free job referrals. A warmer way in", "SkipWait connects job seekers with people inside the companies they want to join. Free referrals, private connections, and honest expectations."), component: LaunchPage });