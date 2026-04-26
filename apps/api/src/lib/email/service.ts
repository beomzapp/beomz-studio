import type { OrgRow, StudioDbClient, UserRow } from "@beomz-studio/studio-db";

import { getFromEmail, getResendClient } from "./resend.js";
import { buildCreditsLowEmail } from "./templates/credits-low.js";
import { buildReferralRewardEmail } from "./templates/referral-reward.js";
import { buildResetPasswordEmail } from "./templates/reset.js";
import { buildVerifyEmail } from "./templates/verify.js";
import { buildWelcomeEmail } from "./templates/welcome.js";

interface EmailContent {
  html: string;
  subject: string;
}

function redactSensitiveEmailHtml(html: string): string {
  return html.replaceAll(/([?&](?:token|code)=)[^"'&<\s]+/gi, "$1[redacted]");
}

function normalizeDisplayName(name: string | null | undefined, email: string): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const [localPart] = email.split("@");
  const cleaned = localPart?.replace(/[._-]+/g, " ").trim() ?? "";
  return cleaned.length > 0 ? cleaned : "there";
}

async function sendEmail(to: string, content: EmailContent): Promise<void> {
  const html = content.html.trim();
  console.log("[email] generated html", {
    to,
    subject: content.subject,
    htmlLength: html.length,
    html: redactSensitiveEmailHtml(html),
  });

  if (html.length === 0) {
    throw new Error(`Email template rendered empty HTML for subject "${content.subject}"`);
  }

  const resend = getResendClient();
  const response = await resend.emails.send({
    from: getFromEmail(),
    html,
    subject: content.subject,
    to,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }
}

export function getUserDisplayName(user: Pick<UserRow, "email" | "full_name">): string {
  return normalizeDisplayName(user.full_name, user.email);
}

export async function sendVerificationEmail(input: {
  email: string;
  name?: string | null;
  verifyUrl: string;
}): Promise<void> {
  await sendEmail(
    input.email,
    buildVerifyEmail({
      name: normalizeDisplayName(input.name, input.email),
      verifyUrl: input.verifyUrl,
    }),
  );
}

export async function sendResetPasswordEmail(input: {
  email: string;
  name?: string | null;
  resetUrl: string;
}): Promise<void> {
  await sendEmail(
    input.email,
    buildResetPasswordEmail({
      name: normalizeDisplayName(input.name, input.email),
      resetUrl: input.resetUrl,
    }),
  );
}

export async function sendWelcomeEmail(input: {
  email: string;
  name?: string | null;
}): Promise<void> {
  await sendEmail(
    input.email,
    buildWelcomeEmail({
      name: normalizeDisplayName(input.name, input.email),
    }),
  );
}

export async function sendReferralRewardEmail(input: {
  credits: number;
  email: string;
  name?: string | null;
}): Promise<void> {
  await sendEmail(
    input.email,
    buildReferralRewardEmail({
      credits: input.credits,
      name: normalizeDisplayName(input.name, input.email),
    }),
  );
}

export async function sendCreditsLowEmail(input: {
  email: string;
  name?: string | null;
  remaining: number;
}): Promise<void> {
  await sendEmail(
    input.email,
    buildCreditsLowEmail({
      name: normalizeDisplayName(input.name, input.email),
      remaining: input.remaining,
    }),
  );
}

type CreditsLowNotificationDb = Pick<
  StudioDbClient,
  "findUserById" | "getOrgWithBalance" | "updateUser"
>;

function hasRecentCreditsLowEmail(user: UserRow, now: Date): boolean {
  if (!user.last_credits_low_email) {
    return false;
  }

  const sentAt = Date.parse(user.last_credits_low_email);
  return Number.isFinite(sentAt) && sentAt > now.getTime() - 24 * 60 * 60 * 1000;
}

function getRemainingCredits(org: OrgRow): number {
  return Number(org.credits ?? 0) + Number(org.topup_credits ?? 0);
}

function supportsCreditsLowEmailTracking(user: UserRow): boolean {
  return Object.prototype.hasOwnProperty.call(user, "last_credits_low_email");
}

export async function maybeSendCreditsLowEmailForUser(input: {
  db: CreditsLowNotificationDb;
  now?: Date;
  orgId: string;
  userId: string | null;
}): Promise<void> {
  if (!input.userId) {
    return;
  }

  const [user, org] = await Promise.all([
    input.db.findUserById(input.userId),
    input.db.getOrgWithBalance(input.orgId),
  ]);

  if (!user?.email || !org) {
    return;
  }

  if (!supportsCreditsLowEmailTracking(user)) {
    console.warn("[email] skipping low credits email because tracking column is unavailable");
    return;
  }

  const now = input.now ?? new Date();
  const remaining = getRemainingCredits(org);
  if (remaining >= 20 || hasRecentCreditsLowEmail(user, now)) {
    return;
  }

  await sendCreditsLowEmail({
    email: user.email,
    name: user.full_name ?? null,
    remaining,
  });

  await input.db.updateUser(user.id, {
    last_credits_low_email: now.toISOString(),
  });
}
