/**
 * GET /api/projects/:id/db/schema
 *
 * Returns the live tables + columns from the project's DB schema.
 * For managed (beomz) projects: queries beomz-user-data via Management API.
 * For BYO Supabase: queries via the anon key + Supabase REST OpenAPI spec.
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { getSchemaTableList, isUserDataConfigured } from "../../lib/userDataClient.js";
import { getNeonSchemaTableList } from "../../lib/neonDb.js";
import {
  getProjectPostgresUrl,
  getProjectSupabaseConfig,
  resolveProjectDbProvider,
} from "../../lib/projectDb.js";

interface SchemaRouteTableColumn {
  name: string;
  type: string;
}

interface SchemaRouteTable {
  table_name: string;
  columns: SchemaRouteTableColumn[];
}

function parseRefName(ref: string): string | null {
  const segments = ref.split("/");
  return segments.at(-1) ?? null;
}

function resolveOpenApiSchema(
  schema: unknown,
  components: Record<string, unknown>,
  visited = new Set<string>(),
): Record<string, unknown> | null {
  if (!schema || typeof schema !== "object") {
    return null;
  }

  const candidate = schema as Record<string, unknown>;

  if (typeof candidate.$ref === "string") {
    const refName = parseRefName(candidate.$ref);
    if (!refName || visited.has(refName)) {
      return null;
    }

    visited.add(refName);
    return resolveOpenApiSchema(components[refName], components, visited);
  }

  if (candidate.type === "array" && candidate.items) {
    return resolveOpenApiSchema(candidate.items, components, visited);
  }

  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const options = candidate[key];
    if (!Array.isArray(options)) {
      continue;
    }

    for (const option of options) {
      const resolved = resolveOpenApiSchema(option, components, new Set(visited));
      if (resolved) {
        return resolved;
      }
    }
  }

  return candidate;
}

function inferOpenApiColumns(
  tableName: string,
  pathSpec: unknown,
  components: Record<string, unknown>,
): SchemaRouteTableColumn[] {
  const pathObject = typeof pathSpec === "object" && pathSpec !== null
    ? pathSpec as Record<string, unknown>
    : {};
  const getSpec = typeof pathObject.get === "object" && pathObject.get !== null
    ? pathObject.get as Record<string, unknown>
    : {};
  const responses = typeof getSpec.responses === "object" && getSpec.responses !== null
    ? getSpec.responses as Record<string, unknown>
    : {};
  const response200 = responses["200"] ?? responses.default ?? null;
  const responseObject = typeof response200 === "object" && response200 !== null
    ? response200 as Record<string, unknown>
    : {};
  const content = typeof responseObject.content === "object" && responseObject.content !== null
    ? responseObject.content as Record<string, unknown>
    : {};
  const jsonContent = content["application/json"] ?? null;
  const jsonObject = typeof jsonContent === "object" && jsonContent !== null
    ? jsonContent as Record<string, unknown>
    : {};
  const resolved = resolveOpenApiSchema(jsonObject.schema, components)
    ?? resolveOpenApiSchema(components[tableName], components)
    ?? resolveOpenApiSchema(components[`public.${tableName}`], components)
    ?? resolveOpenApiSchema(components[`${tableName}Row`], components);

  const properties = typeof resolved?.properties === "object" && resolved.properties !== null
    ? resolved.properties as Record<string, unknown>
    : {};

  return Object.entries(properties).map(([name, property]) => {
    const propertyObject = typeof property === "object" && property !== null
      ? property as Record<string, unknown>
      : {};
    const type = typeof propertyObject.type === "string"
      ? propertyObject.type
      : typeof propertyObject.format === "string"
        ? propertyObject.format
        : "unknown";
    return { name, type };
  });
}

function parseSupabaseOpenApiSpec(spec: unknown): SchemaRouteTable[] {
  const specObject = typeof spec === "object" && spec !== null
    ? spec as {
      paths?: Record<string, unknown>;
      components?: { schemas?: Record<string, unknown> };
    }
    : {};
  const paths = specObject.paths ?? {};
  const components = specObject.components?.schemas ?? {};

  const tableNames = Object.keys(paths)
    .map((path) => path.replace(/^\//, "").split("/")[0] ?? "")
    .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !name.startsWith("rpc"))
    .filter((value, index, allValues) => allValues.indexOf(value) === index)
    .sort();

  return tableNames.map((tableName) => ({
    table_name: tableName,
    columns: inferOpenApiColumns(tableName, paths[`/${tableName}`] ?? paths[tableName], components),
  }));
}

export async function listSupabaseSchemaTables(
  supabaseUrl: string,
  supabaseAnonKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ tables: SchemaRouteTable[] }> {
  try {
    const response = await fetchFn(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        Accept: "application/openapi+json",
      },
    });

    if (response.ok) {
      return { tables: parseSupabaseOpenApiSpec(await response.json()) };
    }
  } catch {
    // Fall through to the non-fatal empty state below.
  }

  return { tables: [] };
}

interface SchemaDbRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  getSchemaTableList?: typeof getSchemaTableList;
  isUserDataConfigured?: typeof isUserDataConfigured;
  getNeonSchemaTableList?: typeof getNeonSchemaTableList;
  listSupabaseSchemaTables?: typeof listSupabaseSchemaTables;
}

export function createSchemaDbRoute(deps: SchemaDbRouteDeps = {}) {
  const schemaDbRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const getSchemaTableListFn = deps.getSchemaTableList ?? getSchemaTableList;
  const isUserDataConfiguredFn = deps.isUserDataConfigured ?? isUserDataConfigured;
  const getNeonSchemaTableListFn = deps.getNeonSchemaTableList ?? getNeonSchemaTableList;
  const listSupabaseSchemaTablesFn = deps.listSupabaseSchemaTables ?? listSupabaseSchemaTables;

  schemaDbRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = c.req.param("id") as string;
    const orgContext = c.get("orgContext") as OrgContext;
    const { db, org } = orgContext;

    const project = await db.findProjectById(projectId);
    if (!project || project.org_id !== org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    const supabaseConfig = getProjectSupabaseConfig(project);

    if (supabaseConfig) {
      try {
        const result = await listSupabaseSchemaTablesFn(
          supabaseConfig.supabaseUrl,
          supabaseConfig.supabaseAnonKey,
        );
        return c.json({ tables: result.tables });
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : "Failed to fetch schema" },
          500,
        );
      }
    }

    if (!project.database_enabled) {
      return c.json({ error: "Database not enabled for this project" }, 400);
    }

    const limits = await db.getProjectDbLimits(projectId);
    const provider = resolveProjectDbProvider(project, limits);

    if (provider === "beomz") {
      if (!isUserDataConfiguredFn()) {
        return c.json({ error: "Database service not configured" }, 503);
      }
      if (!project.db_schema) {
        return c.json({ tables: [] });
      }
      try {
        const tables = await getSchemaTableListFn(project.db_schema);
        return c.json({ tables });
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : "Failed to fetch schema" },
          500,
        );
      }
    }

    if (provider === "supabase") {
      return c.json({ tables: [] });
    }

    if (provider === "neon" || provider === "postgres") {
      const dbUrl = getProjectPostgresUrl(project, limits);
      if (!dbUrl) {
        return c.json({ error: "Postgres connection string missing" }, 400);
      }
      try {
        const tables = await getNeonSchemaTableListFn(dbUrl);
        return c.json({ tables });
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : "Failed to fetch schema" },
          500,
        );
      }
    }

    return c.json({ tables: [] });
  });

  return schemaDbRoute;
}

const schemaDbRoute = createSchemaDbRoute();

export default schemaDbRoute;
