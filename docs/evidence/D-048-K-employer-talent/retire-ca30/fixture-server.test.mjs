import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CSP, REF_A, REF_B, REF_C, startFixtures } from "./fixture-server.mjs";

test("synthetic local boundary serves two unchanged roots and deterministic app contracts", async t => {
  const directory = await mkdtemp(join(tmpdir(), "sw-ca30-fixture-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const roots = [join(directory, "baseline"), join(directory, "candidate")];
  for (const [index, root] of roots.entries()) {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "index.html"), `<html><body>unchanged-${index}</body></html>`);
    await writeFile(join(root, "assets", "local.js"), `console.log(${index});`);
  }
  const targets = await startFixtures(...roots);
  t.after(() => { for (const target of targets) { target.server.closeAllConnections(); target.server.close(); } });
  assert.notEqual(targets[0].origin, targets[1].origin);
  for (const target of targets) assert.equal(target.server.address().address, "127.0.0.1");
  function client(target) {
    let cookie = "";
    return async (path, method = "GET", headers = {}) => {
      const response = await fetch(`${target.origin}${path}`, { method, headers: { Cookie: cookie, ...headers } });
      if (response.headers.has("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
      return response;
    };
  }
  const before = client(targets[0]);
  const after = client(targets[1]);
  for (const [request, root] of [[before, roots[0]], [after, roots[1]]]) {
    const document = await request("/employer/talent?fixture=default");
    assert.equal(document.status, 200);
    assert.equal(await document.text(), await readFile(join(root, "index.html"), "utf8"));
    assert.equal(document.headers.get("content-security-policy"), CSP);
    assert.equal(document.headers.get("cache-control"), "no-store");
    assert.equal(await (await request("/assets/local.js")).text(), await readFile(join(root, "assets/local.js"), "utf8"));
    assert.equal((await request("/assets/missing.js")).status, 404);
    const list = await (await request("/api/employer/talent")).json();
    assert.deepEqual(list.talent.map(row => [row.displayRef, row.isUnlocked]), [[REF_A, false], [REF_B, true], [REF_C, false]]);
    assert.equal((await (await request("/api/employer/account")).json()).account.credits, 20);
    const profile = (await (await request(`/api/employer/talent/${REF_B}`)).json()).profile;
    assert.equal(profile.experience, "6-10 years");
    assert.deepEqual(profile.expertise, ["Design systems", "Figma"]);
    for (const field of ["displayRef", "name", "email", "resumeUrl"]) assert.equal(field in profile, false);
    assert.equal((await request(`/api/employer/talent/${REF_A}`)).status, 402);
    const me = await (await request("/api/trpc/auth.me?batch=1")).json();
    assert.equal(me[0].result.data.json.id, 79);
    assert.equal((await (await request("/api/dev-auth/session")).json()).account.email, "employer@synthetic.example");
    for (const path of ["/api/account/preferences", "/api/notifications", "/api/credits/summary", "/api/company-referrals/access", "/api/employer/spend-history"]) assert.equal((await request(path)).status, 200);
    assert.equal((await request("/api/account/signup-language", "POST")).status, 204);
    const search = await (await request("/api/employer/talent?query=Go&location=Pune")).json();
    assert.deepEqual(search.talent.map(row => row.displayRef), [REF_A]);
    assert.equal((await request("/api/production-not-allowed", "POST")).status, 501);
    assert.equal((await request("/api/trpc/auth.me,admin.users?batch=1")).status, 501);
    assert.equal((await request("/api/employer/account", "POST")).status, 501);
    assert.equal((await request("/api/employer/account", "GET", { Origin: "https://external.synthetic.example" })).status, 403);
    assert.equal((await request("/employer/talent?fixture=invalid")).status, 400);
  }
  // Idempotent local mutations never double-debit and never cross target sessions.
  assert.equal((await before(`/api/employer/talent/${REF_A}/unlock`, "POST")).status, 201);
  const replay = await before(`/api/employer/talent/${REF_A}/unlock`, "POST");
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { unlocked: true, remaining: 15 });
  assert.equal((await (await after("/api/employer/account")).json()).account.credits, 20);
  assert.equal((await before(`/api/employer/talent/${REF_A}/intro`, "POST")).status, 201);
  assert.equal((await before(`/api/employer/talent/${REF_A}/intro`, "POST")).status, 200);
  await before("/employer/talent?fixture=intro-refused");
  assert.equal((await before(`/api/employer/talent/${REF_B}/intro`, "POST")).status, 409);
  await before("/employer/talent?fixture=unlock-402");
  const low = await before(`/api/employer/talent/${REF_A}/unlock`, "POST");
  assert.equal(low.status, 402);
  assert.equal((await low.json()).credits, 2);
  await before("/employer/talent?fixture=unlock-error");
  assert.equal((await before(`/api/employer/talent/${REF_A}/unlock`, "POST")).status, 500);
  await before("/employer/talent?fixture=profile-error");
  assert.equal((await before(`/api/employer/talent/${REF_B}`)).status, 500);
  await before("/employer/talent?fixture=empty");
  assert.deepEqual(await (await before("/api/employer/talent")).json(), { talent: [] });
  await before("/employer/talent?fixture=load-error");
  assert.equal((await before("/api/employer/talent")).status, 503);
  await before("/employer/talent?fixture=denied");
  assert.equal((await before("/api/employer/talent")).status, 403);
  await before("/employer/talent?fixture=retry");
  assert.equal((await before("/api/employer/talent")).status, 503);
  assert.equal((await before("/api/employer/talent")).status, 200);
  await before("/employer/talent?fixture=unlock-pending");
  const pending = before(`/api/employer/talent/${REF_A}/unlock`, "POST");
  let status;
  for (let attempt = 0; attempt < 100; attempt++) {
    status = await (await before("/__fixture/status")).json();
    if (status.pending === 1) break;
  }
  assert.equal(status.pending, 1);
  assert.equal(status.balance, 20);
  assert.equal((await (await before("/__fixture/release")).json()).released, 1);
  const unlocked = await pending;
  assert.equal(unlocked.status, 201);
  assert.equal((await unlocked.json()).remaining, 15);
  assert.equal((await (await before("/__fixture/status")).json()).pending, 0);
  await before("/employer/talent?fixture=loading");
  const loading = before("/api/employer/talent");
  for (let attempt = 0; attempt < 100; attempt++) {
    status = await (await before("/__fixture/status")).json();
    if (status.pending === 1) break;
  }
  assert.equal(status.pending, 1);
  await before("/__fixture/release");
  assert.deepEqual(await (await loading).json(), { talent: [] });
});
