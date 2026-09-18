#!/usr/bin/env bash
# collab.sh — runnable companion to COLLABORATION.md.
#
# One session = one branch + one isolated worktree + one claim on the board.
#   ./scripts/collab.sh status                  snapshot: branch, dirty paths, worktrees, drift, open board
#   ./scripts/collab.sh start <task> [--session NAME] [--dir DIR]
#                                               create isolated worktree+branch off origin/main
#   ./scripts/collab.sh claim --issue N --session S --task T --scope F [--shared R] [--status ST] [--next X] [--dry-run]
#                                               post a scope claim comment
#   ./scripts/collab.sh release --issue N --session S [--note NOTE]
#                                               release a scope when done
#   ./scripts/collab.sh board                   show worktrees + open coordination issues
#
# Requires: git, gh (authenticated). Never touches another session's directory.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || { echo "ERROR: not inside a git repo" >&2; exit 2; })"
cd "$ROOT"

cmd="${1:-status}"

do_status() {
  echo "== branch =="
  git branch --show-current
  git log --oneline -1
  echo "== dirty (belongs to whoever owns this directory — do not touch) =="
  git status --short | head -20
  echo "== worktrees =="
  git worktree list
  echo "== drift vs origin/main =="
  git fetch origin main --quiet 2>/dev/null || echo "(fetch failed — offline?)"
  LOCAL="$(git rev-parse HEAD)"; REMOTE="$(git rev-parse origin/main 2>/dev/null || echo unknown)"
  if [ "$LOCAL" = "$REMOTE" ]; then echo "in sync with origin/main"; else echo "LOCAL $LOCAL | origin/main $REMOTE"; fi
}

do_board() {
  echo "== worktrees =="
  git worktree list
  echo "== open issues (coordination records) =="
  gh issue list --state open --limit 20 2>/dev/null || echo "(gh unavailable)"
}

do_start() {
  TASK="${1:-}"; SESSION="agent"; DIR_BASE="${TMPDIR:-/tmp}"
  shift || true
  while [ $# -gt 0 ]; do case "$1" in
    --session) SESSION="$2"; shift 2;;
    --dir) DIR_BASE="$2"; shift 2;;
    *) echo "ERROR: unknown flag $1" >&2; exit 2;;
  esac; done
  [ -n "$TASK" ] || { echo "Usage: collab.sh start <task> [--session NAME] [--dir DIR]" >&2; exit 2; }
  git fetch origin main --quiet
  BASE="$(git rev-parse origin/main)"
  SAFE_TASK="$(printf '%s' "$TASK" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | cut -c1-40)"
  BRANCH="agent/${SESSION}/${SAFE_TASK}"
  WT="${DIR_BASE}/skipwait-${SESSION}-${SAFE_TASK}"
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then echo "ERROR: branch $BRANCH exists" >&2; exit 1; fi
  git worktree add -b "$BRANCH" "$WT" "$BASE"
  echo "Worktree ready: $WT ($BRANCH, base $BASE)"
  echo "Next: post a claim, e.g."
  echo "  ./scripts/collab.sh claim --issue 23 --session '$SESSION' --task '$TASK' --scope '<files>' --next 'implement'"
}

do_claim() {
  ISSUE=""; SESSION=""; TASK=""; SCOPE=""; SHARED="none"; STATUS="claimed"; NEXT=""; DRY=0
  while [ $# -gt 0 ]; do case "$1" in
    --issue) ISSUE="$2"; shift 2;;
    --session) SESSION="$2"; shift 2;;
    --task) TASK="$2"; shift 2;;
    --scope) SCOPE="$2"; shift 2;;
    --shared) SHARED="$2"; shift 2;;
    --status) STATUS="$2"; shift 2;;
    --next) NEXT="$2"; shift 2;;
    --dry-run) DRY=1; shift;;
    *) echo "ERROR: unknown flag $1" >&2; exit 2;;
  esac; done
  [ -n "$ISSUE$SESSION$TASK$SCOPE" ] && [ -n "$ISSUE" ] && [ -n "$SESSION" ] && [ -n "$TASK" ] && [ -n "$SCOPE" ] \
    || { echo "Usage: collab.sh claim --issue N --session S --task T --scope F [--shared R] [--status ST] [--next X] [--dry-run]" >&2; exit 2; }
  BASE="$(git rev-parse HEAD | cut -c1-7)"; BRANCH="$(git branch --show-current)"
  BODY="Session: $SESSION
Task: $TASK
Base: $BASE
Branch/worktree: $BRANCH ($(pwd))
Scope: $SCOPE
Shared resources: $SHARED
Status: $STATUS
Updated: $(date -u +%FT%TZ)
Next: $NEXT"
  if [ "$DRY" = 1 ]; then printf '%s\n' "$BODY"; else gh issue comment "$ISSUE" --body "$BODY"; fi
}

do_release() {
  ISSUE=""; SESSION=""; NOTE="scope released; worktree can be removed"
  while [ $# -gt 0 ]; do case "$1" in
    --issue) ISSUE="$2"; shift 2;;
    --session) SESSION="$2"; shift 2;;
    --note) NOTE="$2"; shift 2;;
    *) echo "ERROR: unknown flag $1" >&2; exit 2;;
  esac; done
  [ -n "$ISSUE" ] && [ -n "$SESSION" ] || { echo "Usage: collab.sh release --issue N --session S [--note NOTE]" >&2; exit 2; }
  gh issue comment "$ISSUE" --body "Session: $SESSION
Status: complete — $NOTE
Updated: $(date -u +%FT%TZ)"
}

case "$cmd" in
  status) do_status;;
  board) do_board;;
  start) shift; do_start "$@";;
  claim) shift; do_claim "$@";;
  release) shift; do_release "$@";;
  *) echo "Usage: collab.sh {status|board|start|claim|release}" >&2; exit 2;;
esac
