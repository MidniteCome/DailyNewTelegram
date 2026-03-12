import fs from "node:fs/promises";
import { normalizeHealth } from "./base.mjs";

/**
 * WeChat adapter (Phase 1 skeleton)
 *
 * Safe default: no-op unless ENABLE_WECHAT=true and source file exists.
 * This avoids any behavior change in existing daily pipeline.
 */
export async function fetchWechat({ enabled = false, configPath = "sources/wechat.json" } = {}) {
  if (!enabled) {
    return {
      items: [],
      health: [normalizeHealth("wechat", configPath, { ok: true, skipped: true })],
    };
  }

  try {
    await fs.readFile(configPath, "utf8");
    // TODO(phase-2): implement connector logic after source strategy is finalized.
    return {
      items: [],
      health: [normalizeHealth("wechat", configPath, { ok: true, itemCount: 0 })],
    };
  } catch (e) {
    return {
      items: [],
      health: [normalizeHealth("wechat", configPath, { ok: false, itemCount: 0, error: String(e?.message ?? e) })],
    };
  }
}
