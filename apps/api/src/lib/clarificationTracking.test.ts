import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClarificationTrackingState,
  normaliseClarifyingQuestion,
} from "./clarificationTracking.js";

test("normaliseClarifyingQuestion canonicalizes punctuation and casing", () => {
  assert.equal(
    normaliseClarifyingQuestion("Which social platforms are you focusing on?"),
    "which social platforms are you focusing on?",
  );
  assert.equal(
    normaliseClarifyingQuestion("**Which social platforms are you focusing on?**"),
    "which social platforms are you focusing on?",
  );
});

test("buildClarificationTrackingState tracks unique asked and answered questions", () => {
  const state = buildClarificationTrackingState([
    { role: "assistant", content: "Which social platforms are you focusing on?", timestamp: new Date().toISOString() },
    { role: "user", content: "Instagram and TikTok", timestamp: new Date().toISOString() },
    { role: "assistant", content: "Which social platforms are you focusing on?", timestamp: new Date().toISOString() },
    { role: "user", content: "Same answer", timestamp: new Date().toISOString() },
    { role: "assistant", content: "What tone should it have?", timestamp: new Date().toISOString() },
  ]);

  assert.equal(state.askedCount, 2);
  assert.equal(state.answeredCount, 1);
  assert.deepEqual(state.askedQuestions, [
    "Which social platforms are you focusing on?",
    "What tone should it have?",
  ]);
  assert.deepEqual(state.answeredQuestions, [
    "Which social platforms are you focusing on?",
  ]);
});
