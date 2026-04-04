import path from "node:path";

import type { PreviewRuntimeContract, StudioFile } from "@beomz-studio/contracts";

import {
  PREVIEW_RUNTIME_CONTRACT_PATH,
  serializeRuntimeContract,
} from "./contract.js";

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

function buildGeneratedPageComponentName(filePath: string): string {
  const normalized = filePath.replace(/^apps\/web\/src\/app\/generated\//, "").replace(/\.tsx$/, "");
  return `Generated${toPascalCase(normalized)}`;
}

function normalizeGeneratedPath(filePath: string): string {
  return path.posix.normalize(filePath.replaceAll("\\", "/")).replace(/^\.\//, "");
}

function escapeTemplateLiteral(value: string): string {
  return JSON.stringify(value);
}

function buildShellRouteFile(runtime: PreviewRuntimeContract, route: PreviewRuntimeContract["routes"][number]): StudioFile {
  const componentName = buildGeneratedPageComponentName(route.filePath);

  return {
    content: `export default function ${componentName}() {
  const projectName = ${escapeTemplateLiteral(runtime.project.name)};
  const routeLabel = ${escapeTemplateLiteral(route.label)};
  const routeSummary = ${escapeTemplateLiteral(route.summary)};
  const shell = ${escapeTemplateLiteral(runtime.shell)};

  return (
    <section className="beomz-stage">
      <div className="beomz-eyebrow">Preview booting</div>
      <h1>{routeLabel}</h1>
      <p>
        The deterministic {shell} shell for {projectName} is live now. Generated files
        will stream into this surface as soon as the build pipeline validates them.
      </p>
      <div className="beomz-stage-grid">
        <article className="beomz-card">
          <span>Entry path</span>
          <strong>${runtime.entryPath}</strong>
        </article>
        <article className="beomz-card">
          <span>Route</span>
          <strong>{routeSummary}</strong>
        </article>
        <article className="beomz-card">
          <span>Mode</span>
          <strong>Hot preview shell</strong>
        </article>
      </div>
    </section>
  );
}
`,
    kind: "route",
    language: "tsx",
    locked: false,
    path: route.filePath,
    source: "platform",
  };
}

export function mergePreviewFiles(
  runtime: PreviewRuntimeContract,
  generatedFiles: readonly StudioFile[],
): readonly StudioFile[] {
  const normalizedGeneratedFiles = generatedFiles.map((file) => ({
    ...file,
    path: normalizeGeneratedPath(file.path),
  }));
  const generatedByPath = new Map(normalizedGeneratedFiles.map((file) => [file.path, file]));
  const routePaths = new Set(runtime.routes.map((route) => route.filePath));

  const routeFiles = runtime.routes.map((route) =>
    generatedByPath.get(route.filePath) ?? buildShellRouteFile(runtime, route));
  const supplementalFiles = normalizedGeneratedFiles.filter((file) => !routePaths.has(file.path));

  return [...routeFiles, ...supplementalFiles];
}

export function buildSandboxPath(workdir: string, filePath: string): string {
  return path.posix.join(workdir, normalizeGeneratedPath(filePath));
}

export function buildPreviewWorkspaceWrites(input: {
  runtime: PreviewRuntimeContract;
  files: readonly StudioFile[];
  workdir: string;
}): Array<{ path: string; data: string }> {
  return [
    {
      data: serializeRuntimeContract(input.runtime),
      path: buildSandboxPath(input.workdir, PREVIEW_RUNTIME_CONTRACT_PATH),
    },
    ...input.files.map((file) => ({
      data: file.content,
      path: buildSandboxPath(input.workdir, file.path),
    })),
  ];
}
