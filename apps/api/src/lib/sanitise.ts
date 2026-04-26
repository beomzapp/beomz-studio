/**
 * Pre-render sanitisation pipeline.
 *
 * A set of named, pure-sync fixers that run on ALL generated files before
 * they reach WebContainer or are uploaded to Vercel.
 *
 * Each fixer logs [sanitise] <fixerName> fixed in <filename> when it makes
 * a change, so we can trace exactly which transform fired.
 *
 * Must be pure sync Node.js, <5ms for a typical 7-file app.
 *
 * Apply in generate.ts at TWO points:
 *   1. After initial build files assembled   → sanitiseFiles(files)
 *   2. After iteration files assembled       → sanitiseFiles(files)
 */

import dynamicIconImports from "lucide-react/dynamicIconImports.mjs";

// ── Post-processing stage: Neon import rewrites ─────────────────────────────
// Maps shortened relative import paths that LLMs generate back to the correct
// npm package paths. This runs before stub injection so validateAndInjectStubs
// never sees paths like ./serverless.

const NEON_IMPORT_REWRITES: [RegExp, string][] = [
  // LLMs often invent a local ./serverless helper when they really mean the Neon package.
  [/from\s+['"]\.\.?\/serverless['"]/g, "from '@neondatabase/serverless'"],
  // Some generations shorten the Neon client import to ./neon, which breaks in the flat output.
  [/from\s+['"]\.\.?\/neon['"]/g, "from '@neondatabase/serverless'"],
  // A generic ./db alias is another hallucinated shortcut for the Neon serverless client.
  [/from\s+['"]\.\.?\/db['"]/g, "from '@neondatabase/serverless'"],
  // Neon auth imports sometimes get flattened into a fake local module instead of the real package path.
  [/from\s+['"]\.\.?\/neon-auth['"]/g, "from '@neondatabase/neon-js/auth'"],
  // Some models guess a relative ./neon-js path even though the package is published under @neondatabase/neon-js.
  [/from\s+['"]\.\.?\/neon-js['"]/g, "from '@neondatabase/neon-js'"],
];

export function rewriteNeonImports<T extends { content: string }>(files: T[]): T[] {
  return files.map((file) => {
    let content = file.content;
    for (const [pattern, replacement] of NEON_IMPORT_REWRITES) {
      content = content.replace(pattern, replacement);
    }
    return { ...file, content };
  });
}

// ── Fixer type ────────────────────────────────────────────────────────────────

interface Fixer {
  /** Short camelCase name used in log lines, e.g. "supabaseImport" */
  name: string;
  /** Pure sync transform — receives full file content, returns transformed content */
  fix: (content: string) => string;
}

function runFixer(fixer: Fixer, content: string, filename: string): string {
  const out = fixer.fix(content);
  if (out !== content) {
    console.log(`[sanitise] ${fixer.name} fixed in ${filename}`);
  }
  return out;
}

function kebabToPascal(name: string): string {
  return name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build valid icon set from the installed package — always accurate for the
// currently installed lucide-react version.
function toLucideExportName(iconKey: string): string {
  return iconKey
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

const dynamicIconImportsMap: Record<string, unknown> = (
  typeof dynamicIconImports === "object"
  && dynamicIconImports !== null
  && "default" in dynamicIconImports
  && typeof (dynamicIconImports as { default?: unknown }).default === "object"
)
  ? (dynamicIconImports as { default: Record<string, unknown> }).default
  : (dynamicIconImports as Record<string, unknown>);

export const VALID_LUCIDE_ICONS = new Set(
  Object.keys(dynamicIconImportsMap).map(toLucideExportName),
);

// Safe fallback for unknown icons.
export const LUCIDE_FALLBACK = "Circle";

const DISALLOWED_LUCIDE_ICONS = new Set([
  "LayoutKanban",
  "KanbanSquare",
  "LayoutDashboard",
  "CheckSquare",
  "BadgeCheck",
  "StickyNote",
  "ClipboardList",
  "ListChecks",
  "PackageSearch",
  "ReceiptText",
  "FileClock",
]);

// ── Fixer 1: supabaseImport ──────────────────────────────────────────────────
// AI hallucinates './supabase-js' or 'supabase-js' instead of the correct
// '@supabase/supabase-js' package name.
// Must run BEFORE flatImports so the corrected path isn't re-flattened.

const supabaseImport: Fixer = {
  name: "supabaseImport",
  fix: (content) =>
    content.replace(
      /(from\s+|require\(\s*)(['"])(?:\.\.?\/)?supabase-js\2(\s*\))?/g,
      (_match, prefix: string, quote: string, suffix = "") =>
        `${prefix}${quote}@supabase/supabase-js${quote}${suffix}`,
    ),
};

const SUPABASE_REST_FETCH_TARGET =
  "(?:`[\\s\\S]*?/rest/v1/[\\s\\S]*?`|[^,\\n)]+?\\s*\\+\\s*['\"][^'\"]*/rest/v1/[^'\"]*['\"]|['\"][^'\"]*/rest/v1/[^'\"]*['\"])";
const SUPABASE_REST_FETCH_ASSIGNMENT_PATTERN = new RegExp(
  `^([ \\t]*)(const|let|var)\\s+([^=\\n]+?)=\\s*(await\\s*)?fetch\\(\\s*${SUPABASE_REST_FETCH_TARGET}\\s*(?:,\\s*\\{[\\s\\S]*?\\})?\\s*\\)\\s*;?`,
  "gm",
);
const SUPABASE_REST_FETCH_STATEMENT_PATTERN = new RegExp(
  `^([ \\t]*)(await\\s*)?fetch\\(\\s*${SUPABASE_REST_FETCH_TARGET}\\s*(?:,\\s*\\{[\\s\\S]*?\\})?\\s*\\)\\s*;?`,
  "gm",
);

// ── Fixer 2: supabaseRestFetch ───────────────────────────────────────────────
// Generated apps must use the Supabase client, not handwritten REST URLs.
// Replace broken fetch statements with a safe placeholder and TODO comment.

const supabaseRestFetch: Fixer = {
  name: "supabaseRestFetch",
  fix: (content) =>
    content
      .replace(
        SUPABASE_REST_FETCH_ASSIGNMENT_PATTERN,
        (_match, indent: string, keyword: string, identifier: string) =>
          `${indent}${keyword} ${identifier.trim()} = undefined; // TODO: use supabase client: supabase.from('table').select('*')`,
      )
      .replace(
        SUPABASE_REST_FETCH_STATEMENT_PATTERN,
        (_match, indent: string) =>
          `${indent}// TODO: use supabase client: supabase.from('table').select('*')`,
      ),
};

// ── Fixer 3: reactGlobals ─────────────────────────────────────────────────────
// Prebuilt templates use `const { useState, useEffect } = React;` (CJS/UMD
// style) designed for the inline srcDoc preview where React is window.React.
// Vite inside WebContainer uses strict ESM — patch to a proper import.

const reactGlobals: Fixer = {
  name: "reactGlobals",
  fix: (content) => {
    const names = new Set<string>();
    const cleaned = content.replace(
      /^const\s*\{([^}]+)\}\s*=\s*React\s*;?\r?\n?/gm,
      (_m, ids: string) => {
        ids
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((n) => names.add(n));
        return "";
      },
    );
    if (names.size === 0) return content;
    return `import { ${Array.from(names).join(", ")} } from "react";\n${cleaned}`;
  },
};

// ── Fixer 4: flatImports ──────────────────────────────────────────────────────
// After remapPrebuiltPath() all generated files live in the same flat directory.
// Deep import paths like './components/X' break at Vite because the file is
// already at './X'. Rewrite any import with directory components to flat form.

const flatImports: Fixer = {
  name: "flatImports",
  fix: (content) =>
    content
      // Relative paths with directory components: './components/X' → './X'
      .replace(
        /(['"])(\.\.?\/(?:[^/'"]*\/)+[^/'"]+)(['"])/g,
        (_m, open, path: string, close) =>
          `${open}./${path.replace(/^.*\//, "")}${close}`,
      )
      // Alias paths: '@/components/X' or '~/components/X' → './X'
      .replace(
        /(['"])[@~]\/(?:[^/'"]*\/)*([^/'"]+)(['"])/g,
        (_m, open, base: string, close) => `${open}./${base}${close}`,
      )
      // Bare directory paths without ./ prefix: 'src/components/X' → './X'
      // Do not rewrite the scoped Supabase package import we already corrected.
      .replace(
        /(?<=from\s+)(['"])(?!\.\.?\/)(?!@supabase\/)([^/'"]+\/(?:[^/'"]*\/)*[^/'"]+)(['"])/g,
        (_m, open, path: string, close) =>
          `${open}./${path.replace(/^.*\//, "")}${close}`,
      ),
};

// ── Fixer 5: jsxQuotes ───────────────────────────────────────────────────────
// AI sometimes generates backslash-escaped quotes inside double-quoted JSX
// attribute values: placeholder="e.g. MacBook Pro 14\" (HW001)"
// This is invalid JSX — Vite/oxc chokes on it. Replace \" with &quot;.

function stripInvalidJsxAttributeEscapes(content: string): string {
  let out = "";
  let inTag = false;
  let quote: '"' | "'" | "`" | null = null;
  let braceDepth = 0;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1] ?? "";

    if (!inTag) {
      out += char;
      if (char === "<" && /[A-Za-z/]/.test(next)) {
        inTag = true;
      }
      continue;
    }

    if (quote !== null) {
      out += char;
      if (char === "\\") {
        const escaped = content[i + 1];
        if (escaped !== undefined) {
          out += escaped;
          i += 1;
        }
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      out += char;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      out += char;
      continue;
    }

    if (char === "}" && braceDepth > 0) {
      braceDepth -= 1;
      out += char;
      continue;
    }

    if (char === ">" && braceDepth === 0) {
      inTag = false;
      out += char;
      continue;
    }

    if (braceDepth === 0 && char === "\\" && /[a-z]/.test(next)) {
      const sequence = content.slice(i, i + 2);
      out += sequence === "\\r" ? "" : " ";
      i += 1;
      continue;
    }

    out += char;
  }

  return out;
}

function sanitiseJsxAttributes(content: string): string {
  const withEscapedQuotesFixed = content.replace(
    /(<\w[^>]*?\s\w[\w-]*=)"((?:[^"\\]|\\.)*)"/g,
    (_m, prefix: string, value: string) => {
      if (!value.includes('\\"')) return _m;
      return `${prefix}"${value.replace(/\\"/g, "&quot;")}"`;
    },
  );

  return stripInvalidJsxAttributeEscapes(withEscapedQuotesFixed);
}

const jsxQuotes: Fixer = {
  name: "jsxQuotes",
  fix: sanitiseJsxAttributes,
};

// ── Fixer 5: tailwindCdnScript ───────────────────────────────────────────────
// Generated apps sometimes include <script src="https://cdn.tailwindcss.com">,
// version-pinned/query-string variants, or a stylesheet <link> to the same
// CDN. Tailwind v4 is already wired in the scaffold via @tailwindcss/vite, so
// these tags are redundant and COEP-blocked inside WebContainer.
//
// Use a cheap substring guard first so the regex never runs on the common case.

const tailwindCdnScript: Fixer = {
  name: "tailwindCdnScript",
  fix: (content) => {
    if (!content.includes("tailwindcss.com")) return content;

    return content
      .replace(
        /<script\b[^>]*\bsrc=['"](?:(?:https?:)?\/\/)cdn\.tailwindcss\.com[^'" >]*['"][^>]*>\s*<\/script>\s*/gi,
        "",
      )
      .replace(
        /<script\b[^>]*\bsrc=['"](?:(?:https?:)?\/\/)cdn\.tailwindcss\.com[^'" >]*['"][^>]*\/>\s*/gi,
        "",
      )
      .replace(
        /<link\b[^>]*\bhref=['"](?:(?:https?:)?\/\/)cdn\.tailwindcss\.com[^'" >]*['"][^>]*\/?>\s*/gi,
        "",
      );
  },
};

// ── Fixer 6: externalUrls ────────────────────────────────────────────────────
// WebContainer enforces COEP require-corp. External resources without CORP
// headers (Google Fonts, CDN scripts, remote images) trigger
// ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep.

const externalUrls: Fixer = {
  name: "externalUrls",
  fix: (content) =>
    content
      // CSS @import url('https://fonts.googleapis.com/…') — entire rule
      .replace(/@import\s+url\(['"]https?:\/\/[^'"]+['"]\)\s*;?\s*/gi, "")
      .replace(/@import\s+['"]https?:\/\/[^'"]+['"]\s*;?\s*/gi, "")
      // url('https://…') inside CSS properties → none (preserves rule syntax)
      .replace(/url\(['"]https?:\/\/[^'"]*['"]\)/gi, "none")
      // JSX <link href="https://…" /> (usually Google Fonts link tags)
      .replace(/<link[^>]+href=['"]https?:\/\/[^'"]*['"][^>]*\/?>/gi, "")
      // <script src="https://…"> … </script> (CDN script loads)
      .replace(
        /<script[^>]+src=['"]https?:\/\/[^'"]*['"][^>]*>[\s\S]*?<\/script>/gi,
        "",
      )
      .replace(/<script[^>]+src=['"]https?:\/\/[^'"]*['"][^>]*\/>/gi, ""),
};

// ── Fixer 7: apostropheStrings ───────────────────────────────────────────────
// Sonnet sometimes writes JSX strings with unescaped word-apostrophes inside
// single-quoted delimiters, e.g.:
//   'Here's what's happening today.'  →  "Here's what's happening today."
//   label='It's fine'                 →  label="It's fine"
//
// These are PARSE_ERRORs because the apostrophe prematurely closes the string.
// Fix: scan for single-quoted strings where the content contains at least one
// [letter]'[letter] pattern (contraction/possessive) and swap the outer quotes
// to double quotes. Word-apostrophes are allowed inside the match by using
// lookahead/lookbehind to distinguish them from the closing delimiter.

const apostropheStrings: Fixer = {
  name: "apostropheStrings",
  fix: (content) =>
    content.replace(
      // Match a single-quoted string where inner apostrophes between letters
      // are consumed into the group (they're contractions, not closing quotes).
      // The closing ' is identified by NOT being followed by a letter.
      /'((?:[^'\\]|(?<=[a-zA-Z])'(?=[a-zA-Z])|\\.)*)'(?=[^a-zA-Z]|$)/g,
      (_m, inner: string) => {
        if (!/[a-zA-Z]'[a-zA-Z]/.test(inner)) return _m; // no word-apostrophe → leave alone
        if (inner.includes('"')) return _m;               // inner " → can't safely swap
        return `"${inner}"`;
      },
    ),
};

// ── Fixer 8: hyphenatedFunctionName ──────────────────────────────────────────
// Sonnet sometimes uses a hyphenated filename as the exported function name,
// e.g. export default function supabase-js() { ... }
// Hyphens are invalid in JS/TS identifiers, so rename the function to
// PascalCase and do a best-effort JSX tag rename within the same file.

const hyphenatedFunctionName: Fixer = {
  name: "hyphenatedFunctionName",
  fix: (content) => {
    const replacements: Array<{ from: string; to: string }> = [];
    let updated = content.replace(
      /export default function ([a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)+)\s*\(/g,
      (_match, originalName: string) => {
        const fixedName = kebabToPascal(originalName);
        replacements.push({ from: originalName, to: fixedName });
        return `export default function ${fixedName}(`;
      },
    );

    for (const { from, to } of replacements) {
      if (from === to) continue;
      const escapedFrom = escapeRegExp(from);
      updated = updated.replace(
        new RegExp(`(<\\/?\\s*)${escapedFrom}(?=[\\s>/])`, "g"),
        `$1${to}`,
      );
    }

    return updated;
  },
};

// ── Fixer 9: invalidLucideIcon ───────────────────────────────────────────────
// Sonnet can import icon names that do not exist in the installed lucide-react
// version, causing runtime module import failures. Replace invalid names with a
// known-good fallback and update JSX usages in the same file.

export function fixInvalidLucideIcons(content: string): string {
  const replacedNames = new Set<string>();
  const importsFixed = content.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g,
    (_match, imports: string) => {
      const names = imports
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      const fixed = names.map((name: string) => {
        const [importedNameRaw, aliasRaw] = name.split(/\s+as\s+/);
        const importedName = importedNameRaw?.trim() ?? "";
        const alias = aliasRaw?.trim();
        const isDisallowed = DISALLOWED_LUCIDE_ICONS.has(importedName);
        if (!isDisallowed && VALID_LUCIDE_ICONS.has(importedName)) return name;

        replacedNames.add(importedName);
        if (isDisallowed) {
          console.warn(
            `[sanitise] replacing disallowed lucide icon: ${importedName} -> ${LUCIDE_FALLBACK}`,
          );
        } else {
          console.warn(
            `[sanitise] replacing invalid lucide icon: ${importedName} -> ${LUCIDE_FALLBACK}`,
          );
        }
        return alias
          ? `${LUCIDE_FALLBACK} as ${alias}`
          : LUCIDE_FALLBACK;
      });
      const unique = [...new Set(fixed)];
      return `import { ${unique.join(", ")} } from 'lucide-react'`;
    },
  );

  if (replacedNames.size === 0) return importsFixed;

  let jsxFixed = importsFixed;
  for (const oldName of replacedNames) {
    if (!oldName || oldName === LUCIDE_FALLBACK) continue;
    const escapedOld = escapeRegExp(oldName);
    jsxFixed = jsxFixed
      .replace(
        new RegExp(`<${escapedOld}(?=[\\s>/])`, "g"),
        `<${LUCIDE_FALLBACK}`,
      )
      .replace(
        new RegExp(`</${escapedOld}(?=\\s*>)`, "g"),
        `</${LUCIDE_FALLBACK}`,
      );
  }

  return jsxFixed;
}

const invalidLucideIcon: Fixer = {
  name: "invalidLucideIcon",
  fix: fixInvalidLucideIcons,
};

// ── Pipeline ──────────────────────────────────────────────────────────────────
// Order matters:
//   supabaseImport    — before flatImports (don't re-flatten the corrected path)
//   supabaseRestFetch — strip broken raw Supabase REST fetches before URL fixers touch them
//   reactGlobals      — before flatImports (avoid flattening react import we just added)
//   flatImports       — flatten all remaining deep relative/alias paths
//   jsxQuotes         — fix backslash-escaped double quotes in JSX attributes
//   tailwindCdnScript — strip Tailwind CDN tags first, including protocol-relative
//                       variants the generic external URL fixer does not catch
//   externalUrls      — strip remaining CDN URLs
//   apostropheStrings — convert single-quoted strings with word apostrophes to double-quoted
//   hyphenatedFunctionName — convert invalid kebab-case function exports to PascalCase
//   invalidLucideIcon — replace non-existent lucide-react imports with a safe fallback

const PIPELINE: readonly Fixer[] = [
  // Force the correct npm package before any later import-path cleanup runs.
  supabaseImport,
  // Strip broken raw REST calls so generated apps fall back to the supported client path.
  supabaseRestFetch,
  // Convert WebContainer-only React globals into real ESM imports before path rewriting.
  reactGlobals,
  // Collapse deep or aliased imports to the flat generated file layout.
  flatImports,
  // Repair invalid escape sequences that make JSX attribute parsing fail.
  jsxQuotes,
  // Remove Tailwind CDN tags that are redundant in the scaffold and blocked by COEP.
  tailwindCdnScript,
  // Remove any remaining external URLs that would break preview isolation.
  externalUrls,
  // Swap unsafe single-quoted contractions into valid double-quoted strings.
  apostropheStrings,
  // Rename invalid kebab-case function exports to legal PascalCase identifiers.
  hyphenatedFunctionName,
  // Replace Lucide icons that do not exist in the installed version with a safe fallback.
  invalidLucideIcon,
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full sanitisation pipeline on a single file's content.
 * Logs [sanitise] <fixerName> fixed in <filename> for each fixer that fires.
 */
export function sanitiseContent(content: string, path: string): string {
  const filename = path.split("/").pop() ?? path;
  return PIPELINE.reduce((c, fixer) => runFixer(fixer, c, filename), content);
}

/**
 * Run the full sanitisation pipeline on an array of files.
 * Returns a new array; input is not mutated.
 */
export function sanitiseFiles<T extends { path: string; content: string }>(
  files: T[],
): T[] {
  return files.map((f) => ({ ...f, content: sanitiseContent(f.content, f.path) }));
}
