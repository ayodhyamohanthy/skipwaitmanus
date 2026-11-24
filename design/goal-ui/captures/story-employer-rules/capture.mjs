import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
};

function createStaticServer(publicDir) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ result: { data: { json: null } } }));
      return;
    }

    let filePath = path.join(publicDir, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    if (!fs.existsSync(filePath)) {
      // Check for <pathname>.html (for prerendered routes like /how-employees-refer-candidates)
      const htmlPath = path.join(publicDir, `${pathname.replace(/^\//, "")}.html`);
      if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
        filePath = htmlPath;
      } else {
        // Fallback to index.html for SPA routes
        filePath = path.join(publicDir, "index.html");
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIMES[ext] || "application/octet-stream";

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}

async function captureState(publicDir, prefix) {
  const server = createStaticServer(publicDir);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  const viewports = [
    { name: "1280", width: 1280, height: 900, dpr: 1 },
    { name: "390", width: 390, height: 844, dpr: 2 },
  ];

  try {
    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
        isMobile: vp.width < 600,
        hasTouch: vp.width < 600,
      });
      const page = await context.newPage();

      // 1. Capture /how-employees-refer-candidates
      await page.goto(`${baseUrl}/how-employees-refer-candidates`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);

      const guideOut = path.join(__dirname, `${prefix}-guide-${vp.name}.png`);
      await page.screenshot({ path: guideOut, fullPage: true });
      console.log(`Captured: ${guideOut}`);

      // 2. Capture /safety
      await page.goto(`${baseUrl}/safety`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);

      // In after state, click to open the employer-rules disclosure row if present
      const employerBtn = page.getByRole("button", { name: "Does this fit my employer's referral rules?" });
      if (await employerBtn.isVisible().catch(() => false)) {
        await employerBtn.click();
        await page.waitForTimeout(300);
      } else {
        // In before state, open work-email verification question if present
        const verifyBtn = page.getByRole("button", { name: "What does work-email verification mean?" });
        if (await verifyBtn.isVisible().catch(() => false)) {
          await verifyBtn.click();
          await page.waitForTimeout(300);
        }
      }

      const safetyOut = path.join(__dirname, `${prefix}-safety-${vp.name}.png`);
      await page.screenshot({ path: safetyOut, fullPage: true });
      console.log(`Captured: ${safetyOut}`);

      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  const beforeDir = path.resolve(__dirname, "../../../../../../skipwaitmanus/dist/public");
  const afterDir = path.resolve(__dirname, "../../../../dist/public");

  console.log("Capturing BEFORE from:", beforeDir);
  await captureState(beforeDir, "before");

  console.log("Capturing AFTER from:", afterDir);
  await captureState(afterDir, "after");

  console.log("All captures completed successfully.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
