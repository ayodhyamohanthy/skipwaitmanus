// D-212: pure evidence classification. Missing observations are never a breach.
const isSha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const known = state => ["green", "red"].includes(state) ? state : "unknown";
const combine = states => states.includes("red") ? "red" : states.every(s => s === "green") ? "green" : "unknown";
const workflowState = run => !run || run.status !== "completed" ? "unknown"
  : run.conclusion === "success" ? "green"
  : ["failure", "timed_out", "action_required", "startup_failure"].includes(run.conclusion) ? "red" : "unknown";
const issuesState = (issues, complete = true) => Array.isArray(issues) ? issues.length ? "red" : complete ? "green" : "unknown" : "unknown";
const issueNumbers = issues => Array.isArray(issues) ? issues.map(i => i.number).filter(Number.isSafeInteger) : [];

export function releaseLights(e = {}) {
  const sha = isSha(e.liveWeb) ? e.liveWeb : null;
  const identity = (live, expected) => !isSha(live) || !isSha(expected) ? "unknown" : live === expected ? "green" : "red";
  const verification = sha && e.verified?.sha === sha
    ? e.verified.state === "success" ? "green" : ["failure", "error"].includes(e.verified.state) ? "red" : "unknown"
    : "unknown";
  const jobs = typeof e.jobs?.ok === "boolean" ? e.jobs.ok ? "green" : "red" : "unknown";
  const light = (number, label, state, detail) => ({ number, label, state, sha, detail });
  return {
    sha, apiSha: isSha(e.liveApi) ? e.liveApi : null,
    incidents: [...new Set([...issueNumbers(e.downIssues), ...issueNumbers(e.incidents)])],
    lights: [
      light(1, "Built right", known(e.mainCi?.state), `main CI: ${e.mainCi?.state ?? "unknown"}`),
      light(2, "Required CI", workflowState(e.checks), "CI workflow on the exact released PR head (D-370); no review dependency"),
      light(3, "Landed cleanly", known(e.landed), "merged PR into main, merge commit and retired branch/markers"),
      light(4, "Deployed", combine([workflowState(e.deployApi), workflowState(e.deployWeb)]),
        `Deploy API: ${workflowState(e.deployApi)}; Deploy Web: ${workflowState(e.deployWeb)}`),
      light(5, "Verified live", combine([identity(e.liveApi, e.expectedApi), identity(e.liveWeb, e.expectedWeb), verification]),
        "API vs api-runtime; web vs newest successful Pages deploy; release/verified on live web SHA"),
      light(6, "Watched", combine([issuesState(e.downIssues, e.downIssuesComplete), jobs]),
        `watchdog: ${issuesState(e.downIssues, e.downIssuesComplete)}; job heartbeats: ${jobs}`),
      light(7, "No open incident", issuesState(e.incidents, e.incidentsComplete),
        Array.isArray(e.incidents) ? `open incident issues: ${e.incidentsComplete === false ? "at least " : ""}${e.incidents.length}` : "incident issues unreadable"),
    ],
  };
}
