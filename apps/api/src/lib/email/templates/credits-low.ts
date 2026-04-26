import { normalizeEmailName, renderEmailLayout } from "./shared.js";

export const CREDITS_LOW_SUBJECT = "Your Beomz credits are running low";

export function buildCreditsLowEmail(props: { name?: string | null; remaining: number }) {
  const name = normalizeEmailName(props.name);
  const remaining = Number.isFinite(props.remaining) ? props.remaining : 0;
  return {
    subject: CREDITS_LOW_SUBJECT,
    html: renderEmailLayout({
      actionHref: "https://beomz.ai/pricing",
      actionLabel: "Buy credits or upgrade",
      footer: "We'll only send this reminder once every 24 hours while your balance stays low.",
      intro: [
        `Hi ${name},`,
        `Your Beomz balance is down to ${remaining} credits.`,
        "Top up or upgrade your plan to keep builds moving without interruption.",
      ],
      preheader: `Your Beomz balance is down to ${remaining} credits.`,
      title: "Your credits are running low",
    }),
  };
}
