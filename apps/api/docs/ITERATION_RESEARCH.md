# BEO-510 Iteration Engine Research

## Goal

Bring Beomz Studio iterations under:

- `< 60s` end to end
- `< 20 credits`
- targeted edits with low regression risk

Current bottleneck before this work:

- every iteration sent the whole app to Sonnet
- prompt caching helped billed input, but Sonnet still had to reason over a very large prefix
- output often over-expanded because the model saw the entire codebase and had no cheap way to inspect only what mattered

## What I researched

### 1. AST-based patching

Candidate tools:

- `recast`
- `jscodeshift`
- `@babel/parser`

Pros:

- very small outputs
- server can enforce structured edits
- preserves untouched code well when the transform is deterministic

Cons:

- great for known refactors, weak for open-ended product requests
- hard to map vague user intent like "make onboarding feel more premium" into a reliable AST transform
- React/Tailwind edits often span JSX, strings, imports, state, handlers, and new files at once

Verdict:

- strong future layer for known edit classes
- not the best first fix for general-purpose Beomz chat iterations

### 2. Semantic retrieval with embeddings

Pros:

- good long-term answer for larger codebases
- easy to scale from 10 files to 100+ files

Cons:

- needs indexing, persistence, invalidation, and background refresh
- extra infra and operational surface
- still needs a fallback when retrieval misses the right file

Verdict:

- worth adding later if Beomz apps grow much larger
- not required for the first big latency win

### 3. Diff-only / unified-diff output

Pros:

- smaller output tokens
- natural match for "surgical edit" workflows

Cons:

- applying arbitrary diffs safely is brittle
- merge failures become a new failure mode
- current Beomz pipeline already expects complete changed files through `deliver_customised_files`

Verdict:

- interesting, but it would add risk to the current sanitizer + merge pipeline

### 4. Two-phase selector model (Haiku -> Sonnet)

Pros:

- cheap first pass
- better than naive file-name matching

Cons:

- adds another network round trip
- still requires a correctness fallback when selector misses

Verdict:

- promising, but not the fastest possible path for v1

### 5. Claude tool use for file access

Pros:

- the model can inspect only what it needs
- works well with a compact manifest + targeted reads
- preserves the existing final output contract
- easy to add search/read tools without changing the downstream sanitizer

Cons:

- requires a multi-turn tool loop
- total usage must sum across turns

Verdict:

- best near-term foundation

## Best architecture for now

Use a hybrid engine:

1. Build a compact manifest of every file.
2. Locally rank the most likely relevant files.
3. Send Sonnet:
   - the manifest for the whole app
   - the top seed files
   - tool access for `search_project_code` and `read_project_file`
4. Keep `deliver_customised_files` as the final tool call.

Why this wins:

- fewer upfront input tokens than "full codebase every time"
- no extra selector-model round trip
- correctness fallback remains strong because Sonnet can ask for more files on demand
- no schema change to the downstream merge/sanitize flow

## Why this beats the alternatives today

### Versus full-context prompting

- much smaller first request
- lower reasoning load
- smaller tendency to rewrite unrelated files

### Versus embeddings-first retrieval

- zero new infra
- no embedding storage or invalidation
- still gets most of the retrieval win for small generated apps

### Versus AST patching first

- supports open-ended product edits, not just deterministic transforms
- no fragile patch-apply stage

## Implementation shipped

File:

- `apps/api/src/routes/builds/generate.ts`

Changes:

- added a compact project manifest builder
- added local seed-file ranking
- added `read_project_file` tool
- added `search_project_code` tool
- changed the Anthropic iteration path to a tool loop
- preserved `deliver_customised_files` as the final output contract
- added iteration metrics logging:
  - baseline input tokens
  - optimized input tokens
  - time to first tool/content block
  - total generation time
  - seed files
  - files read via tools
  - search queries
  - changed files

## Tradeoffs accepted

- local ranking is heuristic, not semantic search
- tool use introduces multiple model turns
- this is optimized for Beomz's current flat generated-file structure

Those are acceptable because:

- the tool loop closes the correctness gap when ranking misses
- the flat-file shape of Beomz apps makes local ranking surprisingly effective
- this path is much simpler to deploy safely than a new retrieval or patch engine

## Recommended next steps

1. Persist file summaries + hashes in the database so manifest generation is even cheaper.
2. Add an optional embeddings layer once projects routinely exceed the current file count.
3. Add AST/codemod handlers for high-frequency edit classes:
   - theme changes
   - form field additions
   - table column additions
   - nav item additions
4. Add automated benchmark fixtures from real user projects so regressions are visible in CI.

## Notes from external docs

- Anthropic tool use supports client-side tools where the application executes the tool and returns `tool_result` blocks in the next user turn.
- Anthropic prompt caching caches `tools`, `system`, and `messages` up to the cached breakpoint, so reducing the first-turn payload still matters even when caching is active.
- Anthropic token counting can estimate message tokens before sending a request, including tools and system prompt content.
- Recast is designed for conservative pretty-printing and preserves untouched formatting best when transforms flow through `recast.parse(...)` and `recast.print(...)`.
- OpenAI `text-embedding-3-small` remains a low-cost option if Beomz adds a real semantic retrieval layer later.

## References

- Anthropic tool use overview: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Anthropic define tools / tool result rules: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
- Anthropic prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Anthropic token counting: https://platform.claude.com/docs/en/api/typescript/messages/count_tokens
- Anthropic text editor tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool
- Recast README: https://github.com/benjamn/recast
- jscodeshift README: https://github.com/facebook/jscodeshift
- OpenAI embeddings guide: https://platform.openai.com/docs/guides/embeddings/embedding-models
- OpenAI `text-embedding-3-small`: https://platform.openai.com/docs/models/text-embedding-3-small
