# Beomz Studio V2 — Agent Handover Doc
**Last updated:** April 4, 2026

---

## Agent roles

| Agent | Role | Owns |
| -- | -- | -- |
| **Codex** | Backend / engine / arch | `apps/api/`, `packages/` (excl. kernel), `workers/` |
| **Claude Code** | Frontend / UI | `apps/web/` only |
| **Claude (chat)** | Orchestrator | Linear, PRs, GitHub, browser ops, Vercel, Supabase, Railway |

**Hard rules:**
- NEVER touch `packages/kernel/` or `packages/engine/`
- Push branch immediately after every successful build
- Discord CI fires automatically on push to `main` — no manual posting
- Claude (chat) opens all PRs — agents push branches only

---

## Start of session checklist

1. `git pull origin main`
2. Check BEO-44 on Linear for current active queue
3. Read your assigned issue before writing any code
4. Push immediately when build passes

---

## Infrastructure

| Service | URL / ID | Status |
| -- | -- | -- |
| Vercel frontend | https://beomz.ai | ✅ Live |
| Railway API | beomz-studioapi-production.up.railway.app | ✅ Online |
| Supabase beomz-platform | `labutmadyprdhfqywwdn` · EU-west-1 | ✅ Auth |
| Supabase beomz-studio | `srflynvdrsdazxvcxmzb` · ap-southeast-1 | ✅ Data |
| Supabase beomz-user-data | US-east-1 | ✅ DO NOT PAUSE |
| Temporal Cloud | `quickstart-beomz-studio` · ap-southeast-1 | ✅ |
| Discord CI | `.github/workflows/discord-notify.yml` | ✅ Auto |

### Env vars — Vercel (baked at build time)
```
VITE_SUPABASE_URL=https://labutmadyprdhfqywwdn.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_fBJGrRwHOVT0k1Hru1qz8Q_CWf_EPWn
VITE_API_BASE_URL=https://beomz-studioapi-production.up.railway.app
VITE_ANTHROPIC_API_KEY=[set]
```

### Env vars — Railway (runtime)
```
STUDIO_SUPABASE_URL=https://srflynvdrsdazxvcxmzb.supabase.co
STUDIO_SUPABASE_SERVICE_ROLE_KEY=[set]
ANTHROPIC_API_KEY=[set]
E2B_API_KEY=[set]
BEOMZ_ENABLE_EMBEDDED_TEMPORAL_WORKER=true
TEMPORAL_ADDRESS=quickstart-beomz-studio.sdvdw.tmprl.cloud:7233
TEMPORAL_NAMESPACE=quickstart-beomz-studio
TEMPORAL_TASK_QUEUE=initial-builds
PORT=3001
```

### Railway deployment note
- Production Railway should run Temporal inside the API service via `apps/api/src/bootstrap.ts`.
- Do not rely on a separate Railway worker service rooted at `workers/temporal`; shared monorepo files will be missing from that deploy shape.
- Keep the Railway API service at 1 replica during cutover, then scale intentionally after validating queue consumption.

### Local dev env — apps/web/.env.local
```
VITE_SUPABASE_URL=https://labutmadyprdhfqywwdn.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_fBJGrRwHOVT0k1Hru1qz8Q_CWf_EPWn
VITE_API_BASE_URL=https://beomz-studioapi-production.up.railway.app
```

---

## Design tokens
```
bg dark:    #060612      cream:    #faf9f6
orange:     #F97316      purple:   #a855f7
accent:     #e8580a      success:  #22c55e
font:       DM Sans
surface hl: rgba(249,115,22,0.08)
```

**UI rule:** Studio builder UI uses cream `#faf9f6` (light/V1 aesthetic).
Dark Aurora theme is for landing page only.

---

## Sprint 2 — current queue

### Active
| Issue | Agent | Branch |
| -- | -- | -- |
| BEO-68 | Claude Code | `beo-68-questions-ui` |

### PRs pending merge
| Branch | Issue |
| -- | -- |
| `beo-146-conversational-plan-mode` | BEO-146 |
| `beo-76-checkpoints-ui` | BEO-76 |

### Queued
| Issue | Agent | What |
| -- | -- | -- |
| BEO-141 | Codex | Confirm first generation end-to-end |
| BEO-59 | Codex | Context compression + concurrent actions |
| BEO-67 | Claude Code | Visual edits (click element to modify) |

---

## Key issue reference

| Issue | What |
| -- | -- |
| BEO-44 | Master sprint (always check this) |
| BEO-57 | GenerationEngine spec |
| BEO-47 | Kernel + contracts (frozen) |
| BEO-146 | Conversational plan mode (done) |
| BEO-68 | Clarifying questions UI — Lovable parity (active) |
| BEO-76 | Checkpoints + time travel UI (done) |
