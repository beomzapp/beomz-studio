import assert from "node:assert/strict";
import test from "node:test";

import { extractUrlLike } from "./webFetch.js";

test("extractUrlLike returns explicit https URLs", () => {
  assert.equal(
    extractUrlLike("Research https://mybos.com/features and summarise it."),
    "https://mybos.com/features",
  );
});

test("extractUrlLike normalises naked domains to https", () => {
  assert.equal(
    extractUrlLike("research mybos.com and build something similar"),
    "https://mybos.com",
  );
});

test("extractUrlLike ignores email domains", () => {
  assert.equal(
    extractUrlLike("send the invite to hello@beomz.com"),
    null,
  );
});
