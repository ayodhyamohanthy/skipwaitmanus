import { createHash, randomBytes } from "node:crypto";
import type { Express, Request } from "express";
import { desc, eq } from "drizzle-orm";
import { developerApps } from "../drizzle/schema";
import { createDeveloperAppSchema, needsReview, type DeveloperAppKind, type DeveloperAppStatus } from "../shared/developerApps";

/**
 * Developer-app registration.
 *
 * WHAT THIS IS: list and create for the apps a developer registers. That is the
 * whole surface. The OAuth authorization-code flow, the consent screen, scope
 * enforcement on the API and the MCP endpoint are NOT here -- an app can be
 * registered and approved, and nothing can authenticate as one yet.
 *
 * That boundary is the point. An authorization endpoint written quickly is how
 * an authorization code ends up delivered to the wrong party; it needs redirect
 * URL matching against the registered list, PKCE, single-use codes and a consent
 * screen that shows the scopes. Half of that is worse than none, because it
 * looks like it works. The console states the boundary rather than implying the
 * integration is live.
 *
 * SECRET HANDLING: the plaintext client secret is generated here, hashed with
 * SHA-256, and the hash is what is stored. The plaintext is returned exactly
 * once, in the create response, and is never readable again -- the same contract
 * as a password reset token. There is no route that can return it.
 */

type Deps = {
  resolveIdentity: (req: Request) => Promise<{ account: { id: number } } | undefined>;
  listApps: (ownerId: number) => Promise<Array<{
    id: number; name: string; kind: string; status: string; scopes: string;
    redirectUrls: string; isTestMode: boolean; clientId: string;
    reviewNote: string | null; createdAt: Date;
  }>>;
  createApp: (input: {
    ownerId: number; name: string; kind: DeveloperAppKind; websiteUrl: string | null;
    redirectUrls: string; description: string; scopes: string; status: DeveloperAppStatus;
    clientId: string; clientSecretHash: string; isTestMode: boolean;
  }) => Promise<{ id: number }>;
};

/** Opaque, non-sequential, and prefixed so it is recognisable in a log or a leak. */
function newClientId(): string {
  return `swc_${randomBytes(16).toString("hex")}`;
}
function newClientSecret(): string {
  return `sws_${randomBytes(32).toString("hex")}`;
}
function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Parse a JSON column defensively -- a malformed value must not 500 the list. */
function parseList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function registerDeveloperAppsRoutes(app: Express, deps: Deps) {
  app.get("/api/developer/apps", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to manage your apps" });
      const rows = await deps.listApps(identity.account.id);
      return res.json({
        apps: rows.map(row => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          status: row.status,
          scopes: parseList(row.scopes),
          redirectUrls: parseList(row.redirectUrls),
          isTestMode: row.isTestMode,
          clientId: row.clientId,
          reviewNote: row.reviewNote,
          createdAt: row.createdAt,
        })),
      });
    } catch (error) {
      console.error("[developer] list error", error);
      return res.status(502).json({ error: "We could not load your apps. Please try again." });
    }
  });

  app.post("/api/developer/apps", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to register an app" });

      const parsed = createDeveloperAppSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return res.status(400).json({ error: first?.message ?? "That app registration is not valid", field: first?.path?.join(".") });
      }
      const input = parsed.data;

      const clientSecret = newClientSecret();
      const created = await deps.createApp({
        ownerId: identity.account.id,
        name: input.name,
        kind: input.kind,
        websiteUrl: input.websiteUrl || null,
        redirectUrls: JSON.stringify(input.redirectUrls),
        description: input.description,
        scopes: JSON.stringify(input.scopes),
        // Anything asking to act on a person's behalf or spend their money waits
        // for a human. The rest still lands in review rather than going live,
        // because nothing can authenticate yet either way.
        status: "in_review",
        clientId: newClientId(),
        clientSecretHash: hashSecret(clientSecret),
        isTestMode: true,
      });

      return res.status(201).json({
        id: created.id,
        // Returned ONCE. Not stored, not re-readable, no route returns it again.
        clientSecret,
        status: "in_review",
        needsReview: needsReview(input.scopes),
      });
    } catch (error) {
      console.error("[developer] create error", error);
      return res.status(502).json({ error: "We could not register your app. Please try again." });
    }
  });
}

export const developerAppDb = {
  listApps: async (ownerId: number) => {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return db.select({
      id: developerApps.id, name: developerApps.name, kind: developerApps.kind,
      status: developerApps.status, scopes: developerApps.scopes,
      redirectUrls: developerApps.redirectUrls, isTestMode: developerApps.isTestMode,
      clientId: developerApps.clientId, reviewNote: developerApps.reviewNote,
      createdAt: developerApps.createdAt,
    }).from(developerApps).where(eq(developerApps.ownerId, ownerId)).orderBy(desc(developerApps.createdAt));
  },
  createApp: async (input: Parameters<Deps["createApp"]>[0]) => {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.insert(developerApps).values(input);
    return { id: Number(result[0]?.insertId ?? 0) };
  },
};
