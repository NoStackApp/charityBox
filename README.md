# charityBox

A fundraising platform where organizations run short, high-intensity campaigns
(typically 24 hours) toward a goal amount. This first slice delivers the public
campaign page at `/c/[slug]` with a **live goal thermometer** that climbs the moment a
donation lands — via Server-Sent Events, with HTTP polling as a fallback — and that
**never moves backwards**, even if updates arrive out of order.

## Tech Stack

- **Next.js 16** (App Router, TypeScript strict) — one deployable unit, native routing,
  streaming route handlers, first-class on Vercel.
- **Prisma + PostgreSQL** — SQLite cannot persist on Vercel's ephemeral filesystem, so
  Postgres is used everywhere (Docker locally, Neon / Vercel Postgres in production).
- **Tailwind CSS v4** — styling.
- **Vitest** — unit tests for the core invariants.
- **tsx** — runs the TypeScript seed and CLI scripts.

## How it stays live and monotonic

- Every donation is inserted in a single transaction that also bumps a per-campaign
  `version` counter. That counter is the **sequence number** (`seq`).
- Snapshots are **absolute** — `{ seq, totalMinor, donorCount }`, never deltas — so a
  dropped or reconnected stream self-heals on the next snapshot with no replay.
- The SSE route **polls the database every 2s** (not an in-memory event emitter): on
  serverless the instance handling a donation POST is not the instance holding the SSE
  connection, so in-process pub/sub would silently fail.
- The client keeps the highest `seq` it has applied and **discards any snapshot with a
  `seq <=` that value**, from SSE *or* polling. The displayed total therefore never
  decreases.
- Money is stored and transported as **integer minor units (cents)** — never floats.
  Division by 100 happens only at render time inside `formatMoney`.

## Prerequisites

- **Node.js 20+**
- **Docker** (for the local Postgres container) — or any reachable PostgreSQL 14+
  instance, in which case set `DATABASE_URL` to point at it and skip `npm run db:up`.

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env         # adjust DATABASE_URL if not using the docker default

# 3. Start Postgres (docker-compose)
npm run db:up

# 4. Create the schema and seed the sample campaign
npm run db:migrate           # applies migrations (prisma migrate dev)
npm run db:seed              # idempotent upsert of the sample campaign

# 5. Run the app
npm run dev                  # → http://localhost:3000
```

Then open **http://localhost:3000/c/save-the-community-center**.

> Not using Docker? Point `DATABASE_URL` at any Postgres 14+ database and run steps 4–5.

## Watch the thermometer move

In a second terminal, insert fake donations (no payment processing exists yet):

```bash
npm run donate                              # random $10–$500 donation, random name
npm run donate -- --amount 180 --name "Sarah"
npm run donate -- --amount 36 --anonymous
npm run donate -- --amount 120000           # push past the goal (bar caps, label > 100%)
```

Each donation appears on any open campaign page within ~2 seconds, with no refresh.

You can also drive the dev-only HTTP endpoint (enabled by `ALLOW_FAKE_DONATIONS`):

```bash
curl -X POST localhost:3000/api/dev/donate \
  -H 'content-type: application/json' \
  -d '{"slug":"save-the-community-center","amountMinor":18000,"donorName":"Chai Donor"}'
# → { "ok": true, "donation": {...}, "snapshot": { "seq": N, "totalMinor": N, "donorCount": N } }
```

`amountMinor` is in **cents**. Body fields are all optional (defaults match the CLI).

## Scripts

| Script               | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | Start the Next.js dev server.                            |
| `npm run build`      | Production build.                                        |
| `npm run start`      | Start the production server (after `build`).             |
| `npm run db:up`      | Start the docker-compose Postgres container.             |
| `npm run db:migrate` | Apply Prisma migrations (`prisma migrate dev`).          |
| `npm run db:seed`    | Seed / re-seed the sample campaign (idempotent).         |
| `npm run donate`     | Insert a fake donation (see flags above).                |
| `npm run test`       | Run the Vitest unit tests.                               |
| `npm run typecheck`  | Type-check with `tsc --noEmit`.                          |

## Environment variables

| Variable               | Required | Description                                                                                          |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Yes      | Postgres connection string. Local: the docker-compose instance. Prod: a Neon / Vercel Postgres URL.  |
| `ALLOW_FAKE_DONATIONS` | No       | Set to the exact string `"true"` to enable `POST /api/dev/donate`. Anything else (or unset) → 404.   |

`.env` (which holds `DATABASE_URL`) is **git-ignored and must never be committed** —
only `.env.example` is tracked.

## Deploying to Vercel

1. Provision a **Neon** or **Vercel Postgres** database and copy its pooled connection
   string into the Vercel project's `DATABASE_URL` environment variable.
2. Run migrations against that database (e.g. `DATABASE_URL=… npx prisma migrate deploy`).
3. Optionally set `ALLOW_FAKE_DONATIONS="true"` to demo live donations via the dev
   endpoint. Leave it unset in a real deployment.
4. **SSE under function duration caps**: each stream self-closes at ~55s (under Vercel's
   duration limit); the browser's native `EventSource` auto-reconnects, and because
   snapshots are absolute, nothing is missed across the reconnect. The polling fallback
   covers any gap. No external pub/sub (Redis/Pusher) is needed at this stage.

## Testing

```bash
npm run test
```

Unit tests cover the core invariants: the `applySnapshot` monotonicity reducer
(newer `seq` applies; equal/older discarded, even when the stale total is higher),
money formatting, percentage (including the goal-of-0 guard and over-goal), the
countdown remaining-time math, and donation amount validation.

## Project structure

```
prisma/
  schema.prisma            # Campaign + Donation models; version = seq counter
  seed.ts                  # idempotent sample-campaign upsert
scripts/
  donate.ts                # demo CLI (uses the shared createDonation write path)
public/images/
  hero-sample.svg          # committed placeholder hero image
src/
  app/
    page.tsx               # minimal landing page
    c/[slug]/page.tsx      # public campaign page (server component)
    api/campaigns/[slug]/stream/route.ts    # SSE (DB-polling, serverless-safe)
    api/campaigns/[slug]/snapshot/route.ts  # polling-fallback snapshot
    api/dev/donate/route.ts                 # dev-only fake donation endpoint
  components/              # Thermometer, Countdown, LiveCampaignDashboard
  hooks/useLiveCampaignStats.ts             # SSE/polling state machine + applySnapshot
  lib/                     # db, money, campaignStats, donations, countdown helpers
```

## Out of scope (future PRs)

Payment processing, authentication, matching multipliers, ambassador leaderboards,
campaign listing/admin UIs, and external pub/sub for SSE fan-out at scale.
