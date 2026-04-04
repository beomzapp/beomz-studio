import type { PreviewRuntimeContract } from "@beomz-studio/contracts";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildLocalFallbackHtml(input: {
  runtime: PreviewRuntimeContract;
  message?: string;
  title?: string;
}): string {
  const { runtime } = input;
  const title = input.title ?? `Preview unavailable for ${runtime.project.name}`;
  const message =
    input.message
    ?? "We kept the preview warm locally while the remote sandbox recovers.";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(runtime.project.name)} preview fallback</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Geist Sans", system-ui, sans-serif;
        --bg: #050816;
        --panel: rgba(12, 18, 38, 0.92);
        --border: rgba(255, 255, 255, 0.09);
        --text: rgba(255, 255, 255, 0.92);
        --muted: rgba(255, 255, 255, 0.62);
        --accent: #f97316;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top, rgba(249, 115, 22, 0.22), transparent 45%),
          linear-gradient(160deg, #050816 0%, #0d1630 48%, #050816 100%);
        color: var(--text);
      }

      main {
        width: min(1040px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 24px 0 40px;
      }

      .shell {
        border: 1px solid var(--border);
        border-radius: 28px;
        background: var(--panel);
        backdrop-filter: blur(18px);
        overflow: hidden;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      }

      header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 20px 24px;
        border-bottom: 1px solid var(--border);
      }

      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      nav a {
        color: var(--muted);
        text-decoration: none;
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 999px;
      }

      section {
        padding: 28px 24px 32px;
      }

      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 11px;
        color: var(--accent);
        margin-bottom: 14px;
      }

      h1 {
        margin: 0;
        font-size: clamp(28px, 5vw, 48px);
        line-height: 1.05;
      }

      p {
        max-width: 720px;
        color: var(--muted);
        line-height: 1.7;
      }

      ul {
        margin: 24px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 12px;
      }

      li {
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.03);
      }

      strong {
        display: block;
        margin-bottom: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="shell">
        <header>
          <div>
            <div class="eyebrow">${escapeHtml(runtime.shell)} shell</div>
            <strong>${escapeHtml(runtime.project.name)}</strong>
          </div>
          <nav>
            ${runtime.navigation.map((item) =>
    `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("")}
          </nav>
        </header>
        <section>
          <div class="eyebrow">Local fallback</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}</p>
          <ul>
            ${runtime.routes.map((route) => `
              <li>
                <strong>${escapeHtml(route.label)} <span style="color: var(--muted); font-weight: 400;">${escapeHtml(route.path)}</span></strong>
                <span style="color: var(--muted);">${escapeHtml(route.summary)}</span>
              </li>
            `).join("")}
          </ul>
        </section>
      </div>
    </main>
  </body>
</html>`;
}
