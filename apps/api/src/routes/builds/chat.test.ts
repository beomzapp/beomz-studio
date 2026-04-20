import assert from "node:assert/strict";
import test from "node:test";

import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createBuildsChatRoute } = await import("./chat.js");

function createTestOrgContext(): OrgContext {
  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "free",
    credits: 5,
    topup_credits: 0,
    monthly_credits: 0,
    rollover_credits: 0,
    rollover_cap: 0,
    credits_period_start: null,
    credits_period_end: null,
    downgrade_at_period_end: false,
    pending_plan: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    daily_reset_at: null,
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  return {
    db: {
      getOrgWithBalance: async () => org,
      applyOrgUsageDeduction: async () => ({
        deducted: 3,
        credits: 2,
        topup_credits: 0,
      }),
    } as OrgContext["db"],
    jwt: { sub: "platform-user" },
    membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
    org,
    user: {
      id: "user-1",
      email: "omar@example.com",
      platform_user_id: "platform-user",
      created_at: new Date().toISOString(),
    },
  };
}

test("builds/chat passes imageUrl to Anthropic as an image content block", async () => {
  let capturedMessages: Array<Record<string, unknown>> = [];

  const route = createBuildsChatRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createTestOrgContext());
      await next();
    },
    createMessageStream: (input) => {
      capturedMessages = input.messages as Array<Record<string, unknown>>;

      return (async function* () {
        yield {
          type: "content_block_delta",
          delta: {
            type: "text_delta",
            text: "Looks good.",
          },
        };
      })();
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: "Please review this design.",
        },
      ],
      imageUrl: "https://storage.example.com/signed/reference.png",
    }),
  });

  assert.equal(response.status, 200);
  await response.text();

  assert.equal(capturedMessages.length, 1);
  assert.deepEqual(capturedMessages[0], {
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "url",
          url: "https://storage.example.com/signed/reference.png",
        },
      },
      {
        type: "text",
        text: "Please review this design.",
      },
    ],
  });
});

test("builds/chat accepts data URLs and converts them to base64 Anthropic image blocks", async () => {
  let capturedMessages: Array<Record<string, unknown>> = [];

  const route = createBuildsChatRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      const orgContext = createTestOrgContext();
      c.set("orgContext", {
        ...orgContext,
        org: {
          ...orgContext.org,
          credits: 5,
        },
        db: {
          ...orgContext.db,
          getOrgWithBalance: async () => ({
            ...orgContext.org,
            credits: 5,
          }),
        } as OrgContext["db"],
      });
      await next();
    },
    createMessageStream: (input) => {
      capturedMessages = input.messages as Array<Record<string, unknown>>;

      return (async function* () {
        yield {
          type: "content_block_delta",
          delta: {
            type: "text_delta",
            text: "Looks good.",
          },
        };
      })();
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: "Please use this style.",
        },
      ],
      imageUrl: "data:image/png;base64,aGVsbG8=",
    }),
  });

  assert.equal(response.status, 200);
  await response.text();

  assert.equal(capturedMessages.length, 1);
  assert.deepEqual(capturedMessages[0], {
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: "aGVsbG8=",
        },
      },
      {
        type: "text",
        text: "Please use this style.",
      },
    ],
  });
});

test("builds/chat blocks requests when the org has no credits left", async () => {
  const route = createBuildsChatRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      const orgContext = createTestOrgContext();
      c.set("orgContext", {
        ...orgContext,
        org: {
          ...orgContext.org,
          credits: 0,
        },
        db: {
          ...orgContext.db,
          getOrgWithBalance: async () => ({
            ...orgContext.org,
            credits: 0,
          }),
        } as OrgContext["db"],
      });
      await next();
    },
    createMessageStream: () => {
      throw new Error("should not reach model call");
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: "Help me with this app.",
        },
      ],
    }),
  });

  assert.equal(response.status, 402);
  const payload = await response.json() as { error: string };
  assert.match(payload.error, /out of credits for chat/i);
});

test("builds/chat translates structured model JSON into chat_response and ready_to_implement events", async () => {
  const route = createBuildsChatRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createTestOrgContext());
      await next();
    },
    createMessageStream: () => (async function* () {
      yield {
        type: "content_block_delta",
        delta: {
          type: "text_delta",
          text: "{\"message\":\"**Plan**\\n\\nI'll add dark mode.\",\"readyToImplement\":true,",
        },
      };
      yield {
        type: "content_block_delta",
        delta: {
          type: "text_delta",
          text: "\"implementPlan\":\"Update `theme.ts` with dark tokens. Add a toggle in `App.tsx`.\"}",
        },
      };
    })(),
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: "add dark mode",
        },
      ],
    }),
  });

  assert.equal(response.status, 200);

  const body = await response.text();
  assert.match(body, /"type":"chat_response"/);
  assert.match(body, /\*\*Plan\*\*/);
  assert.match(body, /"type":"ready_to_implement"/);
  assert.match(body, /Update `theme\.ts` with dark tokens/);
  assert.doesNotMatch(body, /\\"message\\":\\"\*\*Plan\*\*/);
});
