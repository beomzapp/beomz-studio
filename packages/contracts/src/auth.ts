export type OrgPlan = "free" | "starter" | "pro" | "business";

export type MembershipRole = "owner" | "admin" | "member";

export interface User {
  id: string;
  platformUserId: string;
  email: string;
  createdAt: string;
}

export interface Org {
  id: string;
  ownerId: string;
  name: string;
  plan: OrgPlan;
  credits: number;
  createdAt: string;
}

export interface Membership {
  orgId: string;
  userId: string;
  role: MembershipRole;
  createdAt: string;
}
