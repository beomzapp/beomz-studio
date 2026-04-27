import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const {
  extractClientIp,
  tryMarkLoginSessionSeen,
} = await import("./loginEvents.js");

test("extractClientIp prefers cf-connecting-ip over x-forwarded-for and socket remote address", () => {
  const ip = extractClientIp({
    cloudflareIp: "203.0.113.10",
    forwardedFor: "203.0.113.7, 10.0.0.1",
    socketRemoteAddress: "198.51.100.9",
  });

  assert.equal(ip, "203.0.113.10");
});

test("extractClientIp prefers x-forwarded-for over socket remote address when Cloudflare header is absent", () => {
  const ip = extractClientIp({
    forwardedFor: "203.0.113.7, 10.0.0.1",
    socketRemoteAddress: "198.51.100.9",
  });

  assert.equal(ip, "203.0.113.7");
});

test("extractClientIp falls back to the socket remote address when forwarding headers are absent", () => {
  const ip = extractClientIp({
    forwardedFor: undefined,
    socketRemoteAddress: "::ffff:198.51.100.9",
  });

  assert.equal(ip, "198.51.100.9");
});

test("tryMarkLoginSessionSeen only accepts the first request for the same access token inside the ttl", () => {
  const seenSessions = new Map<string, number>();
  let now = 1_000;

  assert.equal(tryMarkLoginSessionSeen("token-1", { now: () => now, seenSessions }), true);
  assert.equal(tryMarkLoginSessionSeen("token-1", { now: () => now + 100, seenSessions }), false);
  assert.equal(tryMarkLoginSessionSeen("token-2", { now: () => now + 100, seenSessions }), true);

  now += 6 * 60 * 60 * 1000 + 1;
  assert.equal(tryMarkLoginSessionSeen("token-1", { now: () => now, seenSessions }), true);
});
