import assert from "node:assert/strict";
import test from "node:test";

import { summariseChatThread } from "./summariseChatThread.js";

test("summariseChatThread returns a non-empty prompt from a short planning thread", async () => {
  const result = await summariseChatThread(
    [
      { role: "user", content: "I need a CRM dashboard." },
      { role: "assistant", content: "Who will use it and what should they see first?" },
      { role: "user", content: "A small sales team. Show leads, pipeline, and recent activity." },
    ],
    async () => "Build a CRM dashboard for a small sales team with leads, pipeline overview, and recent activity visible on the main screen.",
  );

  assert.ok(result.prompt.length > 0);
  assert.match(result.prompt, /CRM dashboard/i);
});
