import type { JWTPayload } from "jose";

import type {
  OrgMembershipRow,
  OrgRow,
  StudioDbClient,
  UserRow,
} from "@beomz-studio/studio-db";

export interface PlatformJwtPayload extends JWTPayload {
  email?: string;
  sub: string;
}

export interface OrgContext {
  db: StudioDbClient;
  jwt: PlatformJwtPayload;
  membership: OrgMembershipRow;
  org: OrgRow;
  user: UserRow;
}
