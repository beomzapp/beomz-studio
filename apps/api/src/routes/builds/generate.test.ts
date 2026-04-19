import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.PORT ??= "3001";

const {
  filterBlockedGeneratedFiles,
  buildIterationSystemPrompt,
  buildSystemPrompt,
  validateAndInjectStubs,
} = await import("./generate.js");

const INLINE_SUPABASE_RULE = "Continue the same inline createClient() pattern already present in the existing project files.";

test("iteration system prompt injects the inline Supabase rule when db_wired=true", () => {
  const prompt = buildIterationSystemPrompt(undefined, undefined, true);

  assert.match(prompt, /inline createClient\(\)/);
  assert.equal(prompt.includes("import { supabase } from"), false);
  assert.match(prompt, /Do NOT generate any file named supabase\.ts, supabase\.tsx, supabase-js, or supabase-client\./);
});

test("iteration system prompt injects Neon serverless guidance when db_wired=true and provider=neon", () => {
  const prompt = buildIterationSystemPrompt(undefined, undefined, true, "neon");

  assert.match(prompt, /This project uses a Neon Postgres database/);
  assert.match(prompt, /@neondatabase\/serverless/);
  assert.match(prompt, /import\.meta\.env\.VITE_DATABASE_URL/);
  assert.match(prompt, /CREATE TABLE IF NOT EXISTS/);
  assert.equal(prompt.includes("import { Pool } from 'pg'"), false);
  assert.equal(prompt.includes("process.env.DATABASE_URL"), false);
  assert.equal(prompt.includes("inline createClient()"), false);
});

test("iteration system prompt injects Neon Auth guidance when neon auth URL exists", () => {
  const prompt = buildIterationSystemPrompt(
    undefined,
    undefined,
    true,
    "neon",
    "https://auth.neon.example",
  );

  assert.match(prompt, /Authentication \(Neon Auth — already provisioned\):/);
  assert.match(prompt, /createAuthClient/);
  assert.match(prompt, /NeonAuthUIProvider/);
  assert.match(prompt, /AuthView pathname='sign-in'/);
});

test("iteration system prompt omits Neon Auth guidance when neon auth URL is missing", () => {
  const prompt = buildIterationSystemPrompt(undefined, undefined, true, "neon", "");

  assert.equal(prompt.includes("Authentication (Neon Auth — already provisioned):"), false);
});

test("iteration system prompt does not inject the inline Supabase rule when db_wired=false", () => {
  const prompt = buildIterationSystemPrompt(undefined, undefined, false);

  assert.equal(prompt.includes(INLINE_SUPABASE_RULE), false);
});

test("initial build system prompt does not inject the inline Supabase rule", () => {
  const prompt = buildSystemPrompt("professional-blue");

  assert.equal(prompt.includes(INLINE_SUPABASE_RULE), false);
  assert.equal(prompt.includes("import { supabase } from"), false);
});

test("system prompts include lucide safe icon guidance and banned icon list", () => {
  const initialPrompt = buildSystemPrompt("professional-blue");
  const iterationPrompt = buildIterationSystemPrompt(undefined, undefined, false);

  assert.match(initialPrompt, /When using lucide-react icons, prefer these commonly used icons which are guaranteed to exist:/);
  assert.match(initialPrompt, /Do NOT use: LayoutKanban, KanbanSquare, LayoutDashboard/);
  assert.match(iterationPrompt, /When using lucide-react icons, prefer these commonly used icons which are guaranteed to exist:/);
  assert.match(iterationPrompt, /Do NOT use: LayoutKanban, KanbanSquare, LayoutDashboard/);
});

test("validateAndInjectStubs does not create supabase.tsx when a supabase import is missing", () => {
  const result = validateAndInjectStubs(
    [
      {
        path: "apps/web/src/app/generated/workspace-task/TopupsPage.tsx",
        kind: "route",
        language: "tsx",
        content: "import { supabase } from './supabase'\nexport default function TopupsPage() { return null; }\n",
        source: "ai",
        locked: false,
      },
    ],
    "workspace-task",
  );

  assert.deepEqual(
    result.files.map((file) => file.path),
    ["apps/web/src/app/generated/workspace-task/TopupsPage.tsx"],
  );
  assert.deepEqual(result.missing, ["supabase (imported in TopupsPage.tsx)"]);
});

test("filterBlockedGeneratedFiles removes blocked supabase placeholder files", () => {
  const result = filterBlockedGeneratedFiles([
    {
      path: "apps/web/src/app/generated/workspace-task/App.tsx",
      kind: "entry",
      language: "tsx",
      content: "export default function App() { return null; }\n",
      source: "ai",
      locked: false,
    },
    {
      path: "apps/web/src/app/generated/workspace-task/supabase.tsx",
      kind: "component",
      language: "tsx",
      content: "export default function supabase() { return null; }\n",
      source: "platform",
      locked: false,
    },
  ]);

  assert.deepEqual(
    result.map((file) => file.path),
    ["apps/web/src/app/generated/workspace-task/App.tsx"],
  );
});
