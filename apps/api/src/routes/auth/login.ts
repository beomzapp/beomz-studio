import { Hono } from "hono";

import type { OrgContext } from "../../types.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";

const authLoginRoute = new Hono();

authLoginRoute.post("/", verifyPlatformJwt, loadOrgContext, (c) => {
  const orgContext = c.get("orgContext") as OrgContext;

  return c.json({
    membership: orgContext.membership,
    org: orgContext.org,
    session: {
      accessToken: c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "",
      expiresAt: orgContext.jwt.exp ?? null,
      issuedAt: orgContext.jwt.iat ?? null,
    },
    user: orgContext.user,
  });
});

export default authLoginRoute;
