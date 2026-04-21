import { tavily } from "@tavily/core";
import type { TavilyClient, TavilyClientOptions } from "@tavily/core";

import { apiConfig } from "../config.js";

const JINA_FETCH_TIMEOUT_MS = 8_000;
const MAX_WEBSITE_CONTENT_LENGTH = 8_000;
const MAX_BUILD_REFERENCE_CONTENT_LENGTH = 4_000;
const MAX_TAVILY_RESULTS = 3;

const HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/i;
const DOMAIN_PATTERN = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"'`]*)?/i;
const RESEARCH_PREFIX_PATTERN = /^(?:please\s+)?(?:research|search(?:\s+for)?|look\s+up|find|check|browse|learn\s+about|tell\s+me\s+about|what\s+is|who\s+is)\s+/i;

export interface WebsiteContext {
  content: string | null;
  fetchFailed: boolean;
  label: string;
  sourceType: "search" | "url";
  url?: string;
}

let tavilyClientFactory: (options?: TavilyClientOptions) => TavilyClient = tavily;

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[),.;!?]+$/, "");
}

function isEmailDomainMatch(sourceText: string, matchIndex: number): boolean {
  return matchIndex > 0 && sourceText[matchIndex - 1] === "@";
}

export function extractUrlLike(text: string): string | null {
  const httpMatch = HTTP_URL_PATTERN.exec(text);
  if (httpMatch?.[0]) {
    return stripTrailingPunctuation(httpMatch[0]);
  }

  const domainMatch = DOMAIN_PATTERN.exec(text);
  if (domainMatch?.[0] && !isEmailDomainMatch(text, domainMatch.index)) {
    return `https://${stripTrailingPunctuation(domainMatch[0])}`;
  }

  return null;
}

export async function fetchUrlContent(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), JINA_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed.slice(0, MAX_WEBSITE_CONTENT_LENGTH);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function extractResearchQuery(text: string): string | null {
  const withoutUrl = text.replace(HTTP_URL_PATTERN, " ").trim();
  const stripped = withoutUrl
    .replace(RESEARCH_PREFIX_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();

  const query = stripped.length > 0 ? stripped : withoutUrl.replace(/\s+/g, " ").trim();
  return query.length > 0 ? query : null;
}

export function canUseTavilySearch(message: string): boolean {
  return Boolean(apiConfig.TAVILY_API_KEY && extractResearchQuery(message));
}

export function setTavilyClientFactoryForTests(
  factory: (options?: TavilyClientOptions) => TavilyClient,
): void {
  tavilyClientFactory = factory;
}

export function resetTavilyClientFactoryForTests(): void {
  tavilyClientFactory = tavily;
}

export async function loadUrlContext(message: string): Promise<WebsiteContext | null> {
  const url = extractUrlLike(message);
  if (!url) {
    return null;
  }

  const content = await fetchUrlContent(url);
  return {
    url,
    content,
    fetchFailed: content === null,
    label: `Source URL: ${url}`,
    sourceType: "url",
  };
}

export function buildUrlReferenceContextBlock(context: WebsiteContext | null): string | null {
  if (!context || context.sourceType !== "url" || !context.url || !context.content) {
    return null;
  }

  const content = context.content.trim();
  if (!content) {
    return null;
  }

  return [
    `Reference website: ${context.url}`,
    "Use the fetched website content below as grounding for colors, layout, theme, and design cues.",
    "Only use visual details that are explicitly supported by this content. Do not invent missing styling details.",
    "Website content:",
    content.slice(0, MAX_BUILD_REFERENCE_CONTENT_LENGTH),
  ].join("\n");
}

export async function injectUrlContextIntoBuildPrompt(
  prompt: string,
  loadContext: (message: string) => Promise<WebsiteContext | null> = loadUrlContext,
): Promise<string> {
  const urlContext = await loadContext(prompt);
  const referenceBlock = buildUrlReferenceContextBlock(urlContext);

  if (!referenceBlock) {
    return prompt;
  }

  return `${referenceBlock}\n\nUser build request:\n${prompt}`;
}

function formatSearchResults(
  query: string,
  results: Array<{ title: string; url: string; content: string }>,
): string {
  const lines = [`Search query: ${query}`];

  for (const [index, result] of results.entries()) {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`URL: ${result.url}`);
    lines.push(`Snippet: ${result.content.trim()}`);
  }

  return lines.join("\n");
}

export async function searchWebContent(query: string): Promise<WebsiteContext | null> {
  const apiKey = apiConfig.TAVILY_API_KEY;
  if (!apiKey) {
    return null;
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return null;
  }

  try {
    const client = tavilyClientFactory({ apiKey });
    const response = await client.search(trimmedQuery, {
      maxResults: MAX_TAVILY_RESULTS,
      searchDepth: "advanced",
      timeout: 8,
      topic: "general",
    });
    const results = response.results
      .filter((result) => result.content.trim().length > 0)
      .slice(0, MAX_TAVILY_RESULTS)
      .map((result) => ({
        title: result.title.trim(),
        url: result.url.trim(),
        content: result.content.trim(),
      }));

    return {
      content: results.length > 0 ? formatSearchResults(trimmedQuery, results).slice(0, MAX_WEBSITE_CONTENT_LENGTH) : null,
      fetchFailed: results.length === 0,
      label: `Tavily search results for: ${trimmedQuery}`,
      sourceType: "search",
    };
  } catch {
    return {
      content: null,
      fetchFailed: true,
      label: `Tavily search results for: ${trimmedQuery}`,
      sourceType: "search",
    };
  }
}

export async function loadResearchContext(message: string): Promise<WebsiteContext | null> {
  const urlContext = await loadUrlContext(message);
  if (urlContext) {
    return urlContext;
  }

  const query = extractResearchQuery(message);
  if (!query) {
    return null;
  }

  return searchWebContent(query);
}
