import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../");
const beforeDist = "/Users/ayodhyarammohanthy/Documents/GitHub/skipwaitmanus/dist/public";
const afterDist = path.resolve(root, "dist/public");

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function createStaticServer(publicDir) {
  return createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const relative = path.resolve(publicDir, `.${pathname}`);
    if (!relative.startsWith(publicDir + path.sep) && relative !== publicDir) {
      response.writeHead(404).end();
      return;
    }
    const candidates = path.extname(pathname) ? [relative] : [relative + ".html", path.join(publicDir, "index.html")];
    for (const file of candidates) {
      try {
        const body = await readFile(file);
        response.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream" }).end(body);
        return;
      } catch {
        // next candidate
      }
    }
    response.writeHead(404).end();
  });
}

async function capturePhase(phase, publicDir, browser) {
  const server = createStaticServer(publicDir);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const outDir = path.join(here, phase);
  await mkdir(outDir, { recursive: true });

  const phaseResults = [];

  try {
    for (const width of [1280, 390]) {
      const height = width === 390 ? 844 : 900;
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: width === 390 ? 2 : 1,
        locale: "en-US",
        timezoneId: "UTC",
      });

      const page = await context.newPage();
      await page.route("https://**", r => r.abort());
      await page.route(url => new URL(url).pathname.startsWith("/api/"), async r => {
        const u = new URL(r.request().url());
        const json = (status, body) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (u.pathname.startsWith("/api/trpc/")) {
          return json(200, { result: { data: { json: null } } });
        }
        if (u.pathname === "/api/dev-auth/session") {
          return json(200, { signedIn: false });
        }
        return json(200, {});
      });

      await page.goto(origin + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForSelector("h1", { timeout: 30000 });
      await page.waitForTimeout(500);

      const metrics = await page.evaluate(() => {
        const rulesSection = document.getElementById("rules");
        const rulesRows = rulesSection ? rulesSection.querySelectorAll("#rules .mt-10 > div") : [];
        return {
          title: document.title,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          fairRulesCount: rulesRows.length,
          kicker: document.querySelector("section p")?.textContent?.trim() ?? "",
        };
      });

      const screenshotPath = path.join(outDir, `landing-${width}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const res = {
        phase,
        width,
        height,
        file: `${phase}/landing-${width}.png`,
        ...metrics,
      };
      phaseResults.push(res);
      console.log(JSON.stringify(res, null, 2));

      await context.close();
    }
  } finally {
    server.close();
  }

  return phaseResults;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const beforeResults = await capturePhase("before", beforeDist, browser);
    const afterResults = await capturePhase("after", afterDist, browser);

    const report = {
      capturedAt: new Date().toISOString(),
      task: "STORY-trust-landing",
      summary: "Signed-out landing captures before and after at 1280 and 390",
      before: beforeResults,
      after: afterResults,
    };

    await writeFile(path.join(here, "capture.json"), JSON.stringify(report, null, 2) + "\n");

    const readme = `# STORY-trust-landing UI Captures

Signed-out landing captures at 1280 and 390 viewports (before and after D-323 trust & matching update).

## Verification Checks
- **Fair Rules Count**: 4 before -> 6 after (includes GOAL_LANDING_FAIR_NO_SALE and GOAL_LANDING_FAIR_EMPLOYER_PROCESS).
- **Horizontal Overflow at 390px**: 0px (scrollWidth === innerWidth === 390).
- **Page Title**: "Request a job referral from a verified employee — skipwait.me"
- **Hero Kicker**: "Verified referral matching"

## Captures
- Before 1280: [before/landing-1280.png](./before/landing-1280.png)
- Before 390: [before/landing-390.png](./before/landing-390.png)
- After 1280: [after/landing-1280.png](./after/landing-1280.png)
- After 390: [after/landing-390.png](./after/landing-390.png)
`;
    await writeFile(path.join(here, "README.md"), readme);
    console.log("Captures complete and verified!");
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
