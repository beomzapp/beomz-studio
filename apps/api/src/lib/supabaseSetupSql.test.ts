import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSupabaseSetupSqlFromFiles,
  detectSupabaseTablesFromFiles,
} from "./supabaseSetupSql.ts";

test("detectSupabaseTablesFromFiles reads tables and simple selected columns", () => {
  const files = [
    {
      content: [
        'const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);',
        "const { data } = await supabase.from('tasks').select('id, title, status').order('created_at', { ascending: false });",
        'const { data: users } = await supabase.from("profiles").select("id, display_name");',
      ].join("\n"),
    },
  ];

  assert.deepEqual(detectSupabaseTablesFromFiles(files), [
    {
      name: "profiles",
      columns: ["display_name", "id"],
    },
    {
      name: "tasks",
      columns: ["created_at", "id", "status", "title"],
    },
  ]);
});

test("buildSupabaseSetupSqlFromFiles generates simple CREATE TABLE statements", () => {
  const files = [
    {
      content: "const { data } = await supabase.from('tasks').select('id, title, created_at').order('created_at', { ascending: false });",
    },
  ];

  const sql = buildSupabaseSetupSqlFromFiles(files);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\."tasks"/);
  assert.match(sql, /"id" UUID DEFAULT gen_random_uuid\(\) PRIMARY KEY/);
  assert.match(sql, /"created_at" TIMESTAMPTZ DEFAULT now\(\)/);
  assert.match(sql, /"title" TEXT/);
  assert.match(sql, /ALTER TABLE public\."tasks" ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /CREATE POLICY "Allow all for anon" ON public\."tasks"/);
  assert.match(sql, /TO anon/);
  assert.match(sql, /USING \(true\)/);
  assert.match(sql, /WITH CHECK \(true\);/);
});

test("buildSupabaseSetupSqlFromFiles returns empty string when no tables are detected", () => {
  const sql = buildSupabaseSetupSqlFromFiles([
    { content: "export default function App() { return <div>Hello</div>; }" },
  ]);

  assert.equal(sql, "");
});
