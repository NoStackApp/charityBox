# HubLaunch Lessons Learned

This file persists context across agent sessions. Update it as you work.

## Current Status
- Phase: COMPLETE ✅ — all 10 ACs verified.
- Last action: Full verification (typecheck, test, build, migrate status, seed, donate, dev app, SSE) all pass.
- Blockers: None.

## Key Discoveries
- Environment differs from plan assumptions:
  - Node **v20.20.2** (plan said 25.6). Satisfies Prisma 7's `^20.19` requirement. OK.
  - pnpm **9.15.9** (plan said 12.3.4). `allowBuilds` in pnpm-workspace.yaml needs pnpm >=10.26,
    so on pnpm 9 it is an UNKNOWN setting and dependency build scripts may be BLOCKED.
    Watch esbuild/prisma/@prisma/client/@prisma/engines build scripts — if blocked, tsx (esbuild)
    or prisma generate could fail. May need `onlyBuiltDependencies` or `pnpm approve-builds` /
    `--config` workaround. Commit the `allowBuilds` map per plan regardless (harmless on new pnpm).
  - No Docker. Postgres must be installed natively (`sudo apt-get install -y postgresql`,
    start `sudo pg_ctlcluster 14 main start`). sudo works passwordless.
  - No `.env` present — must `cp .env.example .env` for DB-touching steps.
  - No node_modules yet — first `pnpm install` will run postinstall `prisma generate`.
- ralph.effective.md verification uses `npm run typecheck` / `npm run test`; project uses pnpm-lock.yaml.

## Solutions That Worked
- **pnpm 9 breaks on `allowBuilds`**: pnpm 9 treats pnpm-workspace.yaml as a workspace root and
  errors "packages field missing or empty". FIX: `sudo npm install -g pnpm@12` (got 12.4.1). Then
  `pnpm install` runs postinstall `prisma generate` cleanly, build scripts approved via allowBuilds.
- **Postgres native install**: apt hung on interactive tzdata debconf. FIX: kill it, then
  `echo 'tzdata tzdata/Areas select Etc' | sudo debconf-set-selections` (+ Zones/Etc UTC),
  `sudo -E DEBIAN_FRONTEND=noninteractive dpkg --configure -a`. Cluster 14 main came up.
  Provision: `CREATE ROLE charitybox LOGIN PASSWORD 'charitybox'; CREATE DATABASE charitybox OWNER charitybox;`
  Start: `sudo pg_ctlcluster 14 main start`.
- **`prisma migrate dev` shadow DB**: needs CREATEDB. FIX: `ALTER ROLE charitybox CREATEDB;`.
  After that db:generate reports "Already in sync" and creates NO new migration (AC7 ✓).
- **Clerk keys for runtime app test**: env validation/middleware rejects fake keys. Use valid-FORMAT
  dummies in .env (gitignored): pk_test_Y2xlcmsuZXhhbXBsZS5jb20k (decodes clerk.example.com$) +
  sk_test_<chars>. Page renders 200, SSE + dev donate work. (typecheck/test skip env validation.)
- Verified: no-env `prisma generate` exits 0 (move .env aside). SSE emits absolute snapshots;
  donate/dev-donate bump totalMinor correctly (bigint raw path returns integers).

## Things to Avoid
- Do NOT use `prisma@latest` — resolves to an 8.x RC. Pin `^7.10.0`.
- Do NOT put `url = env(...)` back in schema.prisma.

## Files Modified
- pnpm-workspace.yaml (new, allowBuilds map)
- prisma.config.ts (new)
- prisma/schema.prisma (generator prisma-client, datasource url removed)
- src/server/db.ts (PrismaPg adapter, import generated/prisma/client)
- prisma/seed.ts (dotenv, PrismaPg adapter, import generated/prisma/client)
- src/server/campaignStats.ts (SnapshotRow types bigint|string + comment)
- package.json (prisma deps ^7.10.0, add @prisma/adapter-pg, removed prisma.seed key, chained db:generate)
- pnpm-lock.yaml (regenerated)
- README.md, ralph.md (docs)
- NOT committed / gitignored: .env (local), generated/ (client)

## Open Questions
- None. (pnpm 12 handles allowBuilds; build scripts ran.)

## Next Steps
- DONE. Optionally `git add`/commit if the user wants (task did not explicitly request commit).
