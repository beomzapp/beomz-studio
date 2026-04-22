import { tavily } from "@tavily/core";
import type { TavilyClient, TavilyClientOptions } from "@tavily/core";

import { apiConfig } from "../config.js";

const JINA_FETCH_TIMEOUT_MS = 8_000;
const DIRECT_FETCH_TIMEOUT_MS = 8_000;
const MAX_WEBSITE_CONTENT_LENGTH = 8_000;
const MAX_BUILD_REFERENCE_CONTENT_LENGTH = 4_000;
const MAX_DIRECT_FALLBACK_CONTENT_LENGTH = 2_000;
const MAX_TAVILY_RESULTS = 3;
const DIRECT_FETCH_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normaliseWhitespace(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function readMetaDescription(html: string): string | null {
  const patterns = [
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      const description = normaliseWhitespace(match[1]);
      if (description.length > 0) {
        return description;
      }
    }
  }

  return null;
}

function extractTextFromHtml(html: string): string | null {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch?.[1] ? normaliseWhitespace(titleMatch[1]) : null;
  const description = readMetaDescription(html);
  const visibleText = normaliseWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  );

  const lines: string[] = [];
  if (title) {
    lines.push(`Title: ${title}`);
  }
  if (description) {
    lines.push(`Description: ${description}`);
  }
  if (visibleText.length > 0) {
    lines.push(`Content: ${visibleText}`);
  }

  if (lines.length === 0) {
    return null;
  }

  return lines.join("\n").slice(0, MAX_DIRECT_FALLBACK_CONTENT_LENGTH);
}

async function fetchUrlContentFromJina(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), JINA_FETCH_TIMEOUT_MS);

  try {
    console.log("[webFetch] URL context attempt: jina.", { url });
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain" },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("[webFetch] Jina returned non-2xx status.", {
        status: response.status,
        statusText: response.statusText,
        url,
      });
      return null;
    }

    const text = await response.text();
    const trimmed = text.trim();
    if (!trimmed) {
      console.warn("[webFetch] Jina returned empty content.", { url });
      return null;
    }

    console.log("[webFetch] URL context loaded via jina.", {
      contentLength: trimmed.length,
      url,
    });

    return trimmed.slice(0, MAX_WEBSITE_CONTENT_LENGTH);
  } catch (error) {
    console.warn("[webFetch] Jina request failed.", {
      error: toErrorMessage(error),
      url,
    });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchUrlContentFromDirectFetch(url: string): Promise<string | null> {
  try {
    console.log("[webFetch] URL context fallback attempt: direct fetch.", { url });
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": DIRECT_FETCH_USER_AGENT,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(DIRECT_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn("[webFetch] Direct fetch returned non-2xx status.", {
        status: response.status,
        statusText: response.statusText,
        url,
      });
      return null;
    }

    const html = await response.text();
    const extractedContent = extractTextFromHtml(html);

    if (!extractedContent) {
      console.warn("[webFetch] Direct fetch produced no usable text content.", { url });
      return null;
    }

    console.log("[webFetch] URL context fallback used: direct fetch.", {
      contentLength: extractedContent.length,
      url,
    });

    return extractedContent;
  } catch (error) {
    console.warn("[webFetch] Direct fetch fallback failed.", {
      error: toErrorMessage(error),
      url,
    });
    return null;
  }
}

function buildUrlFeaturesQuery(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    return `${hostname} features`;
  } catch {
    return `${url} features`;
  }
}

async function fetchUrlContentFromTavilyFallback(url: string): Promise<string | null> {
  const query = buildUrlFeaturesQuery(url);
  console.log("[webFetch] URL context fallback attempt: tavily.", { query, url });

  const searchContext = await searchWebContent(query);
  const fallbackContent = searchContext?.content?.trim();

  if (!fallbackContent) {
    console.warn("[webFetch] Tavily URL fallback returned empty content.", { query, url });
    return null;
  }

  console.log("[webFetch] URL context fallback used: tavily.", {
    contentLength: fallbackContent.length,
    query,
    url,
  });

  return fallbackContent.slice(0, MAX_WEBSITE_CONTENT_LENGTH);
}

export async function fetchUrlContent(url: string): Promise<string | null> {
  const jinaContent = await fetchUrlContentFromJina(url);
  if (jinaContent) {
    return jinaContent;
  }

  const directContent = await fetchUrlContentFromDirectFetch(url);
  if (directContent) {
    return directContent;
  }

  const tavilyContent = await fetchUrlContentFromTavilyFallback(url);
  if (tavilyContent) {
    return tavilyContent;
  }

  console.warn("[webFetch] URL context failed across jina/direct/tavily providers.", { url });
  return null;
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
