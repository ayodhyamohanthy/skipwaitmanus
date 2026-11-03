// Goal /settings > App. Device push and display preferences do not exist yet,
// so the kit toggles stay out; the install screens drive the real install prompt.
import { GoalButton, GoalNextStep } from "@/components/goal";
import { Link } from "wouter";
import { Section } from "./settingsParts";

export default function AppSection() {
  return (
    <>
      <GoalNextStep reason="Install skipwait.me for one-tap opening from your home screen. Drafts stay saved on this device while you're offline.">
        <GoalButton className="mt-4" variant="primary" touch="large" asChild>
          <Link href="/app-states">Preview install screens</Link>
        </GoalButton>
      </GoalNextStep>

      <Section title="skipwait.me app">
        <p className="mt-2 text-g-meta text-g-ink-2">skipwait.me runs in your browser and installs from the install screens. There is no separate store app, and nothing here needs a download.</p>
      </Section>
    </>
  );
}
