import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerFollowRoutes, type FollowRouteDeps } from "./followRoutes";

function buildApp(options: { users?: number[]; follows?: Array<[number, number]> } = {}) {
  const app = express();
  app.use(express.json());
  const users = new Set(options.users ?? [11, 22, 33]);
  const follows = new Set((options.follows ?? []).map(([a, b]) => `${a}:${b}`));
  const identities = new Map([...users].map(id => [String(id), { account: { id, openId: `workos-${id}` } }]));
  const follow = async (follower: number, target: number) => { follows.add(`${follower}:${target}`); };
  const unfollow = async (follower: number, target: number) => { follows.delete(`${follower}:${target}`); };
  const stateOf = async (viewer: number | undefined, target: number) => {
    const followers = [...follows].filter(entry => entry.endsWith(`:${target}`)).length;
    const followingCount = [...follows].filter(entry => entry.startsWith(`${target}:`)).length;
    const isFollowingViewer = viewer !== undefined && follows.has(`${viewer}:${target}`);
    const isFollowingTarget = viewer !== undefined && follows.has(`${target}:${viewer}`);
    return { followers, followingCount, isFollowingViewer, isFollowingTarget, isMutual: isFollowingViewer && isFollowingTarget, joinedMonthYear: "September 2026" };
  };
  const deps: FollowRouteDeps = {
    resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
    recordActivity: async () => undefined,
    userExists: async userId => users.has(userId),
    followUser: follow,
    unfollowUser: unfollow,
    followState: stateOf,
    listFollowers: async userId => [...follows].filter(entry => entry.endsWith(`:${userId}`)).map(entry => ({ userId: Number(entry.split(":")[0]), label: "Member", followedAt: new Date() })),
    listFollowing: async userId => [...follows].filter(entry => entry.startsWith(`${userId}:`)).map(entry => ({ userId: Number(entry.split(":")[1]), label: "Member", followedAt: new Date() })),
  };
  registerFollowRoutes(app, deps);
  return app;
}

describe("follow graph (X-style)", () => {
  it("follows, reports counts, and exposes state with mutual detection", async () => {
    const app = buildApp();
    const first = await request(app).post("/api/users/22/follow").set("x-test-user", "11");
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ following: true, followers: 1, isFollowingViewer: true, isMutual: false, joinedMonthYear: "September 2026" });
    const state = await request(app).get("/api/users/22/follow-state").set("x-test-user", "11");
    expect(state.body).toMatchObject({ followers: 1, viewerSignedIn: true });
  });

  it("rejects self-follow (400), unknown members (404), and anonymous use (401)", async () => {
    const app = buildApp();
    expect((await request(app).post("/api/users/11/follow").set("x-test-user", "11")).status).toBe(400);
    expect((await request(app).post("/api/users/99/follow").set("x-test-user", "11")).status).toBe(404);
    expect((await request(app).post("/api/users/22/follow")).status).toBe(401);
  });

  it("unfollows and clears the state", async () => {
    const app = buildApp({ follows: [[11, 22]] });
    const removed = await request(app).delete("/api/users/22/follow").set("x-test-user", "11");
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ following: false, followers: 0 });
  });

  it("serves follower and following lists with anonymous-safe labels", async () => {
    const app = buildApp({ follows: [[11, 22], [33, 22]] });
    const followers = await request(app).get("/api/users/22/followers").set("x-test-user", "11");
    expect(followers.status).toBe(200);
    expect(followers.body.followers).toHaveLength(2);
    expect(JSON.stringify(followers.body)).not.toMatch(/@/);
    expect(followers.body.followers[0]).toEqual({ label: "Member" });
    expect(JSON.stringify(followers.body)).not.toMatch(/userId|followedAt|company/i);
    const following = await request(app).get("/api/users/11/following").set("x-test-user", "22");
    expect(following.body.following).toHaveLength(1);
  });
  it("requires auth for graph reads and makes missing IDs indistinguishable", async () => {
    const app = buildApp({ follows: [[11, 22]] });
    for (const path of ["/api/users/22/follow-state", "/api/users/22/followers", "/api/users/22/following"]) expect((await request(app).get(path)).status).toBe(401);
    for (const path of ["/api/users/nope/follow-state", "/api/users/99/follow-state"]) expect((await request(app).get(path).set("x-test-user", "11")).status).toBe(404);
  });

});
