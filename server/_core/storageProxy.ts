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
  // Raw DB keys are never an authorization surface. Canonical downloads stream
  // through /api/documents/:attachmentId after the shared attachment policy.
  app.get("/api/documents/by-key/:key", async (req, res) => {
    const identity = await deps.resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: "Sign in to view this document" });
    res.set("Cache-Control", "private, no-store");
    res.status(404).json({ error: "Document not found" });
  });
}
