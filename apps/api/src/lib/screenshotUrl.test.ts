import assert from "node:assert/strict";
import test from "node:test";

import { screenshotUrl } from "./screenshotUrl.js";

test("screenshotUrl falls through to microlink when screenshotapi returns non-2xx", async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const requestUrl = typeof input === "string" ? input : input.toString();
    calledUrls.push(requestUrl);

    if (requestUrl.startsWith("https://shot.screenshotapi.net/screenshot")) {
      return new Response("unauthorized", { status: 401, statusText: "Unauthorized" });
    }

    if (requestUrl.startsWith("https://api.microlink.io/")) {
      return new Response(
        JSON.stringify({
          status: "success",
          data: {
            screenshot: { url: "https://cdn.microlink.test/mybos-shot.png" },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (requestUrl === "https://cdn.microlink.test/mybos-shot.png") {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${requestUrl}`);
  }) as typeof fetch;

  try {
    const result = await screenshotUrl("https://mybos.com");

    assert.equal(result, Buffer.from([1, 2, 3, 4]).toString("base64"));
    assert.equal(calledUrls.length, 3);
    assert.match(calledUrls[0] ?? "", /^https:\/\/shot\.screenshotapi\.net\/screenshot\?/);
    assert.match(calledUrls[1] ?? "", /^https:\/\/api\.microlink\.io\/\?/);
    assert.equal(calledUrls[2], "https://cdn.microlink.test/mybos-shot.png");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("screenshotUrl returns null when screenshotapi and microlink both fail", async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const requestUrl = typeof input === "string" ? input : input.toString();
    calledUrls.push(requestUrl);

    if (requestUrl.startsWith("https://shot.screenshotapi.net/screenshot")) {
      return new Response("unauthorized", { status: 401, statusText: "Unauthorized" });
    }

    if (requestUrl.startsWith("https://api.microlink.io/")) {
      return new Response("unavailable", { status: 502, statusText: "Bad Gateway" });
    }

    throw new Error(`Unexpected fetch URL in test: ${requestUrl}`);
  }) as typeof fetch;

  try {
    const result = await screenshotUrl("https://failing-example.com");

    assert.equal(result, null);
    assert.equal(calledUrls.length, 2);
    assert.match(calledUrls[0] ?? "", /^https:\/\/shot\.screenshotapi\.net\/screenshot\?/);
    assert.match(calledUrls[1] ?? "", /^https:\/\/api\.microlink\.io\/\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
