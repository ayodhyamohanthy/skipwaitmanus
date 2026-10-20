import type { Express, Request } from "express";
import { ENV } from "./env";

/**
 * Canonical storage key for the legacy `/manus-storage/*` proxy.
 *
 * The proxy only allowed `skipwait/private-referrals/…` through one
 * `startsWith` check; `skipwait//private-referrals/…`, `./skipwait/…` and
 * `skipwait/a/../private-referrals/…` slipped past it. Collapse empty and `.`
 * segments, and reject `..`, NUL, backslashes and any `private-referrals`
 * segment, so the key forwarded to the provider is the same key that was
 * checked.
 */
export function normalizeStorageKey(raw: string): string | null {
  if (!raw || raw.includes("\0") || raw.includes("\\")) return null;
  const segments: string[] = [];
  for (const segment of raw.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." || segment === "private-referrals") return null;
    segments.push(segment);
  }
  if (!segments.length) return null;
  return segments.join("/");
}

export type StorageProxyDeps = {
  forgeUrl?: string;
  forgeKey?: string;
  fetchImpl?: typeof fetch;
};

export function registerStorageProxy(app: Express, deps: StorageProxyDeps = {}) {
  app.get("/manus-storage/*", async (req, res) => {
    const raw = (req.params as Record<string, string>)[0] ?? "";
    const key = normalizeStorageKey(raw);
    if (!key) {
      if (!raw) {
        res.status(400).send("Missing storage key");
        return;
      }
      // A private or malformed key answers exactly like a missing document.
      res.status(404).send("Document not found");
      return;
    }

    const forgeUrl = deps.forgeUrl ?? ENV.forgeApiUrl;
    const forgeKey = deps.forgeKey ?? ENV.forgeApiKey;
    const fetchImpl = deps.fetchImpl ?? fetch;
    if (!forgeUrl || !forgeKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const presignUrl = new URL(
        "v1/storage/presign/get",
        forgeUrl.replace(/\/+$/, "") + "/",
      );
      presignUrl.searchParams.set("path", key);

      const forgeResp = await fetchImpl(presignUrl, {
        headers: { Authorization: `Bearer ${forgeKey}` },
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
  resolveIdentity: (req: Request) => Promise<{ account: { id: number } } | undefined>;
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
