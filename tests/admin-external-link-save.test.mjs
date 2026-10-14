import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

test("admin save rebinds editor controls to the hydrated config", () => {
  assert.match(
    appSource,
    /async function saveAdminConfig\(\)[\s\S]*?state\.saveStatus = payload\.noChanges[\s\S]*?renderAdminEditor\(\);/
  );
});

test("external link fallback text keeps API余额 intact on client and worker", () => {
  assert.match(appSource, /const externalLinkIconTextMaxLength = 8;/);
  assert.match(appSource, /link\.iconText = normalizeExternalLinkIconTextInput\(value\);/);
  assert.match(appSource, /maxLength: externalLinkIconTextMaxLength/);
  assert.match(appSource, /iconText: normalizeExternalLinkIconText\(link\?\.iconText \|\| "WEB"\)/);
  assert.match(
    workerSource,
    /iconText: limitText\(asString\(record\.iconText\) \|\| "WEB", externalLinkIconTextMaxLength\)\.toUpperCase\(\)/
  );
});

test("long icon fallback text has a compact visual treatment", () => {
  assert.match(appSource, /classList\.toggle\("has-long-text", Array\.from\(fallbackText\)\.length > 4\)/);
  assert.match(stylesSource, /\.module-icon\.has-long-text\s*{[^}]*font-size: 10px;[^}]*overflow-wrap: anywhere;/);
});
