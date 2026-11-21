// BANDED-checkout (D-367): founding-place reservation against real MySQL with the
// real 0123 migration. Proves the counter lock, the last-place race, expiry and
// replacement release, idempotent replay and TEST/LIVE isolation.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { test, expect } from "playwright/test";
import { drizzle } from "drizzle-orm/mysql2";
import { PLAN_FAMILY } from "../shared/planFamily";
import { foundingPlacesLeft, releaseFoundingPlace, reserveFoundingPlace } from "../server/bandedCheckoutStore";

const migration = readFileSync(new URL("../drizzle/deploy/0123_banded_plans.sql", import.meta.url), "utf8");
const oldWalletPlans = ["free", "pro", "max", "start", "momentum", "land_100", "land_200", "land_500", "keep_warm", "land_focus", "land_sprint", "land_concierge"];
const oldIntentPlans = ["pro", "max", "start", "momentum", "land_100", "land_200", "land_500", "keep_warm", "land_focus", "land_sprint", "land_concierge"];
const literals = (values: readonly string[]) => values.map(value => `'${value}'`).join(",");
const T0 = new Date("2026-11-21T10:00:00.000Z");
const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

type Fixture = { db: Connection; connect: () => Promise<Connection> };
async function withDatabase(run: (fixture: Fixture) => Promise<void>) {
  const url = new URL(process.env.E2E_DATABASE_URL || "mysql://root:e2e@127.0.0.1:3306/skipwait");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Banded checkout proof refuses a non-local database");
  const options = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), multipleStatements: true, timezone: "Z" as const };
  const database = `sw_banded_co_${randomUUID().replaceAll("-", "")}`;
  const admin = await mysql.createConnection(options);
  let db: Connection | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    created = true;
    db = await mysql.createConnection({ ...options, database });
    await db.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'");
    await db.query(`CREATE TABLE users (id int NOT NULL AUTO_INCREMENT PRIMARY KEY);
      CREATE TABLE tokenBalances (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, plan ENUM(${literals(oldWalletPlans)}) NOT NULL DEFAULT 'free');
      CREATE TABLE subscriptionCheckoutIntents (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, plan ENUM(${literals(oldIntentPlans)}) NOT NULL);`);
    for (let id = 1; id <= 12; id += 1) await db.execute("INSERT INTO users (id) VALUES (?)", [id]);
    await db.query(migration);
    await run({ db, connect: () => mysql.createConnection({ ...options, database }) });
  } finally {
    try { if (db) await db.end(); }
    finally {
      try { if (created) await admin.query(`DROP DATABASE \`${database}\``); }
      finally { await admin.end(); }
    }
  }
}

async function counter(db: Connection, site: string, planId: string) {
  const [rows] = await db.execute<RowDataPacket[]>("SELECT issuedCount, reservedCount FROM bandedFoundingCounters WHERE site = ? AND planId = ?", [site, planId]);
  return { issued: Number(rows[0].issuedCount), reserved: Number(rows[0].reservedCount) };
}
async function statuses(db: Connection, site: string, planId: string) {
  const [rows] = await db.execute<RowDataPacket[]>("SELECT checkoutIntentId, status FROM bandedFoundingMemberships WHERE site = ? AND planId = ? ORDER BY id", [site, planId]);
  return rows.map(row => `${String(row.checkoutIntentId)}:${String(row.status)}`);
}
const reserve = (db: Connection, input: { site?: "test" | "live"; planId?: "early_to_mid" | "mid_to_senior" | "senior_to_executive"; userId: number; key: string; now?: Date; ttlMinutes?: number }) => {
  const now = input.now ?? T0;
  return reserveFoundingPlace(drizzle(db), { site: input.site ?? "test", planId: input.planId ?? "early_to_mid", userId: input.userId, checkoutIntentId: input.key, now, expiresAt: new Date(now.getTime() + (input.ttlMinutes ?? 360) * 60_000), replayNotBefore: new Date(now.getTime() - 25 * 60_000) });
};

test("a reservation holds one place; replaying its key reuses it and a used key is refused", async () => {
  await withDatabase(async ({ db }) => {
    expect(await reserve(db, { userId: 1, key: "bp_a" })).toEqual({ status: "reserved" });
    expect(await reserve(db, { userId: 1, key: "bp_a", now: later(5) })).toEqual({ status: "existing" });
    expect(await counter(db, "test", "early_to_mid")).toEqual({ issued: 0, reserved: 1 });
    // Past the provider's idempotency window the same key would open a second page: start a new checkout.
    expect(await reserve(db, { userId: 1, key: "bp_a", now: later(26) })).toEqual({ status: "key_used" });
    // The same key from another person, for another plan, or after expiry is never a second place.
    expect(await reserve(db, { userId: 2, key: "bp_a" })).toEqual({ status: "key_used" });
    expect(await reserve(db, { userId: 1, key: "bp_a", now: later(361) })).toEqual({ status: "key_used" });
    expect(await counter(db, "test", "early_to_mid")).toEqual({ issued: 0, reserved: 1 });
  });
});

test("eight buyers race for the last founding place: exactly one wins and the cap holds", async () => {
  await withDatabase(async ({ db, connect }) => {
    const cap = PLAN_FAMILY.find(plan => plan.id === "senior_to_executive")!.foundingCap;
    await db.execute("UPDATE bandedFoundingCounters SET issuedCount = ? WHERE site = 'test' AND planId = 'senior_to_executive'", [cap - 1]);
    const outcomes = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      const connection = await connect();
      try { return (await reserve(connection, { planId: "senior_to_executive", userId: index + 1, key: `bp_race_${index}` })).status; }
      finally { await connection.end(); }
    }));
    expect(outcomes.filter(status => status === "reserved")).toHaveLength(1);
    expect(outcomes.filter(status => status === "full")).toHaveLength(7);
    expect(await counter(db, "test", "senior_to_executive")).toEqual({ issued: cap - 1, reserved: 1 });
    expect(await foundingPlacesLeft(drizzle(db), "test", T0)).toMatchObject({ senior_to_executive: 0 });
  });
});

test("an expired reservation is released when the next buyer arrives, freeing its place", async () => {
  await withDatabase(async ({ db }) => {
    const cap = PLAN_FAMILY.find(plan => plan.id === "mid_to_senior")!.foundingCap;
    await db.execute("UPDATE bandedFoundingCounters SET issuedCount = ? WHERE site = 'test' AND planId = 'mid_to_senior'", [cap - 1]);
    expect(await reserve(db, { planId: "mid_to_senior", userId: 1, key: "bp_old", ttlMinutes: 60 })).toEqual({ status: "reserved" });
    expect(await reserve(db, { planId: "mid_to_senior", userId: 2, key: "bp_early", now: later(30) })).toEqual({ status: "full" });
    expect(await foundingPlacesLeft(drizzle(db), "test", later(61))).toMatchObject({ mid_to_senior: 1 });
    expect(await reserve(db, { planId: "mid_to_senior", userId: 2, key: "bp_new", now: later(61) })).toEqual({ status: "reserved" });
    expect(await statuses(db, "test", "mid_to_senior")).toEqual(["bp_old:released", "bp_new:reserved"]);
    expect(await counter(db, "test", "mid_to_senior")).toEqual({ issued: cap - 1, reserved: 1 });
  });
});

test("a new checkout replaces the same person's earlier unpaid reservation for that plan", async () => {
  await withDatabase(async ({ db }) => {
    expect(await reserve(db, { userId: 3, key: "bp_first" })).toEqual({ status: "reserved" });
    expect(await reserve(db, { userId: 3, key: "bp_second", now: later(2) })).toEqual({ status: "reserved" });
    expect(await reserve(db, { userId: 4, key: "bp_other", now: later(3) })).toEqual({ status: "reserved" });
    expect(await statuses(db, "test", "early_to_mid")).toEqual(["bp_first:released", "bp_second:reserved", "bp_other:reserved"]);
    expect(await counter(db, "test", "early_to_mid")).toEqual({ issued: 0, reserved: 2 });
  });
});

test("release frees only a live reservation, once, and never an issued place", async () => {
  await withDatabase(async ({ db }) => {
    await reserve(db, { userId: 5, key: "bp_rel" });
    expect(await releaseFoundingPlace(drizzle(db), { site: "test", checkoutIntentId: "bp_rel", now: later(1) })).toEqual({ released: true });
    expect(await releaseFoundingPlace(drizzle(db), { site: "test", checkoutIntentId: "bp_rel", now: later(2) })).toEqual({ released: false });
    expect(await releaseFoundingPlace(drizzle(db), { site: "test", checkoutIntentId: "bp_missing", now: later(2) })).toEqual({ released: false });
    expect(await counter(db, "test", "early_to_mid")).toEqual({ issued: 0, reserved: 0 });
    await reserve(db, { userId: 6, key: "bp_paid", now: later(3) });
    await db.execute("UPDATE bandedFoundingMemberships SET status = 'issued', issuedSequence = 1, issuedAt = ? WHERE checkoutIntentId = 'bp_paid'", [later(4)]);
    await db.execute("UPDATE bandedFoundingCounters SET issuedCount = 1, reservedCount = 0 WHERE site = 'test' AND planId = 'early_to_mid'");
    expect(await releaseFoundingPlace(drizzle(db), { site: "test", checkoutIntentId: "bp_paid", now: later(5) })).toEqual({ released: false });
    expect(await counter(db, "test", "early_to_mid")).toEqual({ issued: 1, reserved: 0 });
  });
});

test("TEST checkouts never take LIVE founding places", async () => {
  await withDatabase(async ({ db }) => {
    const cap = PLAN_FAMILY.find(plan => plan.id === "early_to_mid")!.foundingCap;
    await db.execute("UPDATE bandedFoundingCounters SET issuedCount = ? WHERE site = 'live' AND planId = 'early_to_mid'", [cap]);
    expect(await reserve(db, { site: "live", userId: 7, key: "bp_live" })).toEqual({ status: "full" });
    expect(await reserve(db, { site: "test", userId: 7, key: "bp_test" })).toEqual({ status: "reserved" });
    expect(await foundingPlacesLeft(drizzle(db), "live", T0)).toMatchObject({ early_to_mid: 0 });
    expect(await foundingPlacesLeft(drizzle(db), "test", T0)).toMatchObject({ early_to_mid: cap - 1 });
  });
});
