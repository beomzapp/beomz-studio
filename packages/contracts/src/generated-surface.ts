import type { PreviewAuthPolicy, PreviewNavigationItem, PreviewRuntimeRoute } from "./previews.js";
import type { StudioFile } from "./studio.js";
import type { TemplateDefinition, TemplateId } from "./templates.js";

export const GENERATED_APP_MANIFEST_VERSION = 1 as const;

export interface GeneratedAppManifestRoute {
  id: string;
  path: string;
  label: string;
  summary: string;
  auth: PreviewAuthPolicy;
  inPrimaryNav: boolean;
  filePath: string;
}

export interface GeneratedAppManifest {
  version: typeof GENERATED_APP_MANIFEST_VERSION;
  templateId: TemplateId;
  shell: TemplateDefinition["shell"];
  entryPath: string;
  routes: readonly GeneratedAppManifestRoute[];
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

export function normalizeGeneratedPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

export function buildGeneratedManifestPath(templateId: TemplateId): string {
  return `apps/web/src/generated/${templateId}/app.manifest.json`;
}

export function buildGeneratedThemeFilePath(templateId: TemplateId): string {
  return `apps/web/src/generated/${templateId}/theme.ts`;
}

export function buildGeneratedDataFilePath(templateId: TemplateId): string {
  return `apps/web/src/generated/${templateId}/data.ts`;
}

export function buildGeneratedNavigationFilePath(templateId: TemplateId): string {
  return `apps/web/src/generated/${templateId}/navigation.ts`;
}

export function buildGeneratedPageFilePath(templateId: TemplateId, pageId: string): string {
  return `apps/web/src/app/generated/${templateId}/${pageId}.tsx`;
}

export function buildGeneratedAppShellPath(templateId: TemplateId): string {
  return `apps/web/src/components/generated/${templateId}/AppShell.tsx`;
}

export function buildGeneratedUiComponentPath(templateId: TemplateId, componentName: string): string {
  return `apps/web/src/components/generated/${templateId}/ui/${componentName}.tsx`;
}

export function buildGeneratedPageComponentName(templateId: TemplateId, pageId: string): string {
  return `Generated${toPascalCase(templateId)}${toPascalCase(pageId)}Page`;
}

export function buildGeneratedManifest(template: TemplateDefinition): GeneratedAppManifest {
  return {
    entryPath: template.previewEntryPath,
    routes: template.pages.map((page) => ({
      auth: page.requiresAuth ? "authenticated" : "public",
      filePath: buildGeneratedPageFilePath(template.id, page.id),
      id: `${template.id}:${page.id}`,
      inPrimaryNav: page.inPrimaryNav,
      label: page.navigationLabel,
      path: page.path,
      summary: page.summary,
    })),
    shell: template.shell,
    templateId: template.id,
    version: GENERATED_APP_MANIFEST_VERSION,
  };
}

export function buildGeneratedNavigationFromManifest(
  manifest: GeneratedAppManifest,
): readonly PreviewNavigationItem[] {
  return manifest.routes
    .filter((route) => route.inPrimaryNav)
    .map((route) => ({
      auth: route.auth,
      href: route.path,
      id: route.id,
      label: route.label,
    }));
}

export function buildGeneratedRoutesFromManifest(
  manifest: GeneratedAppManifest,
): readonly PreviewRuntimeRoute[] {
  return manifest.routes.map((route) => ({ ...route }));
}

function isPreviewAuthPolicy(value: unknown): value is PreviewAuthPolicy {
  return value === "public" || value === "authenticated";
}

function isManifestRoute(value: unknown): value is GeneratedAppManifestRoute {
  return typeof value === "object"
    && value !== null
    && typeof (value as GeneratedAppManifestRoute).id === "string"
    && typeof (value as GeneratedAppManifestRoute).path === "string"
    && typeof (value as GeneratedAppManifestRoute).label === "string"
    && typeof (value as GeneratedAppManifestRoute).summary === "string"
    && typeof (value as GeneratedAppManifestRoute).filePath === "string"
    && typeof (value as GeneratedAppManifestRoute).inPrimaryNav === "boolean"
    && isPreviewAuthPolicy((value as GeneratedAppManifestRoute).auth);
}

function isGeneratedAppManifest(value: unknown): value is GeneratedAppManifest {
  return typeof value === "object"
    && value !== null
    && (value as GeneratedAppManifest).version === GENERATED_APP_MANIFEST_VERSION
    && typeof (value as GeneratedAppManifest).templateId === "string"
    && typeof (value as GeneratedAppManifest).entryPath === "string"
    && typeof (value as GeneratedAppManifest).shell === "string"
    && Array.isArray((value as GeneratedAppManifest).routes)
    && (value as GeneratedAppManifest).routes.every(isManifestRoute);
}

export function readGeneratedManifestFromFiles(
  templateId: TemplateId,
  files: readonly Pick<StudioFile, "path" | "content">[],
): GeneratedAppManifest | null {
  const manifestPath = buildGeneratedManifestPath(templateId);
  const manifestFile = files.find(
    (file) => normalizeGeneratedPath(file.path) === manifestPath,
  );

  if (!manifestFile) {
    return null;
  }

  try {
    const parsed = JSON.parse(manifestFile.content) as unknown;
    if (!isGeneratedAppManifest(parsed) || parsed.templateId !== templateId) {
      return null;
    }

    return {
      ...parsed,
      entryPath: normalizeGeneratedPath(parsed.entryPath).startsWith("/")
        ? parsed.entryPath
        : `/${parsed.entryPath.replace(/^\/+/, "")}`,
      routes: parsed.routes.map((route) => ({
        ...route,
        filePath: normalizeGeneratedPath(route.filePath),
      })),
    };
  } catch {
    return null;
  }
}

export function buildRequiredGeneratedScaffoldPaths(
  template: TemplateDefinition,
): readonly string[] {
  return [
    buildGeneratedManifestPath(template.id),
    buildGeneratedThemeFilePath(template.id),
    buildGeneratedDataFilePath(template.id),
    buildGeneratedNavigationFilePath(template.id),
    buildGeneratedAppShellPath(template.id),
    buildGeneratedUiComponentPath(template.id, "PrimaryButton"),
    buildGeneratedUiComponentPath(template.id, "SurfaceCard"),
  ];
}
