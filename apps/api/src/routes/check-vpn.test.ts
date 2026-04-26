import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.IPQS_API_KEY ??= "test-ipqs-key";

const { createCheckVpnRoute } = await import("./check-vpn.js");

test("GET /check-vpn returns is_vpn true when IPQS flags vpn", async () => {
  const route = createCheckVpnRoute({
    fetchImpl: async () => new Response(JSON.stringify({ success: true, vpn: true }), { status: 200 }),
  });

  const response = await route.request("http://localhost/", {
    headers: {
      "cf-connecting-ip": "178.132.108.41",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { is_vpn: true });
});

test("GET /check-vpn fails closed when IPQS is unverified", async () => {
  const route = createCheckVpnRoute({
    fetchImpl: async () => new Response(JSON.stringify({
      message: "You have insufficient credits to make this query.",
      success: false,
      vpn: false,
    }), { status: 200 }),
  });

  const response = await route.request("http://localhost/", {
    headers: {
      "cf-connecting-ip": "178.132.108.41",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { is_vpn: true });
});
