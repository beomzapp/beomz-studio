import bcrypt from "bcryptjs";
import { createStudioDbClient } from "@beomz-studio/studio-db";
import type { ProjectRow, ProjectDbLimitsRow } from "@beomz-studio/studio-db";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { apiConfig } from "../../config.js";
import {
  createUsersTable,
  getUserByEmail,
  getUserById,
  insertUser,
  type NeonProjectUser,
  type NeonProjectUserRow,
} from "../../lib/neonDb.js";
import { getProjectPostgresUrl, resolveProjectDbProvider } from "../../lib/projectDb.js";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface ProjectAuthTokenPayload {
  sub: string;
  projectId: string;
  email: string;
  type: "project-auth";
}

type ProjectLookup = Pick<ProjectRow, "id" | "database_enabled" | "db_provider" | "db_wired" | "db_schema" | "db_config"> & {
  byo_db_url?: unknown;
};
type LimitsLookup = Pick<ProjectDbLimitsRow, "db_url"> | null;
type StudioDbClientLike = {
  findProjectById: (projectId: string) => Promise<ProjectLookup | null>;
  getProjectDbLimits: (projectId: string) => Promise<LimitsLookup>;
};

interface ProjectAuthRouteDeps {
  createStudioDbClient?: () => StudioDbClientLike;
  createUsersTable?: typeof createUsersTable;
  getUserByEmail?: typeof getUserByEmail;
  getUserById?: typeof getUserById;
  insertUser?: typeof insertUser;
  hashPassword?: typeof bcrypt.hash;
  comparePassword?: typeof bcrypt.compare;
  signJwt?: typeof jwt.sign;
  verifyJwt?: typeof jwt.verify;
}

function getProjectJwtSecret(projectId: string): string {
  const sharedSecret = apiConfig.PROJECT_JWT_SECRET?.trim()
    || apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY;
  return `${projectId}:${sharedSecret}`;
}

function buildAuthResponse(
  signJwtFn: typeof jwt.sign,
  projectId: string,
  user: NeonProjectUser | NeonProjectUserRow,
) {
  const publicUser: NeonProjectUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    created_at: user.created_at,
  };

  const token = signJwtFn(
    {
      sub: String(publicUser.id),
      projectId,
      email: publicUser.email,
      type: "project-auth",
    } satisfies ProjectAuthTokenPayload,
    getProjectJwtSecret(projectId),
    { expiresIn: "7d" },
  );

  return { token, user: publicUser };
}

async function resolveProjectDbUrl(
  db: StudioDbClientLike,
  projectId: string,
): Promise<string | null> {
  const project = await db.findProjectById(projectId);
  if (!project || !project.database_enabled) {
    return null;
  }

  const limits = await db.getProjectDbLimits(projectId);
  const provider = resolveProjectDbProvider(project, limits);
  if (provider !== "neon" && provider !== "postgres") {
    return null;
  }

  return getProjectPostgresUrl(project, limits);
}

function readBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function parseJwtPayload(value: string | jwt.JwtPayload): ProjectAuthTokenPayload | null {
  if (typeof value === "string" || !value) {
    return null;
  }
  if (
    typeof value.sub !== "string"
    || typeof value.projectId !== "string"
    || typeof value.email !== "string"
    || value.type !== "project-auth"
  ) {
    return null;
  }
  return {
    sub: value.sub,
    projectId: value.projectId,
    email: value.email,
    type: "project-auth",
  };
}

export function createProjectAuthRoute(deps: ProjectAuthRouteDeps = {}) {
  const projectAuthRoute = new Hono();
  const createStudioDbClientFn = deps.createStudioDbClient ?? createStudioDbClient;
  const createUsersTableFn = deps.createUsersTable ?? createUsersTable;
  const getUserByEmailFn = deps.getUserByEmail ?? getUserByEmail;
  const getUserByIdFn = deps.getUserById ?? getUserById;
  const insertUserFn = deps.insertUser ?? insertUser;
  const hashPasswordFn = deps.hashPassword ?? bcrypt.hash;
  const comparePasswordFn = deps.comparePassword ?? bcrypt.compare;
  const signJwtFn = deps.signJwt ?? jwt.sign;
  const verifyJwtFn = deps.verifyJwt ?? jwt.verify;

  projectAuthRoute.post("/signup", async (c) => {
    let parsedBody: z.infer<typeof signupSchema>;
    try {
      parsedBody = signupSchema.parse(await c.req.json());
    } catch {
      return c.json({ error: "Invalid signup payload" }, 400);
    }

    const projectId = c.req.param("projectId");
    if (!projectId) {
      return c.json({ error: "Project ID is required" }, 400);
    }
    const db = createStudioDbClientFn();
    const dbUrl = await resolveProjectDbUrl(db, projectId);
    if (!dbUrl) {
      return c.json({ error: "Project database not available" }, 404);
    }

    await createUsersTableFn(dbUrl);

    const normalizedEmail = parsedBody.email.trim().toLowerCase();
    const existingUser = await getUserByEmailFn(dbUrl, normalizedEmail);
    if (existingUser) {
      return c.json({ error: "User already exists" }, 409);
    }

    try {
      const passwordHash = await hashPasswordFn(parsedBody.password, 10);
      const user = await insertUserFn(dbUrl, {
        email: normalizedEmail,
        passwordHash,
        name: parsedBody.name?.trim() || null,
      });
      return c.json(buildAuthResponse(signJwtFn, projectId, user), 201);
    } catch (err) {
      if (
        typeof err === "object"
        && err !== null
        && "code" in err
        && err.code === "23505"
      ) {
        return c.json({ error: "User already exists" }, 409);
      }
      return c.json({ error: "Failed to create user" }, 500);
    }
  });

  projectAuthRoute.post("/login", async (c) => {
    let parsedBody: z.infer<typeof loginSchema>;
    try {
      parsedBody = loginSchema.parse(await c.req.json());
    } catch {
      return c.json({ error: "Invalid login payload" }, 400);
    }

    const projectId = c.req.param("projectId");
    if (!projectId) {
      return c.json({ error: "Project ID is required" }, 400);
    }
    const db = createStudioDbClientFn();
    const dbUrl = await resolveProjectDbUrl(db, projectId);
    if (!dbUrl) {
      return c.json({ error: "Project database not available" }, 404);
    }

    await createUsersTableFn(dbUrl);

    const user = await getUserByEmailFn(dbUrl, parsedBody.email.trim().toLowerCase());
    if (!user) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const passwordMatches = await comparePasswordFn(parsedBody.password, user.password_hash);
    if (!passwordMatches) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    return c.json(buildAuthResponse(signJwtFn, projectId, user));
  });

  projectAuthRoute.get("/me", async (c) => {
    const projectId = c.req.param("projectId");
    if (!projectId) {
      return c.json({ error: "Project ID is required" }, 400);
    }
    const token = readBearerToken(c.req.header("authorization"));
    if (!token) {
      return c.json({ error: "Missing bearer token" }, 401);
    }

    const db = createStudioDbClientFn();
    const dbUrl = await resolveProjectDbUrl(db, projectId);
    if (!dbUrl) {
      return c.json({ error: "Project database not available" }, 404);
    }

    await createUsersTableFn(dbUrl);

    let payload: ProjectAuthTokenPayload | null = null;
    try {
      payload = parseJwtPayload(verifyJwtFn(token, getProjectJwtSecret(projectId)) as string | jwt.JwtPayload);
    } catch {
      return c.json({ error: "Invalid bearer token" }, 401);
    }

    if (!payload || payload.projectId !== projectId) {
      return c.json({ error: "Invalid bearer token" }, 401);
    }

    const userId = Number.parseInt(payload.sub, 10);
    if (!Number.isFinite(userId)) {
      return c.json({ error: "Invalid bearer token" }, 401);
    }

    const user = await getUserByIdFn(dbUrl, userId);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ user });
  });

  return projectAuthRoute;
}

const projectAuthRoute = createProjectAuthRoute();

export default projectAuthRoute;
