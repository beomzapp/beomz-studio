/**
 * BEO-130: Supabase Management API client for beomz-user-data.
 *
 * All schema provisioning, SQL execution, and registry operations go through
 * here. Requires SUPABASE_MANAGEMENT_API_KEY, USER_DATA_SUPABASE_URL,
 * USER_DATA_SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * Project ref (beomz-user-data): snmocsydvcvqerlommek
 */

const USER_DATA_PROJECT_REF = "snmocsydvcvqerlommek";
const MANAGEMENT_API_BASE = "https://api.supabase.com/v1";

function getMgmtKey(): string {
  const key = process.env.SUPABASE_MANAGEMENT_API_KEY;
  if (!key) throw new Error("SUPABASE_MANAGEMENT_API_KEY is not configured");
  return key;
}

/** Execute arbitrary SQL on beomz-user-data via Management API. */
export async function runSql(sql: string): Promise<unknown[]> {
  const res = await fetch(
    `${MANAGEMENT_API_BASE}/projects/${USER_DATA_PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getMgmtKey()}`,
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SQL execution failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : [];
}

/**
 * Expose a new schema to PostgREST.
 * Grants privileges then updates authenticator GUC + NOTIFY.
 * Retries up to 3 times with 5s backoff to fix V1's PGRST106 race.
 */
export async function exposeSchemaInPostgREST(schema: string): Promise<void> {
  const grantSql = `
    GRANT USAGE ON SCHEMA "${schema}" TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}"
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
  `;

  // Read current exposed schemas from authenticator role
  const rows = (await runSql(`
    SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator';
  `)) as Array<{ rolconfig: string[] | null }>;

  const rolconfig = rows[0]?.rolconfig ?? [];
  const entry = rolconfig.find((c) => c.startsWith("pgrst.db_schemas="));
  const current = entry
    ? entry.replace("pgrst.db_schemas=", "").split(",").map((s) => s.trim())
    : ["public"];

  const updated = current.includes(schema)
    ? current.join(", ")
    : [...current, schema].join(", ");

  const exposeSql = `
    ALTER ROLE authenticator SET "pgrst.db_schemas" TO '${updated}';
    NOTIFY pgrst, 'reload config';
    NOTIFY pgrst, 'reload schema';
  `;

  await runSql(grantSql);
  await runSql(exposeSql);

  // Retry loop: confirm PostgREST picked up the schema (fixes V1 PGRST106 race)
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
    try {
      await runSql(`SELECT 1 FROM information_schema.schemata WHERE schema_name = '${schema}'`);
      break;
    } catch {
      // continue
    }
  }
}

/**
 * Create or replace the V2 beomz_db SECURITY DEFINER function.
 * V2 differences from V1:
 *  - Accepts p_nonce parameter, verified against beomz_schema_registry
 *  - No auto-create table on insert (prevents type inference errors)
 *  - Returns error json if table doesn't exist instead of silently creating it
 */
export async function createBeomzDbFunction(): Promise<void> {
  await runSql(`
    CREATE OR REPLACE FUNCTION public.beomz_db(
      p_schema text,
      p_nonce  text,
      p_table  text,
      p_op     text  DEFAULT 'select',
      p_data   jsonb DEFAULT NULL
    ) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      result         jsonb;
      expected_nonce text;
      _col_names     text;
      _col_vals      text;
      _set_clauses   text;
      _row_id        text;
    BEGIN
      IF p_schema NOT LIKE 'app_%' THEN
        RETURN jsonb_build_object('error', 'Invalid schema name');
      END IF;

      SELECT nonce INTO expected_nonce
      FROM public.beomz_schema_registry
      WHERE schema_name = p_schema;

      IF expected_nonce IS NULL OR expected_nonce <> p_nonce THEN
        RETURN jsonb_build_object('error', 'Access denied');
      END IF;

      CASE p_op
        WHEN 'select' THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = p_schema AND table_name = p_table
          ) THEN
            RETURN '[]'::jsonb;
          END IF;
          EXECUTE format(
            'SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]'') FROM %I.%I t',
            p_schema, p_table
          ) INTO result;

        WHEN 'insert' THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = p_schema AND table_name = p_table
          ) THEN
            RETURN jsonb_build_object('error', 'Table does not exist. Run a migration first.');
          END IF;
          SELECT
            string_agg(sub.col_name, ', '),
            string_agg(sub.col_val,  ', ')
          INTO _col_names, _col_vals
          FROM (
            SELECT
              format('%I', k) AS col_name,
              CASE
                WHEN left(_udt, 1) = '_' THEN
                  format(
                    'CASE WHEN jsonb_typeof($1->%L)=''array'' '
                    'THEN ARRAY(SELECT elem::%I FROM jsonb_array_elements_text($1->%L) AS x(elem)) '
                    'ELSE NULL::%I[] END',
                    k, substring(_udt from 2), k, substring(_udt from 2)
                  )
                WHEN _udt IN ('jsonb', 'json') THEN
                  format('COALESCE($1->%L,''null''::jsonb)', k)
                ELSE
                  format('($1->>%L)::%s', k, _udt)
              END AS col_val
            FROM (
              SELECT
                kk AS k,
                COALESCE(
                  (SELECT c.udt_name FROM information_schema.columns c
                   WHERE c.table_schema = p_schema AND c.table_name = p_table
                     AND c.column_name = kk LIMIT 1),
                  'text'
                ) AS _udt
              FROM jsonb_object_keys(p_data) AS kk
              WHERE kk <> 'id'
            ) typed
          ) sub;
          EXECUTE format(
            'INSERT INTO %I.%I (%s) VALUES (%s) RETURNING to_jsonb(%I.*)',
            p_schema, p_table, _col_names, _col_vals, p_table
          ) USING p_data INTO result;

        WHEN 'update' THEN
          _row_id := p_data->>'id';
          IF _row_id IS NULL THEN
            RETURN jsonb_build_object('error', 'update requires id in p_data');
          END IF;
          SELECT string_agg(
            format('%I = ($1->>%L)::%s', kk, kk,
              COALESCE(
                (SELECT c.udt_name FROM information_schema.columns c
                 WHERE c.table_schema = p_schema AND c.table_name = p_table
                   AND c.column_name = kk LIMIT 1),
                'text'
              )
            ), ', '
          )
          INTO _set_clauses
          FROM jsonb_object_keys(p_data) AS kk
          WHERE kk <> 'id';
          IF _set_clauses IS NULL THEN
            RETURN jsonb_build_object('error', 'No fields to update');
          END IF;
          EXECUTE format(
            'UPDATE %I.%I SET %s WHERE id = %L RETURNING to_jsonb(%I.*)',
            p_schema, p_table, _set_clauses, _row_id, p_table
          ) USING p_data INTO result;

        WHEN 'delete' THEN
          _row_id := p_data->>'id';
          IF _row_id IS NULL THEN
            RETURN jsonb_build_object('error', 'delete requires id in p_data');
          END IF;
          EXECUTE format(
            'DELETE FROM %I.%I WHERE id = %L RETURNING to_jsonb(%I.*)',
            p_schema, p_table, _row_id, p_table
          ) INTO result;

        ELSE
          RETURN jsonb_build_object('error', 'Unsupported operation: ' || p_op);
      END CASE;

      RETURN coalesce(result, '[]'::jsonb);
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('error', SQLERRM, 'table', p_table, 'schema', p_schema);
    END;
    $$;

    GRANT EXECUTE ON FUNCTION public.beomz_db(text, text, text, text, jsonb) TO anon, authenticated;
    NOTIFY pgrst, 'reload config';
    NOTIFY pgrst, 'reload schema';
  `);
}

/** Insert a new entry into beomz_schema_registry on beomz-user-data. */
export async function insertSchemaRegistry(schemaName: string, nonce: string): Promise<void> {
  const url = process.env.USER_DATA_SUPABASE_URL;
  const key = process.env.USER_DATA_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("USER_DATA_SUPABASE_URL / USER_DATA_SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/beomz_schema_registry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ schema_name: schemaName, nonce }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to insert schema registry (${res.status}): ${body}`);
  }
}

/** Remove an entry from beomz_schema_registry. */
export async function deleteSchemaRegistry(schemaName: string): Promise<void> {
  const url = process.env.USER_DATA_SUPABASE_URL;
  const key = process.env.USER_DATA_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  await fetch(
    `${url.replace(/\/$/, "")}/rest/v1/beomz_schema_registry?schema_name=eq.${encodeURIComponent(schemaName)}`,
    {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  );
}

/** Get all tables in a schema from beomz-user-data. */
export async function getSchemaTableList(
  schema: string,
): Promise<Array<{ table_name: string; columns: Array<{ name: string; type: string }> }>> {
  const rows = (await runSql(`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type
    FROM information_schema.columns c
    WHERE c.table_schema = '${schema}'
      AND c.table_name NOT LIKE 'pg_%'
    ORDER BY c.table_name, c.ordinal_position;
  `)) as Array<{ table_name: string; column_name: string; data_type: string }>;

  const tableMap = new Map<string, Array<{ name: string; type: string }>>();
  for (const row of rows) {
    if (!tableMap.has(row.table_name)) tableMap.set(row.table_name, []);
    tableMap.get(row.table_name)!.push({ name: row.column_name, type: row.data_type });
  }
  return Array.from(tableMap.entries()).map(([name, columns]) => ({ table_name: name, columns }));
}

/** Check if the DB env vars are configured. */
export function isUserDataConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_MANAGEMENT_API_KEY &&
    process.env.USER_DATA_SUPABASE_URL &&
    process.env.USER_DATA_SUPABASE_SERVICE_ROLE_KEY &&
    process.env.USER_DATA_SUPABASE_ANON_KEY,
  );
}

/** Returns the beomz-user-data public URL (for VITE_BEOMZ_DB_URL env injection). */
export function getUserDataPublicUrl(): string {
  const url = process.env.USER_DATA_SUPABASE_URL;
  if (!url) throw new Error("USER_DATA_SUPABASE_URL not configured");
  return url;
}

/** Returns the beomz-user-data anon key (public, safe to inject into WebContainer). */
export function getUserDataAnonKey(): string {
  const key = process.env.USER_DATA_SUPABASE_ANON_KEY;
  if (!key) throw new Error("USER_DATA_SUPABASE_ANON_KEY not configured");
  return key;
}

/** SQL allowlist for managed migrations (beomz-managed path). */
export function isAllowedMigrationStatement(statement: string, schema: string): boolean {
  const s = statement.trim();
  const forbiddenLeading = /^(DROP|TRUNCATE|DELETE|UPDATE|CREATE\s+FUNCTION|ALTER\s+ROLE|COPY)\b/i;
  if (forbiddenLeading.test(s)) return false;
  if (/^INSERT\s+/i.test(s) && !/^INSERT\s+INTO\s+/i.test(s)) return false;

  const privilegeList =
    "(?:USAGE|SELECT|INSERT|UPDATE|DELETE|ALL(?:\\s+PRIVILEGES)?)(?:\\s*,\\s*(?:USAGE|SELECT|INSERT|UPDATE|DELETE|ALL(?:\\s+PRIVILEGES)?))*";
  const allowedPatterns = [
    /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+/i,
    /^ALTER\s+TABLE\s+.+\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+/i,
    /^CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+/i,
    new RegExp(
      `^GRANT\\s+${privilegeList}\\s+ON\\s+(?:SCHEMA\\s+|TABLE\\s+|ALL\\s+TABLES\\s+IN\\s+SCHEMA\\s+)`,
      "i",
    ),
    /^ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+/i,
    /^INSERT\s+INTO\s+/i,
  ];

  if (!allowedPatterns.some((r) => r.test(s))) return false;

  const escaped = schema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(s);
}
