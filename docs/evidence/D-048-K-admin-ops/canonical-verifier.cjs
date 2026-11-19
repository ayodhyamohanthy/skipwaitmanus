// Read-only canonical acceptance; run only after the protected retirement merge.
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const load = createRequire(resolve(process.argv[2], 'package.json'));
const { chromium } = load('playwright');
const expected = process.argv[3];
const output = resolve(process.argv[4]);
assert.match(expected ?? '', /^[a-f0-9]{40}$/);
mkdirSync(output, { recursive: true });
const cases = [
  ['activity', 'Diagnose the referral journey.'],
  ['flow-health', 'See where the referral flow needs work.'],
  ['schema', 'Reconcile the database schema.'],
  ['partners', 'Curate partner slots and sponsored roles.'],
  ['smoke', 'Not found'],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const receipt = {
    expectedWebSha: expected,
    origin: 'https://skipwait.me',
    scope: 'Clean signed-out UI only; no admin authentication or live business mutation.',
    startedAt: new Date().toISOString(),
    cases: [],
  };
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        deviceScaleFactor: width === 390 ? 2 : 1,
        serviceWorkers: 'block',
        reducedMotion: 'reduce',
      });
      try {
        for (const [name, heading] of cases) {
          const page = await context.newPage();
          const errors = [];
           const privateReads = [];
           const blockedWrites = [];
           const blockedSecurityReports = [];
          const reads = [];
          const statusResponses = [];
          page.on('pageerror', error => errors.push(error.message));
          page.on('response', response => {
            const url = new URL(response.url());
            if (url.pathname === '/api/admin/smoke/status') statusResponses.push(response.status());
          });
          await page.route('**/*', async route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== 'https://skipwait.me') {
              if (request.method() === 'GET' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
                await route.continue();
              } else {
                await route.fulfill({ status: 204, body: '' });
              }
              return;
            }
             if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
               // Report-only security telemetry is observed separately, never sent.
               // Every business write and every private API read still fails below.
               if (request.method() === 'POST' && url.pathname === '/api/csp-report') {
                 assert.equal(request.headers()['content-type'], 'application/csp-report');
                 const report = request.postDataJSON()['csp-report'];
                 assert.equal(report?.disposition, 'report');
                 assert.equal(new URL(report['document-uri']).pathname, `/admin/${name}`);
                 const directive = report['effective-directive'];
                 const blockedUri = report['blocked-uri'];
                 const target = blockedUri === 'eval' ? null : new URL(blockedUri);
                 const source = directive === 'script-src' && blockedUri === 'eval' ? 'eval'
                   : directive === 'script-src-elem' && target?.hostname === 'static.cloudflareinsights.com' ? 'cloudflare-beacon'
                   : directive === 'connect-src' && /\.ingest\.[a-z]+\.sentry\.io$/.test(target?.hostname ?? '') ? 'sentry-ingest'
                   : null;
                 assert.ok(source, 'Unexpected CSP report requires investigation');
                 blockedSecurityReports.push({ path: url.pathname, method: request.method(), directive, source, disposition: report.disposition });
                 await route.abort();
                 return;
               }
               blockedWrites.push({ path: url.pathname, method: request.method() });
              await route.abort();
              return;
            }
            if (url.pathname.startsWith('/api/')) {
              reads.push({ path: url.pathname, method: request.method() });
              const anonymousSession = url.pathname === '/api/trpc/auth.me';
              const disabledSmoke = url.pathname === '/api/admin/smoke/status';
              if (!anonymousSession && !disabledSmoke) {
                privateReads.push(url.pathname);
                await route.abort();
                return;
              }
            }
            await route.continue();
          });
          try {
            const smokeReply = name === 'smoke'
              ? page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/smoke/status')
              : null;
            const response = await page.goto(`https://skipwait.me/admin/${name}`, { waitUntil: 'domcontentloaded' });
            assert.equal(response.status(), 200);
            await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
            if (name === 'smoke') {
              await smokeReply;
              assert.deepEqual(statusResponses, [404]);
              assert.equal(await page.getByRole('button', { name: /Enter as|Reset|Exit the fixture/ }).count(), 0);
              assert.match(await page.locator('meta[name="robots"]').last().getAttribute('content'), /noindex/);
            } else {
              assert.equal(await page.locator('[data-goal-page="admin"]').count(), 1);
              assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).count(), 1);
            }
            await page.evaluate(() => document.fonts.ready);
            const metrics = await page.evaluate(() => ({
              sha: document.querySelector('meta[name="git-commit"]')?.content,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
              documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
              h1Count: document.querySelectorAll('h1').length,
            }));
            assert.equal(metrics.sha, expected);
            assert.equal(metrics.viewportWidth, width);
            assert.equal(metrics.viewportHeight, width === 390 ? 844 : 900);
            assert.equal(metrics.h1Count, 1);
            assert.ok(metrics.documentWidth <= width, JSON.stringify(metrics));
            assert.deepEqual(errors, []);
            assert.deepEqual(privateReads, []);
            assert.deepEqual(blockedWrites, []);
            const image = `${name}-${width}.png`;
            const png = await page.screenshot({ path: resolve(output, image), fullPage: true, animations: 'disabled' });
            const pngWidth = png.readUInt32BE(16);
            assert.equal(pngWidth, width * (width === 390 ? 2 : 1));
             receipt.cases.push({ name, heading, width, documentStatus: response.status(), metrics, reads, statusResponses, errors, privateReads, blockedWrites, blockedSecurityReports, image, pngWidth });
            writeFileSync(resolve(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
            console.log(JSON.stringify(receipt.cases.at(-1)));
          } finally {
            await page.close();
          }
        }
      } finally {
        await context.close();
      }
    }
    receipt.finishedAt = new Date().toISOString();
    receipt.success = receipt.cases.length === cases.length * 2;
    writeFileSync(resolve(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
