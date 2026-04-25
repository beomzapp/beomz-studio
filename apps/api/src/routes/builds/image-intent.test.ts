import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("generate no longer contains the image intent confirmation SSE flow", async () => {
  const source = await readFile(new URL("./generate.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /awaiting_image_confirmation/);
  assert.doesNotMatch(source, /type:\s*"image_intent"/);
});
