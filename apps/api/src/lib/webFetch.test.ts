import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.TAVILY_API_KEY ??= "test-tavily-key";

const {
  buildUrlReferenceContextBlock,
  extractResearchQuery,
  extractUrlLike,
  injectUrlContextIntoBuildPrompt,
  loadUrlContext,
  researchUrl,
  resetUrlResearchSynthesisForTests,
  resetTavilyClientFactoryForTests,
  setUrlResearchSynthesisForTests,
  setTavilyClientFactoryForTests,
} = await import("./webFetch.js");

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
    "pricing",
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

test("researchUrl combines fetched site content with Tavily feature and product queries", async () => {
  const originalFetch = globalThis.fetch;
  const tavilyQueries: string[] = [];
  let capturedWebsiteContent = "";
  let capturedSearchContent = "";

  setTavilyClientFactoryForTests(() =>
    ({
      search: async (query: string) => {
        tavilyQueries.push(query);
        return {
          results: [
            {
              title: `${query} result`,
              url: "https://example.com",
              content: `${query} details`,
            },
          ],
        };
      },
    }) as never);

  setUrlResearchSynthesisForTests(async (input) => {
    capturedWebsiteContent = input.websiteContent ?? "";
    capturedSearchContent = input.searchContent ?? "";
    return {
      summary: "Building operations SaaS for property teams",
      features: [
        "Maintenance request tracking",
        "Vendor workflow management",
      ],
    };
  });

  globalThis.fetch = (async (input: string | URL | Request) => {
    const requestUrl = typeof input === "string" ? input : input.toString();

    if (requestUrl === "https://r.jina.ai/https://mybos.com") {
      return new Response("myBOS provides maintenance and compliance workflows.", { status: 200 });
    }

    throw new Error(`Unexpected fetch URL in test: ${requestUrl}`);
  }) as typeof fetch;

  try {
    const result = await researchUrl("https://mybos.com", "mybos.com");

    assert.equal(result?.domain, "mybos.com");
    assert.equal(result?.summary, "Building operations SaaS for property teams");
    assert.deepEqual(result?.features, [
      "Maintenance request tracking",
      "Vendor workflow management",
    ]);
    assert.match(capturedWebsiteContent, /maintenance and compliance workflows/i);
    assert.match(capturedSearchContent, /Search query: mybos\.com features/i);
    assert.match(capturedSearchContent, /Search query: mybos\.com product/i);
    assert.deepEqual(tavilyQueries, ["mybos.com features", "mybos.com product"]);
  } finally {
    globalThis.fetch = originalFetch;
    resetTavilyClientFactoryForTests();
    resetUrlResearchSynthesisForTests();
  }
});

test("loadUrlContext falls back to direct fetch when Jina returns empty content", async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];
  const tavilyQueries: string[] = [];

  setTavilyClientFactoryForTests(() =>
    ({
      search: async (query: string) => {
        tavilyQueries.push(query);
        return { results: [] };
      },
    }) as never);
  setUrlResearchSynthesisForTests(async () => ({
    summary: "Building operations SaaS for property teams",
    features: [
      "Maintenance request tracking",
      "Vendor workflow management",
    ],
  }));

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const requestUrl = typeof input === "string" ? input : input.toString();
    calledUrls.push(requestUrl);

    if (requestUrl === "https://r.jina.ai/https://mybos.com") {
      return new Response("   ", { status: 200 });
    }

    if (requestUrl === "https://mybos.com") {
      const headers = new Headers(init?.headers);
      assert.equal(
        headers.get("User-Agent"),
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );
      return new Response(
        "<html><head><title>MYBOS</title><meta name=\"description\" content=\"Building operations platform\"></head><body><main>Manage maintenance workflows and vendor operations at scale.</main></body></html>",
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    }

    throw new Error(`Unexpected fetch URL in test: ${requestUrl}`);
  }) as typeof fetch;

  try {
    const context = await loadUrlContext("build a website like mybos.com");

    assert.equal(context?.fetchFailed, false);
    assert.equal(context?.sourceType, "url");
    assert.equal(context?.url, "https://mybos.com");
    assert.match(context?.content ?? "", /Research summary: Building operations SaaS for property teams/i);
    assert.match(context?.content ?? "", /Maintenance request tracking/i);
    assert.deepEqual(tavilyQueries, ["mybos.com features", "mybos.com product"]);
    assert.deepEqual(calledUrls, [
      "https://r.jina.ai/https://mybos.com",
      "https://mybos.com",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    resetTavilyClientFactoryForTests();
    resetUrlResearchSynthesisForTests();
  }
});

test("loadUrlContext falls back to Tavily when Jina and direct fetch both fail", async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];
  const tavilyQueries: string[] = [];

  setTavilyClientFactoryForTests(() =>
    ({
      search: async (query: string) => {
        tavilyQueries.push(query);
        return {
          results: [
            {
              title: "MYBOS Features",
              url: "https://mybos.com/features",
              content: "MYBOS includes maintenance tracking, vendor workflows, and compliance tooling.",
            },
            {
              title: "MYBOS Product Overview",
              url: "https://example.com/mybos-overview",
              content: "Platform for building operations teams with resident communications and reporting.",
            },
          ],
        };
      },
    }) as never);
  setUrlResearchSynthesisForTests(async () => ({
    summary: "Building operations SaaS for property teams",
    features: [
      "Compliance workflows",
      "Resident communications",
    ],
  }));

  globalThis.fetch = (async (input: string | URL | Request) => {
    const requestUrl = typeof input === "string" ? input : input.toString();
    calledUrls.push(requestUrl);

    if (requestUrl === "https://r.jina.ai/https://mybos.com") {
      return new Response("", { status: 200 });
    }

    if (requestUrl === "https://mybos.com") {
      return new Response("blocked", { status: 403 });
    }

    throw new Error(`Unexpected fetch URL in test: ${requestUrl}`);
  }) as typeof fetch;

  try {
    const context = await loadUrlContext("build a website like mybos.com");

    assert.equal(context?.fetchFailed, false);
    assert.equal(context?.sourceType, "url");
    assert.equal(context?.url, "https://mybos.com");
    assert.match(context?.content ?? "", /Research summary: Building operations SaaS for property teams/i);
    assert.match(context?.content ?? "", /Compliance workflows/i);
    assert.deepEqual(calledUrls, [
      "https://r.jina.ai/https://mybos.com",
      "https://mybos.com",
    ]);
    assert.deepEqual(tavilyQueries, ["mybos.com features", "mybos.com product"]);
  } finally {
    globalThis.fetch = originalFetch;
    resetTavilyClientFactoryForTests();
    resetUrlResearchSynthesisForTests();
  }
});
