# HubLaunch Lessons Learned

This file persists context across agent sessions. Update it as you work.

## Current Status
- Phase: ✅ COMPLETE — all 4 phases done, all ACs met, all verifications pass.
- Last action: final AC audit passed.
- Blockers: none.

## Verification Results (all PASS)
- pnpm typecheck: exit 0
- pnpm test: 23 tests / 4 files pass
- pnpm db:migrate: applied 20260901122036_init cleanly
- pnpm db:seed: seeded save-the-community-center via adapter
- pnpm donate --amount 18: $transaction + $queryRaw ::bigint OK → total $18.00
- pnpm dev + curl /c/save-the-community-center: HTTP 200, renders campaign + $18.00 total
- pnpm build: completes (generate + migrate deploy + next build)
- Edge: pnpm install with DATABASE_URL unset → generates client OK (AC5)
- Edge: pnpm db:migrate with no DATABASE_URL → "Connection url is empty" (intended)
- lockfile: prisma/@prisma/client/@prisma/adapter-pg all 7.10.0, pg 8.23.0
- git: only intended files changed; generated/ and .env git-ignored

## Environment setup notes (for future sessions)
- Postgres NOT preinstalled. Fix: apt-get update; apt-get install -y postgresql;
  useradd -r -m -d /var/lib/postgresql postgres; chown -R postgres:postgres /var/lib/postgresql;
  sudo pg_createcluster 14 main --start
- Create DB: sudo -u postgres psql -c "CREATE ROLE charitybox WITH LOGIN PASSWORD 'charitybox' CREATEDB;"
  and CREATE DATABASE charitybox OWNER charitybox;
- .env needs VALID-FORMAT Clerk keys or dev page 500s (unrelated to Prisma).
  Working dummy publishable key: pk_test_Y2xlcmsuZXhhbXBsZS5jb20k (base64 of "clerk.example.com$").
- Do NOT `pkill -f next` inside a backgrounded bash command — it self-terminates (exit 144).

## Key Discoveries
- Project uses **pnpm** (pnpm-lock.yaml present), pnpm 9.15.9, node v20.20.2. ralph.md verification uses `npm run ...` but pnpm is the real PM.
- `npm view prisma dist-tags`: latest=8.0.0-rc.15, prev=7.10.0. So MUST pin ^7.10.0. @prisma/adapter-pg latest=7.10.0.
- No `.env` existed. Created one with docker DATABASE_URL (postgresql://charitybox:charitybox@localhost:5432/charitybox?schema=public) and PLACEHOLDER Clerk keys (env.js requires min(1) so build/dev would fail with empty keys).
- Postgres not preinstalled despite ralph.md claim. `pg_ctlcluster`/`pg_lsclusters` not present. apt-get update was needed first (pkg lists empty).
- Need to create charitybox role/db after postgres install (ralph.md claimed pre-provisioned but nothing exists).

## Solutions That Worked
<!-- Record successful fixes so they can be reused -->

## Things to Avoid
- Do NOT install prisma@latest (8.0 RC). Pin ^7.10.0.
- New generator entry point is generated/prisma/client (with /client suffix), not generated/prisma.

## Files Modified
- package.json: prisma+@prisma/client ^7.10.0, added @prisma/adapter-pg ^7.10.0, removed top-level prisma.seed key
- prisma.config.ts: NEW
- prisma/schema.prisma: generator provider prisma-client, removed url from datasource, header comment
- src/server/db.ts: PrismaPg adapter, import from ../../generated/prisma/client
- prisma/seed.ts: dotenv/config, PrismaPg adapter, import from ../generated/prisma/client
- .env: created (gitignored)

## Next Steps
1. Wait for pnpm install (postinstall runs prisma generate) + postgres install
2. Create charitybox role/db, start postgres
3. pnpm typecheck, pnpm test
4. pnpm db:migrate, db:seed, donate, dev page load, build
5. Phase 4 docs: README.md, ralph.md
