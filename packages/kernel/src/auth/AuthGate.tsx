import type { Membership, Org, User } from "@beomz-studio/contracts";
import type { ReactNode } from "react";

export interface AuthSnapshot {
  user: User | null;
  org: Org | null;
  membership: Membership | null;
  isLoading?: boolean;
}

export type AuthRequirement = "authenticated" | "org-member";

export interface AuthGateProps {
  snapshot: AuthSnapshot;
  requirement?: AuthRequirement;
  loadingFallback?: ReactNode;
  unauthorizedFallback?: ReactNode;
  children: ReactNode;
}

export function AuthGate({
  snapshot,
  requirement = "authenticated",
  loadingFallback = null,
  unauthorizedFallback = null,
  children,
}: AuthGateProps) {
  if (snapshot.isLoading) {
    return <>{loadingFallback}</>;
  }

  if (!snapshot.user) {
    return <>{unauthorizedFallback}</>;
  }

  if (requirement === "org-member" && (!snapshot.org || !snapshot.membership)) {
    return <>{unauthorizedFallback}</>;
  }

  return <>{children}</>;
}
