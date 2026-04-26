function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const BEOMZ_LOGO_SVG = `
<svg width="30" height="34" viewBox="0 0 690 768" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Beomz logo">
  <path d="M580.46 370.68C597.69 379.32 613.12 390.73 626.88 405.64C669.02 446.95 689.56 496.37 689.56 553.44C689.56 610.51 669.26 661.26 626.88 704.16C585.23 746.36 530.94 767.48 463.93 767.48H0.00994873L580.47 370.68H580.46ZM0 246.14V0H423.23C487.78 0 540 20.25 580.78 60.83C621.37 101.18 641.62 149.06 641.62 204.9C641.62 219.2 640.34 232.94 637.77 246.13H0V246.14Z" fill="currentColor"/>
</svg>`;

export function normalizeEmailName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "there";
}

function logoLockup(): string {
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">',
    "<tr>",
    `<td style="padding:0 12px 0 0;vertical-align:middle;color:#f97316;line-height:0;">
      ${BEOMZ_LOGO_SVG}
    </td>`,
    '<td style="padding:0;vertical-align:middle;font-size:20px;line-height:1;font-weight:700;color:#111827;letter-spacing:-0.02em;">Beomz</td>',
    "</tr>",
    "</table>",
  ].join("");
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.65;">${escapeHtml(text)}</p>`;
}

function actionButton(label: string, href: string): string {
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 28px;">',
    "<tr>",
    `<td style="border-radius:999px;background:#f97316;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">
        ${escapeHtml(label)}
      </a>
    </td>`,
    "</tr>",
    "</table>",
  ].join("");
}

export function renderEmailLayout(input: {
  actionHref?: string;
  actionLabel?: string;
  footer?: string;
  intro: string[];
  preheader: string;
  title: string;
}) {
  const title = input.title.trim() || "Beomz";
  const preheader = input.preheader.trim() || title;
  const intro = input.intro
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const paragraphs = intro.length > 0 ? intro : ["Your Beomz account is ready."];
  const actionHref = input.actionHref?.trim() ?? "";
  const actionLabel = input.actionLabel?.trim() ?? "";
  const action = actionHref && actionLabel
    ? actionButton(actionLabel, actionHref)
    : "";
  const footer = input.footer?.trim()
    ? `<p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">${escapeHtml(input.footer.trim())}</p>`
    : "";

  return [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${escapeHtml(title)}</title>`,
    `</head>`,
    `<body bgcolor="#faf9f6" style="margin:0;background-color:#faf9f6;padding:32px 16px;font-family:Inter,Helvetica,Arial,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#faf9f6" style="max-width:560px;margin:0 auto;background-color:#faf9f6;">
        <tr>
          <td bgcolor="#ffffff" style="padding:36px;border:1px solid #ece7df;border-radius:28px;background-color:#ffffff;box-shadow:0 20px 60px rgba(15,23,42,0.08);">
            ${logoLockup()}
            <h1 style="margin:0 0 18px;color:#111827;font-size:28px;line-height:1.2;letter-spacing:-0.02em;">${escapeHtml(title)}</h1>
            ${paragraphs.map(paragraph).join("")}
            ${action}
            ${footer}
          </td>
        </tr>
      </table>
    </body>`,
    "</html>",
  ].join("");
}
