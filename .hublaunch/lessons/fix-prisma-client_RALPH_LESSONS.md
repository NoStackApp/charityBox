# HubLaunch Lessons Learned

This file persists context across agent sessions. Update it as you work.

## Current Status
- Phase: COMPLETE ✅
- Last action: Re-merged advanced origin/main (Prisma 7 upgrade) into fix-prisma-client,
  resolved package.json + README.md conflicts, re-verified, pushed (commit 7ae66af).
- Blockers: None

## Merge Conflict Resolution (session 3, 2026-10-22)
- GitHub still reported conflicts because origin/main had advanced 4 more commits
  past our last merge base (abda6d6): "Convert to T3 Stack conventions", "Add Clerk
  authentication", "Make sample campaign nondenominational", and the PR #11 "Upgrade
  to Prisma 7 (prisma.config.ts + pg driver adapter)". Our branch was 2 commits ahead
  of that base; needed a fresh `git fetch` + `git merge origin/main`.
- KEY INSIGHT: origin/main had ALREADY adopted this branch's root-cause fix —
  `"postinstall": "prisma generate"` is present in origin/main's package.json. So our
  branch is effectively superseded; the Prisma 7 upgrade also dropped the old
  `bash -c` build/start/test wrappers and the Prisma 6 deps.
- Only TWO files conflicted: package.json and README.md.
  - package.json: our HEAD side had old Prisma 6 bash -c wrappers + a 2nd
    `packageManager` (pnpm@10.30.0) + a `pnpm.onlyBuiltDependencies` block, which would
    have produced DUPLICATE keys / stale deps if hand-merged. Resolved with
    `git checkout --theirs package.json` (take origin/main wholesale) — it already has
    the postinstall fix, pins pnpm@10.28.0, and uses Prisma 7 deps.
  - README.md (5 conflict hunks): ours described the superseded Prisma 6 / pnpm@10.30.0
    setup; origin/main's is current (Prisma 7, db:generate/db:push/db:studio scripts,
    Node 20.19+). Resolved with `git checkout --theirs README.md`.
- System pnpm (9.x) errors on the new `pnpm-workspace.yaml` ("packages field missing");
  use `corepack pnpm@10.28.0 <cmd>` (matches the pinned packageManager). Install's
  postinstall generated the Prisma 7 client to `./generated/prisma` (new location).
- Re-verified: `corepack pnpm@10.28.0 run typecheck` exit 0; `... run test` 25/25 pass.
  (Tests grew from 23 → 25 after the T3/Prisma-7 changes.) Pushed 7ae66af; HEAD now
  contains all of origin/main (`git log HEAD..origin/main` empty).

## Merge Conflict Resolution (session 2, 2026-09-02)
- origin/main had advanced 2 commits ahead of the merge base ("all local changes",
  "added prisma to build script") while our branch had the pnpm-standardization commit.
  Merging origin/main produced ONE real conflict: package.json `build` script.
- The other listed files (README.md, package-lock.json, pnpm-lock.yaml) did NOT conflict:
  package-lock.json was already git-removed on our side; README/pnpm-lock auto-merged clean.
- HEAD build: `bash -c 'prisma generate && next build'` + `postinstall: prisma generate`.
  origin/main build: `npx prisma generate && npx prisma migrate deploy && bash -c 'next build'`.
  RESOLUTION (combine both intents, standardize on pnpm — drop `npx`):
  `build`: `bash -c 'prisma generate && prisma migrate deploy && next build'` and KEEP
  the `postinstall: prisma generate` (the root-cause fix). This preserves origin/main's
  new `migrate deploy` step while keeping our auto-generate fix and pnpm standardization.
- Merge also pulled in .agents/skills/*, .claude/settings.json, .hublaunch scaffolding,
  .vscode/settings.json, .gitignore changes — all additive, no conflicts.
- Re-verified after merge (via `corepack pnpm@10.30.0`): install+postinstall generate
  client OK, `tsc --noEmit` exit 0, `pnpm check` exit 0, `pnpm test` 23/23 pass.

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
