export type AuthTierKind = "mock" | "neon" | "supabase";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface AuthWithTokenResult {
  user: AuthUser;
  token: string;
}

export interface AuthLogoutResult {
  success: true;
}

export interface AuthMeResult {
  user: AuthUser;
}

export interface AuthTier {
  kind: AuthTierKind;
  signup(email: string, password: string): Promise<AuthWithTokenResult>;
  login(email: string, password: string): Promise<AuthWithTokenResult>;
  logout(token: string): Promise<AuthLogoutResult>;
  me(token: string): Promise<AuthMeResult>;
}

export class AuthTierError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthTierError";
    this.status = status;
  }
}
