import { Hono } from "hono";

import type { OrgContext } from "../../types.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";

const authMeRoute = new Hono();

authMeRoute.get("/", verifyPlatformJwt, loadOrgContext, (c) => {
  const orgContext = c.get("orgContext") as OrgContext;

  return c.json({
    membership: orgContext.membership,
    org: orgContext.org,
    user: orgContext.user,
  });
});

export default authMeRoute;
