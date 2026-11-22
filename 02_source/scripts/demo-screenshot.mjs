/**
 * Demo screenshot + runtime offline proof — P025 GuidancePulse, T008.
 *
 * Run: `npm run demo:screenshot` (after `npm run build` and
 * `npm run demo:report`).
 *
 * Serves `dist/` and `artifacts/demo/timeline.html` on 127.0.0.1,
 * drives the dashboard in headless Chromium (playwright-core with the
 * cached browser binary — no download), and writes:
 *
 *   artifacts/screenshots/T008_dashboard.png          (full dashboard)
 *   artifacts/screenshots/T008_dashboard_filtered.png (guidance filter
 *                                                       + detail open)
 *   artifacts/screenshots/T008_report.png             (static report)
 *   artifacts/demo/T008_demo.webm                     (short interaction
 *                                                       recording)
 *   artifacts/demo/T008_demo-requests.json             (every request URL
 *                                                       the pages made)
 *
 * The script FAILS (exit 1) when any request leaves 127.0.0.1, when a
 * page errors, or when an expected dashboard element is missing — so
 * the screenshots are evidence, not decoration.
 */

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, "dist");
const REPORT_FILE = join(ROOT, "artifacts", "demo", "timeline.html");
const SHOT_DIR = join(ROOT, "artifacts", "screenshots");
const DEMO_DIR = join(ROOT, "artifacts", "demo");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

function findChromium() {
  const cache = join(process.env.HOME ?? "", ".cache", "ms-playwright");
  if (!existsSync(cache)) return null;
  for (const name of ["chromium-1254", "chromium-1248"]) {
    const exe = join(cache, name, "chrome-linux64", "chrome");
    if (existsSync(exe)) return exe;
    const shell = join(cache, `${name.replace("chromium", "chromium_headless_shell")}`, "chrome-headless-shell-linux64", "chrome-headless-shell");
    if (existsSync(shell)) return shell;
  }
  return null;
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file;
  if (urlPath === "/report") file = REPORT_FILE;
  else {
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    file = join(DIST, rel);
    if (!file.startsWith(DIST)) file = join(DIST, "index.html");
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const executablePath = findChromium();
if (executablePath === null) {
  console.error("no cached Chromium binary found under ~/.cache/ms-playwright");
  server.close();
  process.exit(1);
}

mkdirSync(SHOT_DIR, { recursive: true });
mkdirSync(DEMO_DIR, { recursive: true });

const requestedUrls = [];
const pageErrors = [];
let browser;
try {
  browser = await chromium.launch({ executablePath });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: DEMO_DIR, size: { width: 1280, height: 900 } },
  });
  const page = await context.newPage();
  page.on("request", (request) => requestedUrls.push(request.url()));
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="session-bar"]', { timeout: 10000 });
  await page.waitForSelector('[data-testid="guidance-release-checklist"]', { timeout: 10000 });
  await page.screenshot({ path: join(SHOT_DIR, "T008_dashboard.png"), fullPage: true });

  // Interact: filter to one guidance, open a denied write's detail.
  await page.click('[data-testid="guidance-release-checklist"]');
  await page.waitForSelector('[data-testid="entry-e7"]', { timeout: 10000 });
  await page.click('[data-testid="entry-e7"]');
  await page.waitForSelector('[data-testid="detail-decision"]', { timeout: 10000 });
  const decision = await page.textContent('[data-testid="detail-decision"]');
  if (decision === null || !decision.includes("DENY")) {
    throw new Error(`detail panel did not show DENY (got: ${decision ?? "null"})`);
  }
  // The Compact event (e6) is scope-wide, so it is hidden by the
  // guidance filter; reopen the full timeline to show its reason.
  await page.click("text=All events");
  await page.waitForSelector('[data-testid="entry-e6"]', { timeout: 10000 });
  await page.click('[data-testid="entry-e6"]');
  await page.waitForSelector('[data-testid="detail-reason"]', { timeout: 10000 });
  const reason = await page.textContent('[data-testid="detail-reason"]');
  if (reason === null || !reason.includes("CONTEXT_COMPACTION")) {
    throw new Error(`detail panel did not show CONTEXT_COMPACTION (got: ${reason ?? "null"})`);
  }
  await page.screenshot({ path: join(SHOT_DIR, "T008_dashboard_filtered.png"), fullPage: true });

  // Static report page.
  await page.goto(`${base}/report`, { waitUntil: "networkidle" });
  await page.waitForSelector(".gp-timeline", { timeout: 10000 });
  await page.screenshot({ path: join(SHOT_DIR, "T008_report.png"), fullPage: true });

  const video = page.video();
  await context.close();
  const videoPath = video === null ? null : await video.path();
  if (videoPath !== null) {
    const dest = join(DEMO_DIR, "T008_demo.webm");
    const { renameSync } = await import("node:fs");
    renameSync(videoPath, dest);
    console.log(`video: ${dest}`);
  }
} finally {
  if (browser !== undefined) await browser.close();
  server.close();
}

writeFileSync(
  join(DEMO_DIR, "T008_demo-requests.json"),
  `${JSON.stringify({ base, requests: requestedUrls }, null, 2)}\n`,
);

const external = requestedUrls.filter((url) => !url.startsWith("http://127.0.0.1"));
if (external.length > 0) {
  console.error(`external requests made: ${external.join(", ")}`);
  process.exit(1);
}
if (pageErrors.length > 0) {
  console.error(`page errors: ${pageErrors.join(" | ")}`);
  process.exit(1);
}
console.log(`requests: ${requestedUrls.length}, all to 127.0.0.1 — offline OK`);
console.log(`screenshots: ${SHOT_DIR}/T008_dashboard.png, T008_dashboard_filtered.png, T008_report.png`);
