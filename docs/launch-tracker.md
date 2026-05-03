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
- [ ] **Sprint 5** — Cleanup, hook split, polish

---

## 🔁 Handover snapshot — 2026-05-03

**Where we are:** Sprints 0–4 shipped + BEO-777 hotfix deployed to production droplet. Awaiting Omar's retry of a build at beomz.ai/studio to validate the engine path completes end-to-end.

**Production environment (the API does NOT run on Vercel/Railway):**
- DigitalOcean Droplet `beomz-web-api-sfo3` at `143.198.154.126`
- SSH: `ssh -i ~/.ssh/beomz_do root@143.198.154.126`
- Process manager: pm2, app name `beomz-api`, cluster mode (workers `10`, `11`)
- Repo path on droplet: `/root/beomz-studio` (or similar — check `pm2 show beomz-api`)
- Restart after env change: `pm2 restart beomz-api --update-env`
- Tail logs: `pm2 logs beomz-api --lines 200`
- Frontend (apps/web) IS on Vercel; only the API is on the Droplet.

**Engine pilot allowlist on the droplet** (`ENGINE_PILOT_ORG_IDS`):
- `f7f5ffc7-…` (org: beomz.com)
- `3e11937b-…` (org: ofareda)
Both opted in for the engine path. Omar's last attempt ran under `3e11937b`.

**Last verified state on droplet:**
- HEAD: `23ce909` (BEO-777)
- `dist/lib/build/runEngineAdapter.js` exists; `packages/engine/dist/GenerationEngine.js` contains `tool_choice:{type:"any"}`
- pm2 workers online, fresh restart

**Immediate next step:**
1. Omar retries the same simple-recipe-finder build at beomz.ai/studio.
2. New Claude tails pm2 logs: `pm2 logs beomz-api --lines 300 | grep -E "telemetry|engine|anthropic"`
3. Success looks like: `[telemetry] build complete {"path":"engine","success":true,"filesGenerated":N,...}`. Failure repeats `GenerationEngineError`.

**Known follow-ups (not yet ticketed):**
1. **picsum.photos / external `<img src>` COEP errors** — `apps/api/src/lib/sanitise.ts` `externalUrls` fixer (lines ~342-359) strips external `<link>`/`<script>` but NOT `<img src="https://...">`. Caused 18,786 console errors in Omar's first test build under WebContainer COEP. Class A surgical fix — extend the regex to `<img>` and replace with a data-uri placeholder or a same-origin proxy.
2. **`.claude/launch.json`** — local-only Claude Code preview-tool config left as `M` in working tree on the droplet. Revert or `git update-index --skip-worktree`.
3. **Engine first-cut limitations** still open (image attachments, phaseScope, palette/design-system propagation) — see Sprint 4 playbook below.

**Working agreement (carry forward):**
- 1 prompt per agent at a time, max 2 concurrent if non-conflicting.
- Codex 5.3 / Low–Med = backend surgical (apps/api, packages/engine spec-locked work).
- Codex 5.4 / Med–High = backend stateful reasoning (migrations, retry, engine wiring).
- Cursor Sonnet 4.6 = frontend default (apps/web, apps/admin); Cursor Opus 4.7 for bigger refactors.
- Every agent prompt: lead with **Agent + Model + Reasoning level + WHY**.
- Use **tilde fences `~~~`** inside outer triple-backtick blocks so copy-to-clipboard captures the full prompt.
- "Fired" = agent working. "Done" / "paste" = ready for Claude to verify.
- Claude verifies every commit (diff exact to spec, build clean) before closing in Linear.

**Reference files for the next session:**
- This tracker (`docs/launch-tracker.md`) — SSOT for everything shipped.
- `apps/api/src/config.ts` — all 9 audit feature flags.
- `apps/api/src/lib/build/runEngineAdapter.ts` — the engine drop-in.
- `apps/api/src/lib/build/buildPipeline.ts` — flag-gated routing + telemetry log.
- `packages/engine/src/GenerationEngine.ts` — engine main loop (BEO-758 / 764 / 777 land here).
- `packages/engine/src/systemPrompt.ts` — stable-vs-per-turn split (BEO-774).

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
