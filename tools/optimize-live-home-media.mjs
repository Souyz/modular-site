import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = resolve(root, ".codex-cache", "home-media-optimization");
const wranglerPath = resolve(root, "node_modules", "wrangler", "bin", "wrangler.js");
const resizeScript = resolve(root, "tools", "resize-site-image.py");
const siteOrigin = "https://neyc.de5.net";
const apply = process.argv.includes("--apply");
const pythonArgument = process.argv.find((value) => value.startsWith("--python="));
const python = pythonArgument?.slice("--python=".length) || process.env.CODEX_PYTHON;
const curl = process.env.CODEX_CURL || "curl.exe";
const profiles = {
  icon: { name: "icon", maxSize: 192, quality: 80 },
  background: { name: "background", maxSize: 960, quality: 78 },
  hero: { name: "hero", maxSize: 1280, quality: 80 }
};

if (!python) {
  throw new Error("Set CODEX_PYTHON to a Python executable with Pillow installed.");
}

await mkdir(cacheDir, { recursive: true });
const originalText = await getRemoteConfig();
const originalConfig = JSON.parse(originalText);
const originalHash = sha256(Buffer.from(originalText));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = resolve(cacheDir, `site-config-backup-${stamp}.json`);
await writeFile(backupPath, originalText);

const config = structuredClone(originalConfig);
const targets = collectHomeMediaTargets(config);
const variants = new Map();
let originalBytes = 0;
let optimizedBytes = 0;

for (const target of targets) {
  const cacheKey = `${target.source}|${target.profile.name}`;
  let variant = variants.get(cacheKey);

  if (!variant) {
    variant = await createVariant(target.source, target.profile);
    variants.set(cacheKey, variant);
    originalBytes += variant.originalBytes;
    optimizedBytes += variant.optimizedBytes;
  }

  target.owner[target.key] = variant.publicUrl;
}

config.updatedAt = new Date().toISOString();
const optimizedConfigPath = resolve(cacheDir, `site-config-optimized-${stamp}.json`);
await writeFile(optimizedConfigPath, JSON.stringify(config));

const summary = {
  mode: apply ? "apply" : "dry-run",
  fieldsUpdated: targets.length,
  variants: variants.size,
  originalBytes,
  optimizedBytes,
  savedBytes: originalBytes - optimizedBytes,
  savedPercent: originalBytes ? Math.round((1 - optimizedBytes / originalBytes) * 1000) / 10 : 0,
  backupPath,
  optimizedConfigPath
};

if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const latestText = await getRemoteConfig();
if (sha256(Buffer.from(latestText)) !== originalHash) {
  throw new Error("Remote site config changed during optimization; nothing was written.");
}

const bulkPath = resolve(cacheDir, `site-media-bulk-${stamp}.json`);
const bulkEntries = [
  {
    key: `site-config-backup/${stamp}`,
    value: Buffer.from(originalText).toString("base64"),
    base64: true,
    expiration_ttl: 604800,
    metadata: { kind: "site-config-backup", createdAt: new Date().toISOString() }
  },
  ...[...variants.values()].map((variant) => ({
    key: `site-media/${variant.fileName}`,
    value: variant.bytes.toString("base64"),
    base64: true,
    metadata: {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable"
    }
  }))
];
await writeFile(bulkPath, JSON.stringify(bulkEntries));
await runWrangler(["kv", "bulk", "put", bulkPath, "--binding", "SITE_CONFIG", "--remote"]);
await runWrangler([
  "kv", "key", "put", "site-config",
  "--path", optimizedConfigPath,
  "--binding", "SITE_CONFIG",
  "--remote"
]);

const verifyText = await getRemoteConfig();
const verifyConfig = JSON.parse(verifyText);
if (verifyConfig.updatedAt !== config.updatedAt) {
  throw new Error("Remote config verification failed after upload.");
}

console.log(JSON.stringify({ ...summary, verifiedUpdatedAt: verifyConfig.updatedAt }, null, 2));

function collectHomeMediaTargets(siteConfig) {
  const targets = [];
  const add = (owner, key, profile) => {
    const source = owner?.[key];
    if (typeof source !== "string" || !source.startsWith("/api/site-media/")) return;
    targets.push({ owner, key, source, profile });
  };

  add(siteConfig, "homeImage", profiles.hero);

  for (const link of siteConfig.links || []) {
    if (link.visible === false) continue;
    add(link, "iconImage", profiles.icon);
    add(link, "backgroundImage", profiles.background);
  }

  for (const page of siteConfig.pages || []) {
    if (page.visible === false) continue;
    add(page.entry, "iconImage", profiles.icon);
    add(page.entry, "sidebarIconImage", profiles.icon);
    add(page.entry, "backgroundImage", profiles.background);
  }

  return targets;
}

async function createVariant(source, profile) {
  const sourceUrl = new URL(source, siteOrigin).href;
  const sourceCacheKey = sha256(Buffer.from(sourceUrl)).slice(0, 24);
  const variantCacheKey = sha256(Buffer.from(`${sourceUrl}|${profile.maxSize}|${profile.quality}`)).slice(0, 24);
  const downloadedSource = resolve(cacheDir, `source-${sourceCacheKey}`);
  const temporaryOutput = resolve(cacheDir, `variant-${variantCacheKey}.webp`);
  let sourceBytes = await readNonEmptyFile(downloadedSource);

  if (!sourceBytes) {
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    const curlArgs = [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--retry", "3",
      "--retry-all-errors",
      "--connect-timeout", "20",
      "--max-time", "120",
      "--output", downloadedSource
    ];

    if (proxy) {
      curlArgs.push("--proxy", proxy);
    }

    curlArgs.push(sourceUrl);
    await execFileAsync(curl, curlArgs, {
      cwd: root,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      timeout: 150000
    });
    sourceBytes = await readNonEmptyFile(downloadedSource);
  }

  if (!sourceBytes) {
    throw new Error(`Downloaded source is empty: ${source}`);
  }

  let bytes = await readNonEmptyFile(temporaryOutput);
  if (!bytes) {
    const { stdout } = await execFileAsync(python, [
      resizeScript,
      downloadedSource,
      temporaryOutput,
      "--max-size", String(profile.maxSize),
      "--quality", String(profile.quality)
    ], { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024 });
    JSON.parse(stdout);
    bytes = await readFile(temporaryOutput);
  }
  const fileName = `${sha256(bytes)}.webp`;
  return {
    fileName,
    publicUrl: `/api/site-media/${fileName}`,
    bytes,
    originalBytes: sourceBytes.length,
    optimizedBytes: bytes.length
  };
}

async function readNonEmptyFile(path) {
  try {
    const bytes = await readFile(path);
    return bytes.length ? bytes : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function getRemoteConfig() {
  const { stdout } = await runWrangler([
    "kv", "key", "get", "site-config",
    "--binding", "SITE_CONFIG",
    "--remote",
    "--text"
  ]);
  return stdout.trim();
}

async function runWrangler(args) {
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    delete env[name];
  }

  return execFileAsync(process.execPath, [wranglerPath, ...args], {
    cwd: root,
    env,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120000
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
