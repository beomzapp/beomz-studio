import path from "node:path";

import type { StudioFile, StudioFileKind } from "@beomz-studio/contracts";
import { minimatch } from "minimatch";

export interface VirtualFileEntry {
  path: string;
  content: string;
}

export interface VirtualFileSystemSnapshot {
  version: number;
  files: readonly VirtualFileEntry[];
}

export interface VirtualFileDiffEntry {
  type: "created" | "updated" | "deleted";
  path: string;
  before?: string;
  after?: string;
}

export interface ServiceWorkerLike {
  postMessage(message: unknown): void;
}

export type VirtualFileSystemMountMessage =
  | {
      type: "beomz.vfs.mount";
      snapshot: VirtualFileSystemSnapshot;
      diff: readonly VirtualFileDiffEntry[];
    }
  | {
      type: "beomz.vfs.update";
      snapshot: VirtualFileSystemSnapshot;
      diff: readonly VirtualFileDiffEntry[];
    }
  | {
      type: "beomz.vfs.unmount";
    };

type VirtualFileSystemListener = (payload: {
  snapshot: VirtualFileSystemSnapshot;
  diff: readonly VirtualFileDiffEntry[];
}) => void;

function splitContentLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }

  return content.replace(/\r\n/g, "\n").split("\n");
}

function inferLanguage(filePath: string): string {
  const extension = path.posix.extname(filePath).toLowerCase();

  switch (extension) {
    case ".tsx":
      return "tsx";
    case ".ts":
      return "ts";
    case ".jsx":
      return "jsx";
    case ".js":
      return "js";
    case ".json":
      return "json";
    case ".css":
      return "css";
    case ".scss":
      return "scss";
    case ".html":
      return "html";
    case ".md":
      return "md";
    case ".mdx":
      return "mdx";
    case ".txt":
      return "txt";
    case ".svg":
      return "svg";
    default:
      return extension.replace(/^\./, "") || "txt";
  }
}

function inferFileKind(filePath: string): StudioFileKind {
  const normalized = filePath.toLowerCase();
  const baseName = path.posix.basename(normalized);

  if (baseName.startsWith("layout.")) {
    return "layout";
  }

  if (
    normalized.includes("/app/generated/")
    || normalized.includes("/pages/")
    || normalized.includes("/routes/")
  ) {
    return "route";
  }

  if (normalized.includes("/components/")) {
    return "component";
  }

  if (
    normalized.includes("/styles/")
    || normalized.endsWith(".css")
    || normalized.endsWith(".scss")
  ) {
    return "style";
  }

  if (
    normalized.endsWith(".json")
    || normalized.endsWith(".yaml")
    || normalized.endsWith(".yml")
    || normalized.endsWith(".toml")
    || baseName === "package.json"
    || baseName === "tsconfig.json"
  ) {
    return "config";
  }

  if (
    normalized.endsWith(".md")
    || normalized.endsWith(".mdx")
    || normalized.endsWith(".txt")
    || normalized.endsWith(".html")
  ) {
    return "content";
  }

  return "data";
}

interface ParsedUnifiedDiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

function parseUnifiedDiff(diffText: string, filePath: string): ParsedUnifiedDiffHunk[] {
  const lines = diffText.replace(/\r\n/g, "\n").split("\n");
  const hunks: ParsedUnifiedDiffHunk[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (!line.startsWith("@@")) {
      index += 1;
      continue;
    }

    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) {
      throw new Error(`Invalid unified diff header for ${filePath}: ${line}`);
    }

    index += 1;

    const hunk: ParsedUnifiedDiffHunk = {
      oldStart: Number(match[1] ?? 0),
      oldCount: Number(match[2] ?? "1"),
      newStart: Number(match[3] ?? 0),
      newCount: Number(match[4] ?? "1"),
      lines: [],
    };

    while (index < lines.length) {
      const nextLine = lines[index] ?? "";

      if (nextLine.startsWith("@@")) {
        break;
      }

      if (nextLine.startsWith("\\ No newline at end of file")) {
        index += 1;
        continue;
      }

      if (nextLine === "") {
        index += 1;
        continue;
      }

      const prefix = nextLine[0];
      if (prefix !== " " && prefix !== "+" && prefix !== "-") {
        break;
      }

      hunk.lines.push(nextLine);
      index += 1;
    }

    hunks.push(hunk);
  }

  if (hunks.length === 0) {
    throw new Error(`Unified diff for ${filePath} did not contain any hunks.`);
  }

  return hunks;
}

function applyUnifiedDiffToText(
  currentContent: string,
  diffText: string,
  filePath: string,
): string {
  const originalLines = splitContentLines(currentContent);
  const resultLines: string[] = [];
  const hunks = parseUnifiedDiff(diffText, filePath);
  let cursor = 0;

  for (const hunk of hunks) {
    const oldStartIndex = Math.max(hunk.oldStart - 1, 0);

    while (cursor < oldStartIndex && cursor < originalLines.length) {
      resultLines.push(originalLines[cursor] ?? "");
      cursor += 1;
    }

    let localCursor = oldStartIndex;

    for (const line of hunk.lines) {
      const operation = line[0];
      const value = line.slice(1);

      if (operation === " ") {
        const currentLine = originalLines[localCursor];
        if (currentLine !== value) {
          throw new Error(
            `Patch context mismatch for ${filePath} at line ${localCursor + 1}.`,
          );
        }

        resultLines.push(currentLine);
        localCursor += 1;
        continue;
      }

      if (operation === "-") {
        const currentLine = originalLines[localCursor];
        if (currentLine !== value) {
          throw new Error(
            `Patch removal mismatch for ${filePath} at line ${localCursor + 1}.`,
          );
        }

        localCursor += 1;
        continue;
      }

      if (operation === "+") {
        resultLines.push(value);
      }
    }

    cursor = localCursor;
  }

  while (cursor < originalLines.length) {
    resultLines.push(originalLines[cursor] ?? "");
    cursor += 1;
  }

  return resultLines.join("\n");
}

export function normalizeVirtualPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    throw new Error("File path cannot be empty.");
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (
    normalized.length === 0
    || normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
    || path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Invalid virtual file path: ${rawPath}`);
  }

  return normalized.replace(/^\.\//, "");
}

function normalizePattern(pattern: string): string {
  const normalized = pattern.trim().replaceAll("\\", "/");
  return normalized.length > 0 ? normalized : "**/*";
}

export class VirtualFileSystem {
  private readonly files = new Map<string, string>();
  private readonly listeners = new Set<VirtualFileSystemListener>();
  private version = 0;

  constructor(initialFiles: readonly VirtualFileEntry[] = []) {
    for (const file of initialFiles) {
      this.files.set(normalizeVirtualPath(file.path), file.content);
    }
  }

  has(filePath: string): boolean {
    return this.files.has(normalizeVirtualPath(filePath));
  }

  read(filePath: string): string | undefined {
    return this.files.get(normalizeVirtualPath(filePath));
  }

  write(filePath: string, content: string): readonly VirtualFileDiffEntry[] {
    const normalizedPath = normalizeVirtualPath(filePath);
    const previousContent = this.files.get(normalizedPath);

    if (previousContent === content) {
      return [];
    }

    this.files.set(normalizedPath, content);
    this.version += 1;

    const diff = [
      {
        type: previousContent === undefined ? "created" : "updated",
        path: normalizedPath,
        before: previousContent,
        after: content,
      } satisfies VirtualFileDiffEntry,
    ];

    this.notify(diff);
    return diff;
  }

  delete(filePath: string): readonly VirtualFileDiffEntry[] {
    const normalizedPath = normalizeVirtualPath(filePath);
    const previousContent = this.files.get(normalizedPath);

    if (previousContent === undefined) {
      return [];
    }

    this.files.delete(normalizedPath);
    this.version += 1;

    const diff = [
      {
        type: "deleted",
        path: normalizedPath,
        before: previousContent,
      } satisfies VirtualFileDiffEntry,
    ];

    this.notify(diff);
    return diff;
  }

  list(pattern = "**/*"): string[] {
    const normalizedPattern = normalizePattern(pattern);

    return [...this.files.keys()]
      .filter((filePath) => minimatch(filePath, normalizedPattern, { dot: true }))
      .sort((left, right) => left.localeCompare(right));
  }

  entries(): VirtualFileEntry[] {
    return [...this.files.entries()]
      .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
      .map(([filePath, content]) => ({
        content,
        path: filePath,
      }));
  }

  snapshot(): VirtualFileSystemSnapshot {
    return {
      files: this.entries(),
      version: this.version,
    };
  }

  restore(snapshot: VirtualFileSystemSnapshot): readonly VirtualFileDiffEntry[] {
    const previousSnapshot = this.snapshot();
    this.files.clear();

    for (const file of snapshot.files) {
      this.files.set(normalizeVirtualPath(file.path), file.content);
    }

    this.version = snapshot.version;
    const diff = this.diff(previousSnapshot);
    this.notify(diff);
    return diff;
  }

  diff(snapshot: VirtualFileSystemSnapshot): readonly VirtualFileDiffEntry[] {
    const previousFiles = new Map(
      snapshot.files.map((file) => [normalizeVirtualPath(file.path), file.content] as const),
    );
    const changes: VirtualFileDiffEntry[] = [];

    for (const [filePath, previousContent] of previousFiles) {
      const nextContent = this.files.get(filePath);

      if (nextContent === undefined) {
        changes.push({
          before: previousContent,
          path: filePath,
          type: "deleted",
        });
        continue;
      }

      if (nextContent !== previousContent) {
        changes.push({
          after: nextContent,
          before: previousContent,
          path: filePath,
          type: "updated",
        });
      }
    }

    for (const [filePath, nextContent] of this.files) {
      if (previousFiles.has(filePath)) {
        continue;
      }

      changes.push({
        after: nextContent,
        path: filePath,
        type: "created",
      });
    }

    return changes.sort((left, right) => left.path.localeCompare(right.path));
  }

  applyPatch(filePath: string, unifiedDiff: string): string {
    const normalizedPath = normalizeVirtualPath(filePath);
    const currentContent = this.files.get(normalizedPath);

    if (currentContent === undefined) {
      throw new Error(`Cannot patch missing file: ${normalizedPath}`);
    }

    const nextContent = applyUnifiedDiffToText(currentContent, unifiedDiff, normalizedPath);
    this.write(normalizedPath, nextContent);
    return nextContent;
  }

  subscribe(listener: VirtualFileSystemListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  mount(serviceWorker: ServiceWorkerLike): () => void {
    const emit = (message: VirtualFileSystemMountMessage) => {
      serviceWorker.postMessage(message);
    };

    const unsubscribe = this.subscribe(({ diff, snapshot }) => {
      emit({
        diff,
        snapshot,
        type: "beomz.vfs.update",
      });
    });

    emit({
      diff: [],
      snapshot: this.snapshot(),
      type: "beomz.vfs.mount",
    });

    return () => {
      unsubscribe();
      emit({ type: "beomz.vfs.unmount" });
    };
  }

  toStudioFiles(): StudioFile[] {
    return this.entries().map((file) => ({
      content: file.content,
      kind: inferFileKind(file.path),
      language: inferLanguage(file.path),
      locked: false,
      path: file.path,
      source: "ai",
    }));
  }

  private notify(diff: readonly VirtualFileDiffEntry[]): void {
    if (diff.length === 0) {
      return;
    }

    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener({ diff, snapshot });
    }
  }
}
