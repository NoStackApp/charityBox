# HubLaunch Lessons Learned

## Current Status
- Phase: COMPLETE ✅
- Last action: Full verification suite green (typecheck, 25 tests, build)
- Blockers: None (AC10 = Vercel Preview is human/dashboard, out of agent scope)

## Key Discoveries
- Container starts with pnpm 9.15.9, node 20.20.2, NO docker, NO postgres.
- pnpm global install FAILS without sudo (EACCES). Use `sudo npm install -g pnpm@10.28.0`.
- Postgres: `sudo apt-get install -y postgresql` (14); cluster preexists, start with `sudo pg_ctlcluster 14 main start`. Create role/db:
  `sudo -u postgres psql -c "CREATE ROLE charitybox WITH LOGIN PASSWORD 'charitybox' CREATEDB;" -c "CREATE DATABASE charitybox OWNER charitybox;"`
- .env created with placeholder Clerk keys (git-ignored; NOT committed).
- Prisma 7 postinstall FAILS while schema still has url=env(...); fixing schema in Phase 2 resolves it. Packages still install fine.
- prisma-client generator emits generated/prisma/client.ts (no index.js). Import from `../../generated/prisma/client`.

## Solutions That Worked
- Exact-pin prisma/@prisma/client/@prisma/adapter-pg @ 7.10.0. Lockfile has no Prisma 8.x (all "8.0.0" grep hits are react/vite ranges).
- prisma.config.ts uses process.env.DATABASE_URL conditionally → generate works w/o URL (exit 0), migrate status fails with exact "datasource.url property is required" msg (exit 1). Both verified.
- pnpm-workspace.yaml allowBuilds map → no "Ignored build scripts" warning.
- db.ts + seed.ts use PrismaPg adapter. seed.ts adds `import "dotenv/config"`.

## Verification Results (all pass)
- pnpm typecheck: 0
- pnpm test: 25 passed (23 existing + 2 new prismaConfig)
- no-URL generate: 0; no-URL migrate status: 1 with expected msg
- pnpm db:generate: applied existing migration, NO new migration folder
- pnpm db:seed: "Seeded campaign save-the-community-center"
- pnpm donate --amount 18: "✓ Donated $18.00", New total via ::bigint raw query
- pnpm dev: /c/save-the-community-center → HTTP 200
- pnpm build: generate + migrate deploy + next build all succeed
- fresh install (rm node_modules generated, no .env): succeeds, client.ts present

## Files Modified
- package.json (versions, packageManager, scripts, removed prisma field)
- pnpm-lock.yaml (regenerated)
- pnpm-workspace.yaml (NEW)
- prisma.config.ts (NEW)
- prisma/schema.prisma (generator=prisma-client, removed url)
- src/server/db.ts (PrismaPg adapter, import path)
- prisma/seed.ts (dotenv + adapter + import path)
- src/server/__tests__/prismaConfig.test.ts (NEW)
- README.md, ralph.md (docs)

## Next Steps
- Done. Optionally commit. .env and generated/ remain git-ignored.
