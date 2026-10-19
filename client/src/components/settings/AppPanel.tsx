// Kit v4 Settings > App: the "SkipWait app" Panel. Device push and display
// preferences do not exist yet, so the kit toggles are left out; the install
// screens on /app-states drive the browser's real install prompt.
import { Smartphone } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";

export function AppPanel() {
  return <Panel>
    <Smartphone className="mb-2 size-5" aria-hidden="true" />
    <h2 className="text-lg font-semibold">SkipWait app</h2>
    <p className="mt-1 text-sm text-muted-foreground">Install for one-tap opening from your home screen. Drafts stay saved on this device while you're offline.</p>
    <Button asChild className="mt-4"><Link href="/app-states">Preview install and app screens</Link></Button>
  </Panel>;
}
