interface GeneratedFileLike {
  content: string;
}

export interface DetectedSupabaseTable {
  name: string;
  columns: string[];
}

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FROM_PATTERN = /\.from\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*\)/g;
const SELECT_PATTERN = /\.select\(\s*(['"`])([\s\S]*?)\1/g;
const COLUMN_REFERENCE_PATTERN = /\.(?:order|eq|neq|gt|gte|lt|lte|like|ilike|contains|containedBy|is|filter)\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1/g;

function isSafeIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value);
}

function quoteIdentifier(identifier: string): string {
  if (!isSafeIdentifier(identifier)) {
    throw new Error(`Unsafe identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function normaliseSelectedColumn(rawSegment: string): string | null {
  const trimmed = rawSegment.trim();
  if (!trimmed || trimmed === "*" || trimmed.includes("(") || trimmed.includes(")")) {
    return null;
  }

  const withoutModifiers = trimmed
    .replace(/!inner\b/g, "")
    .replace(/::[A-Za-z_][A-Za-z0-9_]*/g, "")
    .trim();
  const aliasParts = withoutModifiers.split(":").map((part) => part.trim()).filter(Boolean);
  const candidate = aliasParts.length > 1 ? aliasParts[aliasParts.length - 1] : withoutModifiers;

  return isSafeIdentifier(candidate) ? candidate : null;
}

function collectColumnsFromSnippet(snippet: string, target: Set<string>): void {
  for (const match of snippet.matchAll(SELECT_PATTERN)) {
    const selectClause = match[2] ?? "";
    for (const rawSegment of selectClause.split(",")) {
      const columnName = normaliseSelectedColumn(rawSegment);
      if (columnName) {
        target.add(columnName);
      }
    }
  }

  for (const match of snippet.matchAll(COLUMN_REFERENCE_PATTERN)) {
    const columnName = match[2]?.trim();
    if (columnName && isSafeIdentifier(columnName)) {
      target.add(columnName);
    }
  }
}

function buildSnippet(content: string, startIndex: number): string {
  const nextFromRelativeIndex = content.slice(startIndex + 1).search(/\.from\(\s*['"`]/);
  const nextStatementRelativeIndex = content.slice(startIndex).search(/;\s*(?:\r?\n|$)/);

  const nextFromIndex = nextFromRelativeIndex >= 0
    ? startIndex + 1 + nextFromRelativeIndex
    : Number.POSITIVE_INFINITY;
  const nextStatementIndex = nextStatementRelativeIndex >= 0
    ? startIndex + nextStatementRelativeIndex + 1
    : Number.POSITIVE_INFINITY;
  const snippetEnd = Math.min(
    content.length,
    startIndex + 1200,
    Number.isFinite(nextFromIndex) ? nextFromIndex : content.length,
    Number.isFinite(nextStatementIndex) ? nextStatementIndex : content.length,
  );

  return content.slice(startIndex, snippetEnd);
}

export function detectSupabaseTablesFromFiles(
  files: readonly GeneratedFileLike[],
): DetectedSupabaseTable[] {
  const tables = new Map<string, Set<string>>();

  for (const file of files) {
    for (const match of file.content.matchAll(FROM_PATTERN)) {
      const tableName = match[2];
      if (!tableName || !isSafeIdentifier(tableName)) {
        continue;
      }

      const knownColumns = tables.get(tableName) ?? new Set<string>();
      tables.set(tableName, knownColumns);

      const snippet = buildSnippet(file.content, match.index ?? 0);
      collectColumnsFromSnippet(snippet, knownColumns);
    }
  }

  return Array.from(tables.entries())
    .map(([name, columns]) => ({
      name,
      columns: Array.from(columns).sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function sqlTypeForColumn(columnName: string): string {
  if (columnName === "id") {
    return "UUID DEFAULT gen_random_uuid() PRIMARY KEY";
  }
  if (columnName === "created_at") {
    return "TIMESTAMPTZ DEFAULT now()";
  }
  return "TEXT";
}

export function buildSupabaseSetupSqlFromFiles(
  files: readonly GeneratedFileLike[],
): string {
  const tables = detectSupabaseTablesFromFiles(files);
  if (tables.length === 0) {
    return "";
  }

  return tables.map((table) => {
    const allColumns = ["id", "created_at", ...table.columns.filter((column) => column !== "id" && column !== "created_at")];
    const columnLines = allColumns.map((columnName) => `  ${quoteIdentifier(columnName)} ${sqlTypeForColumn(columnName)}`);
    const qualifiedTableName = `public.${quoteIdentifier(table.name)}`;
    return [
      `CREATE TABLE IF NOT EXISTS ${qualifiedTableName} (`,
      columnLines.join(",\n"),
      ");",
      "",
      `ALTER TABLE ${qualifiedTableName} ENABLE ROW LEVEL SECURITY;`,
      "",
      `CREATE POLICY "Allow all for anon" ON ${qualifiedTableName}`,
      "  FOR ALL",
      "  TO anon",
      "  USING (true)",
      "  WITH CHECK (true);",
    ].join("\n");
  }).join("\n\n");
}
