import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.TAVILY_API_KEY ??= "test-tavily-key";

import {
  buildUrlReferenceContextBlock,
  extractResearchQuery,
  extractUrlLike,
  injectUrlContextIntoBuildPrompt,
} from "./webFetch.js";

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

test("buildUrlReferenceContextBlock formats Jina content as build grounding", () => {
  const result = buildUrlReferenceContextBlock({
    url: "https://bullioncentral.com.au",
    content: "Palette: charcoal, white, metallic gold. Layout: hero, spot ticker, product grid.",
    fetchFailed: false,
    label: "Source URL: https://bullioncentral.com.au",
    sourceType: "url",
  });

  assert.match(result ?? "", /Reference website: https:\/\/bullioncentral\.com\.au/);
  assert.match(result ?? "", /grounding for colors, layout, theme, and design cues/);
  assert.match(result ?? "", /Palette: charcoal, white, metallic gold/);
});

test("injectUrlContextIntoBuildPrompt prepends fetched URL context for build prompts", async () => {
  const prompt = "build a site like bullioncentral.com.au";
  const result = await injectUrlContextIntoBuildPrompt(
    prompt,
    async () => ({
      url: "https://bullioncentral.com.au",
      content: "Colors: black, white, metallic gold. Layout: hero, live spot ticker, category grid.",
      fetchFailed: false,
      label: "Source URL: https://bullioncentral.com.au",
      sourceType: "url",
    }),
  );

  assert.match(result, /Reference website: https:\/\/bullioncentral\.com\.au/);
  assert.match(result, /Only use visual details that are explicitly supported by this content/);
  assert.match(result, /User build request:\nbuild a site like bullioncentral\.com\.au/);
});

test("injectUrlContextIntoBuildPrompt falls back gracefully when Jina fetch has no content", async () => {
  const prompt = "build a site like bullioncentral.com.au";
  const result = await injectUrlContextIntoBuildPrompt(
    prompt,
    async () => ({
      url: "https://bullioncentral.com.au",
      content: null,
      fetchFailed: true,
      label: "Source URL: https://bullioncentral.com.au",
      sourceType: "url",
    }),
  );

  assert.equal(result, prompt);
});
