import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("notification center interface safeguards", () => {
  it("uses a private authenticated notification source, unread badge, fixed mobile screen, and read-before-open flow", () => {
    const bell = source("client/src/components/NotificationBell.tsx");
    const notifications = source("client/src/pages/Notifications.tsx");
    const app = source("client/src/App.tsx");

    expect(bell).toContain('data-skipwait-notification-bell="true"');
    expect(bell).toContain('data-skipwait-notification-count={String(unreadCount)}');
    expect(bell).toContain('fetch("/api/notifications"');
    expect(notifications).toContain('data-skipwait-screen="notifications"');
    expect(notifications).toContain("h-dvh min-h-dvh overflow-hidden");
    expect(notifications).toContain("/api/notifications/${notification.id}/read");
    expect(notifications).toContain('data-skipwait-notifications-empty="true"');
    expect(notifications).not.toContain("demoNotifications");
    expect(app).toContain('path="/notifications" component={Notifications}');
  });

  it("converts unsafe API parser failures into concise recovery messages instead of exposing raw HTML tokens", () => {
    const helper = source("client/src/lib/apiResponse.ts");
    const main = source("client/src/main.tsx");

    expect(helper).toContain("An HTML gateway, sign-in, or static fallback response");
    expect(main).toContain('error.message.includes("Unexpected token \'<\'")');
    expect(main).toContain('if (!(error instanceof Error && error.message.includes("Unexpected token \'<\'"))) console.error("[API Query Error]", error);');
  });
});
