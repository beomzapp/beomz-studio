import { neon } from "@neondatabase/serverless";

export interface NeonSchemaColumn {
  name: string;
  type: string;
}

export interface NeonSchemaTable {
  table_name: string;
  columns: NeonSchemaColumn[];
}

export interface NeonTableRowsResult {
  rows: Array<Record<string, unknown>>;
  columns: string[];
}

export interface NeonProjectUser {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
}

export interface NeonProjectUserRow extends NeonProjectUser {
  password_hash: string;
}

function createSqlClient(connectionString: string) {
  return neon(connectionString);
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function assertSafeIdentifier(identifier: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error("Invalid table name");
  }
  return identifier;
}

export async function getNeonSchemaTableList(
  connectionString: string,
): Promise<NeonSchemaTable[]> {
  const sql = createSqlClient(connectionString);
  const rows = await sql`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name NOT LIKE 'pg_%'
    ORDER BY c.table_name, c.ordinal_position;
  ` as Array<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>;

  const tableMap = new Map<string, NeonSchemaColumn[]>();
  for (const row of rows) {
    if (!tableMap.has(row.table_name)) tableMap.set(row.table_name, []);
    tableMap.get(row.table_name)?.push({
      name: row.column_name,
      type: row.data_type,
    });
  }

  return Array.from(tableMap.entries()).map(([table_name, columns]) => ({
    table_name,
    columns,
  }));
}

export async function fetchTableRows(
  connectionString: string,
  tableName: string,
): Promise<NeonTableRowsResult> {
  const safeTableName = assertSafeIdentifier(tableName);
  const sql = createSqlClient(connectionString) as ReturnType<typeof neon> & {
    query: <T extends Record<string, unknown>>(query: string, params?: unknown[]) => Promise<T[]>;
  };

  const columnsResult = await sql.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position;
    `,
    [safeTableName],
  );
  const columns = columnsResult.map((column) => column.column_name);

  if (columns.length === 0) {
    throw new Error("Table not found");
  }

  const rows = await sql.query<Record<string, unknown>>(
    `SELECT * FROM "${safeTableName}" LIMIT 100;`,
  );

  return { rows, columns };
}

export async function createUsersTable(connectionString: string): Promise<void> {
  const sql = createSqlClient(connectionString);
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
}

export async function getUserByEmail(
  connectionString: string,
  email: string,
): Promise<NeonProjectUserRow | null> {
  const sql = createSqlClient(connectionString);
  const rows = await sql`
    SELECT id, email, password_hash, name, created_at
    FROM users
    WHERE email = ${email}
    LIMIT 1;
  ` as NeonProjectUserRow[];

  return rows[0] ?? null;
}

export async function getUserById(
  connectionString: string,
  id: number,
): Promise<NeonProjectUser | null> {
  const sql = createSqlClient(connectionString);
  const rows = await sql`
    SELECT id, email, name, created_at
    FROM users
    WHERE id = ${id}
    LIMIT 1;
  ` as NeonProjectUser[];

  return rows[0] ?? null;
}

export async function insertUser(
  connectionString: string,
  input: {
    email: string;
    passwordHash: string;
    name?: string | null;
  },
): Promise<NeonProjectUser> {
  const sql = createSqlClient(connectionString);
  const rows = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES (${input.email}, ${input.passwordHash}, ${input.name ?? null})
    RETURNING id, email, name, created_at;
  ` as NeonProjectUser[];

  const user = rows[0];
  if (!user) {
    throw new Error("Failed to create user");
  }

  return user;
}

export async function getNeonUsage(
  connectionString: string,
): Promise<{ storageMbUsed: number; rowsUsed: number; tablesUsed: number }> {
  const sql = createSqlClient(connectionString);
  const [storageRowsRaw, rowCountRowsRaw, tableCountRowsRaw] = await Promise.all([
    sql`
      SELECT COALESCE(
        SUM(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))),
        0
      ) / (1024 * 1024.0) AS storage_mb
      FROM pg_tables
      WHERE schemaname = 'public';
    `,
    sql`
      SELECT COALESCE(SUM(n_live_tup), 0) AS rows_used
      FROM pg_stat_user_tables
      WHERE schemaname = 'public';
    `,
    sql`
      SELECT COUNT(*) AS tables_used
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE';
    `,
  ]);
  const storageRows = storageRowsRaw as Array<{ storage_mb: number | string | null }>;
  const rowCountRows = rowCountRowsRaw as Array<{ rows_used: number | string | null }>;
  const tableCountRows = tableCountRowsRaw as Array<{ tables_used: number | string | null }>;

  return {
    storageMbUsed: Math.round(toNumber(storageRows[0]?.storage_mb) * 100) / 100,
    rowsUsed: Math.trunc(toNumber(rowCountRows[0]?.rows_used)),
    tablesUsed: Math.trunc(toNumber(tableCountRows[0]?.tables_used)),
  };
}
