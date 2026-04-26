import jwt from "jsonwebtoken";
import type { OrgMembershipRow, OrgRow, UserRow } from "@beomz-studio/studio-db";

const LOCAL_PLATFORM_JWT_TTL = "7d";

export interface LocalPlatformJwtPayload extends jwt.JwtPayload {
  email: string;
  provider: "email";
  sub: string;
  type: "platform-auth";
}

function getPlatformJwtSecret(): string {
  return process.env.BEOMZ_JWT_SECRET?.trim()
    || process.env.PROJECT_JWT_SECRET?.trim()
    || process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY
    || "beomz-platform-fallback-secret";
}

export function signLocalPlatformJwt(
  user: Pick<UserRow, "email" | "platform_user_id">,
  signJwt: typeof jwt.sign = jwt.sign,
): string {
  return signJwt(
    {
      email: user.email,
      provider: "email",
      sub: user.platform_user_id,
      type: "platform-auth",
    } satisfies LocalPlatformJwtPayload,
    getPlatformJwtSecret(),
    { expiresIn: LOCAL_PLATFORM_JWT_TTL },
  );
}

export function verifyLocalPlatformJwt(
  token: string,
  verifyJwt: typeof jwt.verify = jwt.verify,
): LocalPlatformJwtPayload | null {
  try {
    const decoded = verifyJwt(token, getPlatformJwtSecret()) as string | jwt.JwtPayload;
    if (
      typeof decoded === "string"
      || typeof decoded.sub !== "string"
      || typeof decoded.email !== "string"
      || decoded.provider !== "email"
      || decoded.type !== "platform-auth"
    ) {
      return null;
    }

    return decoded as LocalPlatformJwtPayload;
  } catch {
    return null;
  }
}

export function buildPlatformAuthResponse(input: {
  membership: OrgMembershipRow;
  org: OrgRow;
  token: string;
  user: UserRow;
}) {
  const decoded = jwt.decode(input.token) as jwt.JwtPayload | null;

  return {
    membership: input.membership,
    org: input.org,
    session: {
      accessToken: input.token,
      expiresAt: typeof decoded?.exp === "number" ? decoded.exp : null,
      issuedAt: typeof decoded?.iat === "number" ? decoded.iat : null,
    },
    user: input.user,
  };
}
