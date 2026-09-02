# HubLaunch Lessons Learned

This file persists context across agent sessions. Update it as you work.

## Current Status
- Phase: COMPLETE ✅
- Last action: Fixed missing Prisma client, migrated repo to pnpm, verified end-to-end.
- Blockers: None

## Key Discoveries
- Container reality differed from the plan's assumptions: NO node_modules, NO
  pnpm-lock.yaml, NO .env, and system pnpm was 9.15.9 (not 10.30.0). Postgres was
  NOT pre-provisioned (no psql/pg_ctl, no cluster).
- Network + corepack both work: `corepack pnpm@10.30.0 <cmd>` fetches pnpm 10.30.0
  on demand — used it for all pnpm commands to match the pinned packageManager.
- `.env.example` ships with a LITERAL masked value:
  `DATABASE_URL="******localhost:5432/charitybox?schema=public"`. Must be replaced
  with the real URL `postgresql://charitybox:charitybox@localhost:5432/charitybox?schema=public`.
- The root cause fix is the project-level `"postinstall": "prisma generate"` — it runs
  in ANY pnpm version and regenerates the schema-specific client (`.prisma/client`),
  which lives in the pnpm virtual store, not top-level node_modules (require() resolves fine).

## Solutions That Worked
- package.json: added `"postinstall": "prisma generate"`, changed build to
  `bash -c 'prisma generate && next build'`, added `"packageManager": "pnpm@10.30.0"`
  and `"pnpm": {"onlyBuiltDependencies": ["@prisma/client","@prisma/engines","prisma"]}`.
- `git rm --cached package-lock.json` + `rm package-lock.json`; committed pnpm-lock.yaml.
- README.md: all `npm install`/`npm run X` → `pnpm install`/`pnpm X`; donate `-- --flag`
  → `--flag`; `npx prisma migrate deploy` → `pnpm prisma migrate deploy`; added note that
  install auto-generates the client.
- Installed Postgres 14 for DB verification:
  `sudo apt-get update && DEBIAN_FRONTEND=noninteractive sudo -E apt-get install -y postgresql-14`
  (the interactive tzdata prompt hangs — set /etc/timezone + DEBIAN_FRONTEND=noninteractive
  then `dpkg --configure -a`). Start: `sudo pg_ctlcluster 14 main start`. Create role/db and
  grant `ALTER ROLE charitybox CREATEDB;` (needed for prisma migrate dev shadow DB).

## Things to Avoid
- Don't run plain `apt-get install postgresql` before `apt-get update` (package not found).
- Don't let apt run interactively — the tzdata prompt hangs the install.
- `prisma migrate dev` fails with P3014 unless the DB role has CREATEDB (shadow DB).

## Files Modified
- package.json (scripts + packageManager + pnpm fields)
- README.md (pnpm migration + auto-generate note)
- package-lock.json (deleted, git rm)
- pnpm-lock.yaml (new, committed)
- .env (created locally from example with real DATABASE_URL — gitignored, not committed)
- UNCHANGED (as required): src/lib/db.ts, prisma/schema.prisma, prisma/migrations/*

## Verification Results (all pass)
- `pnpm typecheck` → exit 0
- `pnpm test` → 23/23 pass
- `pnpm build` → success (prisma generate runs first; /c/[slug] is dynamic, no DB needed)
- `node -e "require('@prisma/client')"` → OK (also after `rm -rf node_modules && pnpm install`)
- Clean-install regression: postinstall auto-generates client, zero manual steps.
- Dev server: GET /c/save-the-community-center → HTTP 200, NO "Cannot find module
  '.prisma/client/default'" error, campaign renders; snapshot API + donate write path work.

## Next Steps
- Done. If a reviewer re-runs, remember to start Postgres and set a real .env DATABASE_URL.
