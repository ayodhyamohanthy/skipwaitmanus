import type { Express } from "express";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (key.startsWith("skipwait/private-referrals/")) {
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

/**
 * Zero-config document streaming: when the DB storage adapter holds the bytes,
 * `storageGetSignedUrl` resolves to this route instead of an object-store URL.
 * Access rules mirror /api/documents/:attachmentId: the caller must be signed
 * in AND own the attachment or be the assigned referrer.
 */
export function registerDbDocumentRoute(app: Express, deps: {
  resolveIdentity: (req: import("express").Request) => Promise<{ account: { id: number } } | undefined>;
}) {
  app.get("/api/documents/by-key/:key", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view this document" });
      const key = decodeURIComponent((req.params as Record<string, string>).key ?? "");
      if (!key.startsWith("skipwait/private-referrals/") && !key.startsWith("private/")) return res.status(404).json({ error: "Document not found" });
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Documents are unavailable right now" });
      const { documentBlobs, referralAttachments, referralRequests } = await import("../../drizzle/schema");
      const { and, eq, or } = await import("drizzle-orm");
      const accessible = await db.select({ fileKey: referralAttachments.fileKey, mimeType: referralAttachments.mimeType }).from(referralAttachments).leftJoin(referralRequests, eq(referralAttachments.referralRequestId, referralRequests.id)).where(and(eq(referralAttachments.fileKey, key), or(eq(referralAttachments.ownerId, identity.account.id), eq(referralRequests.referrerId, identity.account.id)))).limit(1);
      if (!accessible[0]) return res.status(404).json({ error: "Document not found" });
      const rows = await db.select().from(documentBlobs).where(eq(documentBlobs.fileKey, key)).limit(1);
      if (!rows[0]) return res.status(404).json({ error: "Document not found" });
      res.set("Cache-Control", "private, no-store");
      res.set("Content-Type", accessible[0].mimeType || "application/octet-stream");
      res.send(rows[0].data);
    } catch {
      res.status(502).json({ error: "We could not retrieve that document" });
    }
  });
}
