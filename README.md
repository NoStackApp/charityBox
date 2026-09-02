# charityBox

A fundraising platform where organizations run short, high-intensity campaigns
(typically 24 hours) toward a goal amount. This first slice delivers the public
campaign page at `/c/[slug]` with a **live goal thermometer** that climbs the moment a
donation lands — via Server-Sent Events, with HTTP polling as a fallback — and that
**never moves backwards**, even if updates arrive out of order.

## Tech Stack

This is a [T3 Stack](https://create.t3.gg/) project (structured as `create-t3-app`
lays it out):

- **Next.js 16** (App Router, TypeScript strict) — one deployable unit, native routing,
  streaming route handlers, first-class on Vercel.
- **tRPC v11** — end-to-end typesafe API (`campaign.snapshot` powers the polling
  fallback); the SSE transport stays a plain route handler.
- **Clerk** — authentication (`clerkMiddleware` in `src/proxy.ts`, modal sign-in/up in
  the header, hosted pages at `/sign-in` and `/sign-up`, and a tRPC
  `protectedProcedure` for future authenticated routers). No routes are gated yet.
- **Prisma + PostgreSQL** — SQLite cannot persist on Vercel's ephemeral filesystem, so
  Postgres is used everywhere (Docker locally, Neon / Vercel Postgres in production).
- **@t3-oss/env-nextjs + Zod** — env vars are validated at build/boot in `src/env.js`.
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
# 1. Install dependencies (also runs `prisma generate` via postinstall)
pnpm install

# 2. Configure environment
cp .env.example .env         # adjust DATABASE_URL if not using the docker default

# 3. Start Postgres (docker-compose)
pnpm db:up

# 4. Create the schema and seed the sample campaign
pnpm db:generate             # applies migrations (prisma migrate dev)
pnpm db:seed                 # idempotent upsert of the sample campaign

# 5. Run the app
pnpm dev                     # → http://localhost:3000
```

Then open **http://localhost:3000/c/save-the-community-center**.

> Not using Docker? Point `DATABASE_URL` at any Postgres 14+ database and run steps 4–5.

## Watch the thermometer move

In a second terminal, insert fake donations (no payment processing exists yet):

```bash
pnpm donate                              # random $10–$500 donation, random name
pnpm donate --amount 50 --name "Sarah"
pnpm donate --amount 36 --anonymous
pnpm donate --amount 120000              # push past the goal (bar caps, label > 100%)
```

Each donation appears on any open campaign page within ~2 seconds, with no refresh.

You can also drive the dev-only HTTP endpoint (enabled by `ALLOW_FAKE_DONATIONS`):

```bash
curl -X POST localhost:3000/api/dev/donate \
  -H 'content-type: application/json' \
  -d '{"slug":"save-the-community-center","amountMinor":5000,"donorName":"Sample Donor"}'
# → { "ok": true, "donation": {...}, "snapshot": { "seq": N, "totalMinor": N, "donorCount": N } }
```

`amountMinor` is in **cents**. Body fields are all optional (defaults match the CLI).

## Scripts

| Script             | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `pnpm dev`         | Start the Next.js dev server.                                  |
| `pnpm build`       | Production build (`prisma generate && migrate deploy && next build`). |
| `pnpm start`       | Start the production server (after `build`).                   |
| `pnpm db:up`       | Start the docker-compose Postgres container.                   |
| `pnpm db:generate` | Apply Prisma migrations in dev (`prisma migrate dev`).         |
| `pnpm db:migrate`  | Deploy Prisma migrations (`prisma migrate deploy`).            |
| `pnpm db:push`     | Push the schema without a migration (`prisma db push`).        |
| `pnpm db:studio`   | Open Prisma Studio.                                            |
| `pnpm db:seed`     | Seed / re-seed the sample campaign (idempotent).               |
| `pnpm donate`      | Insert a fake donation (see flags above).                      |
| `pnpm test`        | Run the Vitest unit tests.                                     |
| `pnpm typecheck`   | Type-check with `tsc --noEmit`.                                |

## Environment variables

| Variable                            | Required | Description                                                                                          |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                      | Yes      | Postgres connection string. Local: the docker-compose instance. Prod: a Neon / Vercel Postgres URL.  |
| `ALLOW_FAKE_DONATIONS`              | No       | Set to the exact string `"true"` to enable `POST /api/dev/donate`. Anything else (or unset) → 404.   |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes      | Clerk publishable key (dashboard.clerk.com → API keys).                                              |
| `CLERK_SECRET_KEY`                  | Yes      | Clerk secret key. Server-side only — never exposed to the client.                                    |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` etc.| No       | Clerk page/redirect URLs; default to `/sign-in`, `/sign-up`, and `/`.                                |

Env vars are validated by `src/env.js` (`@t3-oss/env-nextjs`) — a missing or malformed
`DATABASE_URL` fails the build instead of failing at runtime. Set `SKIP_ENV_VALIDATION=1`
to skip validation (used by the unit tests and useful for Docker builds).

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
generated/prisma/          # generated Prisma client (git-ignored)
scripts/
  donate.ts                # demo CLI (uses the shared createDonation write path)
public/images/
  hero-sample.svg          # committed placeholder hero image
src/
  env.js                   # validated env vars (@t3-oss/env-nextjs + zod)
  app/
    page.tsx               # minimal landing page
    c/[slug]/page.tsx      # public campaign page (server component)
    api/trpc/[trpc]/route.ts                # tRPC HTTP handler
    api/campaigns/[slug]/stream/route.ts    # SSE (DB-polling, serverless-safe)
    api/dev/donate/route.ts                 # dev-only fake donation endpoint
  server/
    db.ts                  # PrismaClient singleton
    campaignStats.ts       # consistent snapshot query (single SQL statement)
    donations.ts           # shared createDonation write path
    api/                   # tRPC root, context/procedures, routers/campaign
  trpc/                    # tRPC React client, RSC helpers, query client
  components/              # Thermometer, Countdown, LiveCampaignDashboard
  hooks/                   # useLiveCampaignStats (SSE/polling) + applySnapshot reducer
  lib/                     # money, countdown, donationDefaults helpers
  styles/globals.css       # Tailwind entrypoint
```

## Out of scope (future PRs)

Payment processing, authentication, matching multipliers, ambassador leaderboards,
campaign listing/admin UIs, and external pub/sub for SSE fan-out at scale.
