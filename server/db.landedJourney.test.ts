import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQL, getTableColumns, getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { jobs, landedJourney, messages, notifications, referralRequests, userBlocks, users } from "../drizzle/schema";
import { listReferrerThankYous, recordLandedJourney } from "./db";

/*
 * Kit landed journey (queue row 20 slices C+D). These are real calls into
 * server/db.ts against a fixture client implementing the slice of SQL the
 * thank-you path uses: select with joins, count(), orderBy, insert with
 * onDuplicateKeyUpdate and the unique index on referralRequestId, update,
 * and the conversation send. The invariant under test is that a referrer can
 * never be handed the same note twice, and that a failed send stays retryable
 * instead of silently claiming the thanks went through.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const EARLIER = new Date("2026-10-14T12:00:00.000Z");
const SENT_AT = new Date("2026-10-17T09:00:00.000Z");

type Row = Record<string, unknown>;
const TABLES = [users, jobs, referralRequests, landedJourney, messages, notifications, userBlocks];
const COLUMNS_BY_NAME = new Map(TABLES.map(table => [getTableName(table), Object.keys(getTableColumns(table))]));
/** Only landedJourney has a unique index this path can collide with. */
const UNIQUE_BY_NAME: Record<string, string[]> = { landedJourney: ["referralRequestId"] };

let rows: Record<string, Row[]>;
let sequence: Record<string, number>;
let conversationSendFails = false;
let notificationInsertFails = false;
/** Simulates another submit claiming the send between this call's read and its claim. */
let onClaimAttempt: (() => void) | null = null;

const tableNameOf = (table: unknown) => getTableName(table as never);
const bucket = (table: unknown) => (rows[tableNameOf(table)] ??= []);

/** Every column of every joined table keyed "table.column"; a left join with no match is all null. */
function flatten(parts: Array<{ table: string; row: Row | null }>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const part of parts) for (const column of COLUMNS_BY_NAME.get(part.table) ?? []) flat[`${part.table}.${column}`] = part.row ? part.row[column] ?? null : null;
  return flat;
}

const asMs = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}Z`);
  return value;
};

function splitTopLevel(sql: string, operator: string): string[] {
  const parts: string[] = [];
  let depth = 0; let start = 0; let i = 0;
  while (i < sql.length) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") depth--;
    else if (depth === 0 && sql.startsWith(operator, i)) { parts.push(sql.slice(start, i)); i += operator.length; start = i; continue; }
    i++;
  }
  parts.push(sql.slice(start));
  return parts;
}

const ATOM = /^`([^`]+)`\.`([^`]+)`\s*(?:(is not null|is null)|(=|<>|<|>)\s*(?:(`([^`]+)`\.`([^`]+)`)|\?))$/i;

/** Evaluates the WHERE slice this suite exercises: =, <>, is (not) null, and/or, column or param right side. */
function matches(condition: unknown, flat: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition as SQL);
  const cursor = { index: 0 };
  const unwrap = (sql: string): string => {
    let text = sql.trim();
    while (text.startsWith("(")) {
      let depth = 0; let closesAt = -1;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")") { depth--; if (depth === 0) { closesAt = i; break; } }
      }
      if (closesAt !== text.length - 1) break;
      text = text.slice(1, -1).trim();
    }
    return text;
  };
  const evaluate = (sql: string): boolean => {
    const trimmed = unwrap(sql);
    if (!trimmed) return true;
    const orParts = splitTopLevel(trimmed, " or ");
    if (orParts.length > 1) return orParts.map(evaluate).some(Boolean);
    const andParts = splitTopLevel(trimmed, " and ");
    if (andParts.length > 1) return andParts.map(evaluate).every(Boolean);
    const match = ATOM.exec(trimmed);
    if (!match) throw new Error(`fixture cannot evaluate: ${trimmed}`);
    const value = flat[`${match[1]}.${match[2]}`];
    const [, , , nullOp, compareOp, rightColumn, rightTable, rightName] = match;
    if (nullOp) return /is not null/i.test(nullOp) ? value !== null && value !== undefined : value === null || value === undefined;
    const right = rightColumn ? flat[`${rightTable}.${rightName}`] : query.params[cursor.index++];
    if (compareOp === "=") return asMs(value) === asMs(right);
    if (compareOp === "<>") return asMs(value) !== asMs(right);
    const left = asMs(value); const bound = asMs(right);
    if (typeof left !== "number" || typeof bound !== "number") return false;
    return compareOp === "<" ? left < bound : left > bound;
  };
  return evaluate(query.sql);
}

/** Orders by the terms drizzle emits as "`table`.`column` ASC|DESC"; ties fall back to insertion order. */
function orderByCombos(combos: Array<Array<{ table: string; row: Row | null }>>, terms: unknown[]): typeof combos {
  if (terms.length === 0) return combos;
  const parsed = terms.map(term => {
    const sql = dialect.sqlToQuery(term as SQL).sql;
    const match = /^`([^`]+)`\.`([^`]+)`\s+(asc|desc)$/i.exec(sql.trim());
    if (!match) throw new Error(`fixture cannot order by: ${sql}`);
    return { key: `${match[1]}.${match[2]}`, desc: /desc/i.test(match[3]) };
  });
  return combos
    .map((combo, index) => ({ combo, index, flat: flatten(combo) }))
    .sort((a, b) => {
      for (const term of parsed) {
        const left = a.flat[term.key]; const right = b.flat[term.key];
        if (asMs(left) === asMs(right)) continue;
        const order = asMs(left)! < asMs(right)! ? -1 : 1;
        return term.desc ? -order : order;
      }
      return a.index - b.index;
    })
    .map(entry => entry.combo);
}

function fixtureDatabase() {
  const select = (projection?: Record<string, unknown>) => {
    const state: { from?: unknown; joins: Array<{ table: unknown; on: unknown; kind: "inner" | "left" }>; where?: unknown; order: unknown[] } = { joins: [], order: [] };
    const project = (combo: Array<{ table: string; row: Row | null }>, groupSize: number): Row => {
      if (!projection) return structuredClone(combo[0].row ?? {});
      const flat = flatten(combo);
      const out: Row = {};
      for (const [key, value] of Object.entries(projection)) {
        // count() has no column: with no group by it is the size of the filtered set.
        if (value instanceof SQL) out[key] = groupSize;
        else out[key] = flat[`${tableNameOf((value as { table: unknown }).table)}.${(value as { name: string }).name}`];
      }
      return out;
    };
    const run = (): Row[] => {
      let combos = bucket(state.from).map(row => [{ table: tableNameOf(state.from), row }]);
      for (const join of state.joins) {
        const name = tableNameOf(join.table);
        const next: typeof combos = [];
        for (const combo of combos) {
          const matched = bucket(join.table).filter(candidate => matches(join.on, flatten([...combo, { table: name, row: candidate }])));
          for (const candidate of matched) next.push([...combo, { table: name, row: candidate }]);
          if (join.kind === "left" && matched.length === 0) next.push([...combo, { table: name, row: null }]);
        }
        combos = next;
      }
      if (state.where) combos = combos.filter(combo => matches(state.where, flatten(combo)));
      const ordered = orderByCombos(combos, state.order);
      return ordered.map(combo => project(combo, ordered.length));
    };
    const slice = (n: number) => run().slice(0, n);
    const chain = {
      from: (table: unknown) => { state.from = table; return chain; },
      innerJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "inner" }); return chain; },
      leftJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "left" }); return chain; },
      where: (condition: unknown) => { state.where = condition; return chain; },
      orderBy: (...terms: unknown[]) => { state.order = terms; return chain; },
      limit: (n: number) => ({ for: async (_mode: string) => slice(n), then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(slice(n)).then(resolve, reject) }),
      for: async (_mode: string) => run(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  };
  const update = (table: unknown) => ({
    set: (patch: Row) => ({
      where: async (condition: unknown) => {
        const name = tableNameOf(table);
        if (name === "landedJourney" && patch.deliveredAt instanceof Date && onClaimAttempt) {
          const hook = onClaimAttempt;
          onClaimAttempt = null;
          hook();
        }
        const matched = bucket(table).filter(row => matches(condition, flatten([{ table: name, row }])));
        for (const row of matched) for (const [key, value] of Object.entries(patch)) row[key] = structuredClone(value);
        return [{ affectedRows: matched.length }];
      },
    }),
  });
  const insert = (table: unknown) => ({
    values: (input: Row | Row[]) => {
      const name = tableNameOf(table);
      if (name === "messages" && conversationSendFails) throw new Error("conversation send failed");
      if (name === "notifications" && notificationInsertFails) throw new Error("notification insert failed");
      const created: Row[] = [];
      for (const item of Array.isArray(input) ? input : [input]) {
        const unique = UNIQUE_BY_NAME[name] ?? [];
        const clash = unique.length > 0 ? bucket(table).find(row => unique.every(column => row[column] === item[column])) : undefined;
        if (clash) return Object.assign(Promise.resolve([{ affectedRows: 2 }]), { onDuplicateKeyUpdate: async (patch: { set: Row }) => { for (const [key, value] of Object.entries(patch.set)) clash[key] = structuredClone(value); return [{ affectedRows: 2 }]; } });
        const id = (sequence[name] = (sequence[name] ?? 0) + 1);
        // Mirrors the DDL defaults: autoincrement id, shareOnWall false, nullable deliveredAt, timestamps default now.
        const row: Row = { shareOnWall: false, deliveredAt: null, createdAt: SENT_AT, updatedAt: SENT_AT, ...structuredClone(item), id };
        bucket(table).push(row);
        created.push(row);
      }
      return Object.assign(Promise.resolve([{ affectedRows: 1, insertId: created[0]?.id }]), { onDuplicateKeyUpdate: async () => [{ affectedRows: 1 }] });
    },
  });
  const remove = (table: unknown) => ({
    where: async (condition: unknown) => {
      const name = tableNameOf(table);
      const kept = bucket(table).filter(row => !matches(condition, flatten([{ table: name, row }])));
      const removed = bucket(table).length - kept.length;
      rows[name] = kept;
      return [{ affectedRows: removed }];
    },
  });
  const api = { select, update, insert, delete: remove };
  // A real transaction rolls every write back on a throw; the fixture copies the
  // tables so a failed step cannot leave a half-written message behind.
  return {
    ...api,
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const snapshot = { rows: structuredClone(rows), sequence: structuredClone(sequence) };
      try {
        return await cb(api);
      } catch (error) {
        rows = snapshot.rows;
        sequence = snapshot.sequence;
        throw error;
      }
    },
  };
}

const userRow = (id: number, name: string) => ({ id, openId: `u${id}`, name, email: `u${id}@example.test`, role: "user", suspended: false });
const jobRow = (id: number, company: string, title: string) => ({ id, company, title, location: null, targetRoleUrl: `https://careers.${company}/role`, jobFunction: null });
const askRow = (id: number, jobSeekerId: number, jobId: number, over: Row = {}): Row => ({ id, jobSeekerId, jobId, referrerId: 9, status: "closed", personalPitch: null, referrerMessage: null, revision: 1, createdAt: EARLIER, updatedAt: EARLIER, ...over });
const wallRow = (id: number, over: Row = {}): Row => ({ id, referralRequestId: id, seekerUserId: 7, referrerUserId: 9, thankYouMessage: "You opened the door for me. Thank you.", shareOnWall: true, payForwardChoice: null, deliveredAt: SENT_AT, conversationMessageId: null, createdAt: SENT_AT, updatedAt: SENT_AT, ...over });

function seed() {
  rows = {
    users: [userRow(7, "Kavya Menon"), userRow(8, "Arjun Nair"), userRow(9, "Nikhil Rao"), userRow(11, "Meera Iyer")],
    jobs: [jobRow(3, "zensar.com", "Data Analyst"), jobRow(4, "infosysbpm.com", "Support Lead")],
    referralRequests: [askRow(501, 7, 3), askRow(502, 8, 4), askRow(503, 8, 3), askRow(504, 7, 4), askRow(505, 7, 3, { referrerId: 11 })],
    landedJourney: [],
    messages: [],
    notifications: [],
  };
  sequence = { users: 11, jobs: 4, referralRequests: 505, landedJourney: 0, messages: 0, notifications: 0 };
  conversationSendFails = false;
  notificationInsertFails = false;
  onClaimAttempt = null;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  seed();
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const note = (over: Row = {}) => ({ referralRequestId: 501, ...over });
const saved = () => rows.landedJourney[0];

describe("the landed thank-you reaches one referrer once", () => {
  it("stores the note and sends it into the accepted referral conversation", async () => {
    const state = await recordLandedJourney(7, note({ message: "I start on the 3rd, thanks to you.", shareOnWall: true }));
    expect(state).toEqual({ referralRequestId: 501, thankYouMessage: "I start on the 3rd, thanks to you.", shareOnWall: true, payForward: null, delivered: true });
    expect(rows.landedJourney).toHaveLength(1);
    expect(saved()).toMatchObject({ referralRequestId: 501, seekerUserId: 7, referrerUserId: 9 });
    expect(saved().deliveredAt).toBeInstanceOf(Date);
    expect(rows.messages).toEqual([expect.objectContaining({ senderId: 7, recipientId: 9, body: "I start on the 3rd, thanks to you.", referralRequestId: 501 })]);
    expect(saved().conversationMessageId).toBe(rows.messages[0]?.id);
    expect(rows.notifications).toEqual([expect.objectContaining({ kind: "message_new", userId: 9 })]);
  });

  it("refuses a thank-you on another seeker's ask", async () => {
    await expect(recordLandedJourney(8, note({ message: "Not my hire to thank." }))).rejects.toThrow(/not available to you/);
    expect(rows.landedJourney).toHaveLength(0);
    expect(rows.messages).toHaveLength(0);
  });

  it("refuses until the referrer marks the ask as hired", async () => {
    rows.referralRequests[0]!.status = "approved";
    await expect(recordLandedJourney(7, note({ message: "Too early." }))).rejects.toThrow(/marks the ask as hired/);
    rows.referralRequests[0]!.status = "closed";
    rows.referralRequests[0]!.referrerId = null;
    await expect(recordLandedJourney(7, note({ message: "No one to thank." }))).rejects.toThrow(/marks the ask as hired/);
    expect(rows.landedJourney).toHaveLength(0);
  });

  it("cannot hand the referrer the same thanks twice", async () => {
    await recordLandedJourney(7, note({ message: "First note, sent." }));
    const again = await recordLandedJourney(7, note({ message: "A second note the referrer must not get." }));
    expect(again.delivered).toBe(true);
    expect(again.thankYouMessage).toBe("First note, sent.");
    expect(rows.messages).toHaveLength(1);
  });

  it("sends nothing when another submit wins the claim between the read and the claim", async () => {
    rows.landedJourney = [wallRow(501, { thankYouMessage: null, shareOnWall: false, deliveredAt: null, conversationMessageId: null })];
    rows.messages = [{ id: 77, senderId: 7, recipientId: 9, body: "From the other click.", referralRequestId: 501 }];
    // The other submit claims and sends while this call is between its read and its
    // conditional claim; only the isNull guard turns that into affectedRows 0.
    onClaimAttempt = () => { saved().deliveredAt = SENT_AT; saved().conversationMessageId = 77; saved().thankYouMessage = "From the other click."; };
    const state = await recordLandedJourney(7, note({ message: "This click must not send." }));
    expect(state.delivered).toBe(true);
    // The note that reached the referrer is the one the wall reports, not this submit's.
    expect(state.thankYouMessage).toBe("From the other click.");
    expect(saved().thankYouMessage).toBe("From the other click.");
    expect(rows.messages).toHaveLength(1);
    expect(rows.messages[0]).toMatchObject({ id: 77, body: "From the other click." });
    expect(saved().conversationMessageId).toBe(77);
  });

  it("reports a note another submit already claimed instead of sending a second copy", async () => {
    // The state a double click leaves behind: this seeker's earlier submit took the
    // delivery claim and is still in flight, so nothing here may send again.
    rows.landedJourney = [wallRow(501, { thankYouMessage: "Claimed by the first click.", conversationMessageId: null })];
    const state = await recordLandedJourney(7, note({ message: "Typed it again just in case." }));
    expect(state).toMatchObject({ thankYouMessage: "Claimed by the first click.", delivered: true });
    expect(rows.messages).toHaveLength(0);
  });

  it("keeps the note editable while the send fails, then sends what it saved", async () => {
    conversationSendFails = true;
    const failed = await recordLandedJourney(7, note({ message: "Could not go out yet." }));
    expect(failed).toMatchObject({ thankYouMessage: "Could not go out yet.", delivered: false });
    expect(saved().deliveredAt).toBeNull();
    expect(rows.messages).toHaveLength(0);

    conversationSendFails = false;
    const retried = await recordLandedJourney(7, note({ message: "Edited before it ever reached them." }));
    expect(retried.delivered).toBe(true);
    expect(retried.thankYouMessage).toBe("Edited before it ever reached them.");
    expect(rows.messages).toHaveLength(1);
    expect(rows.messages[0]).toMatchObject({ body: "Edited before it ever reached them.", recipientId: 9 });
    expect(saved().deliveredAt).toBeInstanceOf(Date);
    expect(saved().conversationMessageId).toBe(rows.messages[0]?.id);
  });

  it("rolls the message back when the referrer notice fails, so the retry sends exactly one", async () => {
    notificationInsertFails = true;
    const failed = await recordLandedJourney(7, note({ message: "One copy only." }));
    expect(failed).toMatchObject({ thankYouMessage: "One copy only.", delivered: false });
    expect(rows.messages).toHaveLength(0);
    expect(rows.notifications).toHaveLength(0);
    expect(saved().deliveredAt).toBeNull();

    notificationInsertFails = false;
    const retried = await recordLandedJourney(7, note({ message: "One copy only." }));
    expect(retried.delivered).toBe(true);
    expect(rows.messages).toHaveLength(1);
    expect(rows.messages[0]).toMatchObject({ body: "One copy only.", recipientId: 9 });
    expect(rows.notifications).toHaveLength(1);
    expect(saved().conversationMessageId).toBe(rows.messages[0]?.id);
  });

  it("records the pay-it-forward answer without messaging anyone", async () => {
    const state = await recordLandedJourney(7, note({ payForward: "later" }));
    expect(state).toMatchObject({ thankYouMessage: null, shareOnWall: false, payForward: "later", delivered: false });
    expect(rows.messages).toHaveLength(0);
    expect(rows.notifications).toHaveLength(0);
  });

  it("keeps a wall permission the seeker set, and honors an untick", async () => {
    await recordLandedJourney(7, note({ message: "Keep this one.", shareOnWall: true }));
    expect((await recordLandedJourney(7, note({ payForward: "yes" }))).shareOnWall).toBe(true);
    expect(saved().shareOnWall).toBe(true);
    expect((await recordLandedJourney(7, note({ shareOnWall: false }))).shareOnWall).toBe(false);
    expect(saved().shareOnWall).toBe(false);
  });

  it("stores the note that was sent when a racing submit updates the row before the claim", async () => {
    rows.landedJourney = [wallRow(501, { thankYouMessage: null, shareOnWall: true, deliveredAt: null, conversationMessageId: null })];
    // Simulates another tab racing and writing line 3592 before this tab's claim update
    onClaimAttempt = () => { saved().thankYouMessage = "From the other tab."; };
    const state = await recordLandedJourney(7, note({ message: "Sent by this tab." }));
    expect(state.delivered).toBe(true);
    expect(saved().thankYouMessage).toBe(rows.messages[0]?.body);
    expect(state.thankYouMessage).toBe(rows.messages[0]?.body);
    expect(saved().thankYouMessage).toBe("Sent by this tab.");
  });
});

describe("a referrer's private thank-you wall", () => {
  it("hides thank-yous between blocked users and excludes them from total", async () => {
    rows.landedJourney = [
      wallRow(501, { seekerUserId: 7 }),
      wallRow(502, { seekerUserId: 8 }),
    ];
    // Seeker 7 and Referrer 9 are blocked (blocker: 9, blocked: 7)
    rows.userBlocks = [
      { id: 1, blockerUserId: 9, blockedUserId: 7, reason: "spam", createdAt: new Date() },
    ];
    const wall = await listReferrerThankYous(9);
    expect(wall.total).toBe(1);
    expect(wall.thankYous).toHaveLength(1);
    expect(wall.thankYous[0]?.id).toBe(502);

    // Now test the other direction: seeker 8 blocked referrer 9
    rows.userBlocks.push({ id: 2, blockerUserId: 8, blockedUserId: 9, reason: "privacy", createdAt: new Date() });
    const wallBlockedBoth = await listReferrerThankYous(9);
    expect(wallBlockedBoth).toEqual({ thankYous: [], total: 0 });
  });
  it("counts every note that reached them and shows only those they were allowed to keep", async () => {
    rows.landedJourney = [
      wallRow(501, { createdAt: new Date("2026-10-10T09:00:00.000Z") }),
      wallRow(502, { seekerUserId: 8, shareOnWall: false, createdAt: new Date("2026-10-11T09:00:00.000Z") }),
      wallRow(503, { seekerUserId: 8, deliveredAt: null, thankYouMessage: null }),
      wallRow(505, { referrerUserId: 11 }),
    ];
    const wall = await listReferrerThankYous(9);
    expect(wall.total).toBe(2);
    expect(wall.thankYous).toHaveLength(1);
    expect(wall.thankYous[0]).toEqual({
      id: 501,
      message: "You opened the door for me. Thank you.",
      seekerName: "Kavya Menon",
      roleTitle: "Data Analyst",
      createdAt: new Date("2026-10-10T09:00:00.000Z").toISOString(),
    });
  });

  it("shows the newest notes first and never more than asked for", async () => {
    rows.landedJourney = [501, 502, 503, 504].map((id, index) => wallRow(id, {
      seekerUserId: id === 501 || id === 504 ? 7 : 8,
      thankYouMessage: `Note ${index + 1}`,
      createdAt: new Date(`2026-10-0${index + 1}T09:00:00.000Z`),
    }));
    const wall = await listReferrerThankYous(9);
    expect(wall.total).toBe(4);
    expect(wall.thankYous.map(item => item.message)).toEqual(["Note 4", "Note 3", "Note 2"]);
    expect((await listReferrerThankYous(9, 2)).thankYous.map(item => item.message)).toEqual(["Note 4", "Note 3"]);
  });

  it("is empty for a referrer no seeker has thanked", async () => {
    rows.landedJourney = [wallRow(505, { referrerUserId: 11 })];
    expect(await listReferrerThankYous(9)).toEqual({ thankYous: [], total: 0 });
  });
});
