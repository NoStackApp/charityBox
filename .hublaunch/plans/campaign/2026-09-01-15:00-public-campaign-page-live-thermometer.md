# Public Campaign Page with Live Goal Thermometer

## Plan Summary

- **What/why**: Bootstraps the charityBox fundraising platform (Charidy-style, greenfield repo) and delivers its first feature — a public campaign page at `/c/[slug]` with a goal thermometer that climbs live via server-sent events (polling fallback), never moving backwards even under out-of-order delivery.
- **Key decisions**: Next.js (App Router, TypeScript) + Tailwind + Prisma + **Postgres** (not SQLite — Vercel's ephemeral filesystem cannot persist SQLite; a hosted Postgres like Neon/Vercel Postgres deploys cleanly). Monotonicity is enforced with a per-campaign `version` counter incremented in the same transaction as each donation insert; clients discard any snapshot whose `seq` is not greater than the last applied one. SSE snapshots are **absolute totals, not deltas**, so dropped/reconnected streams need no replay.
- **Most important files**: `prisma/schema.prisma`, `src/app/c/[slug]/page.tsx`, `src/app/api/campaigns/[slug]/stream/route.ts`, `src/hooks/useLiveCampaignStats.ts`.
- **Priority/complexity**: High priority, Medium complexity (greenfield scaffolding + one vertical feature slice).

## Problem Statement

charityBox is a new fundraising platform where organizations run short, high-intensity campaigns (typically 24 hours) toward a goal amount. This first PR delivers the public-facing campaign page: a viewer opens `/c/[slug]` and sees the campaign details and a thermometer that visibly climbs the moment a donation lands, without refreshing. The repository currently contains only a README — this PR also establishes the project's technical foundation.

### Planning Context

> **Note**: This section captures key points from the planning discussion to provide complete context for implementation.

**Key Requirements Discussed:**

- Route `/c/[slug]` renders one campaign: org name, title, story text, hero image, goal, amount raised, donor count, and a countdown to the deadline.
- Live updates via **server-sent events**, with **polling as fallback** if the stream drops.
- **The displayed total must never move backwards**, even if events arrive out of order: every update carries a sequence number; the client ignores anything older than what it already applied.
- Money is stored as **integers in minor units (cents)** — never floats. Seed campaign is USD.
- Two entities only: `Campaign` (slug, org name, title, story, goal amount, currency, deadline, timezone) and `Donation` (campaign, amount, donor name, anonymous flag, timestamp).
- No payment processing yet, so demo tooling is required: a seed script creating one sample campaign, **plus both** a CLI command and a dev-only HTTP endpoint that insert a fake donation.
- Deployment target is **Vercel** — this constrains SSE (per-connection duration caps; no shared memory between serverless instances) and rules out SQLite.

**Decisions Made:**

- **Next.js App Router (TypeScript)** over SvelteKit or a split Express+React setup: one deployable unit, native `/c/[slug]` routing, route handlers support streaming responses, first-class on Vercel.
- **Postgres via Prisma** over SQLite: SQLite files cannot persist on Vercel's read-only ephemeral filesystem. Dev uses local Postgres via Docker Compose (or a Neon branch); production uses Neon/Vercel Postgres. One schema everywhere.
- **Sequence number = per-campaign `version` column**, atomically incremented in the same DB transaction as each donation insert. Chosen over `MAX(donation.id)` because it is explicitly per-campaign, survives future non-insert mutations (refunds, corrections), and gives a single authoritative ordering point.
- **SSE handler polls the database internally** (every 2s) rather than using an in-process event emitter: on serverless, the instance handling the donation POST is not the instance holding the SSE connection, so in-memory pub/sub silently fails. DB polling inside the stream is the only correct serverless-safe approach without adding external pub/sub infrastructure (out of scope for this PR).
- **Snapshots are absolute** (`{ seq, totalMinor, donorCount }`), never deltas — reconnects and missed events self-heal on the next snapshot.
- Thermometer bar **caps at 100% visually**; the label shows the true percentage (e.g. "127% of goal").
- When the countdown reaches zero: show "Campaign ended"; the page stays live/read-only (stream keeps running).
- Hero image is a **static file committed to the repo** (an SVG placeholder), with its path stored on the Campaign row.
- Tailwind CSS for styling.
- Tests: unit tests for the core invariants (seq-discard logic, money formatting, percentage, countdown) + a manual demo checklist. No E2E in this PR.

**Out of Scope:**

- Payment processing (Stripe etc.), authentication, matching multipliers, ambassador leaderboards — all explicitly deferred to later PRs.
- Campaign listing/index pages, admin UI, campaign creation UI.
- External pub/sub (Redis, Pusher) for fan-out — DB polling suffices at this stage.
- E2E/browser tests.

### Background & Context

- **Why**: First vertical slice of the platform; the live thermometer is the emotional core of a Charidy-style campaign and must feel instant and trustworthy (never flickering downward).
- **Current state**: Greenfield repo — only `README.md` exists. No package.json, no framework, no database.
- **Who is affected**: Campaign viewers (public page) and the developer demoing the product.

**Current Behavior**:

- Nothing exists; the repo has a single initial commit.

**Desired Behavior**:

- `npm run dev` + `npm run db:seed` yields a working campaign at `http://localhost:3000/c/save-the-community-center`. Running `npm run donate` in another terminal makes the thermometer climb within ~2 seconds on the open page, with no refresh. Killing the SSE stream (e.g. dev server hiccup) degrades gracefully to polling and recovers.

## Detailed Requirements

### Functional Requirements

1. **Campaign page (`/c/[slug]`)**

   - Server-rendered initial state (campaign fields + current totals) so the page is meaningful without JavaScript and has no zero-flash.
   - Displays: org name, title, story (multi-paragraph text), hero image, goal, total raised, donor count, live countdown (days/hours/minutes/seconds) to the deadline.
   - Deadline is displayed formatted in the campaign's own IANA timezone (e.g. "Ends Sep 2, 2026, 6:00 PM EDT") via `Intl.DateTimeFormat` with the `timeZone` option; the countdown itself is computed from the absolute UTC instant.
   - Unknown slug → Next.js `notFound()` → 404 page.
   - Edge case: goal of 0 must not divide by zero — treat percentage as 100 if any money raised, else 0 (guard in the percentage helper).

2. **Live thermometer**

   - Vertical or horizontal bar (implementer's choice; horizontal recommended for responsive layouts) whose fill animates smoothly (CSS `transition` on width/height, ~600ms ease-out) whenever the total changes.
   - Fill percentage = `min(100, floor(totalMinor / goalMinor * 100))`; the label shows the uncapped percentage.
   - Accessible: `role="progressbar"`, `aria-valuenow` (uncapped %), `aria-valuemin=0`, `aria-valuemax=100` capped visual, plus visible text of raised/goal amounts.

3. **Live update transport**

   - Primary: SSE from `GET /api/campaigns/[slug]/stream`. Events are `data: {"seq":N,"totalMinor":N,"donorCount":N}\n\n`.
   - The stream sends the current snapshot immediately on connect, then re-checks the DB every 2 seconds and emits **only when `seq` changed**; a heartbeat comment line (`: ping\n\n`) every 15 seconds keeps proxies from idling out the connection.
   - The stream self-closes cleanly after ~55 seconds (under Vercel's function duration cap); the browser's native `EventSource` auto-reconnects. Because snapshots are absolute, reconnection needs no `Last-Event-ID` replay.
   - Fallback: if `EventSource` fires `error`, the client starts polling `GET /api/campaigns/[slug]/snapshot` every 5 seconds while `EventSource` keeps trying to reconnect; polling stops on the next successful `open`.
   - **Monotonicity invariant (critical)**: the client keeps the highest `seq` applied so far (initialized from the server-rendered snapshot) and discards any incoming snapshot — from SSE *or* polling — whose `seq` is `<=` the current one. The displayed total therefore never decreases.

4. **Data model**

   - `Campaign`: id, slug (unique), orgName, title, story, heroImagePath, goalMinor (Int), currency (ISO 4217 string, default "USD"), deadline (DateTime, UTC), timezone (IANA string), version (Int, the seq counter), createdAt.
   - `Donation`: id (autoincrement Int), campaignId (FK), amountMinor (Int), donorName (nullable String), anonymous (Boolean, default false), createdAt.
   - All money fields are integers in minor units. **Never floats.** Sums use Postgres bigint, converted to JS `number` (safe: campaign totals stay far below 2^53).

5. **Donation write path (shared by CLI + dev endpoint; future payment webhooks will reuse it)**

   - `createDonation({ slug, amountMinor, donorName, anonymous })` in `src/lib/donations.ts`:
     - Validates `amountMinor` is a positive integer.
     - In a single `prisma.$transaction`: insert the `Donation` row and `UPDATE "Campaign" SET version = version + 1` for that campaign.
   - Consistent snapshot read in `src/lib/campaignStats.ts` via **one** SQL statement (a single statement sees one MVCC snapshot in Postgres, so `version`, sum, and count are mutually consistent):

     ```sql
     SELECT c."version" AS seq,
            COALESCE(SUM(d."amountMinor"), 0)::bigint AS "totalMinor",
            COUNT(d.id)::int AS "donorCount"
     FROM "Campaign" c
     LEFT JOIN "Donation" d ON d."campaignId" = c.id
     WHERE c."slug" = $1
     GROUP BY c.id;
     ```

6. **Demo tooling**

   - `prisma/seed.ts`: creates one campaign — slug `save-the-community-center`, orgName "Beit Chesed Community Center", title "Save the Community Center", a 3-paragraph story, goal $100,000 (`goalMinor: 10_000_000`), currency "USD", deadline = 24 hours after seed time, timezone "America/New_York", heroImagePath "/images/hero-sample.svg". Idempotent via `upsert` on slug.
   - `scripts/donate.ts` (run with `tsx`): `npm run donate -- [--slug <slug>] [--amount <dollars>] [--name <name>] [--anonymous]`. Defaults: slug `save-the-community-center`, random amount between $10 and $500 (whole cents), random name from a small built-in list. `--amount` accepts dollars with optional decimals and converts to integer cents (`Math.round(parseFloat(v) * 100)` with NaN/≤0 rejection). Prints the inserted donation and the new campaign total.
   - `POST /api/dev/donate`: JSON body `{ slug, amountMinor?, donorName?, anonymous? }` with the same defaults as the CLI. **Enabled only when `process.env.ALLOW_FAKE_DONATIONS === "true"`; otherwise responds 404** (so it can be switched on for a Vercel demo via env var but is dead by default). Returns `{ ok: true, donation, snapshot }`.

### Technical Requirements

- **Technology**: Next.js 15+ (App Router), TypeScript strict, Tailwind CSS, Prisma ORM, PostgreSQL, `tsx` for scripts, Vitest for unit tests.
- **Location**: All app code under `src/` (`src/app`, `src/components`, `src/hooks`, `src/lib`); Prisma under `prisma/`; scripts under `scripts/`; static image under `public/images/`.
- **Runtime constraints**: SSE and snapshot route handlers must declare `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`; the stream route also sets `export const maxDuration = 60`.
- **Dependencies**: nothing beyond the mainstream packages listed in Technical Considerations.

### Non-Functional Requirements

- **Performance**: donation-to-pixel latency ≤ ~2.5s via SSE (2s DB poll inside the stream); page server-render does one DB round trip for campaign + one for the snapshot (or a single joined query).
- **Security**: dev donate endpoint gated behind `ALLOW_FAKE_DONATIONS`; donor names rendered as text (React escapes by default — no `dangerouslySetInnerHTML` anywhere); amount validation server-side; no secrets in the repo (`.env` must be added to `.gitignore` — it currently is **not** ignored and exists locally; do NOT commit it).
- **Backwards Compatibility**: n/a (greenfield).
- **Error Handling**: unknown slug → 404 on page and API routes; malformed dev-donate body → 400 with `{ error: string }`; CLI prints a clear message and exits non-zero on bad args or unknown slug.

## Proposed Solution

**High-level approach**: Scaffold a Next.js + Prisma + Postgres app. Server-render the campaign page with a consistent `{seq,total,count}` snapshot, then hydrate a client hook that subscribes to an SSE stream (DB-polling loop inside the route handler — serverless-safe) and falls back to HTTP polling. A per-campaign `version` counter bumped transactionally with every donation is the sequence number; the client's apply-only-if-newer rule guarantees the thermometer never moves backwards.

```
 npm run donate ──▶ scripts/donate.ts ─┐
 POST /api/dev/donate ─────────────────┼──▶ lib/donations.createDonation()
                                       │      └─ TX: insert Donation
                                       │             + Campaign.version++
                                       ▼
                                  Postgres ◀───────────────┐
                                       ▲                   │ (2s poll,
                                       │ (1 joined query)  │  emit if seq
        /c/[slug] page.tsx ────────────┘                   │  changed)
              │  initial snapshot           /api/.../stream (SSE)
              ▼                                   │
     useLiveCampaignStats ◀───────────────────────┘
        │   ▲  discard if seq <= current
        │   └── fallback: poll /api/.../snapshot every 5s
        ▼
   <Thermometer/> <Countdown/> (client components)
```

### Key Components

1. **Prisma schema + client singleton** (`prisma/schema.prisma`, `src/lib/db.ts`)

   - Defines `Campaign`/`Donation`; `src/lib/db.ts` exports a `PrismaClient` singleton using the standard `globalThis` caching pattern so Next.js dev hot-reload doesn't exhaust connections.

2. **Stats + donation domain logic** (`src/lib/campaignStats.ts`, `src/lib/donations.ts`, `src/lib/money.ts`)

   - `getSnapshot(slug)` — the single consistent joined query above, returning `{ seq, totalMinor, donorCount } | null`.
   - `createDonation(...)` — transactional insert + version bump.
   - `money.ts` — `formatMoney(minor: number, currency: string): string` using `Intl.NumberFormat` (`{ style: "currency", currency }`, divide by 100 only at format time), and `percentRaised(totalMinor, goalMinor): number` (uncapped, integer, 0 when goal is 0 and total is 0, 100 when goal is 0 and total > 0).

3. **Campaign page** (`src/app/c/[slug]/page.tsx` — server component)

   - Loads campaign by slug + initial snapshot; `notFound()` if missing; renders layout (hero image via `next/image` with the static path, org name, title, story paragraphs) and mounts `<LiveCampaignDashboard initial={...} />` (client component) with the serialized campaign display fields + initial snapshot.

4. **Live client layer** (`src/hooks/useLiveCampaignStats.ts`, `src/components/LiveCampaignDashboard.tsx`, `src/components/Thermometer.tsx`, `src/components/Countdown.tsx`)

   - The hook owns the transport state machine and exposes `{ totalMinor, donorCount, connection: "sse" | "polling" }`. Core reducer `applySnapshot(prev, next)` returns `prev` unless `next.seq > prev.seq` — this pure function is the unit-test target for the monotonicity invariant.
   - `Countdown` ticks every second with `setInterval`, computes remaining time from `deadline` (ISO string prop), renders "Campaign ended" at ≤ 0. To avoid hydration mismatch, render a stable placeholder until mounted (`useEffect`-gated).

5. **API routes** (`src/app/api/campaigns/[slug]/stream/route.ts`, `.../snapshot/route.ts`, `src/app/api/dev/donate/route.ts`)

   - Stream: `ReadableStream` + `TextEncoder`; emit initial snapshot, then loop `{ sleep 2s; getSnapshot; if seq > lastSent emit }`, heartbeat every 15s, `controller.close()` at ~55s or on `request.signal` abort. Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`.

### Files Likely to Change

All files are new (greenfield). The complete set:

- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind` setup, `vitest.config.ts`, `docker-compose.yml`, `.env.example`, `.gitignore` (extend existing), `README.md` (extend existing)
- `prisma/schema.prisma`, `prisma/seed.ts`
- `src/lib/db.ts`, `src/lib/money.ts`, `src/lib/campaignStats.ts`, `src/lib/donations.ts`
- `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (minimal landing linking to the seeded campaign), `src/app/c/[slug]/page.tsx`
- `src/app/api/campaigns/[slug]/stream/route.ts`, `src/app/api/campaigns/[slug]/snapshot/route.ts`, `src/app/api/dev/donate/route.ts`
- `src/hooks/useLiveCampaignStats.ts`
- `src/components/LiveCampaignDashboard.tsx`, `src/components/Thermometer.tsx`, `src/components/Countdown.tsx`
- `scripts/donate.ts`
- `public/images/hero-sample.svg` (authored gradient/scene placeholder SVG, ~16:9)
- `src/lib/__tests__/money.test.ts`, `src/hooks/__tests__/applySnapshot.test.ts`, `src/components/__tests__/countdown.test.ts` (or colocated per Vitest convention)

### Code Patterns to Follow

> The repository is greenfield — there are no internal patterns to reference. Follow these ecosystem-standard patterns instead:

- **Prisma singleton for Next.js dev**: the documented `globalThis.prisma ?? new PrismaClient()` pattern (prevents connection exhaustion under hot reload).
- **SSE in an App Router route handler**: return `new Response(new ReadableStream({...}), { headers: { "Content-Type": "text/event-stream", ... } })` with `runtime = "nodejs"`, `dynamic = "force-dynamic"`. Always wire `request.signal.addEventListener("abort", ...)` to stop the loop and close the controller, or the handler leaks timers.
- **Seed wiring**: `"prisma": { "seed": "tsx prisma/seed.ts" }` in `package.json` so `prisma db seed` and `migrate reset` both work.

**Anti-Patterns to Avoid:**

- **No floats for money, ever** — no `parseFloat` on stored values, no `amount / 100` stored anywhere; division by 100 happens only inside `formatMoney` at render time. The only float→int conversion is CLI dollar input, immediately `Math.round`ed to cents.
- **No in-memory event emitter for donation fan-out** — it will appear to work in `next dev` (single process) and silently break on Vercel (separate instances). The SSE loop must read the DB.
- **No client-side `seq` reset** — never re-initialize the seq from a polling response unconditionally; always go through `applySnapshot`.
- **No `Edge` runtime for the Prisma-touching routes** — Prisma requires the Node runtime here.
- **Do not commit `.env`** — it exists locally and is currently NOT in `.gitignore`; add it in this PR.

## Implementation Steps

#### Phase 1: Project Scaffolding

- [ ] Initialize Next.js in the repo root: TypeScript, App Router, Tailwind, `src/` directory, no ESLint conflicts with defaults (accept `create-next-app` defaults; if scaffolding into the non-empty repo is awkward, scaffold in a temp dir and move files in, preserving the existing `README.md` heading and `.hublaunch/`, `.agents/`, `.claude/`, `.vscode/` directories untouched).
- [ ] Extend `.gitignore`: add `.env`, `node_modules/`, `.next/`, keep the existing HubLaunch entries.
- [ ] Add `docker-compose.yml` with a `postgres:16` service (port 5432, user/password/db `charitybox`, named volume).
- [ ] Create `.env.example` with `DATABASE_URL="postgresql://charitybox:charitybox@localhost:5432/charitybox"` and `ALLOW_FAKE_DONATIONS="true"`, plus a comment pointing Vercel deploys at Neon/Vercel Postgres.
- [ ] Install deps: `prisma`, `@prisma/client`, `tsx`, `vitest`, `@vitest/coverage-v8` (dev). Add scripts: `db:up` (docker compose up -d), `db:migrate` (prisma migrate dev), `db:seed` (prisma db seed), `donate` (tsx scripts/donate.ts), `test` (vitest run).

#### Phase 2: Data Layer

- [ ] Write `prisma/schema.prisma` with the `Campaign` and `Donation` models exactly as specified in Detailed Requirements §4 (including `version Int @default(0)`, `@@index([campaignId])` on Donation, `slug @unique`).
- [ ] Run `prisma migrate dev --name init` to generate the initial migration (commit the migration folder).
- [ ] Implement `src/lib/db.ts` (Prisma singleton).
- [ ] Implement `src/lib/money.ts` (`formatMoney`, `percentRaised` with the goal-0 guard).
- [ ] Implement `src/lib/campaignStats.ts` (`getSnapshot(slug)` via the single joined raw query from Detailed Requirements §5; convert bigint → number).
- [ ] Implement `src/lib/donations.ts` (`createDonation` — validation + transaction: insert donation, increment `Campaign.version`; throws a typed `CampaignNotFoundError` for unknown slug).
- [ ] Write `prisma/seed.ts` (upsert the sample campaign per Detailed Requirements §6) and wire the `prisma.seed` field in `package.json`.

#### Phase 3: API Routes

- [ ] `src/app/api/campaigns/[slug]/snapshot/route.ts` — GET returns `getSnapshot` JSON or 404; `dynamic = "force-dynamic"`, `runtime = "nodejs"`.
- [ ] `src/app/api/campaigns/[slug]/stream/route.ts` — SSE handler per Key Components §5: initial emit, 2s DB re-check loop emitting only on seq change, 15s heartbeats, ~55s graceful close, abort-signal cleanup, `maxDuration = 60`.
- [ ] `src/app/api/dev/donate/route.ts` — POST guarded by `ALLOW_FAKE_DONATIONS === "true"` (404 otherwise); validates body; calls `createDonation`; returns donation + fresh snapshot.

#### Phase 4: Campaign Page UI

- [ ] Author `public/images/hero-sample.svg` — a pleasant 1600×900 gradient placeholder with simple shapes (no external assets).
- [ ] `src/app/c/[slug]/page.tsx` — server component: fetch campaign + snapshot, `notFound()` on miss, render hero/org/title/story and mount the client dashboard with initial data (pass `deadline` as ISO string, money as minor-unit numbers).
- [ ] `src/hooks/useLiveCampaignStats.ts` — pure `applySnapshot` reducer (exported for tests) + EventSource lifecycle + 5s polling fallback on `error`, polling cancelled on `open`; cleanup on unmount.
- [ ] `src/components/Thermometer.tsx` — animated capped bar + uncapped percentage label + raised/goal amounts via `formatMoney`; progressbar ARIA attributes.
- [ ] `src/components/Countdown.tsx` — 1s tick, D/H/M/S display, "Campaign ended" at zero, hydration-safe mounting, deadline date line formatted in the campaign's timezone.
- [ ] `src/components/LiveCampaignDashboard.tsx` — composes hook + Thermometer + Countdown + donor count; subtle indicator when in polling fallback mode (e.g. small "reconnecting…" text).
- [ ] `src/app/page.tsx` — minimal landing page linking to `/c/save-the-community-center`.

#### Phase 5: Demo CLI

- [ ] `scripts/donate.ts` — arg parsing (`--slug`, `--amount` in dollars → integer cents via `Math.round(parseFloat(v)*100)` with validation, `--name`, `--anonymous`), random defaults, calls `createDonation` directly (imports `src/lib/donations.ts`), prints result + new total, exits non-zero with a clear message on bad input/unknown slug.

#### Phase 6: Tests & Docs

- [ ] Unit tests (Vitest): `applySnapshot` (newer seq applies; equal/older seq discarded — including a higher-total-lower-seq snapshot; initial state passthrough), `formatMoney` (USD cents → "$1,234.56"), `percentRaised` (normal, over-goal, zero-goal), countdown remaining-time math ("ended" at/after deadline).
- [ ] Update `README.md`: prerequisites (Node 20+, Docker), setup steps (`npm i`, `npm run db:up`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`), demo instructions (`npm run donate`, curl example for the dev endpoint), env var table, Vercel deployment notes (Neon `DATABASE_URL`, `ALLOW_FAKE_DONATIONS` optional, SSE duration-cap behavior).
- [ ] Run the full manual testing checklist (section 8) before opening the PR.

<details>
<summary><b>Implementation Detail</b></summary>

### 6. Edge Cases & Considerations

#### Edge Cases to Handle

1. **Out-of-order snapshot delivery**: A polling response computed before an SSE event may arrive after it. `applySnapshot` discards it (`seq <=` current). The total never regresses.
2. **SSE stream drops (network, Vercel duration cap, dev-server restart)**: `EventSource` auto-reconnects; polling fallback covers the gap; absolute snapshots mean nothing is missed permanently.
3. **Campaign with zero donations**: snapshot query's `LEFT JOIN` + `COALESCE` returns `{ seq: 0, totalMinor: 0, donorCount: 0 }` — page renders $0 / 0 donors correctly.
4. **Total exceeds goal**: bar caps at 100% width; label shows real percentage (e.g. "127% of goal").
5. **Deadline passes while page is open**: countdown flips to "Campaign ended" on its next 1s tick; stream stays connected (donations may still arrive and display).
6. **Goal of 0** (data-entry edge): `percentRaised` guards division by zero (0% if nothing raised, 100% otherwise).
7. **Unknown slug**: page → 404 via `notFound()`; snapshot/stream routes → HTTP 404; CLI → error message + non-zero exit.
8. **Anonymous donations**: `anonymous: true` donations count toward total and donor count; `donorName` is stored but must never be rendered for them (no donor list is rendered in this PR at all, but the flag semantics are established now).
9. **Tab backgrounded for a long time**: on reconnect/next poll the absolute snapshot brings the page current in one hop.

#### Potential Challenges

- ⚠️ **Vercel SSE duration cap**: streams cannot outlive `maxDuration`. Mitigated by the ~55s graceful close + `EventSource` auto-reconnect + absolute snapshots. Do not attempt to raise `maxDuration` beyond plan limits.
- ⚠️ **Serverless instance isolation**: the SSE loop MUST read the DB (2s interval); any in-memory pub/sub is a trap that only works locally. This is stated in Anti-Patterns and repeated here because it is the most likely silent failure.
- ⚠️ **Hydration mismatch in Countdown**: computing remaining time during SSR vs client causes React hydration warnings; gate the live numbers behind a mounted flag.
- ⚠️ **Scaffolding into a non-empty repo**: `create-next-app` may refuse a non-empty directory; scaffold in a temp dir and move files in, preserving `README.md` content, `.hublaunch/`, `.agents/`, `.claude/`, `.vscode/`, `.gitignore` entries, and the untracked local `.env`.

#### Security Considerations

- Dev donate endpoint returns 404 unless `ALLOW_FAKE_DONATIONS === "true"` — never enabled implicitly by `NODE_ENV`.
- Server-side validation on all donation inputs (positive integer minor units; name length ≤ 100 chars trimmed).
- React's default escaping for all user-provided strings; no `dangerouslySetInnerHTML`.
- `.env` (contains `DATABASE_URL`) added to `.gitignore`; only `.env.example` is committed.
- No PII beyond an optional donor display name; anonymous flag respected in all rendering.

### 7. Technical Considerations

#### Dependencies

- `next@^15` / `react@^19` / `react-dom@^19` — framework (App Router, streaming route handlers).
- `prisma@^6` + `@prisma/client@^6` — ORM + migrations.
- `tailwindcss@^4` (+ postcss wiring per create-next-app) — styling.
- `tsx@^4` (dev) — runs TypeScript seed/CLI scripts.
- `vitest@^3` (dev) — unit tests.
- `typescript@^5` (dev), `@types/node`, `@types/react` — types.

#### Configuration Changes

- New `package.json` scripts: `db:up`, `db:migrate`, `db:seed`, `donate`, `test` (plus standard `dev`/`build`/`start`).
- `prisma.seed` field in `package.json` → `tsx prisma/seed.ts`.

#### Environment Variables

- `DATABASE_URL` — Postgres connection string. Local: the docker-compose instance. Vercel: a Neon / Vercel Postgres pooled connection string.
- `ALLOW_FAKE_DONATIONS` — `"true"` enables `POST /api/dev/donate`; anything else (or unset) → endpoint 404s.

#### API Rate Limiting

- None required for this PR: the SSE loop is 1 DB query / 2s / open connection, and polling fallback is 1 query / 5s / client. Acceptable at demo scale; revisit with external pub/sub when real traffic arrives.

#### Error Handling Strategies

- Domain functions throw typed errors (`CampaignNotFoundError`, `InvalidDonationError`); route handlers map them to 404/400 JSON bodies `{ error: string }`.
- SSE loop wraps its DB call in try/catch — on query failure it skips the tick (keeps the stream alive) rather than crashing the stream.
- CLI catches all errors and prints an actionable message (e.g. `Campaign "x" not found. Did you run: npm run db:seed?`).

### 8. Testing Requirements

#### Unit Tests

- [ ] `applySnapshot`: applies strictly-newer seq; discards equal seq; discards older seq even when its total is higher; works from the initial server-rendered state.
- [ ] `formatMoney`: `formatMoney(123456, "USD") === "$1,234.56"`; zero; large values.
- [ ] `percentRaised`: under goal, exactly goal (100), over goal (uncapped, e.g. 127), zero-goal guard.
- [ ] Countdown math: remaining D/H/M/S from fixed timestamps; "ended" at and after deadline (use `vi.setSystemTime`).
- [ ] `createDonation` validation: rejects 0, negative, and non-integer amounts (pure validation portion; DB-touching path covered manually).

#### Integration Tests

- None in this PR — deliberately deferred to keep the first PR lean; the transactional insert+version-bump and the SSE flow are covered by the manual checklist below, and E2E/browser tests are planned for a later PR.

#### Manual Testing Checklist

1. **Setup**: `npm i` → `npm run db:up` → `npm run db:migrate` → `npm run db:seed` → `npm run dev`.
2. **Page render**: open `http://localhost:3000/c/save-the-community-center` — expected: hero image, org name, title, story, $0 raised of $100,000, 0 donors, live countdown ticking.
3. **Live thermometer**: run `npm run donate` in a second terminal — expected: within ~2.5s the total, donor count, bar fill, and percentage update with a smooth animation, **no refresh**.
4. **Dev endpoint**: `curl -X POST localhost:3000/api/dev/donate -H 'content-type: application/json' -d '{"slug":"save-the-community-center","amountMinor":18000,"donorName":"Chai Donor"}'` — expected: 200 with donation + snapshot; page updates live.
5. **Fallback**: with the page open, stop the dev server for ~10s and restart — expected: page shows the reconnecting indicator, then recovers and displays the correct total (never having moved backwards). Donate while disconnected; total catches up after recovery.
6. **Monotonicity spot-check**: fire 5 rapid `npm run donate` calls in a loop — expected: displayed total only ever increases, ending at the exact DB sum.
7. **404**: open `/c/nope` — expected: 404 page.
8. **Guard**: unset `ALLOW_FAKE_DONATIONS` (restart dev server) and repeat the curl — expected: 404.
9. **Over-goal**: donate past $100,000 (e.g. `npm run donate -- --amount 120000`) — expected: bar full at 100%, label shows >100%.

#### Test Data Requirements

- Seeded campaign from `prisma/seed.ts` (idempotent upsert).
- Fake-donation defaults built into `scripts/donate.ts` (random $10–$500, name list).

### 9. Documentation Updates

#### User-Facing Documentation

- [ ] `README.md`: project description, prerequisites, full local setup + demo walkthrough (all commands from the manual checklist), env var table (`DATABASE_URL`, `ALLOW_FAKE_DONATIONS`), Vercel deployment section (Neon/Vercel Postgres, env vars, note on SSE reconnect behavior under function duration caps).

#### Code Documentation

- [ ] JSDoc on all exported functions in `src/lib/` and the hook (notably: `applySnapshot`'s monotonicity contract, `getSnapshot`'s single-statement consistency rationale, why the SSE loop polls the DB).
- [ ] Comment in the stream route stating the serverless constraint (no in-memory pub/sub) so future contributors don't "optimize" it away.

#### Examples to Include

```bash
# One-time setup
npm install && npm run db:up && npm run db:migrate && npm run db:seed

# Run the app
npm run dev            # → http://localhost:3000/c/save-the-community-center

# Watch the thermometer move
npm run donate                              # random donation
npm run donate -- --amount 180 --name "Sarah"
npm run donate -- --amount 36 --anonymous
```

### 10. Acceptance Criteria

- [ ] **AC1**: `GET /c/save-the-community-center` server-renders org name, title, story, hero image, goal, total raised, donor count, and a ticking countdown; unknown slugs return 404.
- [ ] **AC2**: Inserting a donation (CLI or dev endpoint) updates the open page's total, donor count, bar fill, and percentage within ~2.5 seconds with no page refresh.
- [ ] **AC3**: The displayed total never decreases: `applySnapshot` unit tests pass, including the discard-older-seq cases, and the rapid-donation manual check (checklist #6) shows a strictly non-decreasing total.
- [ ] **AC4**: Killing and restoring the SSE source (checklist #5) triggers the polling fallback and full recovery to the correct total.
- [ ] **AC5**: All money is stored/transported as integer minor units; `grep` finds no float money arithmetic outside the CLI's dollar-input conversion and `formatMoney`'s render-time division.
- [ ] **AC6**: `npm run db:seed` is idempotent; `npm run donate` works with zero flags; `POST /api/dev/donate` 404s unless `ALLOW_FAKE_DONATIONS="true"`.
- [ ] **AC7**: `npm run test` passes; `npm run build` succeeds; README documents the full setup/demo flow.
- [ ] **AC8**: Thermometer caps visually at 100% while the label shows the true percentage; countdown shows "Campaign ended" at/after the deadline.

#### Definition of Done

- All acceptance criteria met; unit tests and build green; manual checklist executed; README updated; `.env` ignored and never committed; no payments/auth/multipliers/leaderboards code introduced.

### 11. Dependencies & Related Work

#### Dependencies

- [ ] Required external setup (local dev): Docker (for the Postgres container) or any reachable Postgres 14+ instance.
- [ ] Required external setup (deploy, optional for this PR): a Neon / Vercel Postgres database and its `DATABASE_URL` set in Vercel project settings.

#### Blockers

- [ ] None — greenfield.

#### Related Issues/PRs

- First feature PR of the charityBox platform. Future planned work (separate PRs): payment processing, authentication, matching multipliers, ambassador leaderboards, external pub/sub for SSE fan-out at scale.

</details>

---

**Priority**: High · **Complexity**: Medium
