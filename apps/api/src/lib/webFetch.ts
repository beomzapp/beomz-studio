const JINA_FETCH_TIMEOUT_MS = 8_000;
const MAX_WEBSITE_CONTENT_LENGTH = 8_000;

const HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/i;
const DOMAIN_PATTERN = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"'`]*)?/i;

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
