import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const [scratch, beforeSha, afterSha] = process.argv.slice(2);
const cases = [
  { id: 'assistants', heading: 'Let your assistant prepare your next referral', signedIn: 'Connected assistants', guest: 'Sign in to manage assistants' },
  { id: 'approve', heading: 'Decide what your assistant can do', signedIn: 'Review your referral to fictional.invalid', guest: 'Sign in to review approvals' },
  { id: 'connect-assistant', heading: 'Choose what your assistant may do', signedIn: 'Connect ChatGPT to skipwait.me', guest: 'Sign in to connect ChatGPT' },
  { id: 'agents', heading: 'Let your agent prepare a better referral', signedIn: 'Give one agent only the access it needs', guest: 'Sign in to let your agent prepare referrals. It cannot send or buy referrals.' },
];
const fixedTime = '2026-10-08T04:30:00.000Z';
const account = { id: 41, name: 'Synthetic Seeker', email: 'fixture@example.invalid', openId: 'fixture', loginMethod: 'fixture', role: 'user', createdAt: fixedTime, updatedAt: fixedTime, lastSignedIn: fixedTime };
const fixtures = {
  '/api/company-referrals/access': { verifiedCompanyAccess: false },
  '/api/account/preferences': { preferences: { language: 'en', timeZone: 'UTC', dateFormat: 'mdy' } },
  '/api/account/signup-language': { ok: true },
  '/api/notifications': { notifications: [] },
  '/api/credits/summary': { summary: { totalAvailable: 12 } },
  '/api/assistants/access': { hasAccess: true, plan: 'land_focus' },
  '/api/assistants/connections': { connections: [{ id: 3, provider: 'chatgpt', appName: 'ChatGPT', scopes: ['read', 'draft'], status: 'connected', lastUsedAt: null, connectedAt: '2026-10-06T04:30:00.000Z' }] },
  '/api/assistants/tokens': { tokens: [] },
  '/api/assistants/activity': { activity: [] },
  '/api/assistants/approvals': { approvals: [{ id: 5, kind: 'ask_send', status: 'pending', provider: 'custom', companyDomain: 'fictional.invalid', role: 'Fictional role', note: 'Confirmed skill.', creditCount: 1, slotCount: 2, cost: { level: 1, cost: 1 }, createdAt: fixedTime, expiresAt: '2026-10-09T04:30:00.000Z' }] },
  '/api/seeker/agents': { agents: [], paused: false },
};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff' };

async function serve(directory) {
  const root = resolve(directory);
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      if (pathname.startsWith('/api/')) { res.writeHead(502).end(); return; }
      const file = resolve(root, `.${pathname}`);
      if (!file.startsWith(root + sep)) { res.writeHead(404).end(); return; }
      const present = await stat(file).catch(() => null);
      const target = present?.isFile() ? file : extname(pathname) ? null : join(root, 'index.html');
      if (!target) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': mime[extname(target)] ?? 'application/octet-stream' });
      createReadStream(target).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(500).end(); }
  });
  await new Promise((resolveReady, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolveReady));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

const captureDir = join(scratch, 'captures');
await mkdir(captureDir, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const [phase, sha] of [['before', beforeSha], ['after', afterSha]]) {
    const server = await serve(join(scratch, phase));
    try {
      for (const sample of cases) for (const signedIn of [false, true]) for (const width of [1280, 390]) {
        const height = width === 390 ? 844 : 900;
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 2 : 1, isMobile: width === 390, hasTouch: width === 390, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
        try {
          const page = await context.newPage();
          const requests = [];
          const unexpected = [];
          const errors = [];
          await page.clock.setFixedTime(new Date(fixedTime));
          await context.addInitScript(() => localStorage.setItem('skipwait:cookie-consent', 'essential'));
          page.on('pageerror', error => errors.push(error.message));
          page.on('console', msg => {
            if (msg.type() === 'error' && !msg.text().startsWith('[auth] VITE_WORKOS_CLIENT_ID is not set')) errors.push(msg.text());
          });
          await context.route('**/*', async interception => {
            const req = interception.request();
            const url = new URL(req.url());
            if (url.origin !== server.origin) return interception.abort();
            if (!url.pathname.startsWith('/api/')) return interception.continue();
            requests.push(`${req.method()} ${url.pathname}`);
            if (url.pathname.startsWith('/api/trpc/')) {
              const values = url.pathname.slice('/api/trpc/'.length).split(',').map(procedure => {
                if (procedure !== 'auth.me') unexpected.push(`tRPC ${procedure}`);
                return { result: { data: { json: procedure === 'auth.me' && signedIn ? account : null } } };
              });
              return interception.fulfill({ json: url.searchParams.has('batch') ? values : values[0] });
            }
            if (url.pathname === '/api/dev-auth/session') return interception.fulfill({ json: signedIn ? { signedIn, account } : { signedIn } });
            if (!(url.pathname in fixtures) || (req.method() !== 'GET' && !(url.pathname === '/api/account/signup-language' && req.method() === 'POST'))) {
              unexpected.push(`${req.method()} ${url.pathname}`);
              return interception.fulfill({ status: 404, json: { error: 'No route fixture' } });
            }
            return interception.fulfill({ json: fixtures[url.pathname] });
          });
          const result = await page.goto(`${server.origin}/${sample.id}`, { waitUntil: 'networkidle', timeout: 25000 });
          assert.equal(result.status(), 200);
          assert.equal(await page.locator('meta[name="git-commit"]').getAttribute('content'), sha);
          const main = page.locator(`main[data-skipwait-screen="${sample.id}"].g-scope`);
          await main.getByRole('heading', { name: sample.heading, level: 1, exact: true }).waitFor({ timeout: 6000 });
          await main.getByText(signedIn ? sample.signedIn : sample.guest, { exact: true }).waitFor({ timeout: 6000 });
          await page.evaluate(() => document.fonts.ready);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert.equal(overflow, 0, `${phase} /${sample.id} at ${width}px`);
          assert.deepEqual(unexpected, [], `unmatched calls on ${phase} /${sample.id}`);
          assert.deepEqual(errors, [], `browser errors on ${phase} /${sample.id}`);
          if (!signedIn) assert.ok(!requests.some(request => /\/api\/(assistants|seeker\/agents|oauth)\b/.test(request)), 'No signed-out assistant/agent requests');
          const name = `${sample.id}-${signedIn ? 'seeker' : 'guest'}-${width}.png`;
          const path = join(captureDir, `${phase}-${name}`);
          const image = await page.screenshot({ path, fullPage: true, animations: 'disabled' });
          const hash = createHash('sha256').update(image).digest('hex');
          results.push({ phase, route: `/${sample.id}`, signedIn, width, height, name, hash, overflow, requests: [...requests].sort() });
          console.log(`${phase} ${name}: exact build, no overflow, no browser errors`);
        } finally { await context.close(); }
      }
    } finally { server.close(); }
  }
} finally { await browser.close(); }
const comparisons = [];
for (const after of results.filter(item => item.phase === 'after')) {
  const before = results.find(item => item.phase === 'before' && item.name === after.name);
  assert.deepEqual(before.requests, after.requests, `request parity for ${after.name}`);
  const [a, b] = await Promise.all(['before', 'after'].map(phase => sharp(join(captureDir, `${phase}-${after.name}`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  assert.deepEqual({ width: a.info.width, height: a.info.height }, { width: b.info.width, height: b.info.height }, `dimensions for ${after.name}`);
  let pixels = 0;
  for (let i = 0; i < a.data.length; i += 4) if (a.data.readUInt32LE(i) !== b.data.readUInt32LE(i)) pixels++;
  comparisons.push({ route: after.route, signedIn: after.signedIn, width: after.width, height: after.height, file: `after-${after.name}`, beforeSha256: before.hash, afterSha256: after.hash, differentPixels: pixels, sameRequestSequenceMultiset: true });
}
await writeFile(join(captureDir, 'parity.json'), JSON.stringify({ before: beforeSha, after: afterSha, synthetic: true, clientBuild: 'Vite production, no surface override or provider credentials', browser: 'Clean Chromium, fixed clock UTC, no service worker; all API replies fixture-only', noHorizontalOverflow: true, unmatchedApiCalls: 0, browserErrors: 0, comparisons }, null, 2) + '\n');
const differences = comparisons.filter(item => item.differentPixels !== 0);
console.log(JSON.stringify({ pairs: comparisons.length, differences, captures: captureDir }));
