import { renderEmailLayout } from "./shared.js";

export const CREDITS_LOW_SUBJECT = "Your Beomz credits are running low";

export function buildCreditsLowEmail(props: { name: string; remaining: number }) {
  return {
    subject: CREDITS_LOW_SUBJECT,
    html: renderEmailLayout({
      actionHref: "https://beomz.ai/pricing",
      actionLabel: "Buy credits or upgrade",
      footer: "We'll only send this reminder once every 24 hours while your balance stays low.",
      intro: [
        `Hi ${props.name},`,
        `Your Beomz balance is down to ${props.remaining} credits.`,
        "Top up or upgrade your plan to keep builds moving without interruption.",
      ],
      preheader: `Your Beomz balance is down to ${props.remaining} credits.`,
      title: "Your credits are running low",
    }),
  };
}
