import type { MiddlewareHandler } from "hono";

import {
  createStudioDbClient,
  type OrgRow,
} from "@beomz-studio/studio-db";

import type { VerifiedPlatformJwt } from "./verifyPlatformJwt.js";

function buildDefaultOrgName(email: string | undefined, platformUserId: string) {
  if (email && email.includes("@")) {
    const [localPart] = email.split("@");
    const cleaned = localPart.trim();
    if (cleaned.length > 0) {
      return `${cleaned}'s Studio`;
    }
  }

  return `Studio ${platformUserId.slice(0, 8)}`;
}

function buildUserFallbackEmail(jwt: VerifiedPlatformJwt) {
  if (typeof jwt.email === "string" && jwt.email.length > 0) {
    return jwt.email;
  }

  return `${jwt.sub}@platform.local`;
}

export const loadOrgContext: MiddlewareHandler = async (c, next) => {
  const jwt = c.get("platformJwt") as VerifiedPlatformJwt | undefined;
  if (!jwt) {
    return c.json({ error: "JWT context missing." }, 401);
  }

  const db = createStudioDbClient();
  const email = buildUserFallbackEmail(jwt);

  let user = await db.findUserByPlatformUserId(jwt.sub);
  if (!user) {
    user = await db.createUser({
      email,
      platform_user_id: jwt.sub,
    });
  } else if (user.email !== email) {
    user = await db.updateUserEmail(user.id, email);
  }

  let membership = await db.findMembershipByUserId(user.id);
  let org: OrgRow | null = null;

  if (membership) {
    org = await db.findOrgById(membership.org_id);
  }

  if (!membership || !org) {
    org = await db.createOrg({
      name: buildDefaultOrgName(jwt.email, jwt.sub),
      owner_id: user.id,
    });

    membership = await db.createOrgMembership({
      org_id: org.id,
      role: "owner",
      user_id: user.id,
    });
  }

  c.set("orgContext", {
    db,
    jwt,
    membership,
    org,
    user,
  });

  await next();
};
