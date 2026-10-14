import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { getPlatformProxy } from "wrangler";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2];
if (!input) {
  throw new Error("Usage: node tools/import-local-kv.mjs <bulk-snapshot.json>");
}
const entries = JSON.parse(await readFile(resolve(input), "utf8"));
if (!Array.isArray(entries)) throw new Error("KV snapshot must be an array.");
for (const entry of entries) {
  if (!entry || typeof entry.key !== "string" || typeof entry.value !== "string") {
    throw new Error("Each snapshot entry must contain a string key and value.");
  }
}

const platform = await getPlatformProxy({
  configPath: resolve(root, "wrangler.jsonc"),
  persist: { path: resolve(root, ".wrangler", "state", "v3") },
  remoteBindings: false
});
let bytesWritten = 0;
try {
  const namespace = platform.env.SITE_CONFIG;
  if (!namespace || typeof namespace.put !== "function") {
    throw new Error("SITE_CONFIG is not available in the local configuration.");
  }
  for (const entry of entries) {
    const bytes = Buffer.from(entry.value, entry.base64 ? "base64" : "utf8");
    await namespace.put(entry.key, bytes, {
      metadata: entry.metadata,
      expiration: entry.expiration,
      expirationTtl: entry.expiration_ttl
    });
    const stored = await namespace.getWithMetadata(entry.key, "arrayBuffer");
    if (stored.value === null || !Buffer.from(stored.value).equals(bytes)) {
      throw new Error(`Local KV byte verification failed for ${entry.key}`);
    }
    if (!isDeepStrictEqual(stored.metadata, entry.metadata ?? null)) {
      throw new Error(`Local KV metadata verification failed for ${entry.key}`);
    }
    bytesWritten += bytes.length;
  }
  console.log(JSON.stringify({ location: "local", entries: entries.length, verified: entries.length, bytes: bytesWritten }));
} finally {
  await platform.dispose();
}
