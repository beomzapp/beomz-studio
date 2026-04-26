import assert from "node:assert/strict";
import test from "node:test";

import { buildCreditsLowEmail } from "./credits-low.js";
import { buildReferralRewardEmail } from "./referral-reward.js";
import { buildResetPasswordEmail } from "./reset.js";
import { buildVerifyEmail } from "./verify.js";
import { buildWelcomeEmail } from "./welcome.js";

function assertSharedEmailHtml(html: string): void {
  assert.ok(html.trim().length > 0, "expected non-empty HTML");
  assert.match(html, /#faf9f6/i);
  assert.match(html, /#ffffff/i);
  assert.match(html, /Beomz/);
  assert.match(html, /<svg/i);
  assert.doesNotMatch(html, /Hi undefined,/);
  assert.doesNotMatch(html, /Hi null,/);
}

test("welcome email falls back to 'there' and renders light theme HTML", () => {
  const content = buildWelcomeEmail({ name: null });

  assert.equal(content.subject, "Welcome to Beomz 🚀");
  assertSharedEmailHtml(content.html);
  assert.match(content.html, /Hi there,/);
  assert.match(content.html, /100 free credits/i);
});

test("all other email templates render non-empty HTML with sparse inputs", () => {
  const emails = [
    buildVerifyEmail({
      name: undefined,
      verifyUrl: "https://beomz.ai/verify-email?token=test-token",
    }),
    buildResetPasswordEmail({
      name: "",
      resetUrl: "https://beomz.ai/reset-password?token=test-token",
    }),
    buildReferralRewardEmail({
      name: undefined,
      credits: Number.NaN,
    }),
    buildCreditsLowEmail({
      name: undefined,
      remaining: Number.NaN,
    }),
  ];

  for (const email of emails) {
    assert.ok(email.subject.trim().length > 0, "expected subject");
    assertSharedEmailHtml(email.html);
    assert.match(email.html, /Hi there,/);
  }

  assert.match(emails[2]!.html, /added 0 credits/i);
  assert.match(emails[3]!.html, /down to 0 credits/i);
});
