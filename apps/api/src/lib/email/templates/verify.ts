import { normalizeEmailName, renderEmailLayout } from "./shared.js";

export const VERIFY_EMAIL_SUBJECT = "Verify your Beomz account";

export function buildVerifyEmail(props: { name?: string | null; verifyUrl: string }) {
  const name = normalizeEmailName(props.name);
  return {
    subject: VERIFY_EMAIL_SUBJECT,
    html: renderEmailLayout({
      actionHref: props.verifyUrl,
      actionLabel: "Verify email",
      footer: "This verification link expires in 24 hours.",
      intro: [
        `Hi ${name},`,
        "Thanks for signing up to Beomz. Confirm your email to activate your account and start building.",
      ],
      preheader: "Verify your email to activate your Beomz account.",
      title: "Verify your Beomz account",
    }),
  };
}
