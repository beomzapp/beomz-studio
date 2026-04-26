import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

export function getFromEmail(): string {
  const fromEmail = process.env.FROM_EMAIL?.trim();
  if (!fromEmail) {
    throw new Error("FROM_EMAIL is not configured");
  }

  return fromEmail;
}
