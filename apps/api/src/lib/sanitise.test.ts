import assert from "node:assert/strict";
import test from "node:test";

import {
  fixInvalidLucideIcons,
  rewriteNeonImports,
  sanitiseContent,
  VALID_LUCIDE_ICONS,
} from "./sanitise.ts";

const TEST_PATH = "apps/web/src/app/generated/dreadmeter/App.tsx";

test("sanitiseContent removes the exact Tailwind CDN script tag", () => {
  const input = [
    "<div>before</div>",
    '<script src="https://cdn.tailwindcss.com"></script>',
    "<div>after</div>",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("cdn.tailwindcss.com"), false);
  assert.equal(output.includes("<div>before</div>"), true);
  assert.equal(output.includes("<div>after</div>"), true);
});

test("sanitiseContent removes Tailwind CDN script tags with query-string variants", () => {
  const input = [
    '<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>',
    "<main>safe</main>",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("cdn.tailwindcss.com"), false);
  assert.equal(output.includes("<main>safe</main>"), true);
});

test("sanitiseContent removes version-pinned Tailwind CDN script tags", () => {
  const input = [
    '<script src="https://cdn.tailwindcss.com/@3.4.13?plugins=forms"></script>',
    "<section>safe</section>",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("cdn.tailwindcss.com"), false);
  assert.equal(output.includes("<section>safe</section>"), true);
});

test("sanitiseContent removes protocol-relative Tailwind CDN script tags", () => {
  const input = [
    "<header>safe</header>",
    '<script src="//cdn.tailwindcss.com?plugins=forms"></script>',
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("cdn.tailwindcss.com"), false);
  assert.equal(output.includes("<header>safe</header>"), true);
});

test("sanitiseContent removes stylesheet links that reference the Tailwind CDN", () => {
  const input = [
    '<link rel="stylesheet" href="https://cdn.tailwindcss.com?plugins=forms">',
    "<article>safe</article>",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("cdn.tailwindcss.com"), false);
  assert.equal(output.includes("<article>safe</article>"), true);
});

test("sanitiseContent leaves unrelated local markup untouched", () => {
  const input = [
    '<script src="/assets/app.js"></script>',
    '<link rel="stylesheet" href="/assets/app.css">',
    "<div>safe</div>",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output, input);
});

test("sanitiseContent replaces raw \\n and \\t escapes between JSX attributes with spaces", () => {
  const input = [
    "export default function App() {",
    "  return <Widget active={tagMenuOpen}\\n\\tactiveColor={theme.accent} />;",
    "}",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("\\n"), false);
  assert.equal(output.includes("\\t"), false);
  assert.match(output, /active=\{tagMenuOpen\}\s+activeColor=\{theme\.accent\}/);
});

test("sanitiseContent removes raw \\r escapes and generic \\[a-z] escapes between JSX attributes", () => {
  const input = [
    "export default function App() {",
    "  return <Widget active={tagMenuOpen}\\r\\qactiveColor={theme.accent} />;",
    "}",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("\\r"), false);
  assert.equal(output.includes("\\q"), false);
  assert.match(output, /active=\{tagMenuOpen\}\s+activeColor=\{theme\.accent\}/);
});

test("sanitiseContent leaves quoted JSX attribute strings untouched while fixing raw escapes between attributes", () => {
  const input = [
    "export default function App() {",
    '  return <Widget title="Line\\nBreak" active={tagMenuOpen}\\factiveColor={theme.accent} />;',
    "}",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes('title="Line\\nBreak"'), true);
  assert.equal(output.includes("\\f"), false);
  assert.match(output, /active=\{tagMenuOpen\}\s+activeColor=\{theme\.accent\}/);
});

test("sanitiseContent logs the dedicated tailwindCdnScript fixer when it fires", () => {
  const input = '<script src="https://cdn.tailwindcss.com"></script>';
  const originalLog = console.log;
  const calls: string[] = [];

  console.log = (...args: unknown[]) => {
    calls.push(args.map((value) => String(value)).join(" "));
  };

  try {
    sanitiseContent(input, TEST_PATH);
  } finally {
    console.log = originalLog;
  }

  assert.equal(
    calls.some((line) => line.includes("[sanitise] tailwindCdnScript fixed in App.tsx")),
    true,
  );
});

test("sanitiseContent fixes export default function supabase-js()", () => {
  const input = "export default function supabase-js() {\n  return null;\n}\n";

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(
    output,
    "export default function SupabaseJs() {\n  return null;\n}\n",
  );
});

test("sanitiseContent fixes broken Supabase import and require variants in one pass", () => {
  const input = [
    'import { createClient } from "./supabase-js";',
    "import { createClient as createClientSingle } from './supabase-js';",
    'import { createClient as createClientPkg } from "supabase-js";',
    "import { createClient as createClientPkgSingle } from 'supabase-js';",
    'const supabase = require("./supabase-js");',
    "const supabaseSingle = require('./supabase-js');",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.match(output, /from "@supabase\/supabase-js";/);
  assert.match(output, /from '@supabase\/supabase-js';/);
  assert.match(output, /require\("@supabase\/supabase-js"\);/);
  assert.match(output, /require\('@supabase\/supabase-js'\);/);
  assert.equal(output.includes('./supabase-js'), false);
  assert.equal(output.includes('"supabase-js"'), false);
  assert.equal(output.includes("'supabase-js'"), false);
});

test("sanitiseContent replaces raw Supabase REST fetch patterns with a TODO placeholder", () => {
  const input = [
    "async function loadTasks() {",
    "  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/tasks?select=*`, {",
    "    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },",
    "  });",
    "  const fallback = await fetch(supabaseUrl + '/rest/v1/tasks?select=*');",
    "  const envFallback = await fetch(import.meta.env.VITE_SUPABASE_URL + '/rest/v1/tasks?select=*');",
    "  const constFallback = await fetch(SUPABASE_URL + '/rest/v1/tasks?select=*');",
    "  await fetch(`${supabaseUrl}/rest/v1/tasks?select=*`);",
    "}",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("/rest/v1/tasks"), false);
  assert.match(output, /const response = undefined; \/\/ TODO: use supabase client: supabase\.from\('table'\)\.select\('\*'\)/);
  assert.match(output, /const fallback = undefined; \/\/ TODO: use supabase client: supabase\.from\('table'\)\.select\('\*'\)/);
  assert.match(output, /const envFallback = undefined; \/\/ TODO: use supabase client: supabase\.from\('table'\)\.select\('\*'\)/);
  assert.match(output, /const constFallback = undefined; \/\/ TODO: use supabase client: supabase\.from\('table'\)\.select\('\*'\)/);
  assert.match(output, /\/\/ TODO: use supabase client: supabase\.from\('table'\)\.select\('\*'\)/);
});

test("sanitiseContent fixes multi-word hyphenated component names", () => {
  const input = "export default function my-cool-component() {\n  return <div />;\n}\n";

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(
    output,
    "export default function MyCoolComponent() {\n  return <div />;\n}\n",
  );
});

test("sanitiseContent leaves valid export default function names unchanged", () => {
  const input = "export default function validName() {\n  return null;\n}\n";

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output, input);
});

test("sanitiseContent converts a-b-c-d to ABCD", () => {
  const input = "export default function a-b-c-d() {\n  return null;\n}\n";

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(
    output,
    "export default function ABCD() {\n  return null;\n}\n",
  );
});

test("VALID_LUCIDE_ICONS includes Circle and Home, excludes LayoutKanban", () => {
  assert.equal(VALID_LUCIDE_ICONS.has("Circle"), true);
  assert.equal(VALID_LUCIDE_ICONS.has("Home"), true);
  assert.equal(VALID_LUCIDE_ICONS.has("LayoutKanban"), false);
});

test("fixInvalidLucideIcons replaces LayoutKanban with Circle", () => {
  const input = "import { LayoutKanban } from 'lucide-react'\n";
  const output = fixInvalidLucideIcons(input);

  assert.equal(output, "import { Circle } from 'lucide-react'\n");
});

test("fixInvalidLucideIcons replaces KanbanSquare with Circle", () => {
  const input = "import { KanbanSquare } from 'lucide-react'\n";
  const output = fixInvalidLucideIcons(input);

  assert.equal(output, "import { Circle } from 'lucide-react'\n");
});

test("fixInvalidLucideIcons keeps valid Home unchanged", () => {
  const input = "import { Home } from 'lucide-react'\n";
  const output = fixInvalidLucideIcons(input);

  assert.equal(output, input);
});

test("fixInvalidLucideIcons preserves alias when replacing invalid icon", () => {
  const input = "import { LayoutKanban as BoardIcon, Home } from 'lucide-react'\n";
  const output = fixInvalidLucideIcons(input);

  assert.equal(output, "import { Circle as BoardIcon, Home } from 'lucide-react'\n");
});

test("fixInvalidLucideIcons replaces invalid icon JSX usages with Circle", () => {
  const input = [
    "import { LayoutKanban, Home } from 'lucide-react'",
    "export default function App() {",
    "  return <div><LayoutKanban className=\"w-4 h-4\"></LayoutKanban><Home /></div>;",
    "}",
  ].join("\n");

  const output = fixInvalidLucideIcons(input);

  assert.match(output, /import \{ Circle, Home \} from 'lucide-react'/);
  assert.match(output, /<Circle className=\"w-4 h-4\"><\/Circle>/);
  assert.equal(output.includes("<LayoutKanban"), false);
  assert.equal(output.includes("</LayoutKanban>"), false);
});

test("rewriteNeonImports rewrites ./serverless to @neondatabase/serverless", () => {
  const [file] = rewriteNeonImports([
    { path: TEST_PATH, content: "import { neon } from './serverless'\n" },
  ]);
  assert.equal(file.content, "import { neon } from '@neondatabase/serverless'\n");
});

test("rewriteNeonImports rewrites ../serverless to @neondatabase/serverless", () => {
  const [file] = rewriteNeonImports([
    { path: TEST_PATH, content: "import { neon } from '../serverless'\n" },
  ]);
  assert.equal(file.content, "import { neon } from '@neondatabase/serverless'\n");
});

test("rewriteNeonImports rewrites ./neon to @neondatabase/serverless", () => {
  const [file] = rewriteNeonImports([
    { path: TEST_PATH, content: "import { neon } from './neon'\n" },
  ]);
  assert.equal(file.content, "import { neon } from '@neondatabase/serverless'\n");
});

test("rewriteNeonImports rewrites ./db to @neondatabase/serverless", () => {
  const [file] = rewriteNeonImports([
    { path: TEST_PATH, content: "import { neon } from './db'\n" },
  ]);
  assert.equal(file.content, "import { neon } from '@neondatabase/serverless'\n");
});

test("rewriteNeonImports rewrites ./neon-auth to @neondatabase/neon-js/auth", () => {
  const [file] = rewriteNeonImports([
    { path: TEST_PATH, content: "import { createAuthClient } from './neon-auth'\n" },
  ]);
  assert.equal(file.content, "import { createAuthClient } from '@neondatabase/neon-js/auth'\n");
});

test("rewriteNeonImports rewrites ./neon-js to @neondatabase/neon-js", () => {
  const [file] = rewriteNeonImports([
    { path: TEST_PATH, content: "import { neonConfig } from './neon-js'\n" },
  ]);
  assert.equal(file.content, "import { neonConfig } from '@neondatabase/neon-js'\n");
});

test("rewriteNeonImports leaves non-Neon npm imports unchanged", () => {
  const input = "import React from 'react'\n";
  const [file] = rewriteNeonImports([{ path: TEST_PATH, content: input }]);
  assert.equal(file.content, input);
});

test("rewriteNeonImports leaves legitimate relative component imports unchanged", () => {
  const input = "import Button from './components/Button'\n";
  const [file] = rewriteNeonImports([{ path: TEST_PATH, content: input }]);
  assert.equal(file.content, input);
});

test("rewriteNeonImports leaves relative subdirectory imports unchanged", () => {
  const input = "import setup from './database/setup'\n";
  const [file] = rewriteNeonImports([{ path: TEST_PATH, content: input }]);
  assert.equal(file.content, input);
});
