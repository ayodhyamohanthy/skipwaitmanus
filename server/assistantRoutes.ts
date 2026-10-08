import express, { type Express, type Request } from "express";
import {
  connectAssistant,
  createAssistantApproval,
  createAssistantToken,
  createDeveloperApp,
  decideAssistantApproval,
  disconnectAssistant,
  editAssistantApproval,
  getAssistantAccessPlan,
  getDeveloperApp,
  listAssistantActivity,
  listAssistantApprovals,
  listAssistantConnections,
  listAssistantTokens,
  listDeveloperApps,
  revokeAssistantToken,
  updateDeveloperAppWebhook,
} from "./db";

type Account = { id: number; openId: string; role?: "user" | "admin" };
type EmailAddress = { emailAddress: string; verification?: { status?: string } | null };
type Identity = { account: Account; primaryEmail?: EmailAddress | null; emailAddresses?: EmailAddress[] };

export type AssistantRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; metadata?: Record<string, string | number | boolean | null | undefined> }) => Promise<void>;
  connectAssistant?: typeof connectAssistant;
  disconnectAssistant?: typeof disconnectAssistant;
  listAssistantConnections?: typeof listAssistantConnections;
  createAssistantToken?: typeof createAssistantToken;
  revokeAssistantToken?: typeof revokeAssistantToken;
  listAssistantTokens?: typeof listAssistantTokens;
  createAssistantApproval?: typeof createAssistantApproval;
  listAssistantApprovals?: typeof listAssistantApprovals;
  decideAssistantApproval?: typeof decideAssistantApproval;
  editAssistantApproval?: typeof editAssistantApproval;
  listAssistantActivity?: typeof listAssistantActivity;
  listDeveloperApps?: typeof listDeveloperApps;
  createDeveloperApp?: typeof createDeveloperApp;
  getDeveloperApp?: typeof getDeveloperApp;
  updateDeveloperAppWebhook?: typeof updateDeveloperAppWebhook;
  submitDeveloperAppForReview?: typeof submitDeveloperAppForReview;
  getAssistantAccessPlan?: typeof getAssistantAccessPlan;
};

const parseId = (raw: string | undefined) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

/** Validation and ownership failures map to 4xx; plan-gate failures to 402. */
function classify(error: unknown): { status: number; message: string } {
  const message = error instanceof Error ? error.message : "We could not complete that";
  const status = /not in your account|not connected|already handled|not in your console|expired/i.test(message) ? 404
    : /Enter|Choose|Agree|Describe|valid|name|permissions|URL|urls|note|kind|spend|cover|submit/i.test(message) ? 400
    : /plan|Upgrade|Max/i.test(message) ? 402
    : 500;
  return { status, message };
}

export function registerAssistantRoutes(app: Express, deps: AssistantRouteDeps) {
  const record = (input: Parameters<NonNullable<typeof deps.recordActivity>>[0]) => { void deps.recordActivity?.(input).catch(() => undefined); };
  const doConnect = deps.connectAssistant ?? connectAssistant;
  const doDisconnect = deps.disconnectAssistant ?? disconnectAssistant;
  const listConnections = deps.listAssistantConnections ?? listAssistantConnections;
  const doCreateToken = deps.createAssistantToken ?? createAssistantToken;
  const doRevokeToken = deps.revokeAssistantToken ?? revokeAssistantToken;
  const listTokens = deps.listAssistantTokens ?? listAssistantTokens;
  const doCreateApproval = deps.createAssistantApproval ?? createAssistantApproval;
  const listApprovals = deps.listAssistantApprovals ?? listAssistantApprovals;
  const doDecide = deps.decideAssistantApproval ?? decideAssistantApproval;
  const doEdit = deps.editAssistantApproval ?? editAssistantApproval;
  const listActivity = deps.listAssistantActivity ?? listAssistantActivity;
  const listApps = deps.listDeveloperApps ?? listDeveloperApps;
  const doCreateApp = deps.createDeveloperApp ?? createDeveloperApp;
  const getApp = deps.getDeveloperApp ?? getDeveloperApp;
  const doUpdateWebhook = deps.updateDeveloperAppWebhook ?? updateDeveloperAppWebhook;
  const doSubmitApp = deps.submitDeveloperAppForReview ?? submitDeveloperAppForReview;
  const accessPlan = deps.getAssistantAccessPlan ?? getAssistantAccessPlan;

  app.get("/api/assistants/access", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to manage assistants" });
      const plan = await accessPlan(identity.account.id);
      res.json({ plan, hasAccess: plan === "max" });
    } catch { res.status(500).json({ error: "We could not check assistant access" }); }
  });

  app.get("/api/assistants/connections", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see your assistants" });
      res.set("Cache-Control", "private, no-store");
      res.json({ connections: await listConnections(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your assistants" }); }
  });

  app.post("/api/assistants/connections", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to connect an assistant" });
      const connection = await doConnect(identity.account.id, { provider: req.body?.provider, appName: req.body?.appName, scopes: req.body?.scopes });
      record({ actorUserId: identity.account.id, action: "assistant.connected", outcome: "success", resourceType: "assistant_connection", resourceId: connection?.id, metadata: { provider: connection?.provider } });
      res.status(201).json({ connection });
    } catch (error) {
      const { status, message } = classify(error);
      res.status(status).json({ error: message });
    }
  });

  app.delete("/api/assistants/connections/:connectionId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to disconnect assistants" });
      const connectionId = parseId(req.params.connectionId);
      if (!connectionId) return res.status(400).json({ error: "Invalid assistant" });
      const result = await doDisconnect(identity.account.id, connectionId);
      record({ actorUserId: identity.account.id, action: "assistant.disconnected", outcome: "success", resourceType: "assistant_connection", resourceId: connectionId });
      res.json(result);
    } catch (error) {
      const { status, message } = classify(error);
      res.status(status).json({ error: message });
    }
  });

  app.get("/api/assistants/tokens", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see your tokens" });
      res.set("Cache-Control", "private, no-store");
      res.json({ tokens: await listTokens(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your tokens" }); }
  });

  app.post("/api/assistants/tokens", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to create a token" });
      const token = await doCreateToken(identity.account.id, { name: req.body?.name });
      record({ actorUserId: identity.account.id, action: "assistant.token_created", outcome: "success", resourceType: "assistant_token", resourceId: token.id, metadata: { prefix: token.prefix } });
      res.status(201).json({ token });
    } catch (error) {
      const { status, message } = classify(error);
      res.status(status).json({ error: message });
    }
  });

  app.delete("/api/assistants/tokens/:tokenId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to revoke tokens" });
      const tokenId = parseId(req.params.tokenId);
      if (!tokenId) return res.status(400).json({ error: "Invalid token" });
      const result = await doRevokeToken(identity.account.id, tokenId);
      record({ actorUserId: identity.account.id, action: "assistant.token_revoked", outcome: "success", resourceType: "assistant_token", resourceId: tokenId });
      res.json(result);
    } catch (error) {
      const { status, message } = classify(error);
      res.status(status).json({ error: message });
    }
  });

  app.get("/api/assistants/approvals", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to review approvals" });
      res.set("Cache-Control", "private, no-store");
      res.json({ approvals: await listApprovals(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your approvals" }); }
  });

  app.post("/api/assistants/approvals", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to create an approval" });
      const approval = await doCreateApproval(identity.account.id, {
        kind: req.body?.kind, provider: req.body?.provider, connectionId: req.body?.connectionId,
        companyDomain: req.body?.companyDomain, role: req.body?.role, note: req.body?.note,
        creditCount: req.body?.creditCount, slotCount: req.body?.slotCount,
      });
      record({ actorUserId: identity.account.id, action: "assistant.approval_requested", outcome: "success", resourceType: "assistant_approval", resourceId: approval.id, metadata: { kind: approval.kind, provider: approval.provider } });
      res.status(201).json({ approval });
    } catch (error) {
      const { status, message } = classify(error);
      res.status(status).json({ error: message });
    }
  });

  app.patch("/api/assistants/approvals/:approvalId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to edit this approval" });
      const approvalId = parseId(req.params.approvalId);
      if (!approvalId) return res.status(400).json({ error: "Invalid approval" });
      const edited = await doEdit(identity.account.id, approvalId, { note: req.body?.note });
      res.json({ approval: edited });
    } catch (error) {
      const { status, message } = classify(error);
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/assistants/approvals/:approvalId/decision", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to decide this approval" });
      const approvalId = parseId(req.params.approvalId);
      if (!approvalId) return res.status(400).json({ error: "Invalid approval" });
      const decision = req.body?.decision === "approved" || req.body?.decision === "declined" ? req.body.decision : null;
      if (!decision) return res.status(400).json({ error: "Choose approve or decline" });
      const result = await doDecide(identity.account.id, approvalId, decision);
      record({ actorUserId: identity.account.id, action: `assistant.approval_${decision}`, outcome: "success", resourceType: "assistant_approval", resourceId: approvalId, metadata: { kind: req.body?.kind } });
      res.json({ approval: result });
    } catch (error) {
      const { status, message } = classify(error);
      res.status(status).json({ error: message });
    }
  });

  app.get("/api/assistants/activity", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see assistant activity" });
      res.set("Cache-Control", "private, no-store");
      res.json({ activity: await listActivity(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load assistant activity" }); }
  });

  app.get("/api/developer-apps", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see your apps" });
      res.set("Cache-Control", "private, no-store");
      res.json({ apps: await listApps(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your apps" }); }
  });

  app.post("/api/developer-apps", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to register an app" });
      const appRow = await doCreateApp(identity.account.id, {
        name: req.body?.name, kind: req.body?.kind, description: req.body?.description,
        website: req.body?.website, redirectUrls: req.body?.redirectUrls, scopes: req.body?.scopes,
        agreeToTerms: req.body?.agreeToTerms === true,
      });
      record({ actorUserId: identity.account.id, action: "developer.app_registered", outcome: "success", resourceType: "developer_app", resourceId: appRow?.id, metadata: { kind: appRow?.kind } });
      res.status(201).json({ app: appRow });
    } catch (error) {
      const { status, message } = classify(error);
      res.status(status).json({ error: message });
    }
  });

  app.get("/api/developer-apps/:appId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see this app" });
      const appId = parseId(req.params.appId);
      if (!appId) return res.status(400).json({ error: "Invalid app" });
      const appRow = await getApp(identity.account.id, appId);
      if (!appRow) return res.status(404).json({ error: "This app is not in your console" });
      res.json({ app: appRow });
    } catch (error) {
      const { status, message } = classify(error);
      res.status(status).json({ error: message });
    }
  });

  app.put("/api/developer-apps/:appId/webhook", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to change this app" });
      const appId = parseId(req.params.appId);
      if (!appId) return res.status(400).json({ error: "Invalid app" });
      const result = await doUpdateWebhook(identity.account.id, appId, { webhookUrl: req.body?.webhookUrl });
      record({ actorUserId: identity.account.id, action: "developer.webhook_updated", outcome: "success", resourceType: "developer_app", resourceId: appId });
      res.json(result);
    } catch (error) {
      const { status, message } = classify(error);
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/developer-apps/:appId/submit", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to submit this app" });
      const appId = parseId(req.params.appId);
      if (!appId) return res.status(400).json({ error: "Invalid app" });
      const result = await doSubmitApp(identity.account.id, appId);
      record({ actorUserId: identity.account.id, action: "developer.app_submitted", outcome: "success", resourceType: "developer_app", resourceId: appId });
      res.json({ app: result });
    } catch (error) {
      const { status, message } = classify(error);
      res.status(status).json({ error: message });
    }
  });
}
