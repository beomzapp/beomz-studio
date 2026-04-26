import { normalizeEmailName, renderEmailLayout } from "./shared.js";

export const WELCOME_EMAIL_SUBJECT = "Welcome to Beomz 🚀";

export function buildWelcomeEmail(props: { name?: string | null }) {
  const name = normalizeEmailName(props.name);
  return {
    subject: WELCOME_EMAIL_SUBJECT,
    html: renderEmailLayout({
      actionHref: "https://beomz.ai",
      actionLabel: "Start building",
      footer: "Your account now has 100 free credits waiting for your first build.",
      intro: [
        `Hi ${name},`,
        "Welcome to Beomz. Describe what you want to build, and we'll turn it into a working app with live preview.",
        "You have 100 free credits to get started today.",
      ],
      preheader: "Your Beomz account is ready with 100 free credits.",
      title: "Welcome to Beomz",
    }),
  };
}
