import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.PORT ??= "3001";

const {
  filterBlockedGeneratedFiles,
  isBlockedFile,
  buildIterationUserMessage,
  buildIterationSystemPrompt,
  buildSystemPrompt,
  isNpmPackage,
  postProcessGeneratedFiles,
  validateAndInjectStubs,
} = await import("./generate.js");

const INLINE_SUPABASE_RULE = "Continue the same inline createClient() pattern already present in the existing project files.";
const BYO_SUPABASE_RULE = "This project uses the user's own Supabase database.";

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

test("iteration system prompt injects BYO Supabase guidance when BYO credentials are present", () => {
  const prompt = buildIterationSystemPrompt(undefined, undefined, false, "supabase", null, true);

  assert.equal(prompt.includes(BYO_SUPABASE_RULE), true);
  assert.match(prompt, /VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are injected automatically\./);
  assert.match(prompt, /Always use @supabase\/supabase-js for ALL data operations\./);
  assert.match(prompt, /Never use hardcoded sample data — always query from Supabase\./);
  assert.match(prompt, /const supabase = createClient\(import\.meta\.env\.VITE_SUPABASE_URL, import\.meta\.env\.VITE_SUPABASE_ANON_KEY\)/);
});

test("initial build system prompt does not inject the inline Supabase rule", () => {
  const prompt = buildSystemPrompt("professional-blue");

  assert.equal(prompt.includes(INLINE_SUPABASE_RULE), false);
  assert.equal(prompt.includes("import { supabase } from"), false);
});

test("initial build system prompt injects BYO Supabase guidance when credentials are connected", () => {
  const prompt = buildSystemPrompt("professional-blue", undefined, undefined, undefined, true);

  assert.equal(prompt.includes(BYO_SUPABASE_RULE), true);
  assert.match(prompt, /VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are injected automatically\./);
  assert.match(prompt, /Always use @supabase\/supabase-js for ALL data operations\./);
  assert.match(prompt, /Never use hardcoded sample data — always query from Supabase\./);
  assert.match(prompt, /const supabase = createClient\(import\.meta\.env\.VITE_SUPABASE_URL, import\.meta\.env\.VITE_SUPABASE_ANON_KEY\)/);
});

test("system prompts include lucide safe icon guidance and banned icon list", () => {
  const initialPrompt = buildSystemPrompt("professional-blue");
  const iterationPrompt = buildIterationSystemPrompt(undefined, undefined, false);

  assert.match(initialPrompt, /When using lucide-react icons, prefer these commonly used icons which are guaranteed to exist:/);
  assert.match(initialPrompt, /Do NOT use: LayoutKanban, KanbanSquare, LayoutDashboard/);
  assert.match(iterationPrompt, /When using lucide-react icons, prefer these commonly used icons which are guaranteed to exist:/);
  assert.match(iterationPrompt, /Do NOT use: LayoutKanban, KanbanSquare, LayoutDashboard/);
});

test("iteration system prompt forces surgical changed-file responses", () => {
  const prompt = buildIterationSystemPrompt(undefined, undefined, false);

  assert.match(prompt, /You are making a surgical edit to an existing React app\./);
  assert.match(prompt, /Start from the project manifest and seed files already provided\./);
  assert.match(prompt, /use search_project_code and read_project_file before editing/);
  assert.match(prompt, /Identify the MINIMUM set of files that need to change to fulfil this request/);
  assert.match(prompt, /Only return files you actually modified/);
  assert.match(prompt, /Think step by step:/);
  assert.match(prompt, /What is the minimal change to each file\?/);
});

test("iteration system prompt appends explicit public URL embedding instructions for attached images", () => {
  const prompt = buildIterationSystemPrompt(
    undefined,
    undefined,
    false,
    null,
    null,
    false,
    [
      "The user has attached an image. It is available at this Beomz-hosted image URL: https://beomz.ai/api/assets/image?bucket=project-assets&path=project-123%2Flogo.png",
      "Use this URL directly as the src attribute in <img> tags or as CSS background-image url(). This URL is preview-safe and allowed even under COEP restrictions. Do NOT use a data URI. Do NOT redraw, recreate, or approximate the image.",
    ].join("\n"),
  );

  assert.match(prompt, /It is available at this Beomz-hosted image URL:/);
  assert.match(prompt, /bucket=project-assets/);
  assert.match(prompt, /Use this URL directly as the src attribute/);
  assert.match(prompt, /preview-safe and allowed even under COEP restrictions/);
  assert.match(prompt, /Do NOT use a data URI/);
  assert.doesNotMatch(prompt, /base64,\.\.\./);
});

test("iteration user message includes a project manifest, seed files, and the edit request", () => {
  const prompt = buildIterationUserMessage("Rename the CTA button.", [
    {
      path: "App.tsx",
      kind: "route",
      language: "tsx",
      content: "export default function App() { return null; }\n",
      source: "ai",
      locked: false,
    },
    {
      path: "theme.ts",
      kind: "config",
      language: "ts",
      content: "export const theme = { accent: '#f97316' };\n",
      source: "ai",
      locked: false,
    },
    {
      path: "package.json",
      kind: "config",
      language: "json",
      content: "{ \"name\": \"iteration-log-seed\" }\n",
      source: "platform",
      locked: false,
    },
  ]);

  assert.match(prompt, /Project file manifest:/);
  assert.match(prompt, /- App\.tsx \| kind=route/);
  assert.match(prompt, /- theme\.ts \| kind=config/);
  assert.match(prompt, /- package\.json \| kind=config/);
  assert.match(prompt, /Seed file contents/);
  assert.match(prompt, /### App\.tsx/);
  assert.match(prompt, /Edit request: Rename the CTA button\./);
});

test("appearance edits prioritize theme and style files in the seed context", () => {
  const prompt = buildIterationUserMessage("Change the theme color to red.", [
    {
      path: "App.tsx",
      kind: "route",
      language: "tsx",
      content: "import { theme } from './theme';\nexport default function App() { return <div style={{ color: theme.textPrimary }}>Hello</div>; }\n",
      source: "ai",
      locked: false,
    },
    {
      path: "theme.ts",
      kind: "config",
      language: "ts",
      content: "export const theme = { accent: '#f97316', primary: '#2563eb' };\n",
      source: "ai",
      locked: false,
    },
    {
      path: "styles.css",
      kind: "style",
      language: "css",
      content: ":root { --brand-color: #f97316; }\n",
      source: "ai",
      locked: false,
    },
    {
      path: "tailwind.config.ts",
      kind: "config",
      language: "typescript",
      content: "export default { theme: { extend: { colors: { brand: '#f97316' } } } };\n",
      source: "ai",
      locked: false,
    },
  ]);

  assert.match(prompt, /### theme\.ts/);
  assert.match(prompt, /### styles\.css/);
  assert.match(prompt, /### tailwind\.config\.ts/);
  assert.match(prompt, /Edit request: Change the theme color to red\./);
});

test("system prompts describe the preview shell icon and logo color mapping", () => {
  const initialPrompt = buildSystemPrompt("professional-blue");
  const iterationPrompt = buildIterationSystemPrompt(undefined, undefined, false);

  assert.match(initialPrompt, /PREVIEW SHELL CONTEXT:/);
  assert.match(initialPrompt, /The shell header shows an app icon: a colored square with a lucide-react icon inside it/);
  assert.match(initialPrompt, /When the user says 'logo', 'app icon', 'logo color', or 'icon color'/);
  assert.match(initialPrompt, /Use theme\.accent as the primary icon\/logo color token/);

  assert.match(iterationPrompt, /PREVIEW SHELL CONTEXT:/);
  assert.match(iterationPrompt, /Treat short requests like 'change the logo color to orange' as a theme\.ts change targeting theme\.accent/);
  assert.match(iterationPrompt, /Example: 'change logo color to orange' → set accent: '#F97316', accentHover: '#EA580C'/);
});

test("generate build flow injects URL grounding before enrichPrompt runs", async () => {
  const source = await readFile(new URL("./generate.ts", import.meta.url), "utf8");

  assert.match(source, /injectUrlContextIntoBuildPrompt/);
  assert.match(source, /const promptWithUrlGrounding = await injectUrlContextIntoBuildPrompt\(prompt\);/);
  assert.match(source, /workingPrompt = input\.isIteration \? promptWithUrlGrounding : await enrichPrompt\(promptWithUrlGrounding\);/);
});

test("image attachments are passed directly into Anthropic content blocks with the image first", async () => {
  const source = await readFile(new URL("./generate.ts", import.meta.url), "utf8");

  assert.match(source, /return \[\s*buildAnthropicImageBlock\(imageUrl\),\s*\{ type: "text", text: userMessage \},\s*\];/);
  assert.match(source, /const optimizedUserContent = imageBlock\s*\?\s*\[\s*imageBlock,\s*\{ type: "text", text: optimizedText, cache_control: \{ type: "ephemeral" \} \} as any,/);
  assert.match(source, /return \[\s*imageBlock,\s*\{\s*type: "text",\s*text: filesContext,/);
  assert.doesNotMatch(source, /awaiting_image_confirmation/);
  assert.doesNotMatch(source, /type:\s*"image_intent"/);
});

test("iteration flow uploads attached images and injects the public asset URL into the system prompt", async () => {
  const source = await readFile(new URL("./generate.ts", import.meta.url), "utf8");

  assert.match(source, /resolvedImageBlock = await resolveAnthropicImageBlock\(imageUrl\);/);
  assert.match(source, /uploadedImageUrl = await uploadProjectAsset\(/);
  assert.match(source, /imageEmbeddingInstructionBlock = buildIterationImageEmbeddingInstruction\(uploadedImageUrl\);/);
  assert.match(source, /console\.log\("\[generate\] image URL to inject:", uploadedImageUrl\);/);
  assert.match(source, /const systemPrompt = buildIterationSystemPrompt\([\s\S]*imageEmbeddingInstructionBlock,\s*\);/);
  assert.match(source, /It is available at this Beomz-hosted image URL: \$\{imageUrl\}/);
  assert.match(source, /preview-safe and allowed even under COEP restrictions/);
  assert.match(source, /Do NOT use a data URI/);
  assert.doesNotMatch(source, /base64,\.\.\./);
  assert.doesNotMatch(source, /imageBlock\.source\.data\}/);
  assert.doesNotMatch(source, /failed to resolve\/upload iteration image for prompt injection \(non-fatal\)/);
  assert.match(source, /console\.error\("\[generate\] failed to resolve\/upload iteration image for prompt injection:", error\);/);
  assert.match(source, /throw error;/);
});

test("iteration logs the source image URL before firing and warns if image context has no URL", async () => {
  const source = await readFile(new URL("./generate.ts", import.meta.url), "utf8");

  assert.match(source, /console\.log\("\[generate\] iteration source image URL:", input\.imageUrl\);/);
  assert.match(source, /console\.warn\("\[generate\] iteration has image context but no image URL was provided\."\);/);
});

test("postProcessGeneratedFiles rewrites empty image data URIs to the uploaded asset URL", () => {
  const { files } = postProcessGeneratedFiles([
    {
      path: "apps/web/src/app/generated/workspace-task/App.tsx",
      kind: "route",
      language: "tsx",
      content: "export default function App(){return <img src=\"data:image/png;base64,\" alt=\"logo\" />;}\n",
      source: "ai",
      locked: false,
    },
  ], "workspace-task", "https://beomz.ai/api/assets/image?bucket=project-assets&path=project-123%2Flogo.png");

  assert.equal(files[0]?.content.includes("data:image/png;base64,"), false);
  assert.match(files[0]?.content ?? "", /https:\/\/beomz\.ai\/api\/assets\/image\?bucket=project-assets/);
});

test("iteration completion persists migrations and applies BYO Supabase OAuth migrations after the build is written", async () => {
  const source = await readFile(new URL("./generate.ts", import.meta.url), "utf8");

  assert.match(source, /const iterationMigrations = Array\.isArray\(iterResult\.migrations\)/);
  assert.match(source, /migrations: iterationMigrations/);
  assert.match(source, /const completedGeneration = await db\.findGenerationById\(buildId\)\.catch\(\(\) => null\);/);
  assert.match(source, /const metadataMigrations = Array\.isArray\(completedMetadata\.migrations\)/);
  assert.match(source, /readStoredSupabaseToken\(projectRow\?\.supabase_oauth_access_token\)/);
  assert.match(source, /runSupabaseManagementQueryWithOAuth\(/);
  assert.match(source, /\[supabase\] migration applied:/);
  assert.match(source, /\[supabase\] migration failed \(non-fatal\):/);
});

test("iteration path uses a lower Anthropic max token cap, enables tool-based file access, and logs iteration metrics", async () => {
  const source = await readFile(new URL("./generate.ts", import.meta.url), "utf8");

  assert.match(source, /const ITERATION_MAX_TOOL_STEPS = 20;/);
  assert.match(source, /const ITERATION_MAX_TOKENS = 32000;/);
  assert.match(source, /const maxTokens = isIteration \? ITERATION_MAX_TOKENS : DEFAULT_BUILD_MAX_TOKENS;/);
  assert.match(source, /system:\s*\[\s*\{\s*type: "text",\s*text: systemPrompt,\s*cache_control: \{ type: "ephemeral" \}/);
  assert.match(source, /console\.log\("\[generate\] existing files fetched:", existingFiles\?\.map\(\(f\) => f\.path\)\);/);
  assert.match(source, /name: "read_project_file"/);
  assert.match(source, /name: "search_project_code"/);
  assert.match(source, /const ITERATION_TOOLS:/);
  assert.match(source, /stream\.on\("streamEvent"/);
  assert.match(source, /console\.log\("\[generate\] iteration tool turn:"/);
  assert.match(source, /console\.log\("\[generate\] tool loop step:", step \+ 1, "tool:", toolUse\.name\);/);
  assert.match(source, /console\.log\("\[generate\] calling tool:", toolUse\.name, toolUse\.input \?\? \{\}\);/);
  assert.match(source, /iteration tool loop fallback triggered/);
  assert.match(source, /return fallbackToLegacyIteration\(`Iteration tool loop exceeded \$\{ITERATION_MAX_TOOL_STEPS\} steps\.`\);/);
  assert.match(source, /console\.log\("\[generate\] iteration metrics:", metrics\);/);
});

test("isNpmPackage classifies npm and local import paths correctly", () => {
  assert.equal(isNpmPackage("@neondatabase/serverless"), true);
  assert.equal(isNpmPackage("@supabase/supabase-js"), true);
  assert.equal(isNpmPackage("@neondatabase/neon-js/auth"), true);
  assert.equal(isNpmPackage("react"), true);
  assert.equal(isNpmPackage("lucide-react"), true);
  assert.equal(isNpmPackage("pg"), true);
  assert.equal(isNpmPackage("./components/Button"), false);
  assert.equal(isNpmPackage("../lib/utils"), false);
  assert.equal(isNpmPackage("/absolute/path"), false);
});

test("validateAndInjectStubs skips npm package imports and logs a warning", () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const result = validateAndInjectStubs(
      [
        {
          path: "apps/web/src/app/generated/workspace-task/BoardPage.tsx",
          kind: "route",
          language: "tsx",
          content: "import { neon } from '@neondatabase/serverless'\nexport default function BoardPage() { return null; }\n",
          source: "ai",
          locked: false,
        },
      ],
      "workspace-task",
    );

    assert.deepEqual(
      result.files.map((file) => file.path),
      ["apps/web/src/app/generated/workspace-task/BoardPage.tsx"],
    );
    assert.deepEqual(result.missing, []);
    assert.equal(
      warnings.some((line) => line.includes("[validateAndInjectStubs] skipping npm package import: @neondatabase/serverless")),
      true,
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("validateAndInjectStubs still creates stubs for missing local relative imports", () => {
  const result = validateAndInjectStubs(
    [
      {
        path: "apps/web/src/app/generated/workspace-task/App.tsx",
        kind: "entry",
        language: "tsx",
        content: "import MissingComponent from './MissingComponent'\nexport default function App() { return <MissingComponent />; }\n",
        source: "ai",
        locked: false,
      },
    ],
    "workspace-task",
  );

  assert.deepEqual(
    result.files.map((file) => file.path).sort(),
    [
      "apps/web/src/app/generated/workspace-task/App.tsx",
      "apps/web/src/app/generated/workspace-task/MissingComponent.tsx",
    ].sort(),
  );
  assert.deepEqual(result.missing, ["MissingComponent (imported in App.tsx)"]);
});

test("validateAndInjectStubs does not create supabase.tsx for npm supabase import", () => {
  const result = validateAndInjectStubs(
    [
      {
        path: "apps/web/src/app/generated/workspace-task/TopupsPage.tsx",
        kind: "route",
        language: "tsx",
        content: "import { createClient } from '@supabase/supabase-js'\nexport default function TopupsPage() { return null; }\n",
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
  assert.deepEqual(result.missing, []);
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

test("filterBlockedGeneratedFiles removes new helper re-export filenames", () => {
  const blockedHelperFilenames = [
    "ui.tsx",
    "ui.ts",
    "auth.tsx",
    "auth.ts",
    "db.tsx",
    "db.ts",
    "client.tsx",
    "client.ts",
    "neon-auth.tsx",
    "neon-auth.ts",
  ];

  for (const blockedFilename of blockedHelperFilenames) {
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
        path: `apps/web/src/app/generated/workspace-task/${blockedFilename}`,
        kind: "component",
        language: blockedFilename.endsWith(".tsx") ? "tsx" : "ts",
        content: "export const value = null;\n",
        source: "platform",
        locked: false,
      },
    ]);

    assert.deepEqual(
      result.map((file) => file.path),
      ["apps/web/src/app/generated/workspace-task/App.tsx"],
      `Expected ${blockedFilename} to be filtered out`,
    );
  }
});

test("isBlockedFile returns true for blocked basenames", () => {
  assert.equal(isBlockedFile("serverless.tsx"), true);
  assert.equal(isBlockedFile("serverless.ts"), true);
  assert.equal(isBlockedFile("ui.tsx"), true);
  assert.equal(isBlockedFile("auth.ts"), true);
  assert.equal(isBlockedFile("db.tsx"), true);
  assert.equal(isBlockedFile("client.ts"), true);
  assert.equal(isBlockedFile("neon-auth.tsx"), true);
  assert.equal(isBlockedFile("supabase.tsx"), true);
  assert.equal(isBlockedFile("supabase-js.ts"), true);
});

test("isBlockedFile returns false for non-blocked filenames", () => {
  assert.equal(isBlockedFile("App.tsx"), false);
  assert.equal(isBlockedFile("Button.tsx"), false);
  assert.equal(isBlockedFile("index.ts"), false);
  assert.equal(isBlockedFile("utils.ts"), false);
});

test("isBlockedFile matches on basename — path prefix is ignored", () => {
  assert.equal(isBlockedFile("src/components/serverless.tsx"), true);
  assert.equal(isBlockedFile("apps/web/src/app/generated/workspace-task/ui.tsx"), true);
  assert.equal(isBlockedFile("some/deep/path/auth.ts"), true);
  assert.equal(isBlockedFile("src/components/App.tsx"), false);
});

test("save path: filterBlockedGeneratedFiles strips stubs injected by validateAndInjectStubs", () => {
  // Simulate: AI imports from './ui' (shortened package path), validateAndInjectStubs
  // creates a ui.tsx stub. filterBlockedGeneratedFiles must remove it before DB persist.
  const fileWithBadImport = {
    path: "apps/web/src/app/generated/workspace-task/App.tsx",
    kind: "entry" as const,
    language: "tsx" as const,
    content: "import { AuthView } from './ui'\nexport default function App() { return null; }\n",
    source: "ai" as const,
    locked: false,
  };
  const { files: withStubs } = validateAndInjectStubs([fileWithBadImport], "workspace-task");
  // validateAndInjectStubs should have injected ui.tsx
  const stubPaths = withStubs.map((f) => f.path.replace(/^.*\//, ""));
  assert.equal(stubPaths.includes("ui.tsx"), true, "validateAndInjectStubs should have injected ui.tsx stub");

  // Now simulate what _runBuildInBackground does before persisting:
  const toSave = filterBlockedGeneratedFiles(withStubs);
  const savedPaths = toSave.map((f) => f.path.replace(/^.*\//, ""));
  assert.equal(savedPaths.includes("ui.tsx"), false, "ui.tsx stub must not be persisted");
  assert.equal(savedPaths.includes("App.tsx"), true, "App.tsx must be kept");
});

test("pipeline order: rewriteNeonImports runs before validateAndInjectStubs", () => {
  const fileWithShortNeonImport = {
    path: "apps/web/src/app/generated/workspace-task/App.tsx",
    kind: "entry" as const,
    language: "tsx" as const,
    content: "import { neon } from './serverless'\nexport default function App() { return null; }\n",
    source: "ai" as const,
    locked: false,
  };

  const { files, missing } = postProcessGeneratedFiles([fileWithShortNeonImport], "workspace-task");
  const paths = files.map((f) => f.path.replace(/^.*\//, ""));
  const appFile = files.find((f) => f.path.endsWith("/App.tsx"));

  assert.equal(paths.includes("serverless.tsx"), false, "No serverless.tsx stub should be created");
  assert.deepEqual(missing, [], "No missing imports should remain after Neon import rewrite");
  assert.match(
    appFile?.content ?? "",
    /from '@neondatabase\/serverless'/,
    "Short Neon import should be rewritten to package import before stub validation",
  );
});
