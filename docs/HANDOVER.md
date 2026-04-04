# Beomz Studio V2 — Session Handover
> **Update this file at the end of every session.**  
> It is the single source of truth for all AI sessions — Claude (chat), Claude Code, and Codex.

---

## Last updated
**Date:** April 4, 2026
**Session type:** BEO-58 — session persistence + credit tracking
**Updated by:** Codex

---

## Current state

### Sprint 1 — COMPLETE ✅
All PRs merged to `main`. Migrations run on beomz-studio (`srflynvdrsdazxvcxmzb`).

| PR | Issue | What shipped |
|---|---|---|
| #4 | BEO-46 | Shared auth + Studio API + `001_initial.sql` |
| #5 | BEO-52 | Phase continuation card |
| #6 | BEO-63 | Three-mode home (Dream / Plan / Build) |
| #7 | BEO-47 | Kernel + contracts 🔒 |
| #8 | BEO-64 | Landing page + SVG logo |
| #9 | BEO-49 | Temporal build pipeline + `002_generations.sql` |
| #10 | BEO-65 | DM Sans + cream theme tokens |
| #11 | BEO-53 | Images + Agents UI shells |
| #12 | BEO-50 | E2B preview streaming + `003_previews.sql` |
| #13 | BEO-51 | Validators + fallback scaffolds (13 tests passing) |
| #14 | BEO-57 | Generation Engine core |

### In progress
| Issue | Title | Who | Branch | Status |
|---|---|---|---|---|
| BEO-58 | Session persistence + credit tracking | Codex | `codex/beo-58-session-persistence-credit-tracking` | ⏳ Local implementation complete — migration file added, not yet applied remotely |

### Next sprint candidates
See `docs/COMPETITOR_RESEARCH.md` → Sprint 2 Recommendation section.

**Top 5 picks:**
1. BEO-89 — Build log / activity feed
2. BEO-134 — Bolt-style chat animations
3. BEO-129 — Plan steps as interactive buttons
4. BEO-130 — Built-in DB + BYO Supabase
5. BEO-124 — App visibility toggle

---

## Rules that never change

| Rule | Detail |
|---|---|
| `packages/kernel/` | 🔒 FROZEN — never modify, never touch |
| `packages/contracts/` | Locked after BEO-47 — only extend, never rewrite |
| AI workflow | Codex → backend/arch. Claude Code → frontend/UI. Never simultaneously |
| Migrations | Always run on beomz-studio (`srflynvdrsdazxvcxmzb`), never beomz-user-data |
| beomz-user-data | DO NOT PAUSE OR DELETE — live user data plane |

---

## How to start a new session

### Claude Code
```
Read docs/HANDOVER.md and docs/COMPETITOR_RESEARCH.md first.

Current state: Sprint 1 complete. BEO-57 (Generation Engine) is running 
in Codex on branch beomzcom/beo-57-generation-engine — check if merged 
before starting anything new.

If BEO-57 is merged → propose Sprint 2 frontend issues from the 
Sprint 2 Recommendation in docs/COMPETITOR_RESEARCH.md.
If not → report back and wait.
```

### Codex
```
Read docs/HANDOVER.md first.

Current state: Sprint 1 complete. Your active task is BEO-57 
(Generation Engine) merged to `main` in PR #14.
Your active task is BEO-58 on branch codex/beo-58-session-persistence-credit-tracking.
Do not touch packages/kernel/ under any circumstance.
```

### Claude (chat)
```
Read docs/HANDOVER.md and docs/COMPETITOR_RESEARCH.md.
Continue from where the last session left off.
```

---

## Infrastructure

| Resource | Detail |
|---|---|
| **beomz-studio** | Supabase `srflynvdrsdazxvcxmzb` · ap-southeast-1 |
| **beomz-user-data** | Supabase · US-east-1 · DO NOT PAUSE |
| **beomz-platform** | Supabase · EU-west-1 · shared auth |
| **Temporal** | `quickstart-beomz-studio` · AWS ap-southeast-1 |
| **Live** | https://beomz.ai (Vercel + GoDaddy DNS) |
| **Monorepo** | `~/Desktop/beomz-studio` · pnpm + Turborepo |
| **Migrations run** | 001 ✅ 002 ✅ 003 ✅ · 004 pending |

### Design tokens
```
background: #060612    orange: #F97316
purple:     #a855f7    cream:  #faf9f6
accent:     #e8580a    font:   DM Sans
```

---

## Issue ranges

| Range | Source | Count |
|---|---|---|
| BEO-40 to BEO-66 | Sprint 1 + arch decisions | 27 |
| BEO-67 to BEO-103 | Lovable research (Apr 4) | 37 |
| BEO-104 to BEO-116 | Replit research (Apr 4) | 13 |
| BEO-117 to BEO-127 | Base44 research (Apr 4) | 11 |
| BEO-128 to BEO-135 | Bolt research (Apr 4) | 8 |

Full feature matrix with priorities: `docs/COMPETITOR_RESEARCH.md`

---

## Key reference links

| What | Where |
|---|---|
| Competitive feature matrix | `docs/COMPETITOR_RESEARCH.md` |
| Beomz Cloud panel spec (10 tabs) | linear.app/beomz/issue/BEO-93 |
| Bolt animation system spec | linear.app/beomz/issue/BEO-134 |
| Built-in DB + BYO Supabase spec | linear.app/beomz/issue/BEO-130 |
| Full feature pick-list | linear.app/beomz/issue/BEO-66 |
| GitHub repo | github.com/beomzapp/beomz-studio |
| Linear board | linear.app/beomz |

---

## Session log

| Date | Type | Summary | Issues |
|---|---|---|---|
| Apr 4, 2026 | Backend / persistence | BEO-58 implemented locally on `codex/beo-58-session-persistence-credit-tracking`: added `004_session_events.sql`, generation session-event logging, resumable session store, credit guard + Sonnet 4 cost accounting, project session API bootstrap, and web hydration for restoring the latest generation after reload. `pnpm build` passes locally. Migration not yet applied to Supabase. | BEO-58 |
| Apr 4, 2026 | Competitive research | Live DOM exploration of Lovable (full settings + Cloud panel), Replit (all 13 Tools & Files, History, Workflows), Base44 (all 13 dashboard sections per app), Bolt (live build observed — animations, plan flow, DB panel, Publish). Full feature matrix + nav maps built. Bolt animation CSS tokens captured. Built-in DB vs BYO Supabase decision documented in BEO-130. | BEO-67 to BEO-135 (69 issues) |
| Pre Apr 4, 2026 | Sprint 1 | Core auth, kernel, contracts, E2B preview, validators. All PRs #4–#13 merged. | BEO-40 to BEO-66 |
