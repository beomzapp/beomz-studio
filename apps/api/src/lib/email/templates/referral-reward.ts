import { normalizeEmailName, renderEmailLayout } from "./shared.js";

export const REFERRAL_REWARD_SUBJECT = "You earned 50 credits! 🎉";

export function buildReferralRewardEmail(props: { name?: string | null; credits: number }) {
  const name = normalizeEmailName(props.name);
  const credits = Number.isFinite(props.credits) ? props.credits : 0;
  return {
    subject: REFERRAL_REWARD_SUBJECT,
    html: renderEmailLayout({
      actionHref: "https://beomz.ai/studio/settings/referrals",
      actionLabel: "View referrals",
      footer: "Keep sharing your link to earn more rewards as Beomz grows.",
      intro: [
        `Hi ${name},`,
        `A new signup used your referral link, so we added ${credits} credits to your Beomz account.`,
      ],
      preheader: `${credits} referral credits were added to your Beomz account.`,
      title: "You earned referral credits",
    }),
  };
}
