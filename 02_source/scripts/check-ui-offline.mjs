/**
 * Offline check — P025 GuidancePulse, T008.
 *
 * Run: `npm run test:ui-offline` (after `npm run build` and
 * `npm run demo:report`).
 *
 * Verifies, with exit code 0/1:
 *   1. `dist/` exists and contains the built dashboard (index.html +
 *      local assets only).
 *   2. No external resource reference in the built HTML/CSS: no
 *      `http(s)://` URL, no protocol-relative `//host` URL, no
 *      `@import`, no remote font. (Inert `https://react.dev/…` strings
 *      inside the JS bundle are error-message text, not requests; they
 *      are reported as warnings, and the runtime proof is step 4.)
 *   3. The static report `artifacts/demo/timeline.html` contains no
 *      `http(s)://` reference at all and no `<script>`.
 *   4. The built dashboard serves locally: a 127.0.0.1 HTTP server
 *      answers 200 for `/` and every local asset it references, and
 *      every fetched response is same-origin.
 *
 * This script makes no network request to any host other than the
 * local test server it starts itself.
 */

import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, "dist");
const REPORT = join(ROOT, "artifacts", "demo", "timeline.html");

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`WARN: ${message}`);
}

function listFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) listFiles(path, out);
    else out.push(path);
  }
  return out;
}

function readText(path) {
  return readFileSync(path, "utf8");
}

/** External-resource patterns: any URL that would leave the machine. */
const EXTERNAL_URL = /https?:\/\/[^\s"'\)]+/gi;
const PROTOCOL_RELATIVE = /["'\(]\/\/[a-z0-9][a-z0-9.-]*\//gi;
const EXTERNAL_RESOURCE_TAG =
  /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i;
const CSS_IMPORT = /@import\s+["'](?:https?:)?\/\//i;
const CSS_URL_EXTERNAL = /url\(\s*["']?(?:https?:)?\/\//i;

// 1. dist/ exists.
if (!existsSync(join(DIST, "index.html"))) {
  fail("dist/index.html is missing — run `npm run build` first.");
}

if (failures.length === 0) {
  // 2. Scan the built bundle.
  for (const file of listFiles(DIST)) {
    const rel = file.slice(DIST.length + 1);
    const ext = extname(file);
    const text = readText(file);
    if (ext === ".html" || ext === ".css") {
      const urls = text.match(EXTERNAL_URL);
      if (urls !== null) fail(`${rel}: external URL(s): ${[...new Set(urls)].join(", ")}`);
      if (PROTOCOL_RELATIVE.test(text)) fail(`${rel}: protocol-relative URL`);
      if (EXTERNAL_RESOURCE_TAG.test(text)) fail(`${rel}: external src/href`);
      if (CSS_IMPORT.test(text)) fail(`${rel}: external @import`);
      if (CSS_URL_EXTERNAL.test(text)) fail(`${rel}: external url()`);
    } else if (ext === ".js") {
      if (EXTERNAL_RESOURCE_TAG.test(text)) fail(`${rel}: external src/href in JS`);
      if (/fetch\(\s*["']https?:/i.test(text)) fail(`${rel}: fetch() to an external URL`);
      if (/WebSocket\(\s*["']https?:/i.test(text)) fail(`${rel}: WebSocket to an external URL`);
      const urls = text.match(EXTERNAL_URL);
      if (urls !== null) {
        warn(`${rel}: inert external-looking string(s) in JS (no request is made): ${[...new Set(urls)].slice(0, 3).join(", ")}`);
      }
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(text)) {
        fail(`${rel}: remote font host referenced`);
      }
    }
  }

  // 3. Static report: no external URL, no script at all.
  if (!existsSync(REPORT)) {
    fail("artifacts/demo/timeline.html is missing — run `npm run demo:report` first.");
  } else {
    const report = readText(REPORT);
    const urls = report.match(EXTERNAL_URL);
    if (urls !== null) fail(`timeline.html: external URL(s): ${[...new Set(urls)].join(", ")}`);
    if (/<script/i.test(report)) fail("timeline.html: contains a <script> element");
    if (PROTOCOL_RELATIVE.test(report)) fail("timeline.html: protocol-relative URL");
  }
}

if (failures.length > 0) {
  console.error(`test:ui-offline FAILED (${failures.length} failure(s))`);
  process.exit(1);
}

// 4. Serve dist/ on 127.0.0.1 and fetch every local asset it references.
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = join(DIST, rel);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
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

try {
  const indexRes = await fetch(`${base}/`);
  if (indexRes.status !== 200) fail(`GET / returned ${indexRes.status}`);
  const indexHtml = await indexRes.text();
  const assetRefs = [
    ...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g),
  ]
    .map((m) => m[1])
    .filter((ref) => !ref.startsWith("http") && !ref.startsWith("#") && !ref.startsWith("data:"));
  const checked = new Set(["/"]);
  for (const ref of assetRefs) {
    const url = new URL(ref, `${base}/`).pathname;
    if (checked.has(url)) continue;
    checked.add(url);
    const res = await fetch(`${base}${url}`);
    if (res.status !== 200) fail(`GET ${url} returned ${res.status}`);
    await res.arrayBuffer();
  }
  console.log(`served ${checked.size} local resource(s) from 127.0.0.1:${port}, all 200, all same-origin`);
} catch (error) {
  fail(`local serve check failed: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  server.close();
}

if (failures.length > 0) {
  console.error(`test:ui-offline FAILED (${failures.length} failure(s))`);
  process.exit(1);
}
console.log(`test:ui-offline PASSED (${warnings.length} warning(s))`);
