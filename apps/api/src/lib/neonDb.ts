import { neon } from "@neondatabase/serverless";

export interface NeonSchemaColumn {
  name: string;
  type: string;
}

export interface NeonSchemaTable {
  table_name: string;
  columns: NeonSchemaColumn[];
}

function createSqlClient(connectionString: string) {
  return neon(connectionString);
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
