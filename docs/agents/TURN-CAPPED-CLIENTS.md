# Turn-capped clients: delegate to subagents (D-402 (6))

Some providers end a conversation after a fixed number of turns (Xingchi: 20, D-401). Short subagent conversations keep
the main conversation under that cap. OpenCode loads this file through `opencode.json` (`instructions`); ZCode and other
clients can read it directly.

**Primary agent only; subagents ignore this section.**

1. Only the primary agent runs `node scripts/next-task.mjs` (claim, heartbeat, report) and opens pull requests.
2. Delegate each search to the read-only `explore` subagent (ZCode: `Explore`). Delegate each commit-sized edit, fix or
   test run to the `worker` subagent, in the task's own worktree and branch.
3. A worker never claims, never pushes another branch and never opens a pull request. It returns the files it changed,
   its test output and what remains.
4. The primary commits and pushes after each worker step. When it nears its turn limit it pushes and stops: a new
   conversation resumes the same claim (D-401), and `scripts/agent-loop.mjs` starts that conversation for you (D-402).
