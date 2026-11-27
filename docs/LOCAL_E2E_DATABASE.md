# Local e2e database (D-412 (5))

A missing MySQL is never a reason to report a task blocked (D-407 (1)(b)). This builds the exact schema CI's `e2e journeys` job uses, in about three minutes, with no account, secret or cost.

## Steps (Linux cloud session or any machine with Docker)
```bash
# 1. Docker: start the daemon if `docker info` fails (cloud sessions ship the binary but not a running daemon).
(dockerd > /tmp/dockerd.log 2>&1 &) ; sleep 6 ; docker info >/dev/null && echo docker-ok

# 2. MySQL 8, same image and password as .github/workflows/ci.yml.
docker run -d --name e2e-mysql -e MYSQL_ROOT_PASSWORD=e2e -e MYSQL_DATABASE=skipwait -p 3306:3306 mysql:8.0
until docker exec e2e-mysql mysqladmin ping -h 127.0.0.1 -pe2e >/dev/null 2>&1; do sleep 2; done

# 3. A `mysql` client on PATH for scripts/apply-deploy-migrations.sh (it reads MYSQL_PWD).
mkdir -p ~/.local/bin
printf '#!/bin/sh\nexec docker exec -i -e MYSQL_PWD="$MYSQL_PWD" e2e-mysql mysql "$@"\n' > ~/.local/bin/mysql
chmod +x ~/.local/bin/mysql ; export PATH="$HOME/.local/bin:$PATH"

# 4. Base schema + every deploy migration twice + drift check, exactly as CI.
export E2E_DATABASE_URL=mysql://root:e2e@127.0.0.1:3306/skipwait
MIGRATION_BASE_SHA=$(git rev-parse origin/main) node scripts/e2e-server.mjs prepare
```
Expect `Deploy migrations, run 2: 0 applied`, `no drift` and `database ready`.

## Running journeys
- Database-only journeys (they import server code and talk to MySQL, such as `e2e/reconfirm-money.e2e.ts` and `e2e/review-email-retry.e2e.ts`) run without the web server: write a throwaway config next to `e2e/playwright.config.ts` with the same `testDir: "."` and a `testMatch` naming the files, and no `webServer`, then `pnpm exec playwright test -c <that file>`. Delete it afterwards.
- Browser journeys need `pnpm build` first and use `pnpm e2e`. In a cloud session, Playwright's bundled browser may be a different build; CI is the source of truth for those.

## Rules for journeys that touch the database
- Use the local e2e database only, through `server/db.ts` (`process.env.DATABASE_URL = E2E_DATABASE_URL`). `getDb()` caches one connection per worker, so a journey that points it at a second database leaks into every later journey in that worker.
- Seed your own rows under a unique suffix and fictional domain, and act only on your own ids: never run a global sweep that would touch other journeys' rows.

## Clean up
`docker rm -f e2e-mysql`
