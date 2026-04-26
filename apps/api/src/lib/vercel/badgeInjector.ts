import type { VercelDeployFile } from "../vercelDeploy.js";

const FREE_PLAN_BEOMZ_BADGE_HTML = '<a id="beomz-badge" href="https://beomz.ai" target="_blank" rel="noopener" style="position:fixed;bottom:16px;right:16px;z-index:9999;background:#F97316;color:#fff;font-family:sans-serif;font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;text-decoration:none;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,0.15);">⚡ Built with Beomz</a>';

export function injectFreePlanBeomzBadge(
  files: readonly VercelDeployFile[],
  plan: string | null | undefined,
): VercelDeployFile[] {
  if ((plan ?? "free") !== "free") {
    return [...files];
  }

  return files.map((file) => {
    if (file.filename !== "index.html") {
      return file;
    }

    const bodyCloseIndex = file.content.toLowerCase().lastIndexOf("</body>");
    if (bodyCloseIndex === -1) {
      return file;
    }

    return {
      ...file,
      content:
        file.content.slice(0, bodyCloseIndex)
        + `${FREE_PLAN_BEOMZ_BADGE_HTML}\n`
        + file.content.slice(bodyCloseIndex),
    };
  });
}
