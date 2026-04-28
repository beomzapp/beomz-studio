/**
 * useWebsiteBuilder — BEO-665
 * Manages the SSE stream for /api/websites/generate, accumulates StudioFile[],
 * tracks iteration history, and exposes sendIterate().
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { StudioFile } from "@beomz-studio/contracts";
import { getAccessToken, getApiBaseUrl } from "../lib/api";

export type WebsiteBuildStatus = "idle" | "generating" | "done" | "error";

export interface WebsiteHistoryEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface WebsiteGenerateOptions {
  projectId: string;
  sessionId: string;
  prompt: string;
  siteType?: string;
  vibe?: string;
  signal?: AbortSignal;
}

export interface UseWebsiteBuilderReturn {
  files: readonly StudioFile[] | null;
  buildId: string | null;
  siteName: string | null;
  status: WebsiteBuildStatus;
  statusMessage: string;
  history: WebsiteHistoryEntry[];
  sendIterate: (prompt: string, activeSection?: string) => void;
  stopGeneration: () => void;
  isBuildInProgress: boolean;
  lastIterationAt: number | null;
}

function ts(): string {
  return new Date().toISOString();
}

export function useWebsiteBuilder(
  projectId: string | null,
  initialBrief: string | null,
  wcPatchFileRef?: RefObject<((file: string, content: string) => Promise<void>) | null>,
): UseWebsiteBuilderReturn {
  const [files, setFiles] = useState<readonly StudioFile[] | null>(null);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [status, setStatus] = useState<WebsiteBuildStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [history, setHistory] = useState<WebsiteHistoryEntry[]>([]);
  const [lastIterationAt, setLastIterationAt] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const firedRef = useRef(false);
  const sessionIdRef = useRef(`ws-${Date.now()}`);

  const generate = useCallback(
    async (opts: WebsiteGenerateOptions) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus("generating");
      setStatusMessage("Building your website…");

      setHistory((prev) => [
        ...prev,
        { role: "user", content: opts.prompt, timestamp: ts() },
      ]);

      try {
        const token = await getAccessToken();
        const res = await fetch(`${getApiBaseUrl()}/websites/generate`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "text/event-stream",
          },
          body: JSON.stringify({
            prompt: opts.prompt,
            projectId: opts.projectId,
            sessionId: opts.sessionId,
            siteType: opts.siteType ?? "landing",
            vibe: opts.vibe ?? "minimal",
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let dataLines: string[] = [];

        const flush = () => {
          const payload = dataLines.join("\n").trim();
          dataLines = [];
          if (!payload) return;

          try {
            const event = JSON.parse(payload) as Record<string, unknown>;

            if (event.type === "stage_preamble") {
              const restatement = typeof event.restatement === "string" ? event.restatement : "";
              if (restatement) setStatusMessage(restatement);
            }

            if (event.type === "files") {
              const rawFiles = event.files;
              if (Array.isArray(rawFiles)) {
                const studioFiles: StudioFile[] = rawFiles
                  .filter(
                    (f): f is { path: string; content: string } =>
                      typeof f?.path === "string" && typeof f?.content === "string",
                  )
                  .map((f) => ({
                    path: f.path,
                    kind: inferKind(f.path),
                    language: inferLanguage(f.path),
                    content: f.content,
                    source: "ai" as const,
                    locked: false,
                  }));
                setFiles(studioFiles);
              }
            }

            if (event.type === "done") {
              const msg = typeof event.message === "string" ? event.message : "Website ready.";
              const bid = typeof event.buildId === "string" ? event.buildId : null;
              const sn = extractSiteNameFromEvent(event);
              setStatus("done");
              setStatusMessage(msg);
              if (bid) setBuildId(bid);
              if (sn) setSiteName(sn);
              setLastIterationAt(Date.now());
              setHistory((prev) => [
                ...prev,
                { role: "assistant", content: msg, timestamp: ts() },
              ]);
            }

            if (event.type === "image_update") {
              const file = typeof event.file === "string" ? event.file : null;
              const content = typeof event.content === "string" ? event.content : null;
              if (file && content !== null) {
                void wcPatchFileRef?.current?.(file, content);
              }
            }

            if (event.type === "error") {
              const msg = typeof event.message === "string" ? event.message : "Generation failed.";
              setStatus("error");
              setStatusMessage(msg);
              setHistory((prev) => [
                ...prev,
                { role: "assistant", content: `Error: ${msg}`, timestamp: ts() },
              ]);
            }
          } catch {
            // ignore parse errors
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            flush();
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const nl = buffer.indexOf("\n");
            if (nl === -1) break;
            const raw = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

            if (line.length === 0) {
              flush();
              continue;
            }
            if (line.startsWith("id:") || line.startsWith("event:")) continue;
            if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trim());
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Generation failed.";
        setStatus("error");
        setStatusMessage(msg);
      }
    },
    [],
  );

  // Fire initial generation once when brief + projectId are available
  useEffect(() => {
    if (!projectId || !initialBrief || firedRef.current) return;
    firedRef.current = true;
    void generate({
      projectId,
      sessionId: sessionIdRef.current,
      prompt: initialBrief,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, initialBrief]);

  const sendIterate = useCallback(
    (prompt: string, activeSection?: string) => {
      if (!projectId) return;
      const fullPrompt = activeSection
        ? `[${activeSection} section] ${prompt}`
        : prompt;
      void generate({
        projectId,
        sessionId: sessionIdRef.current,
        prompt: fullPrompt,
      });
    },
    [projectId, generate],
  );

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus("idle");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    files,
    buildId,
    siteName,
    status,
    statusMessage,
    history,
    sendIterate,
    stopGeneration,
    isBuildInProgress: status === "generating",
    lastIterationAt,
  };
}

function inferKind(path: string): StudioFile["kind"] {
  if (/\/(pages|routes|views)\//.test(path) || /App\.(tsx|jsx)$/.test(path)) return "route";
  if (/\/components\//.test(path)) return "component";
  if (/\.css$/.test(path)) return "style";
  if (/\.(json|html)$/.test(path)) return "content";
  return "component";
}

function inferLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    css: "css", html: "html", js: "javascript", json: "json",
    jsx: "jsx", md: "markdown", ts: "typescript", tsx: "tsx",
  };
  return map[ext] ?? "typescript";
}

function extractSiteNameFromEvent(event: Record<string, unknown>): string | null {
  const payload = event.payload;
  if (typeof payload === "object" && payload !== null) {
    const p = payload as Record<string, unknown>;
    if (typeof p.siteName === "string" && p.siteName.trim()) return p.siteName.trim();
  }
  return null;
}
