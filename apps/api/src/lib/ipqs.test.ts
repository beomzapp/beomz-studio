import assert from "node:assert/strict";
import test from "node:test";

import { buildIpqsUrl, lookupIpqsVpnStatus } from "./ipqs.js";

test("buildIpqsUrl adds strictness=1", () => {
  const url = buildIpqsUrl("secret", "178.132.108.41");

  assert.match(url, /strictness=1/);
});

test("lookupIpqsVpnStatus reads vpn and proxy flags", async () => {
  const result = await lookupIpqsVpnStatus({
    apiKey: "secret",
    clientIp: "178.132.108.41",
    fetchImpl: async () => new Response(JSON.stringify({ proxy: true, success: true, vpn: false }), { status: 200 }),
  });

  assert.equal(result.status, "vpn");
  assert.equal(result.proxy, true);
});

test("lookupIpqsVpnStatus treats unsuccessful payloads as unverified", async () => {
  const result = await lookupIpqsVpnStatus({
    apiKey: "secret",
    clientIp: "178.132.108.41",
    fetchImpl: async () => new Response(JSON.stringify({
      message: "You have insufficient credits to make this query.",
      success: false,
      vpn: false,
    }), { status: 200 }),
  });

  assert.equal(result.status, "unverified");
  assert.match(result.message ?? "", /insufficient credits/i);
});
