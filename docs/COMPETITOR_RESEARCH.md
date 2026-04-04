# Beomz Competitive Research — Feature Reference
> Live research session · April 4, 2026  
> All four platforms explored with live account access (Lovable, Replit, Base44, Bolt)  
> Issues created: BEO-67 through BEO-135

---

## How to use this document

Every row below maps a competitor feature → a Beomz Linear issue. Use this as the canonical reference when planning sprints. Features are grouped by category, not by competitor, so you can see where we stack up across the board in each dimension.

---

## Feature matrix by category

### 🏗️ Core building modes

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Visual edits — click any element to modify | Lovable | BEO-67 | High |
| Plan mode — editable task breakdown before build | Lovable + Replit + Bolt | BEO-68 | High |
| Plan steps as interactive buttons with status | Bolt | BEO-129 | High |
| Bolt-style chat animation — spinners, shimmer, ticks | Bolt | BEO-134 | High |
| Edit / Discuss mode toggle in chat | Base44 | BEO-125 | High |
| Inline AI suggestions after each response | Base44 | BEO-125 | High |
| Prompt queue — stack 50 prompts, execute sequentially | Lovable | BEO-69 | Medium |
| Slash commands — /plan /fix /rollback /deploy | Bolt | BEO-132 | Medium |
| Voice input — speech to text on chat field | Base44 + Replit | BEO-127 | Medium |
| Select element in chat — click preview to reference | Replit | BEO-110 | High |
| Agent modes — Lite / Economy / Power / Max | Replit | BEO-75 | High |
| Long autonomous sessions — up to 200 min | Replit | BEO-77 | Medium |

---

### 🎨 Design & theming

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Themes panel — design tokens, set once, propagates everywhere | Lovable | BEO-70 | High |
| Styling keywords — "glassmorphism" injects tokens | Base44 | BEO-88 | Medium |
| Design System Agents — ingest company design system | Bolt | (via BEO-134) | Medium |
| Import options on home — Figma / GitHub / Template / DS | Bolt | BEO-135 | Medium |

---

### 🖼️ Media & assets

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Built-in image generation — logos, favicons, OG images | Lovable + Bolt | BEO-71 | Medium |
| App Storage — object storage for images/videos/docs | Replit | BEO-105 | Medium |

---

### 🗄️ Database

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Built-in DB auto-provisioned + BYO Supabase upgrade | Bolt | BEO-130 | High |
| Entity data browser — visual table editor | Base44 | BEO-117 | High |
| API code generator — JS/Python per entity | Base44 | BEO-122 | High |
| Natural language database management from DB panel | Bolt | (via BEO-130) | High |

---

### ☁️ Cloud / Infrastructure panel

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Full Cloud panel — 10 tabs, inline Supabase management | Lovable | BEO-93 | High |
| — Overview, AI Usage, Emails, Database, Users | Lovable | BEO-93 | High |
| — Storage, Secrets, Edge Functions, SQL Editor, Logs | Lovable | BEO-93 | High |
| — Usage metrics (DB server, network, compute) | Lovable | BEO-93 | High |
| Workflows panel — process manager, ports, Ask Agent | Replit | BEO-108 | High |
| Automations panel — view/test AI-created background jobs | Replit + Base44 | BEO-106 / BEO-119 | High |
| App automations — scheduled + event-triggered tasks | Base44 | BEO-119 | High |
| Integrations panel — managed + git + external services | Replit | BEO-114 | High |
| Dev vs published URLs — isolated deploy | Replit | BEO-113 | High |
| Test / live environments — isolated databases per project | Lovable | BEO-73 | High |
| Publish Output tab — dedicated deploy pipeline log | Bolt | BEO-131 | Medium |

---

### 🔐 Security

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Security audit — scan + auto-fix critical issues | Bolt | BEO-87 | High |
| RLS scanner — per-entity access policy checker | Base44 | BEO-120 | High |
| Security scan auto-runs on every publish | Bolt | (via BEO-87) | High |
| Block publish with critical security findings | Lovable | (via BEO-87) | High |

---

### 🔍 Observability & analytics

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Built-in analytics — visitors, pages, events, zero setup | Bolt + Base44 | BEO-85 | High |
| Inline analytics tab — ask AI about your data | Base44 | BEO-92 | High |
| App logs explorer — event-level, user + timestamp | Base44 | BEO-121 | High |
| Live visitor count on publish button | Lovable | BEO-102 | Medium |
| Live credit counter in chat — inline upsell | Bolt | BEO-133 | Medium |

---

### 📜 History & versioning

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Checkpoints + time travel — roll back any state | Replit | BEO-76 | High |
| Checkpoint history with AI descriptions + screenshots | Replit | BEO-104 | High |
| Version history UI — preview and restore | Bolt | BEO-83 | High |
| Auto-versioning per chat turn — "Version N at [time]" | Bolt | BEO-128 | Medium |
| Version branching — named versions, switch, merge | Replit | BEO-115 | Medium |
| Session work stats — duration, messages, actions | Replit | BEO-116 | Medium |
| Build log / activity feed — real-time checklist | Base44 | BEO-89 | High |

---

### 👥 Collaboration

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Element-pinned comments — internal + client review | Lovable | BEO-103 | High |
| Private share links — pre-launch feedback | Bolt | BEO-84 | High |
| People — per-member credit limits | Lovable | BEO-97 | Medium |
| Access request approval flow | Lovable | (via BEO-97) | Medium |
| Notifications system — bell icon with badge count | Replit | BEO-112 | Medium |
| Invite users + visibility toggle per app | Base44 | BEO-124 | High |

---

### 🚀 Publishing & deployment

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Internal publish — live but not discoverable | Lovable | BEO-99 | High |
| App visibility toggle — public / login / invite only | Base44 | BEO-124 | High |
| Platform badge toggle — hide "Edit with Beomz" | Base44 | (via BEO-124) | Low |
| Custom domains — buy or connect | Lovable | (via BEO-93) | High |

---

### 📥 Imports

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Figma import — frames → React components | Replit + Bolt | BEO-79 | Medium |
| Import from Lovable / Bolt — migration path in | Replit | BEO-80 | Medium |
| GitHub import — existing repo | Bolt | (via BEO-135) | Medium |

---

### 📤 Multi-output

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Multi-output — web + mobile sharing one backend | Replit | BEO-78 | Medium |
| Mobile apps — React Native + Expo + App Store | Replit | BEO-81 | Medium |
| Slide deck generation from prompts | Bolt | BEO-86 | Medium |

---

### 🤖 Agents & automation

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Subagents / parallel agents — UI + logic + verifier | Replit | BEO-75 | High |
| Agent skills — reusable markdown knowledge files | Replit | BEO-109 | High |
| In-app agents — AI agents for end users | Base44 | BEO-118 | High |
| Canvas — tldraw wireframe tool, build from drawing | Replit | BEO-107 | High |
| Beomz Agent — 24/7 personal AI on WhatsApp/Telegram | Base44 | BEO-126 | Medium |
| Automations — view + test AI-created background jobs | Replit + Base44 | BEO-106 / BEO-119 | High |
| MCP server connections — external tool context | Bolt | BEO-82 | High |

---

### 🧠 Knowledge & intelligence

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Workspace knowledge — persistent rules across all projects | Lovable | BEO-101 | High |
| Project knowledge — per-project AI rules | Lovable | (via BEO-101) | High |
| Agent skills — reusable code pattern files | Replit | BEO-109 | High |

---

### 📊 Project management

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Project stats — messages, AI edits, credits used | Lovable | BEO-100 | Medium |
| Star projects + folders — organise by quick access | Lovable | BEO-98 | Medium |

---

### 👤 User / account

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| User levelling system — L1 Starter → L5 Diamond | Lovable | BEO-94 | Medium |
| Public profile + LinkedIn showcase | Lovable | BEO-95 | Medium |
| Generation complete sound — audio chime | Lovable | BEO-96 | Low |
| Credit bonuses — earn for domain/invite/publish | Lovable | BEO-74 | Medium |
| CLUI — command-line interface at beomz.ai/cli | Replit | BEO-111 | Low |

---

### 📣 Marketing & content

| Feature | Competitor | Beomz issue | Priority |
|---|---|---|---|
| Social content generator — Twitter/LinkedIn/PH posts | Base44 | BEO-123 | Medium |

---

## Key architectural decisions from research

### Bolt animation system (BEO-134)
The most important UX insight from this session. Bolt uses:
- `i-svg-spinners:90-ring-with-bg` — SVG spinner on active plan step
- `i-bolt:circle` → spinner → checkmark transitions (pure CSS)
- CSS gradient shimmer on streaming text: `[--base-gradient-color:var(--bolt-elements-textPrimary)]`
- "Thinking..." micro-state text before each step executes
- Design token system: `bolt-ds-*` (semantic) + `bolt-elements-*` (component-level)

Copy for Beomz: `--beomz-ds-success`, `--beomz-ds-brand` (existing `#F97316`), `--beomz-ds-surfaceHighlight`

### Bolt Database model (BEO-130)
Two-tier DB strategy:
- **Built-in (default):** Auto-provisioned Postgres on project creation. Zero config. "Database - Connected" indicator in top bar. Users never see a connection string.
- **BYO Supabase:** Paste URL + keys → Beomz migrates schema. One-way upgrade. Built-in preserved 30 days as backup.

Both work identically from the GenerationEngine — different connection strings only.

### Base44 Dashboard (BEO-117 to BEO-124)
Base44 has a 13-section dashboard per app:
`Overview · Users · Data · Analytics · Social content · Domains · Integrations · Security · Agents · Automations · Logs · API · Settings`

The most important: **Data** (entity table editor), **Agents** (in-app AI agents), **Security** (RLS per entity), **Logs** (event-level with user identity), **API** (copy-paste code generator).

### Lovable Cloud panel (BEO-93)
10-tab panel accessed via "Cloud" button in studio top nav:
`Overview · AI Usage · Emails · Database · Users · Storage · Secrets · Edge Functions · SQL Editor · Logs · Usage`

The "AI Usage" tab tracks which AI models the generated app is calling (not Lovable's own AI). Critical for billing transparency.

---

## Lovable settings — full navigation map

Accessed from project dropdown → Settings:

| Section | Key features |
|---|---|
| **Project settings** | Name, subdomain, stats (messages/AI edits/credits used), category, Rename/Remix/Transfer/Unpublish/Delete |
| **Domains** | Free subdomain edit URL, custom domains (buy or connect, Pro) |
| **O's Lovable** | Workspace-level settings |
| **People** | Members, roles, per-member credit limits, access request approval, invite link, export CSV |
| **Plans & credits** | Current plan, daily/monthly credits, rollovers, top-up, plan comparison |
| **Cloud & AI balance** | Infrastructure usage: DB server 96%, network 3%, compute, storage, live updates |
| **Privacy & security** | 12 toggles: default visibility, MCP access, data opt-out, restrict invites, block publish with issues, require security scan, public preview links, cross-project sharing |
| **Account** | Level badge (L5 Diamond), LinkedIn, username, chat suggestions, generation sound, push notifications, linked accounts, 2FA |
| **Labs** | Experimental feature toggles |
| **Knowledge** | Project knowledge + Workspace knowledge text fields |
| **Connectors** | Shared: Cloud/GitHub/GitLab/Shopify/Stripe/Supabase/Aikido. Personal: Amplitude/Atlassian/Custom MCP |

---

## Replit studio — full navigation map

| Area | Key features |
|---|---|
| **Top nav** | Expand Agent, project name, Upgrade, Search (Cmd-K), Invite, Publish, Open library, Menu, Main version (branch selector), New task, Tools & Files, History, New chat |
| **Agent modes** | Lite / Autonomous Economy / Autonomous Power / Max |
| **Chat input** | Attach file, Select element, Plan mode toggle, Agent modes |
| **Menu** | Home, Recent projects, Settings, Notifications (badge), CLUI at /~/cli, Theme, Help, Logout |
| **Tools & Files** | Database, App Storage, Preview, Publishing, Integrations, Auth, Security Scanner, Secrets, Agent Skills, Analytics, Automations, Canvas, User Settings |
| **History panel** | Checkpoint timeline with AI descriptions, screenshots, "Rollback here", "Continue chat", session stats (1h 54m, 21 messages, 32 actions) |
| **Integrations** | Replit managed (DB/Storage/Auth/Domains auto-provisioned) + Git (GitHub/GitLab/Bitbucket, NOT accessible to Agent) |
| **Workflows** | Running processes, ports, elapsed time, Ask Agent per workflow |

---

## Bolt studio — full navigation map

| Area | Key features |
|---|---|
| **Top nav** | Home, project name, model selector (Sonnet 4.5), Select, Plan, chat input, Prompt actions, Preview, Code, Database-Connected, More Options, GitHub, Share, Publish |
| **Chat input** | "How can Bolt help you today? (or /command)" — slash command system |
| **Right panel tabs** | Files, Search |
| **Bottom panel tabs** | Bolt (dev server), Publish Output (deploy log), Terminal (interactive ~/project❯) |
| **Build flow** | Plan → numbered steps as buttons → "Thinking..." → step executes → tick → "Plan completed" + "Open details" |
| **Chat versioning** | "Version N at [timestamp]" inline per chat turn |
| **Database panel** | Tables section, "Ask Bolt to create/modify tables", inline table browser |
| **Share panel** | Invite by email (paid), "Learn more about sharing" |
| **Publish panel** | Auto security scan runs first, then Publish button activates |
| **Home** | Import from: Figma / GitHub / Team template / Design System |
| **Token counter** | "139K daily tokens remaining" + "Switch to Pro for 33x more usage" inline in chat |

---

## Base44 app dashboard — full navigation map

13-section dashboard per app:

| Section | Key features |
|---|---|
| **Overview** | App name, Open App, Share App (win credits), visibility (Public/Login/Invite), invite users, Move to Workspace, Hide platform badge |
| **Users** | Manage users + roles, Schema button, Invite User, Pending requests, Name/Role/Email table |
| **Data** | Entity list (e.g. Todo), inline data grid per entity (add/edit/delete rows) |
| **Analytics (Beta)** | Live visitors, "Publish to start collecting data" |
| **Social content (New)** | Generate social posts for app marketing |
| **Domains** | Custom domain management |
| **Integrations** | External service connections |
| **Security** | RLS per entity — "All users have full access" warning, Start Security Check, auto-fix |
| **Agents** | Enable AI agents toggle, describe agent role via chat, agent list |
| **Automations** | Active/Archived tabs, create automation from description (Builder+) |
| **Logs** | Event-level logs: app.entity.query, app.user.query, app.user.registered, app.created — with user + timestamp |
| **API** | Select entity + language → instant copy-paste code (JS/Python/cURL) |
| **Settings** | App-level settings |

---

## Sprint 2 recommendation

### Must-have for a compelling demo (P0)
1. **BEO-89** — Build log / activity feed (Base44-style real-time checklist)
2. **BEO-134** — Bolt-style chat animations (plan steps, spinners, gradient shimmer)
3. **BEO-129** — Plan steps as interactive buttons with live status
4. **BEO-130** — Built-in DB auto-provisioned + BYO Supabase upgrade path
5. **BEO-124** — App visibility toggle (public / login required / invite only)

### Strong competitive features (P1)
6. **BEO-67** — Visual edits (click any element)
7. **BEO-68** — Plan mode
8. **BEO-70** — Themes panel
9. **BEO-93** — Beomz Cloud panel (full 10-tab spec)
10. **BEO-110** — Select element in chat

### High-value but complex (P2)
11. **BEO-76** — Checkpoints + time travel
12. **BEO-104** — Checkpoint history with AI descriptions + screenshots
13. **BEO-103** — Element-pinned comments

---

## Infrastructure quick reference

| Resource | Detail |
|---|---|
| **Supabase beomz-studio** | srflynvdrsdazxvcxmzb · ap-southeast-1 |
| **Supabase beomz-user-data** | US-east-1 · DO NOT PAUSE |
| **Temporal** | namespace: quickstart-beomz-studio · AWS ap-southeast-1 |
| **Live site** | https://beomz.ai (Vercel) |
| **Monorepo** | ~/Desktop/beomz-studio · pnpm + Turborepo |
| **packages/kernel/** | 🔒 FROZEN — AI never modifies |
| **BEO-57 status** | Generation Engine — Codex running, not yet merged |
| **Migrations run** | 001_initial ✅ 002_generations ✅ 003_previews ✅ |

### Design tokens
```
background:  #060612
orange:      #F97316
purple:      #a855f7
cream:       #faf9f6
accent:      #e8580a
font:        DM Sans (Google Fonts CDN)
```

---

## Where to find things

| What | Where |
|---|---|
| All competitor issues | linear.app/beomz · BEO-67 to BEO-135 |
| Full feature pick-list | linear.app/beomz/issue/BEO-66 |
| Full Cloud panel spec | linear.app/beomz/issue/BEO-93 |
| Bolt animation spec | linear.app/beomz/issue/BEO-134 |
| Session transcript | /mnt/transcripts/2026-04-04-07-12-21-beomz-studio-v2-sprint2.txt |
| Session handover | /mnt/user-data/outputs/beomz-session-handover-apr4-2026.md |
