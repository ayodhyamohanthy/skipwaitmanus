import type { Express } from "express";
import { ENV } from "./env";

/** Storage prefix whose objects are only reachable through authorized routes. */
const PRIVATE_SEGMENT = "private-referrals";

/**
 * Collapses a requested storage path into canonical `a/b/c` segments, or returns
 * `null` when it is unsafe. Traversal and empty or `.` segments are rejected so a
 * request cannot dress up a private key (`.//skipwait/private-referrals/...`) as
 * something the prefix check does not recognize.
 */
export function normalizeStorageKey(rawKey: string): string | null {
  if (!rawKey || /[\0\\]/.test(rawKey)) return null;
  const segments = rawKey.split("/").filter(segment => segment !== "" && segment !== ".");
  if (segments.length === 0 || segments.includes("..")) return null;
  if (segments.includes(PRIVATE_SEGMENT)) return null;
  return segments.join("/");
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const rawKey = (req.params as Record<string, string>)[0];
    if (!rawKey) {
      res.status(400).send("Missing storage key");
      return;
    }
    const key = normalizeStorageKey(rawKey);
    if (!key) {
      res.status(404).send("Document not found");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
