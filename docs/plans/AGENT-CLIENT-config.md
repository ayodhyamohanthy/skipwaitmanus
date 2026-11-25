# AGENT-CLIENT-config: OpenCode and ZCode pick up turn-bounded subagents from the repository, with no per-machine setup (D-402 (6))

Tier 2 · lane `agent-client-config` · branch `agent/queue/agent-client-config` · epic D-212 · no dependencies

## Why

Owner, Nov 25 2026: "whatever can be automatically fixed we should do". Xingchi ends each conversation at 20 turns
(D-401, D-402). Delegating each step to a subagent with its own short context keeps conversations under the cap. The
clients read project-level configuration, so committing it makes the setup automatic for everyone.

## The build (formats verified against the official docs on Nov 25 2026)

1. `docs/agents/TURN-CAPPED-CLIENTS.md`: the delegation rule, scoped "primary agent only; subagents ignore this section":
   - the primary alone runs `scripts/next-task.mjs` (claim, heartbeat, report) and opens pull requests;
   - it delegates each search to `explore`/`Explore` and each commit-sized edit or test run to `worker`, in the task's
     worktree;
   - workers never claim, push other branches or open pull requests, and return files changed, test output and what
     remains;
   - the primary pushes and stops when near its limit (D-401 resumes; D-402 restarts).
2. `opencode.json` (project root, OpenCode V2 keys from https://opencode.ai/docs/agents/):
   `{"$schema":"https://opencode.ai/config.json","instructions":["docs/agents/TURN-CAPPED-CLIENTS.md"],"agents":{"general":{"steps":12},"explore":{"steps":10}}}`.
   Do not override `build`'s `system`: it replaces the provider's base prompt.
3. `.opencode/agents/worker.md`: frontmatter `description` (pick automatically for any commit-sized edit, fix or test
   run), `mode: subagent`, `steps: 12`; the body is the worker prompt (one sub-task, never claim or open pull requests,
   return files, tests and what remains).
4. `.zcode/agents/worker.md`: frontmatter `name: worker`, `description` (same), `maxTurns: 12`, `injectAgentsMd: true`
   (workers must read SkipWait's binding rules); the same body.
5. `docs/BUILD_CONTINUITY.md` "Short sessions": one sentence saying these files apply automatically.

## Verification (required)

Install OpenCode in the sandbox only (`npx -y opencode-ai@latest`; never add it to the repository's dependencies). In
the repository, run its agent listing (`opencode agent list` or the documented equivalent) and record that `worker`,
`general` and `explore` load with no config error. ZCode is a desktop app and cannot be run here: say so, and rely on
its documented "unknown fields are silently ignored".

## Risk

A config key the user's older OpenCode version rejects could stop OpenCode from starting on this repository. Record the
OpenCode version verified. If a key is version-sensitive, prefer the Markdown agent file over `opencode.json` keys.

## Status

- AGENT-CLIENT-config: todo — registered Nov 25 2026 by Claude Code · 43c8 (D-402 (6)).
