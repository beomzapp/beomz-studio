import { Hono } from "hono";

import { apiConfig } from "../config.js";
import { extractClientIp, lookupIpqsVpnStatus } from "../lib/ipqs.js";

interface CheckVpnRouteDeps {
  fetchImpl?: typeof fetch;
}

export function createCheckVpnRoute(deps: CheckVpnRouteDeps = {}) {
  const route = new Hono();

  route.get("/", async (c) => {
    const clientIp = extractClientIp(c.req);
    const result = await lookupIpqsVpnStatus({
      apiKey: apiConfig.IPQS_API_KEY,
      clientIp,
      fetchImpl: deps.fetchImpl,
    });

    if (result.status === "unverified") {
      console.warn("[GET /check-vpn] IPQS verification unavailable:", {
        clientIp,
        message: result.message,
      });
    }

    return c.json({
      is_vpn: result.status !== "clear",
    });
  });

  return route;
}

const checkVpnRoute = createCheckVpnRoute();

export default checkVpnRoute;
