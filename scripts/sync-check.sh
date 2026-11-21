#!/bin/zsh
# skipwait sync guard: keeps the Mac clone and GitHub in lockstep after every push.
#
# Enforces:
#   1. No uncommitted work stranded on the Mac (untracked noise excepted).
#   2. The Mac is not missing commits that exist on origin/main.
#   3. Best-effort: deployed web bundle was built from current main.
#
# Exit codes: 0 = in sync, 1 = drift (message explains the fix).
set -uo pipefail

cd "$(dirname "$0")/.."
DRIFT=0

DIRTY=$(git status --porcelain | grep -v "structure.txt" || true)
if [ -n "$DIRTY" ]; then
  echo "WARN Uncommitted changes on the Mac:"
  echo "$DIRTY"
  echo "     -> git add -A && git commit -m 'sync' && git push"
  DRIFT=1
fi

git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  if git merge-base --is-ancestor "$REMOTE" "$LOCAL" 2>/dev/null; then
    echo "INFO Local is ahead of origin/main — push pending (git push origin main)."
  else
    echo "WARN GitHub main has commits missing on the Mac:"
    git log --oneline "$LOCAL..$REMOTE" | head -5
    echo "     -> git pull --rebase origin main"
    DRIFT=1
  fi
fi

if command -v curl >/dev/null 2>&1; then
  REMOTE_HASH=$(/usr/bin/curl -s --max-time 15 "https://skipwait.me" | /usr/bin/grep -oE 'index-[A-Za-z0-9_-]+\.js' | /usr/bin/head -1)
  if [ -f dist/public/index.html ]; then
    LOCAL_HASH=$(/usr/bin/grep -oE 'index-[A-Za-z0-9_-]+\.js' dist/public/index.html | /usr/bin/head -1)
    if [ -n "$REMOTE_HASH" ] && [ -n "$LOCAL_HASH" ] && [ "$REMOTE_HASH" != "$LOCAL_HASH" ]; then
      echo "INFO Deployed web bundle ($REMOTE_HASH) != last local build ($LOCAL_HASH). Run: pnpm build"
    fi
  fi
fi

if [ "$DRIFT" -eq 0 ]; then
  echo "OK Mac <-> GitHub in sync (local $(git rev-parse --short HEAD) == origin/main)"
fi
exit $DRIFT
