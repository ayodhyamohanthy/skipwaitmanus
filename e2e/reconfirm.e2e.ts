// Synthetic UI acceptance only. The existing real-server/money journeys remain unchanged.
import { spawn, type ChildProcess } from "node:child_process";
import { test, expect } from "playwright/test";
import { z } from "zod";

const readySchema = z.strictObject({ url: z.url().refine(value => new URL(value).hostname === "127.0.0.1") });
let fixture: ChildProcess | undefined;
let baseUrl: string;

test.beforeAll(async () => {
  fixture = spawn(process.execPath, ["docs/evidence/D-174-reconfirm/capture.mjs", "--serve"], { stdio: ["ignore", "pipe", "pipe"] });
  const captureProcess = fixture;
  baseUrl = await new Promise<string>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    captureProcess.stderr?.on("data", chunk => { stderr += String(chunk); });
    captureProcess.stdout?.on("data", chunk => {
      stdout += String(chunk);
      const end = stdout.indexOf("\n");
      if (end < 0) return;
      try { resolve(readySchema.parse(JSON.parse(stdout.slice(0, end))).url); }
      catch { reject(new Error("Synthetic capture server returned invalid readiness metadata")); }
    });
    captureProcess.once("error", reject);
    captureProcess.once("exit", code => reject(new Error(`Synthetic capture server exited ${code}: ${stderr.slice(0, 1000)}`)));
  });
});

test.afterAll(() => { fixture?.kill("SIGTERM"); });

test("old-request consent is readable at 1280/390 and recovers after a failed confirmation", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`${baseUrl}/requests`);
    const confirm = page.getByRole("button", { name: "Confirm", exact: true });
    await expect(confirm).toBeVisible();
    await expect(page.getByText("Still want this referral request sent? Confirm to send it.")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    if (width === 390) expect((await confirm.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    for (const state of ["awaiting", "error"]) {
      if (state === "error") {
        await confirm.click();
        await expect(page.getByRole("alert")).toContainText("We couldn’t confirm this referral request.");
        await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
      }
      await confirm.scrollIntoViewIfNeeded();
      // Visibility alone does not detect an opaque fixed navigation overlay.
      await expect.poll(() => confirm.evaluate(element => {
        const box = element.getBoundingClientRect();
        return [box.top + 2, box.top + box.height / 2, box.bottom - 2].every(y => {
          const hit = document.elementFromPoint(box.left + box.width / 2, y);
          return hit !== null && element.contains(hit);
        });
      })).toBe(true);
      if (state === "error") await expect.poll(() => page.getByRole("alert").evaluate(element => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return hit !== null && element.contains(hit);
      })).toBe(true);
      const path = info.outputPath(`${state}-${width}.png`);
      await page.screenshot({ path, fullPage: width !== 390 });
      await info.attach(`${state}-${width}`, { path, contentType: "image/png" });
    }
    await confirm.click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Example/ })).toHaveAttribute("href", "/conversation/501");
  }
  expect(errors).toEqual([]);
});
