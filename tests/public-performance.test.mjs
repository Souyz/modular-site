import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const buildSource = readFileSync(new URL("../tools/build-site-assets.mjs", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("home media is progressively loaded and uploads use role-sized WebP", () => {
  assert.match(appSource, /const iconImageObserver = "IntersectionObserver" in window/);
  assert.match(appSource, /rootMargin: "96px"/);
  assert.match(appSource, /image\.fetchPriority = "low"/);
  assert.match(appSource, /rootMargin: "120px 0px"/);
  assert.doesNotMatch(appSource, /rootMargin: "240px 0px"/);
  assert.match(appSource, /return \{ maxSize: 192, quality: 0\.8 \}/);
  assert.match(appSource, /return \{ maxSize: 960, quality: 0\.78 \}/);
  assert.match(appSource, /canvas\.toDataURL\("image\/webp", quality\)/);
  assert.match(appSource, /scheduleVisitorSummary\(\)/);
});

test("public config starts from the document without allowing stale responses", () => {
  for (const source of [indexSource, buildSource]) {
    assert.match(source, /configPreload\.rel = "preload"/);
    assert.match(source, /configPreload\.as = "fetch"/);
    assert.match(source, /configPreload\.crossOrigin = "anonymous"/);
  }

  assert.match(appSource, /"no-cache", "same-origin"/);
  assert.match(indexSource, /@keyframes boot-pulse/);
  assert.doesNotMatch(indexSource, /@keyframes boot-shimmer/);
});

test("content-addressed site media is cached at the edge with validators", () => {
  assert.match(workerSource, /const cacheKey = new Request\(canonicalUrl\.toString\(\), \{ method: "GET" \}\)/);
  assert.match(workerSource, /await caches\.default\.match\(cacheKey\)/);
  assert.match(workerSource, /caches\.default\.put\(cacheKey, response\.clone\(\)\)/);
  assert.match(workerSource, /const etag = `"\$\{fileName\.split\("\."\)\[0\]\}"`/);
  assert.match(workerSource, /fetchSiteMedia\(request, env as AppEnv, fileName, ctx\)/);
});
