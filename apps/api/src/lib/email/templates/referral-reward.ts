import { renderEmailLayout } from "./shared.js";

export const REFERRAL_REWARD_SUBJECT = "You earned 50 credits! 🎉";

export function buildReferralRewardEmail(props: { name: string; credits: number }) {
  return {
    subject: REFERRAL_REWARD_SUBJECT,
    html: renderEmailLayout({
      actionHref: "https://beomz.ai/studio/settings/referrals",
      actionLabel: "View referrals",
      footer: "Keep sharing your link to earn more rewards as Beomz grows.",
      intro: [
        `Hi ${props.name},`,
        `A new signup used your referral link, so we added ${props.credits} credits to your Beomz account.`,
      ],
      preheader: `${props.credits} referral credits were added to your Beomz account.`,
      title: "You earned referral credits",
    }),
  };
}
