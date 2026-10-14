import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

export function resolveGodot(root = process.cwd()) {
  if (process.env.LLR_GODOT_BIN) {
    const configured = resolve(process.env.LLR_GODOT_BIN);
    if (!existsSync(configured)) {
      throw new Error(`Godot binary configured by LLR_GODOT_BIN not found: ${configured}`);
    }
    return configured;
  }

  const binary = "Godot_v4.3-stable_win64_console.exe";
  const candidates = [
    join(root, ".codex-cache", "godot-bin", binary),
    join(process.env.TEMP || tmpdir(), "godot-4.3-tools", "godot", binary)
  ];
  const available = candidates.find((candidate) => existsSync(candidate));
  if (!available) {
    throw new Error("Godot 4.3 not found. Set LLR_GODOT_BIN to its executable, or place it in .codex-cache/godot-bin/.");
  }
  return available;
}
