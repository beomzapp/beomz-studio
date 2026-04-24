import { refreshSupabaseOAuthTokens, SUPABASE_MANAGEMENT_API_BASE } from "./supabaseOAuth.js";
import { decryptProjectSecret } from "./projectSecrets.js";

export function getSupabaseProjectRef(supabaseUrl: string): string {
  return new URL(supabaseUrl).hostname.split(".")[0] ?? "";
}

export function readStoredSupabaseToken(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return decryptProjectSecret(trimmed) ?? trimmed;
}

export async function runSupabaseManagementQueryWithOAuth(input: {
  projectId: string;
  supabaseUrl: string;
  accessToken: string;
  refreshToken?: string;
  query: string;
  fetchFn?: typeof fetch;
  logPrefix?: string;
  persistTokens?: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
}): Promise<{
  ok: boolean;
  accessToken: string;
  refreshToken: string;
  error: string | null;
}> {
  const fetchFn = input.fetchFn ?? fetch;
  const logPrefix = input.logPrefix ?? "[supabase]";
  const projectRef = getSupabaseProjectRef(input.supabaseUrl);
  const requestQuery = (accessToken: string) => fetchFn(
    `${SUPABASE_MANAGEMENT_API_BASE}/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: input.query }),
    },
  );

  let currentAccessToken = input.accessToken;
  let currentRefreshToken = input.refreshToken?.trim() ?? "";

  console.log(`${logPrefix} starting management query`, {
    projectId: input.projectId,
    projectRef,
    queryPreview: input.query.slice(0, 120),
  });

  let response: Response;
  try {
    response = await requestQuery(currentAccessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${logPrefix} management query request failed`, {
      projectId: input.projectId,
      projectRef,
      queryPreview: input.query.slice(0, 120),
      error: message,
    });
    return {
      ok: false,
      accessToken: currentAccessToken,
      refreshToken: currentRefreshToken,
      error: message,
    };
  }

  if (response.status === 401 && currentRefreshToken) {
    console.log(`${logPrefix} OAuth access token expired, refreshing before retry`, {
      projectId: input.projectId,
      projectRef,
      queryPreview: input.query.slice(0, 120),
    });

    try {
      const refreshedTokens = await refreshSupabaseOAuthTokens(currentRefreshToken, fetchFn);
      currentAccessToken = refreshedTokens.accessToken;
      currentRefreshToken = refreshedTokens.refreshToken;

      await input.persistTokens?.({
        accessToken: currentAccessToken,
        refreshToken: currentRefreshToken,
      });

      response = await requestQuery(currentAccessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${logPrefix} OAuth token refresh failed during management query`, {
        projectId: input.projectId,
        projectRef,
        queryPreview: input.query.slice(0, 120),
        error: message,
      });
      return {
        ok: false,
        accessToken: currentAccessToken,
        refreshToken: currentRefreshToken,
        error: message,
      };
    }
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const message = `Supabase Management API query failed (${response.status})${body ? `: ${body}` : ""}`;
    console.error(`${logPrefix} management query failed`, {
      projectId: input.projectId,
      projectRef,
      status: response.status,
      body,
      queryPreview: input.query.slice(0, 120),
    });
    return {
      ok: false,
      accessToken: currentAccessToken,
      refreshToken: currentRefreshToken,
      error: message,
    };
  }

  console.log(`${logPrefix} management query completed`, {
    projectId: input.projectId,
    projectRef,
    queryPreview: input.query.slice(0, 120),
  });

  return {
    ok: true,
    accessToken: currentAccessToken,
    refreshToken: currentRefreshToken,
    error: null,
  };
}
