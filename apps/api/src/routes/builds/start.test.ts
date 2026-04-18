import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("/builds/start defaults generation to claude-sonnet-4-6", async () => {
  const source = await readFile(new URL("./start.ts", import.meta.url), "utf8");

  assert.match(source, /export const DEFAULT_BUILD_MODEL = "claude-sonnet-4-6";/);
  assert.match(source, /const effectiveModel = parsedBody\.data\.model \?\? DEFAULT_BUILD_MODEL;/);
});
