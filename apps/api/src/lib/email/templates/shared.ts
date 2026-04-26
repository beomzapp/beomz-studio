function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;color:#d4d4d8;font-size:16px;line-height:1.65;">${escapeHtml(text)}</p>`;
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
  const action = input.actionHref && input.actionLabel
    ? actionButton(input.actionLabel, input.actionHref)
    : "";
  const footer = input.footer
    ? `<p style="margin:24px 0 0;color:#a1a1aa;font-size:13px;line-height:1.6;">${escapeHtml(input.footer)}</p>`
    : "";

  return [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${escapeHtml(input.title)}</title>`,
    `</head>`,
    `<body style="margin:0;background:#09090b;padding:32px 16px;font-family:Inter,Helvetica,Arial,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
        <tr>
          <td style="padding:32px;border:1px solid rgba(249,115,22,0.18);border-radius:28px;background:linear-gradient(180deg,#18181b 0%,#09090b 100%);box-shadow:0 22px 70px rgba(0,0,0,0.35);">
            <div style="margin-bottom:24px;">
              <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(249,115,22,0.12);color:#fb923c;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Beomz</div>
            </div>
            <h1 style="margin:0 0 18px;color:#ffffff;font-size:28px;line-height:1.2;">${escapeHtml(input.title)}</h1>
            ${input.intro.map(paragraph).join("")}
            ${action}
            ${footer}
          </td>
        </tr>
      </table>
    </body>`,
    "</html>",
  ].join("");
}
