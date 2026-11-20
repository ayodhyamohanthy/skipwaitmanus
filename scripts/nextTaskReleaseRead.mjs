// Read-only D-212 observations; every provider boundary is parsed before use.
import { z } from "zod";
import { readGitCommitMeta } from "./releaseSmokeCore.mjs";
import { releaseLights } from "./nextTaskReleaseCore.mjs";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const run = z.object({ id: z.number().int().positive(), head_sha: sha, head_branch: z.string().nullable(),
  status: z.string(), conclusion: z.string().nullable(), created_at: z.string().datetime() });
const runs = z.object({ workflow_runs: z.array(run) });
const issue = z.object({ number: z.number().int().positive(), title: z.string(), state: z.literal("open"),
  pull_request: z.object({}).optional() });
const statuses = z.object({ sha, statuses: z.array(z.object({ context: z.string(), state: z.string(),
  created_at: z.string().datetime(), updated_at: z.string().datetime() })) });
const pull = z.object({ number: z.number().int().positive(), merged_at: z.string().nullable(), merge_commit_sha: sha.nullable(),
  head: z.object({ sha, ref: z.string() }), base: z.object({ ref: z.string(), repo: z.object({ full_name: z.string() }) }) });
const jobs = z.object({ jobs: z.array(z.object({ name: z.string(), steps: z.array(z.object({
  name: z.string(), status: z.string(), conclusion: z.string().nullable(),
})) })) });
const newest = list => [...list].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)[0] ?? null;

export async function readLiveRelease({ repo, github, mainCi, tryGit, fetchImpl = fetch, warn = console.error }) {
  // All additional reads share one wall-clock budget; claims do not wait on a broken monitor.
  const signal = AbortSignal.timeout(20_000);
  const get = route => github(repo, route, { signal });
  const safe = async (source, read) => {
    try { return await read(); }
    catch { warn(`next-task: live release ${source} unreadable; light is unknown, not a landing hold`); return null; }
  };
  const publicText = async (route, allowed = [200]) => {
    const res = await fetchImpl(`https://skipwait.me${route}`, { redirect: "error", cache: "no-store", signal });
    if (!allowed.includes(res.status)) throw new Error("public health response unavailable");
    const body = await res.text();
    if (body.length > 1_000_000) throw new Error("public health response too large");
    return body;
  };
  const deployments = file => safe(file, async () => runs.parse(await get(`/actions/workflows/${file}/runs?branch=main&per_page=100`))
    .workflow_runs.filter(r => r.head_branch === "main"));
  const openIssues = async (source, route, matches) => {
    const found = [];
    for (let page = 1; page <= 5; page++) {
      const rows = await safe(`${source} issues`, async () => z.array(issue).parse(await get(`${route}&per_page=100&page=${page}`)));
      if (!rows) return { issues: found, complete: false };
      found.push(...rows.filter(r => !r.pull_request && matches(r)));
      if (rows.length < 100) return { issues: found, complete: true };
    }
    warn(`next-task: live release ${source} issues pagination incomplete; no unobserved zero is inferred`);
    return { issues: found, complete: false };
  };
  const [apiRuns, webRuns, expectedApi, liveApi, liveWeb, incidents, jobHealth] = await Promise.all([
    deployments("deploy-api.yml"), deployments("deploy-pages.yml"),
    safe("api-runtime", async () => {
      const ref = z.object({ object: z.object({ type: z.enum(["commit", "tag"]), sha }) }).parse(await get("/git/ref/tags/api-runtime"));
      if (ref.object.type === "commit") return ref.object.sha;
      return z.object({ object: z.object({ type: z.literal("commit"), sha }) }).parse(await get(`/git/tags/${ref.object.sha}`)).object.sha;
    }),
    safe("API identity", async () => z.object({ commitSha: sha }).parse(JSON.parse(await publicText("/api/health"))).commitSha),
    safe("web identity", async () => sha.parse(readGitCommitMeta(await publicText("/")))),
    openIssues("incident", "/issues?state=open&labels=incident", () => true),
    safe("job heartbeats", async () => z.object({ ok: z.boolean() }).parse(JSON.parse(await publicText("/api/health/jobs", [200, 503])))),
  ]);
  // The watchdog's existing issue has no label contract. Paginate all open issues,
  // then inspect its exact title prefix; never substitute GitHub search's capped index.
  const downIssuesRead = openIssues("watchdog", "/issues?state=open", r => /^SkipWait DOWN(?:\b|:)/.test(r.title));
  const verifiedRead = liveWeb ? safe("release/verified", async () => {
    const data = statuses.parse(await get(`/commits/${liveWeb}/status?per_page=100`));
    if (data.sha !== liveWeb) throw new Error("status SHA mismatch");
    // Combined status can page contexts; a missing context is unknown, never success.
    const status = [...data.statuses].filter(s => s.context === "release/verified")
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    return status ? { state: status.state, sha: data.sha } : null;
  }) : null;
  const governanceRead = liveWeb ? safe("released PR governance", async () => {
    const associated = z.array(pull).parse(await get(`/commits/${liveWeb}/pulls?per_page=100`));
    const pr = associated.find(p => p.merge_commit_sha === liveWeb && p.merged_at && p.base.ref === "main" && p.base.repo.full_name === repo);
    if (!pr) return { review: "unknown", landed: "unknown" };
    const parents = tryGit("rev-list", "--parents", "-n", "1", liveWeb);
    const ancestry = tryGit("merge-base", "--is-ancestor", liveWeb, "origin/main");
    const slug = pr.head.ref.split("/").at(-1);
    const refs = tryGit("for-each-ref", "--format=%(refname)", `refs/remotes/origin/${pr.head.ref}`,
      `refs/remotes/origin/agent/review/${slug}`, `refs/remotes/origin/agent/heartbeat/${slug}`);
    const landed = parents === null || refs === null || ancestry === null ? "unknown"
      : parents.trim().split(/\s+/).length === 3 && !refs ? "green" : "red";
    const prRuns = runs.parse(await get(`/actions/workflows/ci.yml/runs?head_sha=${pr.head.sha}&event=pull_request&per_page=10`));
    const ci = newest(prRuns.workflow_runs.filter(r => r.head_sha === pr.head.sha));
    if (!ci || ci.status !== "completed") return { landed, review: "unknown" };
    const data = jobs.parse(await get(`/actions/runs/${ci.id}/jobs?filter=latest&per_page=100`));
    const gate = data.jobs.find(j => j.name === "typecheck")?.steps.find(s => s.name === "Review gate (independent Tier 1 pass)");
    const review = gate?.status === "completed" && gate.conclusion === "success" ? "green"
      : gate?.conclusion === "failure" ? "red" : "unknown";
    return { landed, review };
  }) : null;
  const [downIssues, verified, governance] = await Promise.all([downIssuesRead, verifiedRead, governanceRead]);
  return releaseLights({ mainCi, ...governance, deployApi: newest(apiRuns ?? []), deployWeb: newest(webRuns ?? []),
    expectedApi, expectedWeb: newest((webRuns ?? []).filter(r => r.status === "completed" && r.conclusion === "success"))?.head_sha,
    liveApi, liveWeb, verified, incidents: incidents.issues, incidentsComplete: incidents.complete,
    downIssues: downIssues.issues, downIssuesComplete: downIssues.complete, jobs: jobHealth });
}
