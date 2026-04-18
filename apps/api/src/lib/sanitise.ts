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

// ── Fixer 1: supabaseImport ──────────────────────────────────────────────────
// AI hallucinates './supabase-js' or 'supabase-js' instead of the correct
// '@supabase/supabase-js' package name.
// Must run BEFORE flatImports so the corrected path isn't re-flattened.

const supabaseImport: Fixer = {
  name: "supabaseImport",
  fix: (content) =>
    content
      .replace(/from\s+(['"])\.\.?\/supabase-js\1/g, 'from "@supabase/supabase-js"')
      .replace(/from\s+(['"])supabase-js\1/g, 'from "@supabase/supabase-js"'),
};

// ── Fixer 2: reactGlobals ─────────────────────────────────────────────────────
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

// ── Fixer 3: flatImports ──────────────────────────────────────────────────────
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
      .replace(
        /(?<=from\s+)(['"])(?!\.\.?\/)([^/'"]+\/(?:[^/'"]*\/)*[^/'"]+)(['"])/g,
        (_m, open, path: string, close) =>
          `${open}./${path.replace(/^.*\//, "")}${close}`,
      ),
};

// ── Fixer 4: jsxQuotes ───────────────────────────────────────────────────────
// AI sometimes generates backslash-escaped quotes inside double-quoted JSX
// attribute values: placeholder="e.g. MacBook Pro 14\" (HW001)"
// This is invalid JSX — Vite/oxc chokes on it. Replace \" with &quot;.

const jsxQuotes: Fixer = {
  name: "jsxQuotes",
  fix: (content) =>
    content.replace(
      /(<\w[^>]*?\s\w[\w-]*=)"((?:[^"\\]|\\.)*)"/g,
      (_m, prefix: string, value: string) => {
        if (!value.includes('\\"')) return _m;
        return `${prefix}"${value.replace(/\\"/g, "&quot;")}"`;
      },
    ),
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

// ── Pipeline ──────────────────────────────────────────────────────────────────
// Order matters:
//   supabaseImport    — before flatImports (don't re-flatten the corrected path)
//   reactGlobals      — before flatImports (avoid flattening react import we just added)
//   flatImports       — flatten all remaining deep relative/alias paths
//   jsxQuotes         — fix backslash-escaped double quotes in JSX attributes
//   tailwindCdnScript — strip Tailwind CDN tags first, including protocol-relative
//                       variants the generic external URL fixer does not catch
//   externalUrls      — strip remaining CDN URLs
//   apostropheStrings — convert single-quoted strings with word apostrophes to double-quoted

const PIPELINE: readonly Fixer[] = [
  supabaseImport,
  reactGlobals,
  flatImports,
  jsxQuotes,
  tailwindCdnScript,
  externalUrls,
  apostropheStrings,
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
