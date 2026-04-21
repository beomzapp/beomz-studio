import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.TAVILY_API_KEY ??= "test-tavily-key";

import { extractResearchQuery, extractUrlLike } from "./webFetch.js";

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

test("extractResearchQuery strips common research prefixes", () => {
  assert.equal(
    extractResearchQuery("research lovable pricing and main features"),
    "lovable pricing and main features",
  );
});

test("extractResearchQuery removes embedded URLs before building a search query", () => {
  assert.equal(
    extractResearchQuery("search https://beomz.ai for pricing"),
    "for pricing",
  );
});
