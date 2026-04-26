import { renderEmailLayout } from "./shared.js";

export const RESET_PASSWORD_SUBJECT = "Reset your Beomz password";

export function buildResetPasswordEmail(props: { name: string; resetUrl: string }) {
  return {
    subject: RESET_PASSWORD_SUBJECT,
    html: renderEmailLayout({
      actionHref: props.resetUrl,
      actionLabel: "Reset password",
      footer: "This reset link expires in 1 hour.",
      intro: [
        `Hi ${props.name},`,
        "A password reset was requested for your Beomz account. Use the button below to set a new password.",
      ],
      preheader: "Reset your Beomz password.",
      title: "Reset your Beomz password",
    }),
  };
}
