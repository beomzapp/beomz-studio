import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnthropicImageSource,
  isSupportedAnthropicImageUrl,
  resolveAnthropicImageSource,
} from "./anthropicImages.js";

test("isSupportedAnthropicImageUrl accepts https URLs and data URLs", () => {
  assert.equal(isSupportedAnthropicImageUrl("https://example.com/test.png"), true);
  assert.equal(isSupportedAnthropicImageUrl("data:image/png;base64,aGVsbG8="), true);
  assert.equal(isSupportedAnthropicImageUrl("data:text/plain;base64,aGVsbG8="), false);
});

test("buildAnthropicImageSource converts data URLs into base64 image sources", () => {
  assert.deepEqual(buildAnthropicImageSource("data:image/jpg;base64,aGVsbG8="), {
    type: "base64",
    media_type: "image/jpeg",
    data: "aGVsbG8=",
  });
});

test("resolveAnthropicImageSource fetches remote images and converts them to base64", async () => {
  const source = await resolveAnthropicImageSource("https://example.com/logo.png", {
    fetchImpl: async () => new Response(Uint8Array.from([137, 80, 78, 71]), {
      status: 200,
      headers: {
        "content-type": "image/png",
      },
    }),
  });

  assert.deepEqual(source, {
    type: "base64",
    media_type: "image/png",
    data: Buffer.from(Uint8Array.from([137, 80, 78, 71])).toString("base64"),
  });
});
