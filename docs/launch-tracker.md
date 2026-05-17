# Beomz Studio V2 — Launch Tracker

Single source of truth for the audit-2026-05 rollout. Every audit ticket gets logged here as it ships.

**Tag:** `pre-audit-fixes` (commit: `d3d35e9`)
**Started:** 2026-05-02
**Owner:** Omar (orchestrator: Claude)
**Linear label:** `audit-2026-05`

---

## Sprint status

- [x] **Sprint 0** — Pre-flight ✅ shipped 2026-05-02 (BEO-757, commit `d3d35e9`)
- [x] **Sprint 1** — Class A surgical fixes ✅ 5/5 shipped 2026-05-02 (tag `sprint-1-complete`)
- [x] **Sprint 2** — Reliability + UX hardening ✅ 6/6 shipped 2026-05-02 (tag `sprint-2-complete`)
- [x] **Sprint 3** — Production reliability + UX polish ✅ 4/4 shipped 2026-05-02 (tag `sprint-3-complete`)
- [x] **Sprint 4** — Engine wiring + pilot rollout ✅ 5/5 shipped 2026-05-03 (tag `sprint-4-complete`)
- [x] **Sprint 4 hotfix** — BEO-777 `tool_choice: any` ✅ shipped 2026-05-03 (commit `23ce909`, deployed to droplet)
- [x] **Sprint 5** — Engine caching + iteration engine spike (REVERTED) ✅ 5/5 shipped 2026-05-03 (BEO-780-784; iteration engine path reverted, tracked in BEO-785)
- [x] **Sprint 6** — Chat panel persistence fixes ✅ 6/6 shipped 2026-05-03 (BEO-786-792)
- [x] **Sprint 7** — Dev inspector + visual polish + iteration scope-preservation ✅ 9/9 shipped 2026-05-03/04 (BEO-793-801)
- [ ] **Sprint 8** — Prompt engineering pass — DEFERRED to post-Sprint-9
- [ ] **Sprint 9** — Chat Panel v2 architectural rebuild 🛠️ PAUSED 2026-05-07 (site in maintenance mode). Design doc at `docs/chat-panel-v2-design.md` (locally untracked — never committed). **Phases 1–4 + visual parity + BEO-820 classifier fix landed** (BEO-803→820). P2.5 wire-up (BEO-818, BEO-819) never fired. Pilot is dark behind maintenance gate.
- [ ] **Sprint 10** — Cleanup of dead paths post-Sprint-9 cutover (`/builds/start` legacy conversational, dual SSE subs, `chatModeActive` toggle)

---

## 🔁 Handover snapshot — 2026-05-17 (Myndlab playground — full session push)

### What shipped today

**`apps/myndlab-web` is live at https://myndlab-dev.beomz.ai** — a separate UI playground forked from `apps/web` to prototype the Myndlab (Permus' Rust-based AI product) frontend before porting to the real Rust app. Droplet HEAD: **`abc9772`** "Myndlab landing: theme system, signed-in nav, mega polish, fixes". HTTP 200. Maintenance bypass code (shared with beomz.ai): `544054`.

**Linear tickets closed in this session:**
- ✅ **BEO-821 (M1)** — Myndlab brand rebrand (orange → Aqua Cyan `#00D5D8`, Beomz → Myndlab everywhere, logo + prism SVG swap)
- ✅ **BEO-822 (M2)** — Hero polish (absolute centered Build placeholder, breathing cyan glow, glass-morphic toolbar with 5 pills + submit ↑, suggestions row at `bottom-[15%]`)
- ✅ **BEO-823 (M3)** — Footer (social icons + "Powered by Permus" wordmark, fixed bottom, no gap)
- ✅ **BEO-824 (MN1)** — Mega-menu marketing nav (Features / Solutions / Pricing / Enterprise / About — full-width drawer, brand-tinted bg, ICONS + ILLUSTRATIONS maps, AI-generated enterprise image)
- ✅ **BEO-825 (MN2)** — Theme system + signed-in nav + nav config + 6 route scaffolds

### Architecture notes for the next session

**Theme system:** `apps/myndlab-web/src/lib/theme.tsx` exposes `theme` (`'dark'|'light'`) + `lang` (`'en'|'ar'`) + setters, reflects state to `document.documentElement` (class="light", `data-theme`, `lang`, `dir="rtl"`) + localStorage. ThemeProvider wraps `<AppGate />` in `main.tsx`.

**Light/dark swap pattern:** CSS variables in `src/index.css` (`--myndlab-surface`, `--myndlab-fg-muted`, `--myndlab-fg-hover`, `--myndlab-glow`, etc.) swap on `html.light`. Dark-hardcoded Tailwind classes (`text-white/X`, `bg-black/X`) are overridden inside `.marketing-surface` scope rather than refactored everywhere. **Don't change this pattern without reading `src/index.css` first.**

**Brand palette (binding — see `reference_myndlab_brand.md`):**
- Aqua Cyan `#00D5D8` primary · Ultra Violet `#7C3AED` secondary · Charcoal `#131313` dark
- Hot Magenta `#FF2FB3` for Enterprise (visible on cream)
- Yellow strictly subtle accent

**Locked visual sources of truth (do not regenerate):**
- `apps/myndlab-web/public/megamenu-samples.html` — mega menu reference
- `apps/myndlab-web/public/drilldown-samples.html` — interaction patterns
- `apps/myndlab-web/src/assets/enterprise-illustration.jpg` — AI-generated Dubai glass prism, 1024×1024

**Local dev:**
- Server: `pnpm --filter @myndlab/web dev` → http://localhost:5189
- Vite proxy: `/api → https://beomz.ai` (bypasses CORS for local sign-in)
- Env: `apps/myndlab-web/.env.local` sets `VITE_API_BASE_URL=/api` — **Vite priority means `.env.local` overrides `.env`, edit both when changing**
- Supabase redirect URL allowlist (project `srflynvdrsdazxvcxmzb`) now includes `http://localhost:5189/**` — needed for Google OAuth back to localhost
- TanStack Router strict typed-route escape hatch: `as "/"` cast (used for `/studio/templates`, `/admin`, `/studio/invite`)

**Background dev server task ID:** `bcs5wb1ou` (Vite dev on :5189). Still running at session end — may need restart in new session.

### What's NOT done — deferred backlog

- **MN3+ content fill** — the 6 marketing routes scaffolded by BEO-825 are stubs. Need real content for `/features`, `/solutions`, `/pricing`, `/enterprise`, `/about`, `/changelog`. No Linear ticket yet — draft when ready.
- **MN8 — Arabic i18n** — `lang` toggle in ThemeContext is wired (sets `dir="rtl"` on html), but no copy is translated. Placeholder only.
- **Real Rust port** — this is a playground. Once UI is locked, port to the live Myndlab Rust frontend (Azure DevOps repo, access expected this week).
- **Beomz Studio Sprint 9 P2.5** — BEO-818 / BEO-819 still drafted, not fired. Site still in maintenance mode. Untouched in this session.

### Bug fixes captured in `abc9772`

- `process is not defined` ReferenceError in Vite dev → switched maintenance bypass to `import.meta.env.VITE_MAINTENANCE_CODE`
- `Invalid URL` on `getCredits()` → `getApiBaseUrl()` now prepends `window.location.origin` when base is relative
- PRO badge hidden on light variant → removed `if (isLight) return null;` in `GlobalNav.tsx::PlanBadge`
- Credit progress bar orange → `bg-[#00D5D8]`
- Google OAuth redirecting to beomz.ai instead of localhost → Supabase redirect allowlist updated (manual, Omar did it)
- Three TS errors on untyped routes → `as "/"` cast

### Immediate next-actions for new Claude session

1. **Read this snapshot + `reference_myndlab_brand.md` + `feedback_beomz_studio_orchestration.md`** before touching myndlab-web.
2. **Check the live URL** with bypass `544054` to confirm HEAD `abc9772` is what Omar sees.
3. **If continuing Myndlab work:** draft MN3 (content fill) tickets per-route. Don't batch — one route per Cursor ticket.
4. **If pivoting back to Beomz Studio:** prior 2026-05-16 snapshot is still accurate. BEO-820 / BEO-806 still need Linear → Done, BEO-818 / BEO-819 still drafted.
5. **Rule 16 still binding** — update Linear + this tracker + memory after every meaningful action.

---

## 🔁 Handover snapshot — 2026-05-16 (returning from 12-day IronCastle detour)

### Where we are

**Site is in maintenance mode — deliberately, to gate wandering free users.** Droplet HEAD `e7c073f` "BEO-maintenance: hardcode maintenance true for testing" (commit chain: `0540877` add page + bypass → `f760b1b` theme fix → `1a68e82` Vite gate fix → `e7c073f` hardcode true). Deployed ~2026-05-07. pm2 workers up 9 days. **No Linear ticket created** for this work — `BEO-maintenance` prefix only. Status: staying down indefinitely as a paywall overlay.

**Maintenance bypass code:** `544054` (updated 2026-05-16 from prior `240625`). Lives as hardcoded fallback in `apps/web/src/app/maintenance/page.tsx:13` because the `process.env.NEXT_PUBLIC_*` lookup never resolves in Vite at runtime. Override via env not yet wired.

**Sprint 9 P2.5 status — paused, not abandoned:**
- ✅ BEO-820 classifier fix (`0ea6309`) landed in main 2026-05-04. **Linear ticket still shows In Progress — needs to be moved to Done.**
- ⏸️ BEO-806 phased-build gate (`a59959c`) landed and deployed 2026-05-04. **Linear ticket still shows In Progress — needs to be moved to Done.**
- 📋 BEO-818 (iteration wire-up) — still Drafted, never fired.
- 📋 BEO-819 (initial_build wire-up) — still Drafted, never fired.
- ChatPanelV2 pilot for ofareda is functional for `kind: question` in code, but unreachable while maintenance mode is on (Omar can bypass with `544054`).

**Local repo drift (`~/Desktop/beomz-studio`):**
- `CLAUDE.md`, `CODEX.md`, `CURSOR.md`, `.claude/commands/status.md`, `docs/chat-panel-v2-design.md` exist locally but are **untracked** — they never made it into main. Decide whether to commit or leave as local-only orchestrator scaffolding.
- `.claude/launch.json` still modified (parked).

### Immediate next-actions (ordered)

**Step 1 — Reconcile Linear with main.** Move BEO-820 and BEO-806 to Done (with their landed commit SHAs in a verification comment). Cleans the stale In Progress board.
**Step 2 — Resume P2.5 behind the maintenance gate.** Omar uses bypass `544054` to access; pilot work continues for ofareda only. Fire BEO-818 → verify → deploy → fire BEO-819 → verify → deploy → live E2E (question / iteration / initial_build) for ofareda inside the gated site.
**Step 3 — Decide on untracked orchestrator docs.** Either commit CLAUDE.md + chat-panel-v2-design.md + the status slash command to main (so they survive across machines), or formalise them as personal scaffolding.
**Step 4 — Optional: wire the maintenance code to an env var** so rotating it doesn't require a rebuild. Use `import.meta.env.VITE_MAINTENANCE_CODE` instead of `process.env.NEXT_PUBLIC_*` so Vite actually substitutes it.

---

## 🔁 Handover snapshot — 2026-05-04 (Sprint 9 P2.5 in flight)

### Where we are

**Sprint 9 Phases 1–4 complete + visual parity done (BEO-803→816).** ChatPanelV2 is live for ofareda with v1-identical styling (orange bubble, cream bg, UserAvatar, v1 composer). BEO-817 hotfix deployed (double `/api/api/` URL prefix causing 404s — fixed). Pilot is functional for `kind: question` — Haiku streams live.

**P2.5 in flight** — three tickets to make iteration + initial_build actually fire builds:
- 🛠️ **BEO-820 IN PROGRESS** (Codex 5.3, Class A) — `classifyTurn.ts` one-line fix: add greetings/conversational/ambiguous to the `question` rule so "hi" doesn't misfire as `iteration`. Awaiting Codex return.
- 📋 **BEO-818 DRAFTED, NOT FIRED** (Codex 5.4, Class C) — wire `iteration`/`redesign` in `v2Message.ts`: export `callModelIterate`+`mergeFiles` from `generate.ts`, create generation record, call model, persist files, emit `build_complete`.
- 📋 **BEO-819 DRAFTED, NOT FIRED** (Codex 5.4, Class C) — wire `initial_build` in `v2Message.ts`: use `runBuildInBackground`, read generation from DB, emit `build_complete`. Requires BEO-818 merged first.

### Critical architecture context (Sprint 9 motivation)

Apps studio iterations route through `/builds/start` (initial-build endpoint), NOT `/websites/iterate`. BEO-799 + BEO-801 flags are partially inert — they only fire on `/websites/iterate` / `callModelIterate` respectively, which the apps studio never hits. Sprint 9 v2 endpoint (`/builds/v2/message`) unifies everything: single classifier, single SSE stream, correct routing for question / iteration / initial_build.

### Sprint 9 — Chat Panel v2 rebuild — current state

**Design doc:** `docs/chat-panel-v2-design.md`.

- **Phases 1–4:** BEO-803 → BEO-816 complete (contract types, InlineConfirmation, dev preview, endpoint scaffold, classifier, kind-routing, reducer, shell component, message components, state inspector, pilot flag, ProjectPage wiring, visual parity). Committed + deployed. Pilot live.
- **P2.5 (current):** BEO-820 / BEO-818 / BEO-819 — wire real builds into v2 endpoint.
- **Phase 5 / Sprint 10 (future):** delete dead paths — `/builds/start` conversational layer, dual SSE sub, `chatModeActive` toggle. Only after 1-week pilot validates.

### Key files for P2.5 work

- **`apps/api/src/routes/builds/v2Message.ts`** — stubs at lines 113–123. `iteration`/`redesign` branch: TODO P2.5. `initial_build` branch: TODO P2.5.
- **`apps/api/src/routes/builds/generate.ts`** (4037 lines):
  - `callModelIterate` at line 2776 — NOT currently exported. 15 params, returns `Promise<CustomiseResult>` with `{files[], summary, outputTokens, ...}`.
  - `mergeFiles` at line 561 — NOT currently exported. `(base: StudioFile[], overrides: Array<{path, content}>) → StudioFile[]`.
  - `runBuildInBackground` at line 3280 — EXPORTED. `(input: BuildGenerateInput, db: StudioDbClient) → Promise<void>`.
  - `BuildGenerateInput` at line 120 — requires `buildId, projectId, orgId, userId, userEmail, prompt, sourcePrompt, templateId, model, requestedAt, operationId, isIteration, existingFiles`.
- **`apps/api/src/lib/classifyTurn.ts`** (133 lines) — BEO-820 target. `CLASSIFY_TURN_SYSTEM_PROMPT` at lines 9–20. `question` rule line 14 needs greetings added.
- **`packages/studio-db/src/index.ts`** — `createGeneration(GenerationInsert)` at line 1051. `GenerationInsert` at line 388 requires `project_id, template_id, operation_id, status, prompt`.

### Production environment

- **API**: DigitalOcean droplet `beomz-web-api-sfo3` (`143.198.154.126`). SSH: `ssh -i ~/.ssh/beomz_do root@143.198.154.126`. pm2 cluster (workers 10+11, port 3001). Repo: `/root/beomz-studio`. Build: `pnpm --filter @beomz-studio/engine build && pnpm --filter @beomz-studio/api build && pm2 restart beomz-api --update-env`. **Rule 15 in-flight check before restart.**
- **Frontend**: pm2 `beomz-web` (port 3002). nginx proxies: `/api/*` → 3001, else → 3002. Rebuild: `pnpm --filter @beomz-studio/web build && pm2 restart beomz-web --update-env`.
- **Droplet HEAD**: API `954d8e4` (BEO-815, workers 10+11). Web `8981682` (BEO-817 hotfix).
- **Next API deploy**: after BEO-820 verifies → pull + api build + pm2 restart beomz-api (no web rebuild needed).

### Active flags on droplet (`/root/beomz-studio/apps/api/.env`)

- `USE_CHAT_PANEL_V2=true` — gates v2 message endpoint
- `CHAT_PANEL_V2_PILOT_ORG_IDS=3e11937b-a2a1-4195-b9d2-e3755cb443bc` — ofareda pilot
- `ENABLE_ITERATION_INTENT_CLASSIFIER=true` + `ITERATION_INTENT_PILOT_ORG_IDS=3e11937b-...` (partially inert until v2 cutover)
- `ITERATION_STRICT_SCOPE=true` + `ITERATION_STRICT_SCOPE_PILOT_ORG_IDS=3e11937b-...` (partially inert)
- `ENGINE_PILOT_ORG_IDS=3e11937b-…,f7f5ffc7-…` (ofareda + beomz.com)

### Working agreement (17 rules — full list in memory)

`~/.claude/projects/-Users-omarfareda-Desktop/memory/feedback_beomz_studio_orchestration.md`. Highlights:
- Codex = backend, Cursor = frontend (no crossing).
- 1 prompt per agent at a time, max 2 concurrent if non-conflicting.
- Codex 5.3 / Low-Med default; 5.4 / Med-High for stateful reasoning.
- Outer ``` blocks, inner code uses TILDE `~~~` (clipboard breaks otherwise).
- Standing deploy auth: verified backend → ship to droplet. EXCEPT Rule 15 — never pm2 restart while build in-flight.
- **Rule 16**: update Linear / launch tracker / memory after every meaningful action.
- **Rule 17**: every Cursor UI ticket includes a dev-preview sample.

### Mandatory reads at next session start

1. **`docs/launch-tracker.md`** (this file) — SSOT.
2. **`docs/chat-panel-v2-design.md`** — active rebuild spec.
3. **`CLAUDE.md`** at repo root — orchestrator role + ticket cycle + rules.
4. Memory files (auto-loaded):
   - `~/.claude/projects/-Users-omarfareda-Desktop/memory/project_beomz_studio.md`
   - `~/.claude/projects/-Users-omarfareda-Desktop/memory/feedback_beomz_studio_orchestration.md`
   - `~/.claude/projects/-Users-omarfareda-Desktop/memory/reference_beomz_studio_infra.md`
   - `~/.claude/projects/-Users-omarfareda-Desktop/memory/beomz_studio_sprint_9_pointer.md`
   - `~/.claude/projects/-Users-omarfareda-Desktop/memory/user_omar.md`

### Immediate next-actions (ordered)

**Step 1 — BEO-820 (Codex, IN PROGRESS):** Await Codex return. Verify diff in `classifyTurn.ts` — only the `question` rule bullet should change, nothing else. Build + lint. Deploy: `pull + api build + pm2 restart beomz-api`. Close in Linear. Test: send "hi" via v2 panel → should get a Haiku text reply, not "On it — applying your changes."

**Step 2 — BEO-818 (Codex 5.4, Class C, drafted):** Fire when BEO-820 closed. Wire `iteration`/`redesign` in `v2Message.ts`. Export `callModelIterate`+`mergeFiles` from `generate.ts`. Create generation record. Call model. Persist files. Emit `build_complete`. Verify + deploy.

**Step 3 — BEO-819 (Codex 5.4, Class C, drafted):** Fire when BEO-818 closed. Wire `initial_build` in `v2Message.ts` using `runBuildInBackground`. Verify + deploy.

**Step 4 — Live E2E test:** Send question ("what does this app do?") → Haiku text. Send iteration ("make the button blue") → real build fires, files update, `build_complete` event arrives, BuildSummary shows file count. If green, park pilot for 1 week.

**Step 5 (Sprint 10, future):** Delete `/builds/start` conversational layer, dual SSE sub, `chatModeActive` toggle. Only after pilot validates.

### Codex fire prompts for BEO-818 and BEO-819 (ready to paste)

**BEO-818 fire prompt:**
```
**Codex 5.4 / Med-High — Class C: v2Message wire iteration/redesign with callModelIterate + file persistence (BEO-818)**

Repo: `/root/beomz-studio` (pnpm monorepo). Build: `pnpm --filter @beomz-studio/api build`.

**Goal:** Replace the iteration/redesign stub in `apps/api/src/routes/builds/v2Message.ts` with a real implementation that calls the AI model and persists changed files.

**Files to change:**
1. `apps/api/src/routes/builds/generate.ts` — export `callModelIterate` (currently line 2776, NOT exported) and `mergeFiles` (currently line 561, NOT exported). Add `export` keyword to both function declarations. No other changes to this file.
2. `apps/api/src/routes/builds/v2Message.ts` — replace the `iteration`/`redesign` stub branch (currently lines 113–118: `emit thinking/building` + placeholder text_delta + TODO comment) with real wiring.

**`v2Message.ts` iteration branch replacement:**
~~~typescript
} else if (result.kind === "iteration" || result.kind === "redesign") {
  emit(res, { type: "state", phase: "thinking" });
  emit(res, { type: "state", phase: "building" });

  const iterationId = crypto.randomUUID();
  const operationId = crypto.randomUUID();
  const now = new Date().toISOString();

  const generationRow = await orgContext.db.createGeneration({
    project_id: projectRow.id,
    template_id: projectRow.template_id ?? "unknown",
    operation_id: operationId,
    status: "pending",
    prompt,
  });

  let iterResult: Awaited<ReturnType<typeof callModelIterate>>;
  try {
    iterResult = await callModelIterate(
      prompt,
      "claude-sonnet-4-6",
      projectRow.id,
      orgContext.org.id,
      existingFiles,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
    );
  } catch (iterErr) {
    await orgContext.db.updateGeneration(generationRow.id, { status: "failed" });
    throw iterErr;
  }

  const merged = mergeFiles(existingFiles, iterResult.files.map(f => ({ path: f.path, content: f.content })));
  await orgContext.db.updateGeneration(generationRow.id, {
    status: "complete",
    files: merged,
  });

  const buildMessageId = crypto.randomUUID();
  emit(res, {
    type: "build_complete",
    messageId: buildMessageId,
    filesChanged: iterResult.files.map(f => f.path),
    durationMs: Date.now() - Date.parse(now),
    creditsUsed: iterResult.outputTokens,
    costUsd: 0,
    nextSteps: [],
  });
}
~~~

**Imports to add at top of `v2Message.ts`** (alongside existing `filterBlockedGeneratedFiles` import):
~~~typescript
import { callModelIterate, filterBlockedGeneratedFiles, mergeFiles } from "./generate.js";
~~~
Remove `filterBlockedGeneratedFiles` from the existing import line since it'll now be combined.

**Acceptance criteria:**
- `pnpm --filter @beomz-studio/api build` succeeds with 0 errors.
- `callModelIterate` and `mergeFiles` have `export` keyword in `generate.ts`.
- Iteration branch in `v2Message.ts` creates a generation record, calls `callModelIterate`, persists merged files, emits `build_complete` event.
- No other files changed.

**Rollback:** revert export additions from `generate.ts` and restore original stub in `v2Message.ts`.
```

**BEO-819 fire prompt:**
```
**Codex 5.4 / Med-High — Class C: v2Message wire initial_build with runBuildInBackground (BEO-819)**

Repo: `/root/beomz-studio` (pnpm monorepo). Build: `pnpm --filter @beomz-studio/api build`.

**Goal:** Replace the `initial_build` stub in `apps/api/src/routes/builds/v2Message.ts` with a real implementation using `runBuildInBackground`.

**Context:** `runBuildInBackground` is already exported from `apps/api/src/routes/builds/generate.ts` (line 3280). `BuildGenerateInput` interface at line 120 requires: `buildId, projectId, orgId, userId, userEmail, prompt, sourcePrompt, templateId, model, requestedAt, operationId, isIteration, existingFiles`. `OrgContext` in `c.get("orgContext")` has `.jwt.sub` (userId) and `.jwt.email` (userEmail).

**File to change:** `apps/api/src/routes/builds/v2Message.ts` — replace the `initial_build` stub (the `else` branch after the iteration branch — currently just `emit thinking/planning` + TODO comment) with real wiring.

**`v2Message.ts` initial_build branch replacement:**
~~~typescript
} else {
  // initial_build
  emit(res, { type: "state", phase: "thinking" });
  emit(res, { type: "state", phase: "planning" });

  const buildId = crypto.randomUUID();
  const operationId = crypto.randomUUID();
  const now = new Date();

  const generationRow = await orgContext.db.createGeneration({
    project_id: projectRow.id,
    template_id: projectRow.template_id ?? "unknown",
    operation_id: operationId,
    status: "pending",
    prompt,
  });

  await runBuildInBackground(
    {
      buildId,
      projectId: projectRow.id,
      orgId: orgContext.org.id,
      userId: orgContext.jwt.sub,
      userEmail: orgContext.jwt.email ?? "",
      prompt,
      sourcePrompt: prompt,
      templateId: projectRow.template_id ?? "unknown",
      model: "claude-sonnet-4-6",
      requestedAt: now,
      operationId,
      isIteration: false,
      existingFiles: [],
    },
    orgContext.db,
  );

  const latestGen = await orgContext.db.findGenerationById(generationRow.id);
  const builtFiles = latestGen?.files ?? [];

  const buildMessageId = crypto.randomUUID();
  emit(res, {
    type: "build_complete",
    messageId: buildMessageId,
    filesChanged: builtFiles.map((f: { path: string }) => f.path),
    durationMs: Date.now() - now.getTime(),
    creditsUsed: 0,
    costUsd: 0,
    nextSteps: [],
  });
}
~~~

**Import to add** at top of `v2Message.ts` (alongside existing imports from `./generate.js`):
~~~typescript
import { callModelIterate, filterBlockedGeneratedFiles, mergeFiles, runBuildInBackground } from "./generate.js";
~~~

**Acceptance criteria:**
- `pnpm --filter @beomz-studio/api build` succeeds with 0 errors.
- `initial_build` branch creates a generation record, calls `runBuildInBackground`, reads result from DB, emits `build_complete`.
- No other files changed.

**Rollback:** restore original `initial_build` stub in `v2Message.ts`.
```

### Open / parked items

- **BEO-797 typography follow-up**: `font-medium` dropped from captions — eyeball on next visual test.
- **WebContainer preview mount error**: parked, may be transient.
- **`.claude/launch.json`** modified in droplet working tree: parked cleanup.
- **Ancient picsum.photos COEP fix**: parked since Sprint 4, not blocking.
- **BEO-12 Stripe live keys**: Omar's responsibility.
- **BEO-271 May-1 handover**: historical, archive when convenient.
- **BEO-785 engine iteration path**: parked (engine path + iteration path-prefix mismatch investigation deferred).

---

## Feature flags

All defined in `apps/api/src/config.ts`. Read via `apiConfig.FLAG === "true"`.

| Flag | Default | Purpose |
|---|---|---|
| `USE_GENERATION_ENGINE` | `false` | Route builds through `packages/engine` instead of legacy `generate.ts`. Sprint 4. |
| `ENABLE_ANTHROPIC_RETRY` | `true` | Exponential backoff on transient Anthropic errors. Sprint 2. |
| `STRICT_AI_ERROR_HANDLING` | `false` | Fail loudly on AI errors instead of silent scaffold fallback. Sprint 2. |
| `ENABLE_TODO_SCAFFOLD_FALLBACK` | `true` | Hardcoded todo App.tsx fallback. Sprint 2 will flip to `false`. |
| `BATCH_STREAMING_DELTAS` | `false` | Batch chat-stream deltas at 50ms instead of per-character setMessages. Sprint 3. |
| `IMPLEMENTBAR_QUIET_PERIOD_MS` | `0` | Wait N ms after last delta before showing ImplementBar. `0` = current behavior. |
| `USE_TRANSACTIONAL_MIGRATIONS` | `false` | Wrap iteration migrations in BEGIN/COMMIT. Sprint 3. |
| `STALE_BUILD_WATCHDOG_MODE` | `off` | `off` \| `dry-run` (log only) \| `on` (mark stale builds failed). Sprint 3. |

---

## Tickets log

| Linear | Title | Class | Sprint | Agent | Status | Verified |
|---|---|---|---|---|---|---|
| [BEO-757](https://linear.app/beomz/issue/BEO-757/) | PF-001 Pre-flight: feature flags + tracker + tag | infra | 0 | Claude | Done | `d3d35e9` build clean ✅ |
| [BEO-758](https://linear.app/beomz/issue/BEO-758/) | S1-1 Engine: throw on empty assistant turn | A | 1 | Codex 5.4 / Med | Done | `5ad8579` engine+api build clean ✅ |
| [BEO-756](https://linear.app/beomz/issue/BEO-756/) | S1-2 TypewriterText: render in &lt;p&gt; whitespace-pre-wrap | A | 1 | Cursor Sonnet 4.6 | Done | `a581bfb` web build clean ✅ (visual proof skipped, rolled forward) |
| [BEO-759](https://linear.app/beomz/issue/BEO-759/) | S1-3 ChatPanel: surface image upload errors | A | 1 | Cursor Sonnet 4.6 | Done | `43c6174` web build clean + visual confirmed ✅ |
| [BEO-760](https://linear.app/beomz/issue/BEO-760/) | S1-4 useBuildChat: SSE buffer cap + parse-error log | A | 1 | Cursor Sonnet 4.6 | Done | `15e41a3` web build clean ✅ (visual skip acknowledged, headless) |
| [BEO-761](https://linear.app/beomz/issue/BEO-761/) | S1-5 ChatPanel: Stop button "Stopping…" state | A | 1 | Cursor Sonnet 4.6 | Done | `45ff4aa` web build clean ✅ (visual skip acknowledged, headless) |
| [BEO-762](https://linear.app/beomz/issue/BEO-762/) | S2-1 iterationPipeline: record skipped/failed migrations in telemetry | B | 2 | Codex 5.3 / Low | Done | `e1783a6` api build clean ✅ |
| [BEO-763](https://linear.app/beomz/issue/BEO-763/) | S2-2 TypewriterText: dynamic speed caps animation at ~1.5s | A | 2 | Cursor Sonnet 4.6 | Done | `d71b395` web build clean + visual confirmed ✅ (12s → 1.8s) |
| [BEO-764](https://linear.app/beomz/issue/BEO-764/) | S2-3 engine: exponential-backoff retry on transient Anthropic errors | B | 2 | Codex 5.4 / Med | Done | `168f086` engine+api build clean ✅ (live when engine wired in S4) |
| [BEO-765](https://linear.app/beomz/issue/BEO-765/) | S2-4 useBuildChat: hoist phrase detection out of setMessages reducer | A | 2 | Cursor Sonnet 4.6 | Done | `b19dca0` web build clean ✅ (parallel with 764) |
| [BEO-766](https://linear.app/beomz/issue/BEO-766/) | S2-5 buildPipeline: STRICT_AI_ERROR_HANDLING flag-gated strict path | B | 2 | Codex 5.4 / Med | Done | `0a3c810` api build clean ✅ (flag default off, flip env to enable) |
| [BEO-767](https://linear.app/beomz/issue/BEO-767/) | S2-6 ChatPanel: debounce scroll handler + raise threshold to 200px | A | 2 | Cursor Sonnet 4.6 | Done | `e6ae446` web build clean ✅ (parallel with 766) |
| [BEO-768](https://linear.app/beomz/issue/BEO-768/) | S3-1 buildPipeline: gate todo App.tsx fallback behind kill switch | B | 3 | Codex 5.4 / Med | Done | `23a829a` api build clean ✅ (default on, flip env to enable fix) |
| [BEO-769](https://linear.app/beomz/issue/BEO-769/) | S3-2 useBuildChat: 500ms quiet-period gate before ImplementBar mid-stream | A | 3 | Cursor Sonnet 4.6 | Done | `a0ad836` web build clean ✅ (parallel with 768) |
| [BEO-771](https://linear.app/beomz/issue/BEO-771/) | S3-4 ChatMessage: render fallback for unknown message types | A | 3 | Cursor Sonnet 4.6 | Done | `4c40328` web build clean ✅ |
| [BEO-770](https://linear.app/beomz/issue/BEO-770/) | S3-3 Stale-build watchdog: sweep abandoned generations at API startup | C | 3 | Codex 5.4 / High | Done | `aaec468` studio-db+api builds clean ✅ (default off; +drive-by fix on getOrgWithBalance SELECT) |
| [BEO-772](https://linear.app/beomz/issue/BEO-772/) | S4-1 Engine adapter foundation — runEngineAdapter.ts (callEngineCustomise) | D | 4 | Claude direct | Done | `b76610e` all 4 builds clean ✅ (dead code; S4-2 wires flag) |
| [BEO-773](https://linear.app/beomz/issue/BEO-773/) | S4-2 buildPipeline: flag-gated engine routing (USE_GENERATION_ENGINE) | D | 4 | Codex 5.4 / Med | Done | `0cb295c` api build clean ✅ (default off; engine wired but dormant) |
| [BEO-774](https://linear.app/beomz/issue/BEO-774/) | S4-3 Engine systemPrompt: split dynamic into stable-per-build (cached) + per-turn | D | 4 | Codex 5.4 / High | Done | `9286516` engine+api builds clean ✅ (5-turn build cost: 150k→60k tokens) |
| [BEO-775](https://linear.app/beomz/issue/BEO-775/) | S4-4 buildPipeline: structured telemetry log with path tag (engine \| legacy) | A | 4 | Codex 5.3 / Low | Done | `adb129a` api build clean ✅ (Vercel-grep-able pilot comparison) |
| [BEO-776](https://linear.app/beomz/issue/BEO-776/) | S4-5 Pilot rollout: ENGINE_PILOT_ORG_IDS allowlist | B | 4 | Codex 5.4 / Med | Done | `42b19a9` api build clean ✅ (per-org opt-in for safe pilot) |
| [BEO-777](https://linear.app/beomz/issue/BEO-777/) | S4-hotfix Engine: tool_choice=any to stop "ended without finish" crash | A | 4 | Codex 5.4 / Med | Done | `23ce909` engine+api build clean ✅, deployed to droplet, retry showed throw still fires (tool_choice insufficient) |
| [BEO-778](https://linear.app/beomz/issue/BEO-778/) | S4-hotfix2 Engine: diagnostic log when turn ends without finish | A | 4 | Codex 5.3 / Low | Done | `f2a3b5e` engine+api+web build clean ✅ deployed; revealed real cause = `stopReason: max_tokens` at 4096 |
| [BEO-779](https://linear.app/beomz/issue/BEO-779/) | S4-hotfix3 Engine: bump maxTokens 4096→16000 + clearer max_tokens error | A | 4 | Claude direct | Done | `1f4be83` engine+api build clean ✅ deployed (real fix for the engine-path failures) |
| [BEO-780](https://linear.app/beomz/issue/BEO-780/) | S5-1 Engine: per-turn cache stats logging (mirror legacy observability) | A | 5 | Claude direct | Done | `c16fc00` api build clean ✅ deployed (diagnostic for BEO-781 cost measurement) |
| [BEO-781](https://linear.app/beomz/issue/BEO-781/) | S5-2 Engine: cache messages history (cache_control on last tool_result) | B | 5 | Claude direct | Done | `a8ed0ea` engine+api build clean ✅ deployed (caching works — turn 2 input_tokens dropped 5996→16) |
| [BEO-782](https://linear.app/beomz/issue/BEO-782/) | S5-hotfix Engine: strip stale cache_control on prior tool_results (4-breakpoint limit) | A | 5 | Claude direct | Done | `ecdad67` engine+api build clean ✅ deployed (BEO-781 hit Anthropic's 4-breakpoint limit on turn 4; this strips priors) |
| [BEO-783](https://linear.app/beomz/issue/BEO-783/) | S5-3 Engine: route iterations through the engine path | C | 5 | Claude direct | **Reverted** | `7530d07` shipped → real test ran 30 turns, 0 files changed, ~$4 wasted spend; reverted at `4db3548`; integration deferred to BEO-785 |
| [BEO-784](https://linear.app/beomz/issue/BEO-784/) | S5-hotfix2 Engine: diagnostic log of iteration engine eligibility | A | 5 | Claude direct | **Reverted** | `6854133` shipped → confirmed engine path was firing on iterations; reverted alongside BEO-783 at `4db3548` |
| [BEO-785](https://linear.app/beomz/issue/BEO-785/) | S5-followup Engine: integrate iteration paths properly (path remapping + prompt tuning) | D | 5 | (parked) | Backlog | Not started — likely path-prefix mismatch (`apps/web/src/app/generated/<templateId>/<basename>` vs engine basenames). Investigation steps in ticket. |
| [BEO-786](https://linear.app/beomz/issue/BEO-786/) | S6-discovery Chat panel deep analysis (Codex + Cursor + Claude) | N/A | 6 | All three | Done | 3 reports synthesized; revised Sprint 6 queue approved by Omar (BEO-787-792) |
| [BEO-787](https://linear.app/beomz/issue/BEO-787/) | S6-1 Chat: persistence completeness (merge backend + persist implementSuggestion + nextSteps + replay chat_response + timestamps) | B | 6 | Cursor Sonnet 4.6 | Done | `f96c649` web build clean ✅ — partial fix; merge dropped chat_response post-boundary, addressed in BEO-788 |
| [BEO-788](https://linear.app/beomz/issue/BEO-788/) | S6-1-hotfix Chat: additive merge — never drop localStorage events | A | 6 | Claude direct | Done | `3a5c3c5` web build clean ✅ Vercel auto-deploy (overlay-only merge; preserves chat_response + implementPlan + nextSteps) |
| [BEO-789](https://linear.app/beomz/issue/BEO-789/) | S6-1-backend Chat: persist nextSteps into build_summary session_event | A | 6 | Claude direct | Done | `3a5c3c5` api build clean ✅ deployed (cross-device replay can now show real chips, not fallback) |
| [BEO-790](https://linear.app/beomz/issue/BEO-790/) | S6-1-diag Chat persistence diagnostic — log restore + merge state | A | 6 | Claude direct | Done | `7559516` web build clean ✅ Vercel auto-deploy (3 `[chat-diag]` log lines to pinpoint why build_summary disappears post-refresh) |
| [BEO-791](https://linear.app/beomz/issue/BEO-791/) | S6-engine-timeout Engine: plumb build-level abortSignal into AnthropicStreamingModel | A | 6 | Claude direct | Done | `5f016fd` engine+api build clean ✅ deployed (in-flight Anthropic stream now aborts within ~1s when BUILD_TIMEOUT_MS or Stop fires, instead of waiting up to 120s) |
| [BEO-792](https://linear.app/beomz/issue/BEO-792/) | S6-1-fix2 Chat: skip backend events not in localStorage (pre_build_ack tail bug) | A | 6 | Claude direct | Done | `7839f84` web build clean ✅ Vercel auto-deploy (BEO-790 diagnostic confirmed pre_build_ack was being appended after build_summary) |
| [BEO-793](https://linear.app/beomz/issue/BEO-793/) | S7-A Chat dev panel: live state inspector for messages + storage + backend | A | 7 | Cursor Sonnet 4.6 | Done | `0266a44` web build clean ✅ Vercel auto-deploy (Cmd+Shift+D toggles floating panel; Context-based, DEV-gated, no production impact) |
| [BEO-794](https://linear.app/beomz/issue/BEO-794/) | S7-A-fixup Chat dev panel: also enable via localStorage flag | A | 7 | Claude direct | Done | `aff8240` web build clean ✅ Vercel auto-deploy (panel now works on prod when `localStorage["beomz:devMode"]==="true"`) |
| [BEO-795](https://linear.app/beomz/issue/BEO-795/) | S7-A-fixup2 Chat dev panel: switch keybinding to Cmd+Shift+K + add floating launcher | A | 7 | Claude direct | Done | `0a47415` web build clean ✅ Vercel auto-deploy (Cmd+Shift+D was Chrome bookmark intercept; new shortcut + 🔍 fallback button) |
| [BEO-796](https://linear.app/beomz/issue/BEO-796/) | S7-B-1 iterationPipeline: persist build_summary on 0-file iterations + log catch errors | A | 7 | Codex 5.3 / Med | Done | `4be572c` api build clean ✅ deployed to droplet (HEAD `b673b68`, workers 10/11 online) — moved `appendSessionEventToDb({type:"build_summary"})` out of files>0 gate; silent catch → `console.warn` |
| [BEO-797](https://linear.app/beomz/issue/BEO-797/) | S7-D-1 Chat surface: typography pass (consistent scale + tracking) | A | 7 | Cursor Sonnet 4.6 | Done | `b673b68` web build clean ✅ Vercel auto-deploy — 5-rung type ladder applied verbatim across 6 chat-surface components (+17/-17). Spec-strict drop of `font-medium` on "Build plan" / "What next?" captions noted for visual eyeball |
| [BEO-798](https://linear.app/beomz/issue/BEO-798/) | S7-D-2 Status pill: live single-line action with shimmer (kill credit estimate) | A | 7 | Cursor Sonnet 4.6 | Done | `6d7f01e` web build clean ✅ Vercel auto-deploy — `LiveStatusPill.tsx` + `currentAction` state, SSE-driven `mapActionToLabel()` with 150ms debounce, CSS shimmer keyframes + reduced-motion reset. Iteration shimmer replaced; initial-build shimmer kept |
| [BEO-799](https://linear.app/beomz/issue/BEO-799/) | S7-F-1 Iteration intent classifier: pre-pipeline Haiku question/build gate | C | 7 | Codex 5.4 / High | Done | `318bf3b` api build clean ✅ deployed to droplet + flag flipped for ofareda — live test 2026-05-04: classifier correctly handled 3/3 question prompts (no builds fired), 1 build prompt fired build (correct). |
| [BEO-800](https://linear.app/beomz/issue/BEO-800/) | S7-D-2-fixup Status pill: extend LiveStatusPill to initial builds (kill 4-orb shimmer) | A | 7 | Cursor Sonnet 4.6 | Done | `33fd9f2` web build clean ✅ Vercel auto-deploy — ternary collapsed to unconditional `LiveStatusPill`; 4-orb checklist gone for both initial and iteration builds |
| [BEO-801](https://linear.app/beomz/issue/BEO-801/) | S7-G-1 Iteration prompt: design-preservation rule (no scope creep on simple change requests) | B | 7 | Codex 5.4 / High | Done | `9732047` api build clean ✅ deployed to droplet + flag flipped for ofareda 2026-05-04 — flag-gated scope-preservation block prepended to iteration system prompt. Live tested: explicit redesign + rename + label-color iteration confirmed working. Note: only fires on `/builds/generate` → `callModelIterate`, NOT on `/builds/start` plan-preview path (architectural gap to be fixed in Sprint 9) |
| [BEO-803](https://linear.app/beomz/issue/BEO-803/) | S9-P1-1 chat-v2 contract: event types + type guards + validation tests | A | 9 | Codex 5.3 / Med | Done | `65df686` contracts build clean ✅ + 3/3 chat-v2 tests pass — 11 event interfaces, type guards, fixtures, assertNever helper. Sprint 9 Phase 1 contract types complete; unblocks Phases 2 & 3 |
| [BEO-804](https://linear.app/beomz/issue/BEO-804/) | S9-P1-2 InlineConfirmation v2 component: 1-2 sentence plan + auto-implement countdown bar (visual spike) | A | 9 | Cursor Sonnet 4.6 | Done | `b5713f7` web build clean ✅ Vercel auto-deploy — 4 new files (+297, 0 v1 mods): `InlineConfirmation.tsx` (countdown timer, CSS scaleX bar, BAvatar, reduced-motion), v2 barrel, `V2ComponentsPage.tsx` dev preview, router.ts DEV-only `/dev/v2-components` route. Sprint 9 Phase 1 complete |
| [BEO-805](https://linear.app/beomz/issue/BEO-805/) | S9-P1-3 Dev preview: LiveStatusPill samples + phase indicator + production localStorage gate | A | 9 | Cursor Sonnet 4.6 | Done | `e868773` web build clean ✅ Vercel auto-deploy — router.ts `isDevPreviewEnabled()` gate (production access via `localStorage.beomz:devMode=true`); V2ComponentsPage sticky nav + 10 LiveStatusPill states + 3 phase-indicator variants + shimmer A/B section. Sprint 9 Phase 1 complete |
| [BEO-806](https://linear.app/beomz/issue/BEO-806/) | S9-P2.4 buildPipeline: gate phased-build mode to initial builds only | A | 9 | Codex 5.3 / Med | Done | `a59959c` api build clean ✅ deployed to droplet — `generate.ts:3732` `!input.isIteration && !hasExistingFiles` double-guard; workers 10+11 online |
| [BEO-807](https://linear.app/beomz/issue/BEO-807/) | S9-P2.1 POST /api/builds/v2/message: endpoint scaffold + typed SSE emitter | B | 9 | Codex 5.4 / High | Done | `420acb9` api build clean ✅ — Hono route, `USE_CHAT_PANEL_V2` flag, typed emit(), 4-event stub confirmed via curl. No deploy yet (stub; deploys with P2.2 classifier) |
| [BEO-809](https://linear.app/beomz/issue/BEO-809/) | S9-P2.2 classifyTurn(): unified intent classifier for v2 endpoint | B | 9 | Codex 5.4 / High | Done | `07b0984` api build clean ✅ — Haiku classifier, 3s timeout, full normalisation + fallback, telemetry log, project context from DB. No deploy yet (batches with P2.3) |
| [BEO-810](https://linear.app/beomz/issue/BEO-810/) | S9-P3.2 ChatPanelV2: shell component wiring useBuildChatV2 | A | 9 | Cursor Sonnet 4.6 | Done | `a04dbd8` web build clean ✅ Vercel auto-deploy — 104-line ChatPanelV2 shell, MessageList + Composer co-located, phase-gated LiveStatusPill + InlineConfirmation, dev preview section |
| [BEO-808](https://linear.app/beomz/issue/BEO-808/) | S9-P3.1 useBuildChatV2: reducer + SSE subscription hook | B | 9 | Cursor Sonnet 4.6 | Done | `c430fde` web build clean ✅ Vercel auto-deploy — 501-line hook (12-action reducer, SSE stream, snapshot persistence), chat-v2-fixtures.ts added to contracts, ReducerInspector dev preview |
| [BEO-811](https://linear.app/beomz/issue/BEO-811/) | S9-11 P2.3 v2Message: kind-routing (question → streaming Haiku, iteration/initial_build → scaffold) | B | 9 | Codex 5.4 / High | Done | `57fce11` api build clean ✅ deployed to droplet — replaces 200ms stub with real branch: question streams Haiku via `anthropic.messages.stream()` → text_delta events; iteration/initial_build scaffold with TODO P2.5. Workers 10+11 online. BEO-807+BEO-809+BEO-811 batch deployed together |
| [BEO-812](https://linear.app/beomz/issue/BEO-812/) | S9-12 P3.3 TextMessage, BuildSummary, InlineError components + MessageList wiring | B | 9 | Cursor Sonnet 4.6 | Done | `a3bb129` web build clean ✅ Vercel auto-deploy — replaces placeholder MessageList with typed dispatch; TextMessage (user/assistant, blinking cursor on streaming), BuildSummary (shimmer / file count + credits + nextSteps chips), InlineError (↺ Retry); blinking-cursor CSS in index.css; 8-sample #message-types dev preview section |

| [BEO-813](https://linear.app/beomz/issue/BEO-813/) | S9-13 P3.4 — ChatStateInspectorV2: v2 reducer state + localStorage panel | B | 9 | Cursor Sonnet 4.6 | Done | `53b6fc3` web build clean ✅ Vercel auto-deploy — 508-line ChatStateInspectorV2 (Section A phase badge, Section B monospace message rows, Section C chat:v2 snapshot poll + MISMATCH); wired into ChatPanelV2 via fragment; #chat-state-inspector-v2 dev preview with forceOpen. **Phase 3 complete.** |
| [BEO-814](https://linear.app/beomz/issue/BEO-814/) | S9-14 P4.1 — CHAT_PANEL_V2_PILOT_ORG_IDS: config + features.chatV2 in build responses | B | 9 | Codex 5.3 / Med | Done | `d4e5be9` api build clean ✅ deployed to droplet — `config.ts` new var; `latest.ts` + `status.ts` each get `isChatV2PilotOrg` helper + `features: { chatV2: bool }` in response. Workers 10+11 online |
| [BEO-815](https://linear.app/beomz/issue/BEO-815/) | S9-15 P4.2 — Wire ChatPanelV2 into ProjectPage behind features.chatV2 | B | 9 | Cursor Sonnet 4.6 | Done | `954d8e4` web build clean ✅ Vercel auto-deploy — `BuildStatusResponse` extended; `chatV2Enabled` state in ProjectPage; conditional render `<ChatPanelV2>` vs `<ChatPanel>`; #phase4-wiring dev preview section. **Phase 4 complete. Pilot live for ofareda.** |
| [BEO-816](https://linear.app/beomz/issue/BEO-816/) | S9-16 P3.5 — ChatPanelV2: port v1 visual design (orange bubble, cream bg, v1 composer) | B | 9 | Cursor Sonnet 4.6 | Done | `ae28c3a` web build ✅ 360ms — orange-tint user bubble `bg-[rgba(255,104,0,0.18)]` + asymmetric corners + UserAvatar right; "B:" prefix removed; `text-[#374151]` assistant; cream `bg-[#faf9f6]`; v1 composer textarea + orange `bg-[#F97316]` send icon; `userAvatarUrl`/`userInitials` threaded from ProjectPage. Vercel auto-deploy. |
| BEO-817 | S9-hotfix — useBuildChatV2: remove double /api prefix in fetch URL (404 fix) | A | 9 | Claude direct | Done | `8981682` web build ✅ 331ms — `getApiBaseUrl()` returns `https://beomz.ai/api`; fetch was calling `/api/builds/v2/message` → double `/api/api/` → Hono 404. Fix: drop extra `/api`. Deployed: droplet pull + web rebuild + pm2 restart beomz-web. |
| [BEO-820](https://linear.app/beomz/issue/BEO-820/) | S9-P2.5a classifyTurn: greetings + ambiguous prompts → question (classifier fix) | A | 9 | Codex 5.3 / Low | **In Progress** | Codex fired 2026-05-04. `classifyTurn.ts` line 14 `question` rule: add greetings/conversational/ambiguous so "hi" stops misfiring as `iteration`. Awaiting return + verify + deploy. |
| [BEO-818](https://linear.app/beomz/issue/BEO-818/) | S9-P2.5b v2Message wire iteration/redesign with callModelIterate + file persistence | C | 9 | Codex 5.4 / Med-High | **Drafted** | NOT fired. Export `callModelIterate`+`mergeFiles` from `generate.ts`. Create generation row. Call model. Persist merged files. Emit `build_complete`. Fire after BEO-820 deployed. |
| [BEO-819](https://linear.app/beomz/issue/BEO-819/) | S9-P2.5c v2Message wire initial_build with runBuildInBackground | C | 9 | Codex 5.4 / Med-High | **Drafted** | NOT fired. Use `runBuildInBackground`, read generation from DB, emit `build_complete`. Fire after BEO-818 deployed. |

(more tickets append here as they ship)

---

## Sprint 4 — engine rollout playbook

The audit's main thesis ("engine is dead code") is now resolved. The engine is wired, prompt-cached, observable, and pilot-able. Production behavior is **byte-identical** to before until you flip a flag.

### Step 1 — find your org UUID
```sql
-- Run in studio Supabase SQL editor:
select id, name from public.orgs where owner_id = '<your-platform-user-id>';
-- Or look it up by your name:
select id, name from public.orgs where name ilike '%beomz%';
```
Copy the UUID — it looks like `abc123de-f456-7890-...`.

### Step 2 — opt your org into the engine path
In Vercel dashboard → your API project → Settings → Environment Variables:
```
ENGINE_PILOT_ORG_IDS=abc123de-f456-7890-...
```
**No redeploy needed** for env-only changes (Vercel picks them up on next request).

### Step 3 — run a build and watch the logs
Open your project in beomz.ai/studio and start a new build. Then in Vercel logs, look for:
- `[generate] using engine path` → the engine eligibility check fired
- `[telemetry] build complete {"path":"engine",...}` → the engine actually ran

If you see `"path":"legacy"` instead, check the eligibility constraints:
- `imageUrl` set? → falls back to legacy (engine doesn't support images yet)
- `phaseScope` set? → falls back to legacy (engine doesn't support phased builds)

### Step 4 — compare engine vs legacy
After a few builds, grep Vercel logs:
```
[telemetry] build complete {"path":"engine"  ← input/output tokens
[telemetry] build complete {"path":"legacy"  ← input/output tokens
```
Engine builds with multi-turn iterations should show **notably lower input tokens** thanks to the BEO-774 prompt caching split.

### Step 5 — ramp or rollback
- **If clean:** add other trusted users' org IDs to the comma-list. Ramp gradually.
- **If issues:** clear `ENGINE_PILOT_ORG_IDS=""` (60-sec rollback, only opted-in orgs revert).
- **Production-wide rollout:** when confident, set `USE_GENERATION_ENGINE=true` (rolls out to everyone; pilot list becomes redundant).

### Known limitations of the first-cut engine path
- **Image attachments** → legacy fallback (engine takes `prompt: string` only)
- **Phased builds** → legacy fallback (engine doesn't propagate phase context yet)
- **Palette / design system specs** → not propagated. Engine has its own app-type brief but doesn't get the full Material/Apple HIG/Linear/etc. spec the legacy contextBuilder builds.

These are intentional first-cut limitations. Future tickets can plumb each of these through if/when needed.

### Engine flag matrix

| `USE_GENERATION_ENGINE` | `ENGINE_PILOT_ORG_IDS` | `imageUrl` | `phaseScope` | This build's path |
|---|---|---|---|---|
| `false` (default) | empty (default) | any | any | Legacy |
| `false` | `<my-org>` | unset | unset | **Engine** |
| `false` | `<other-org>` | any | any | Legacy |
| `false` | `<my-org>` | set | any | Legacy (image fallback) |
| `false` | `<my-org>` | unset | set | Legacy (phase fallback) |
| `true` | any | unset | unset | **Engine** (global) |
| `true` | any | set | any | Legacy (image fallback) |

---

## Rollback procedure

| Scenario | Action | Recovery time |
|---|---|---|
| Single Class A fix breaks something | `git revert <sha>`, redeploy | 5 min |
| Class B fix misbehaves | Flip its env var to default, redeploy | 60 sec |
| Engine wiring causes regressions for one org | Remove that org's UUID from `ENGINE_PILOT_ORG_IDS` | 60 sec |
| Engine wiring causes regressions for everyone | Set `USE_GENERATION_ENGINE=false` AND clear `ENGINE_PILOT_ORG_IDS` | 60 sec |
| Whole audit needs to back out | Reset to tag `pre-audit-fixes`: `git checkout pre-audit-fixes && git push -f origin main` (last resort, coordinate first) | 10 min |

---

## Decision log

- **2026-05-02** — Working contract: 1 prompt per agent, max 2 concurrent if non-conflicting. "Fired" = working, "paste" = done. Claude reviews each return before closing in Linear.
- **2026-05-02** — Codex = backend (apps/api, packages/engine). Cursor = frontend (apps/web, apps/admin), runs **Sonnet 4.6** by default or **Opus 4.7** for bigger refactors. Every handoff prompt must lead with an agent + model + reasoning header. Linear label `codex-task` description is currently inverted in the UI — fix manually when convenient (cosmetic only).
- **2026-05-02** — Cost-aware Codex model picking. **Codex 5.3** is the default for Class A/B surgical work (exact-spec changes, flag wiring) — saves real money, quality unchanged when spec is locked. **Codex 5.4** is reserved for Class C/D (stateful reasoning: migrations, transactions, retry logic, engine wiring, refactors). Every Codex handoff specifies model + reasoning level (Low/Medium/High/Extra High). Default reasoning for surgical: Medium. Step up only when the agent must make architectural decisions.
- **2026-05-02** — Using labels (`audit-2026-05`) not a Linear project. Lighter ceremony for solo founder.
- **2026-05-02** — Engine wiring (Sprint 4) runs in parallel with Sprints 2–3 because it's flag-gated and on a separate code path.
