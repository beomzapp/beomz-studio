# Beomz Studio V2 — Launch Tracker

Single source of truth for the audit-2026-05 rollout. Every audit ticket gets logged here as it ships.

**Tag:** `pre-audit-fixes` (commit: `d3d35e9`)
**Started:** 2026-05-02
**Owner:** Omar (orchestrator: Claude)
**Linear label:** `audit-2026-05`

---

## Sprint status

- [x] **Sprint 0** — Pre-flight ✅ shipped 2026-05-02 (BEO-757, commit `d3d35e9`)
- [ ] **Sprint 1** — Class A surgical fixes (5 tickets)
- [ ] **Sprint 2** — Class B replacements behind kill switches (4 tickets)
- [ ] **Sprint 3** — Class C stateful changes (5 tickets)
- [ ] **Sprint 4** — Engine wiring (parallel with sprints 2–3)
- [ ] **Sprint 5** — Cleanup, hook split, polish

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

(more tickets append here as they ship)

---

## Rollback procedure

| Scenario | Action | Recovery time |
|---|---|---|
| Single Class A fix breaks something | `git revert <sha>`, redeploy | 5 min |
| Class B fix misbehaves | Flip its env var to default, redeploy | 60 sec |
| Engine wiring causes regressions | Set `USE_GENERATION_ENGINE=false`, redeploy | 60 sec |
| Whole audit needs to back out | Reset to tag `pre-audit-fixes`: `git checkout pre-audit-fixes && git push -f origin main` (last resort, coordinate first) | 10 min |

---

## Decision log

- **2026-05-02** — Working contract: 1 prompt per agent, max 2 concurrent if non-conflicting. "Fired" = working, "paste" = done. Claude reviews each return before closing in Linear.
- **2026-05-02** — Codex = backend (apps/api, packages/engine). Cursor = frontend (apps/web, apps/admin), runs **Sonnet 4.6** by default or **Opus 4.7** for bigger refactors. Every handoff prompt must lead with an agent + model + reasoning header. Linear label `codex-task` description is currently inverted in the UI — fix manually when convenient (cosmetic only).
- **2026-05-02** — Cost-aware Codex model picking. **Codex 5.3** is the default for Class A/B surgical work (exact-spec changes, flag wiring) — saves real money, quality unchanged when spec is locked. **Codex 5.4** is reserved for Class C/D (stateful reasoning: migrations, transactions, retry logic, engine wiring, refactors). Every Codex handoff specifies model + reasoning level (Low/Medium/High/Extra High). Default reasoning for surgical: Medium. Step up only when the agent must make architectural decisions.
- **2026-05-02** — Using labels (`audit-2026-05`) not a Linear project. Lighter ceremony for solo founder.
- **2026-05-02** — Engine wiring (Sprint 4) runs in parallel with Sprints 2–3 because it's flag-gated and on a separate code path.
