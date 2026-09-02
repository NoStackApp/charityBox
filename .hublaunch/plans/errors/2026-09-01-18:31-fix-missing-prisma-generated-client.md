# Fix Missing Generated Prisma Client (pnpm 10 blocks Prisma's postinstall)

## Plan Summary

- The dev server crashes on every DB-touching page with `Cannot find module '.prisma/client/default'` because the schema-specific Prisma client was never generated after the repo's `node_modules` was installed with pnpm 10, which blocks dependency postinstall scripts by default.
- Key decision: standardize the repo on **pnpm** (commit `pnpm-lock.yaml`, delete `package-lock.json`) and make client generation automatic and durable via a `postinstall` script, a `prisma generate` step in `build`, and pnpm `onlyBuiltDependencies` approval for the Prisma packages.
- Most important file: `package.json` (scripts + `pnpm` + `packageManager` fields). `README.md` command docs also change from `npm run` to `pnpm`.
- No application code changes: `src/lib/db.ts` and `prisma/schema.prisma` are correct as-is.
- Priority: high (app is broken in dev and would fail identically on CI/Vercel builds). Complexity: low.

## Problem Statement

Loading any page that imports `src/lib/db.ts` (e.g. `/c/[slug]`) fails at module evaluation:

```
Failed to load external module @prisma/client-…: Error: Cannot find module '.prisma/client/default'
```

`@prisma/client` is only a loader shim; at require time it loads the schema-specific client that `prisma generate` writes to `node_modules/.prisma/client`. That directory does not exist anywhere in the current `node_modules` tree.

Root cause (two compounding facts, both verified):

1. The tree was installed with **pnpm 10.30.0** (require-stack paths are `.pnpm/...`; `pnpm-lock.yaml` is new/untracked). pnpm 10 **blocks dependency postinstall scripts by default**, so Prisma's own postinstall hook — which normally runs `prisma generate` automatically after install — was silently skipped. No `pnpm.onlyBuiltDependencies` approval exists in `package.json`, and there is no `.npmrc` or `pnpm-workspace.yaml` granting it.
2. The project has no `postinstall` script of its own and no `prisma generate` in its `build` script, so nothing else ever generates the client. A Vercel/CI build (`next build`) would hit the same failure.

The repo is also mid-migration between package managers: `package-lock.json` is tracked (npm) while `pnpm-lock.yaml` is new and untracked. This plan standardizes on **pnpm** because the current `node_modules` tree is already pnpm-managed and `pnpm-lock.yaml` reflects the actual installed state; keeping npm would mean throwing that install away and re-introducing lockfile drift.

Files that are explicitly **correct and must not change**:

- `src/lib/db.ts` — documented PrismaClient singleton pattern; the failing import is a symptom, not a cause.
- `prisma/schema.prisma` — standard `prisma-client-js` generator with default output.

## Requirements

**Functional:**
- Any page importing `src/lib/db.ts` (e.g. `/c/[slug]`) must load without the `Cannot find module '.prisma/client/default'` error, in dev and in production builds.
- A fresh clone + `pnpm install` must yield a working Prisma client with zero manual steps.

**Technical:**
- pnpm is the sole package manager: `pnpm-lock.yaml` committed, `package-lock.json` removed, `"packageManager": "pnpm@10.30.0"` pinned.
- Prisma client generation must be wired into `postinstall` and the `build` script; the Prisma packages' own build scripts must be approved via `pnpm.onlyBuiltDependencies`.
- No dependency version changes; no changes to `src/lib/db.ts`, `prisma/schema.prisma`, or migrations.

**Non-functional:**
- `postinstall` must not require a database connection (it does not — `prisma generate` only reads the schema), so installs work in CI and on machines without `DATABASE_URL`.
- README must match the actual commands a new contributor runs.

## Proposed Solution

Make Prisma client generation automatic in every context (fresh install, dev, CI/prod build) and commit to pnpm as the single package manager:

1. In `package.json`: add `"postinstall": "prisma generate"`, prepend `prisma generate` to the `build` script, add `pnpm.onlyBuiltDependencies` approving the Prisma packages' own build scripts, and pin `"packageManager": "pnpm@10.30.0"`.
2. Remove `package-lock.json`; commit `pnpm-lock.yaml` (it is not gitignored — verified).
3. Update `README.md` to use `pnpm` commands.
4. Regenerate the client and verify the app, typecheck, and tests all pass.

## Implementation Steps

### Phase 1 — package.json changes

1. Edit `package.json`:
   - In `scripts`, add:
     ```json
     "postinstall": "prisma generate",
     ```
   - Change the `build` script from `"bash -c 'next build'"` to (keeping the existing `bash -c` wrapper pattern used by this repo's scripts):
     ```json
     "build": "bash -c 'prisma generate && next build'",
     ```
   - Add a top-level `pnpm` field (sibling of `scripts`/`dependencies`) so pnpm 10 is allowed to run the Prisma packages' own postinstall hooks on future installs:
     ```json
     "pnpm": {
       "onlyBuiltDependencies": ["@prisma/client", "@prisma/engines", "prisma"]
     }
     ```
   - Add a top-level `"packageManager": "pnpm@10.30.0"` field so corepack/teammates/CI use the same package manager and version.
   - Do not change any other scripts (`dev`, `db:*`, `test`, etc.).

### Phase 2 — package-manager standardization

2. Delete `package-lock.json` from the working tree and from git (`git rm package-lock.json`).
3. Stage `pnpm-lock.yaml` for commit (`git add pnpm-lock.yaml`). It is not covered by `.gitignore` (verified) — no `.gitignore` change is needed.

### Phase 3 — regenerate and verify locally

4. Run `pnpm install`. Expected: install succeeds and the new project `postinstall` script runs `prisma generate`. If the environment blocks it for any reason, run `pnpm prisma generate` directly — the outcome that matters is the next step.
5. Verify the generated client exists: `node_modules/.prisma/client` (reachable via the pnpm virtual store) must now exist and `node -e "require('@prisma/client')"` must exit 0.

### Phase 4 — documentation

6. Update `README.md`: replace every `npm install` with `pnpm install` and every `npm run <script>` with `pnpm <script>` (occurrences at lines ~38, 44, 50–57, 69–72, 92–100, 127; do a full-file search rather than relying on those line numbers). Flag-passing examples like `npm run donate -- --amount 180` become `pnpm donate --amount 180` (pnpm forwards flags without the `--` separator). Add one sentence to the Setup section noting that `pnpm install` auto-generates the Prisma client (via the `postinstall` script), and that `pnpm prisma generate` can be run manually if ever needed.

## Technical Considerations

- **pnpm 10 build-script policy**: `pnpm.onlyBuiltDependencies` in `package.json` is the committed, team-wide way to approve build scripts (as opposed to the interactive `pnpm approve-builds`, which serves the same purpose). Only the three Prisma packages need approval; the repo's other native-ish deps (esbuild via tsx/vitest, `@tailwindcss/oxide`) ship prebuilt binaries as optional dependencies and work without their build scripts.
- **The project-level `postinstall` script is the primary guarantee** — it runs even where dependency build scripts are blocked, and covers Vercel/CI installs. The `onlyBuiltDependencies` approval is defense-in-depth (it lets Prisma's engine setup hooks run) and the `build`-script `prisma generate` covers build environments that cache `node_modules` between install and build.
- **`prisma generate` does not need a database connection** — it only reads `prisma/schema.prisma`, so `postinstall` is safe in environments without `DATABASE_URL` (Prisma reads env at client *runtime*, not generate time).
- **No version changes**: keep `prisma`/`@prisma/client` at `^6.19.3` exactly as they are; this is purely a generation/tooling fix.
- **Vercel**: with `postinstall` + the amended `build` script, a Vercel deployment using pnpm will generate the client with no dashboard configuration.
- **Do not modify** `src/lib/db.ts`, `prisma/schema.prisma`, or anything under `prisma/migrations/`.

## Testing Strategy

- **Automated (existing suites — must pass, no new tests needed for a tooling fix):**
  - `pnpm typecheck` — exits 0 (the generated client also provides the types `tsc` needs).
  - `pnpm test` — full Vitest suite passes.
- **Manual verification:**
  1. `node -e "require('@prisma/client')"` exits 0 (proves the generated client resolves).
  2. Start the stack: `pnpm db:up`, `pnpm db:migrate`, `pnpm db:seed`, then `pnpm dev`; load `http://localhost:3000/c/save-the-community-center` (the slug seeded by `prisma/seed.ts`) — the page renders with no `Cannot find module '.prisma/client/default'` error.
  3. Clean-install regression check: `rm -rf node_modules && pnpm install`, then repeat check 1 — proves a fresh clone no longer reproduces the bug.
  4. `pnpm build` completes (proves the CI/Vercel path generates the client too). Note: `next build` may prerender pages that query the database; run it with the docker-compose Postgres up and migrated. If the build fails for an unrelated pre-existing reason, report it but do not expand scope.

## Documentation Updates

- `README.md` — pnpm command migration plus the one-line note about automatic client generation (detailed in Phase 4, step 6). No other docs reference npm or `prisma generate`.

## Acceptance Criteria

- [ ] `node_modules/.prisma/client` exists after a clean `pnpm install` with no manual steps.
- [ ] `package.json` contains the `postinstall` script, the amended `build` script, the `pnpm.onlyBuiltDependencies` field listing `@prisma/client`, `@prisma/engines`, `prisma`, and `"packageManager": "pnpm@10.30.0"`.
- [ ] `package-lock.json` is removed from the repo; `pnpm-lock.yaml` is committed.
- [ ] The `/c/[slug]` page renders in `pnpm dev` with no Prisma module-resolution error.
- [ ] `pnpm typecheck` and `pnpm test` pass.
- [ ] `pnpm build` succeeds (with the dev database running).
- [ ] `README.md` uses pnpm commands throughout and documents the automatic generate.
- [ ] `src/lib/db.ts` and `prisma/schema.prisma` are unchanged.
