import assert from "node:assert/strict";
import test from "node:test";

import { getImplementSuggestionDecision } from "./chatMode.js";

test("implement_suggestion fires when the assistant says it has enough to build", () => {
  const decision = getImplementSuggestionDecision(
    [
      { role: "user", content: "Build me a habit tracker" },
      { role: "assistant", content: "Who is it for?" },
      { role: "user", content: "Just for me, mobile first." },
    ],
    "I think I have enough to build. A mobile-first habit tracker for one person with streaks and reminders.",
  );

  assert.equal(decision.shouldEmit, true);
  assert.match(decision.summary ?? "", /habit tracker/i);
});

test("implement_suggestion fires when the user says build it after two prior exchanges", () => {
  const decision = getImplementSuggestionDecision(
    [
      { role: "user", content: "I want a CRM dashboard." },
      { role: "assistant", content: "Who will use it?" },
      { role: "user", content: "A small sales team." },
      { role: "assistant", content: "What views matter most?" },
      { role: "user", content: "Pipeline, leads, and a quick activity log. Build it." },
    ],
    "Understood. I'll keep the scope focused around the pipeline, leads, and activity logging.",
  );

  assert.equal(decision.shouldEmit, true);
  assert.match(decision.summary ?? "", /pipeline|leads|activity/i);
});
