import { describe, expect, it } from "vitest";
import { isToday, notificationListSchema, orderNotifications, timeAgo, type NotificationItem } from "./notifications";

const NOW = new Date("2026-10-08T10:00:00").getTime();
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60000).toISOString();
const item = (id: number, minutesAgo: number, read: boolean): NotificationItem => ({ id, category: "status", title: `n${id}`, body: "", readAt: read ? at(minutesAgo) : null, createdAt: at(minutesAgo) });

describe("alerts notification helpers", () => {
  it("formats compact relative times in the kit wording", () => {
    expect(timeAgo(at(0), NOW)).toBe("Just now");
    expect(timeAgo(at(12), NOW)).toBe("12 min");
    expect(timeAgo(at(125), NOW)).toBe("2 h");
    expect(timeAgo(at(26 * 60), NOW)).toBe("Yesterday");
    expect(timeAgo(at(50 * 60), NOW)).toBe("2 days");
    expect(timeAgo("not a date", NOW)).toBe("Just now");
  });

  it("groups by the viewer's calendar day", () => {
    const now = new Date(NOW);
    expect(isToday(at(30), now)).toBe(true);
    expect(isToday(at(24 * 60), now)).toBe(false);
    expect(isToday("garbage", now)).toBe(false);
  });

  it("orders unread first, then newest first", () => {
    const ordered = orderNotifications([item(1, 300, true), item(2, 12, false), item(3, 5, true), item(4, 10, false)]);
    expect(ordered.map(row => row.id)).toEqual([4, 2, 3, 1]);
  });

  it("rejects unknown categories and malformed rows at the edge", () => {
    expect(notificationListSchema.safeParse({ notifications: [item(1, 1, false)] }).success).toBe(true);
    expect(notificationListSchema.safeParse({ notifications: [{ ...item(1, 1, false), category: "marketing" }] }).success).toBe(false);
    expect(notificationListSchema.safeParse({ notifications: [{ id: "1", title: 4 }] }).success).toBe(false);
    expect(notificationListSchema.safeParse({}).success).toBe(false);
  });
});
