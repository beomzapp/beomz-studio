export interface IpqsResponse {
  fraud_score?: number;
  is_vpn?: boolean;
  message?: string;
  proxy?: boolean;
  success?: boolean;
  vpn?: boolean;
}

export interface IpqsLookupResult {
  message: string | null;
  proxy: boolean;
  raw: IpqsResponse | null;
  status: "clear" | "unverified" | "vpn";
  vpn: boolean;
}

interface LookupIpqsOptions {
  apiKey?: string | null;
  clientIp?: string | null;
  fetchImpl?: typeof fetch;
  strictness?: number;
  timeoutMs?: number;
}

export function extractClientIp(request: {
  header(name: string): string | undefined;
}): string | null {
  const cloudflareIp = request.header("cf-connecting-ip")?.trim();
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const forwardedFor = request.header("x-forwarded-for");
  if (!forwardedFor) {
    return null;
  }

  const firstHop = forwardedFor
    .split(",")
    .map((value) => value.trim())
    .find((value) => value.length > 0);

  return firstHop ?? null;
}

export function buildIpqsUrl(apiKey: string, clientIp: string, strictness = 1): string {
  const url = new URL(
    `https://www.ipqualityscore.com/api/json/ip/${encodeURIComponent(apiKey)}/${encodeURIComponent(clientIp)}`,
  );
  url.searchParams.set("strictness", String(strictness));
  return url.toString();
}

export async function lookupIpqsVpnStatus(options: LookupIpqsOptions): Promise<IpqsLookupResult> {
  const {
    apiKey,
    clientIp,
    fetchImpl = fetch,
    strictness = 1,
    timeoutMs = 3_000,
  } = options;

  if (!apiKey || !clientIp) {
    return {
      message: !apiKey ? "IPQS API key missing." : "Client IP missing.",
      proxy: false,
      raw: null,
      status: "unverified",
      vpn: false,
    };
  }

  try {
    const response = await fetchImpl(buildIpqsUrl(apiKey, clientIp, strictness), {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return {
        message: `IPQS HTTP ${response.status}`,
        proxy: false,
        raw: null,
        status: "unverified",
        vpn: false,
      };
    }

    const payload = await response.json().catch(() => null) as IpqsResponse | null;
    if (!payload) {
      return {
        message: "IPQS returned invalid JSON.",
        proxy: false,
        raw: null,
        status: "unverified",
        vpn: false,
      };
    }

    const vpn = payload.vpn === true || payload.is_vpn === true;
    const proxy = payload.proxy === true;

    if (payload.success === false) {
      return {
        message: payload.message ?? "IPQS lookup unsuccessful.",
        proxy,
        raw: payload,
        status: "unverified",
        vpn,
      };
    }

    return {
      message: payload.message ?? null,
      proxy,
      raw: payload,
      status: vpn || proxy ? "vpn" : "clear",
      vpn,
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      proxy: false,
      raw: null,
      status: "unverified",
      vpn: false,
    };
  }
}
