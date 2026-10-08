import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { VitePWA } from "vite-plugin-pwa";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

const productionPlugins = [react(), tailwindcss(), gitCommitMetaPlugin(), swBuildStampPlugin()];
const developmentPlugins = [
  ...productionPlugins,
  jsxLocPlugin(),
  vitePluginManusRuntime(),
  vitePluginManusDebugCollector(),
];

/** Bakes the deployed commit into the git-commit meta tag (dev: live HEAD). */
function gitCommitMetaPlugin(): Plugin {
  let sha = "dev";
  try {
    sha = fs.readFileSync(path.join(PROJECT_ROOT, "commit-sha.txt"), "utf8").trim() || sha;
  } catch {
    try {
      sha = execSync("git rev-parse --short HEAD", { cwd: PROJECT_ROOT }).toString().trim() || sha;
    } catch { /* detached source tree; keep dev */ }
  }
  return {
    name: "skipwait-git-commit-meta",
    transformIndexHtml(html) {
      if (html.includes("%VITE_GIT_COMMIT_SHA%")) return html.replaceAll("%VITE_GIT_COMMIT_SHA%", sha);
      return html;
    },
  };
}

/** Stamps the worker's cache name with the build so every deploy gets a fresh shell cache and an update prompt. */
function swBuildStampPlugin(): Plugin {
  let stamp = String(Date.now());
  try {
    stamp = (fs.readFileSync(path.join(PROJECT_ROOT, "commit-sha.txt"), "utf8").trim() || execSync("git rev-parse --short HEAD", { cwd: PROJECT_ROOT }).toString().trim() || stamp).slice(0, 12);
  } catch {
    try { stamp = execSync("git rev-parse --short HEAD", { cwd: PROJECT_ROOT }).toString().trim() || stamp; } catch { /* keep timestamp */ }
  }
  return {
    name: "skipwait-sw-build-stamp",
    apply: "build",
    closeBundle() {
      const file = path.resolve(PROJECT_ROOT, "dist/public/sw.js");
      if (!fs.existsSync(file)) return;
      // Precache what the offline screen needs to render: the entry assets plus the lazy
      // Offline chunk and the chunks it imports, so a first visit followed by no signal still works.
      const root = path.resolve(PROJECT_ROOT, "dist/public");
      const assetsDir = path.join(root, "assets");
      const html = fs.existsSync(path.join(root, "index.html")) ? fs.readFileSync(path.join(root, "index.html"), "utf8") : "";
      const urls = new Set<string>(Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g), m => m[1]));
      const queue = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter(f => /^Offline-.*\.js$/.test(f)) : [];
      for (const url of Array.from(urls)) if (url.endsWith(".js")) queue.push(path.basename(url));
      const seen = new Set<string>();
      while (queue.length) {
        const name = queue.pop()!;
        if (seen.has(name) || !fs.existsSync(path.join(assetsDir, name))) continue;
        seen.add(name);
        urls.add(`/assets/${name}`);
        const code = fs.readFileSync(path.join(assetsDir, name), "utf8");
        for (const m of Array.from(code.matchAll(/\bfrom\s*["']\.\/([^"']+\.js)["']/g))) queue.push(m[1]);
      }
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replaceAll("__SW_BUILD__", stamp).replace("[]/*__SW_ASSETS__*/", JSON.stringify(Array.from(urls))));
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: mode === "development" ? developmentPlugins : productionPlugins,
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(import.meta.dirname, "client", "src") },
      { find: "@shared", replacement: path.resolve(import.meta.dirname, "shared") },
      { find: "@assets", replacement: path.resolve(import.meta.dirname, "attached_assets") },
    ],
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
}));
