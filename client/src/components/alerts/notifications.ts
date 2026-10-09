import { z } from "zod";

/**
 * Client-side contract for GET /api/notifications (server/privateReferralRoutes.ts
 * serializes { id, category, title, body, readAt, createdAt } per row from the
 * `notifications` table in drizzle/schema.ts). Parsed at the edge so a gateway
 * page, a renamed field or an unknown category becomes the honest error state
 * instead of a half-rendered list.
 */
export const notificationCategorySchema = z.enum(["referral", "message", "status", "system"]);

export const notificationItemSchema = z.object({
  id: z.number().int().positive(),
  category: notificationCategorySchema,
  title: z.string(),
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const notificationListSchema = z.object({ notifications: z.array(notificationItemSchema) });

export type NotificationCategory = z.infer<typeof notificationCategorySchema>;
export type NotificationItem = z.infer<typeof notificationItemSchema>;

/** Compact relative time in the kit's wording: "12 min", "2 h", "Yesterday", "2 days". */
export function timeAgo(value: string, now: number = Date.now()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days`;
}

/** Same calendar day on the viewer's device clock. */
export function isToday(value: string, now: Date = new Date()): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

/** Unread first, then newest first. */
export function orderNotifications(items: readonly NotificationItem[]): NotificationItem[] {
  return [...items].sort((a, b) => Number(Boolean(a.readAt)) - Number(Boolean(b.readAt)) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
