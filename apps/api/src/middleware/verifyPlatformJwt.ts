import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Context, MiddlewareHandler } from "hono";

import { apiConfig } from "../config.js";
import { verifyLocalPlatformJwt } from "../lib/auth/platformJwt.js";

export interface VerifiedPlatformJwt extends JWTPayload {
  email?: string;
  provider?: string;
  sub: string;
  tokenSource: "local" | "supabase";
}

const jwks = createRemoteJWKSet(new URL(apiConfig.PLATFORM_JWKS_URL));

function unauthorized(c: Context, message: string) {
  return c.json({ error: message }, 401);
}

export const verifyPlatformJwt: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return unauthorized(c, "Missing bearer token.");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return unauthorized(c, "Missing bearer token.");
  }

  try {
    const { payload } = await jwtVerify(token, jwks);
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return unauthorized(c, "Invalid token subject.");
    }

    c.set("platformJwt", {
      ...payload,
      tokenSource: "supabase",
    } as VerifiedPlatformJwt);
    await next();
    return;
  } catch {
    const localPayload = verifyLocalPlatformJwt(token);
    if (!localPayload) {
      return unauthorized(c, "Invalid bearer token.");
    }

    c.set("platformJwt", {
      ...localPayload,
      tokenSource: "local",
    });
    await next();
  }
};
