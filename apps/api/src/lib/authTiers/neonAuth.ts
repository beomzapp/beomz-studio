import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import jwt from "jsonwebtoken";

import type { AuthTier, AuthUser, AuthWithTokenResult } from "./shared.js";
import { AuthTierError } from "./shared.js";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const tokenBlacklist = new Map<string, number>();

interface NeonAuthTokenPayload {
  sub: string;
  email: string;
  type: "project-auth";
}

interface NeonAuthUserRow extends AuthUser {
  password_hash: string;
}

type NeonSqlClient = ReturnType<typeof neon> & {
  query: <TRow>(query: string, params?: unknown[]) => Promise<TRow[]>;
};

interface NeonAuthDeps {
  comparePassword?: typeof bcrypt.compare;
  createSqlClient?: (connectionString: string) => NeonSqlClient;
  hashPassword?: typeof bcrypt.hash;
  now?: () => number;
  signJwt?: typeof jwt.sign;
  verifyJwt?: typeof jwt.verify;
}

interface NeonAuthConfig {
  dbUrl: string;
  projectId: string;
}

function defaultCreateSqlClient(connectionString: string): NeonSqlClient {
  return neon(connectionString) as NeonSqlClient;
}

function getProjectJwtSecret(projectId: string): string {
  const sharedSecret = process.env.BEOMZ_JWT_SECRET?.trim()
    || process.env.PROJECT_JWT_SECRET?.trim()
    || process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY
    || "beomz-auth-fallback-secret";
  return `${projectId}:${sharedSecret}`;
}

function clearExpiredBlacklistedTokens(now: number) {
  for (const [token, expiresAt] of tokenBlacklist.entries()) {
    if (expiresAt <= now) {
      tokenBlacklist.delete(token);
    }
  }
}

function isBlacklisted(token: string, now: number): boolean {
  clearExpiredBlacklistedTokens(now);
  const expiresAt = tokenBlacklist.get(token);
  return typeof expiresAt === "number" && expiresAt > now;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseJwtPayload(value: string | jwt.JwtPayload): NeonAuthTokenPayload | null {
  if (typeof value === "string" || !value) {
    return null;
  }

  if (
    typeof value.sub !== "string"
    || typeof value.email !== "string"
    || value.type !== "project-auth"
  ) {
    return null;
  }

  return {
    sub: value.sub,
    email: value.email,
    type: "project-auth",
  };
}

async function ensureUsersTable(sql: NeonSqlClient): Promise<void> {
  await sql.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  `);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

async function getUserByEmail(sql: NeonSqlClient, email: string): Promise<NeonAuthUserRow | null> {
  const rows = await sql.query<NeonAuthUserRow>(
    `
      SELECT id::text AS id, email, password_hash, role
      FROM users
      WHERE email = $1
      LIMIT 1;
    `,
    [email],
  );

  return rows[0] ?? null;
}

async function getUserById(sql: NeonSqlClient, id: string): Promise<AuthUser | null> {
  const rows = await sql.query<AuthUser>(
    `
      SELECT id::text AS id, email, role
      FROM users
      WHERE id = $1
      LIMIT 1;
    `,
    [id],
  );

  return rows[0] ?? null;
}

async function insertUser(
  sql: NeonSqlClient,
  input: { email: string; passwordHash: string },
): Promise<AuthUser> {
  const rows = await sql.query<AuthUser>(
    `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id::text AS id, email, role;
    `,
    [input.email, input.passwordHash],
  );

  const user = rows[0];
  if (!user) {
    throw new Error("Failed to create user");
  }

  return user;
}

function buildAuthResponse(
  signJwtFn: typeof jwt.sign,
  projectId: string,
  user: AuthUser,
): AuthWithTokenResult {
  return {
    user,
    token: signJwtFn(
      {
        sub: user.id,
        email: user.email,
        type: "project-auth",
      } satisfies NeonAuthTokenPayload,
      getProjectJwtSecret(projectId),
      { expiresIn: "7d" },
    ),
  };
}

export function createNeonAuthTier(
  config: NeonAuthConfig,
  deps: NeonAuthDeps = {},
): AuthTier {
  const comparePasswordFn = deps.comparePassword ?? bcrypt.compare;
  const createSqlClientFn = deps.createSqlClient ?? defaultCreateSqlClient;
  const hashPasswordFn = deps.hashPassword ?? bcrypt.hash;
  const nowFn = deps.now ?? Date.now;
  const signJwtFn = deps.signJwt ?? jwt.sign;
  const verifyJwtFn = deps.verifyJwt ?? jwt.verify;

  return {
    kind: "neon",
    async signup(email, password) {
      const sql = createSqlClientFn(config.dbUrl);
      await ensureUsersTable(sql);

      const normalizedEmail = normalizeEmail(email);
      const passwordHash = await hashPasswordFn(password, 10);

      try {
        const user = await insertUser(sql, {
          email: normalizedEmail,
          passwordHash,
        });
        return buildAuthResponse(signJwtFn, config.projectId, user);
      } catch (error) {
        if (
          typeof error === "object"
          && error !== null
          && "code" in error
          && error.code === "23505"
        ) {
          throw new AuthTierError(409, "User already exists");
        }

        throw error;
      }
    },

    async login(email, password) {
      const sql = createSqlClientFn(config.dbUrl);
      await ensureUsersTable(sql);
      const user = await getUserByEmail(sql, normalizeEmail(email));

      if (!user) {
        throw new AuthTierError(401, "Invalid email or password");
      }

      const passwordMatches = await comparePasswordFn(password, user.password_hash);
      if (!passwordMatches) {
        throw new AuthTierError(401, "Invalid email or password");
      }

      return buildAuthResponse(signJwtFn, config.projectId, {
        id: user.id,
        email: user.email,
        role: user.role,
      });
    },

    async logout(token) {
      const now = nowFn();
      clearExpiredBlacklistedTokens(now);
      tokenBlacklist.set(token, now + TOKEN_TTL_MS);
      return { success: true };
    },

    async me(token) {
      const now = nowFn();
      if (isBlacklisted(token, now)) {
        throw new AuthTierError(401, "Invalid bearer token");
      }

      let payload: NeonAuthTokenPayload | null = null;
      try {
        payload = parseJwtPayload(
          verifyJwtFn(token, getProjectJwtSecret(config.projectId)) as string | jwt.JwtPayload,
        );
      } catch {
        throw new AuthTierError(401, "Invalid bearer token");
      }

      if (!payload) {
        throw new AuthTierError(401, "Invalid bearer token");
      }

      const sql = createSqlClientFn(config.dbUrl);
      const user = await getUserById(sql, payload.sub);
      if (!user) {
        throw new AuthTierError(404, "User not found");
      }

      return { user };
    },
  };
}
