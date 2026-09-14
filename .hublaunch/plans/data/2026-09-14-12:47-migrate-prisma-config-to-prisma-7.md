# Migrate Prisma config to Prisma 7 (prisma.config.ts, prisma-client generator, pg driver adapter)

## Plan Summary

- **What/why**: Upgrade the project from Prisma 6.19.3 to the Prisma 7.10 line. Prisma 7 removes the `url` from `schema.prisma`, the `prisma-client-js` generator default output, the `package.json#prisma.seed` key, and engine-less client construction. All of these move to a new root `prisma.config.ts` and a driver adapter (`@prisma/adapter-pg`).
- **Key decisions**: (1) Pin every Prisma package to `^7.10.0` explicitly — the npm `latest` dist-tag of `prisma` currently points at `8.0.0-rc.15`, so `prisma@latest` must never be used. (2) `datasource.url` in `prisma.config.ts` reads `process.env.DATABASE_URL` (not the throwing `env()` helper) so the `postinstall` `prisma generate` still succeeds on a fresh clone or CI box with no `.env`. (3) `prisma/seed.ts` stays self-contained with its own adapter so seeding never requires Clerk env vars.
- **Most important files**: `prisma.config.ts` (new), `prisma/schema.prisma`, `src/server/db.ts`, `prisma/seed.ts`, `package.json`.
- **Priority/complexity**: Medium priority, Medium complexity (many small coordinated edits, no schema or data migration).

## Problem Statement

The project runs Prisma 6.19.3 with the legacy layout: connection URL inside `prisma/schema.prisma`, the `prisma-client-js` generator, a seed command in `package.json#prisma.seed`, and a `PrismaClient` constructed without a driver adapter. Prisma 7 is the current stable major and changes every one of those conventions. This plan moves the project to the Prisma 7.10 conventions (`prisma.config.ts`, `prisma-client` generator, `@prisma/adapter-pg`) without touching the data model, the migrations history, or the application's query code.

### Planning Context

**Key Requirements Discussed:**

- Target the Prisma 7.10 stable line: `prisma@^7.10.0`, `@prisma/client@^7.10.0`, `@prisma/adapter-pg@^7.10.0`. Do **not** install Prisma 8 (the `latest` dist-tag of the `prisma` CLI package is an 8 release candidate at the time of planning).
- `pnpm install` must keep working on a machine with no `.env` file. The `postinstall` script runs `prisma generate`, and every Prisma 7 CLI command loads `prisma.config.ts`, so the config must not throw when `DATABASE_URL` is unset.
- Keep the create-t3-app file layout the repo already uses: `src/server/db.ts` singleton, `prisma/schema.prisma`, `prisma/seed.ts`, generated client under `generated/prisma` (git-ignored). create-t3-app upstream still scaffolds Prisma 6, so there is no T3 Prisma 7 template to copy; apply Prisma's official upgrade guide on top of the T3 layout.
- The `db:generate` script (`prisma migrate dev`) must keep regenerating the client after schema changes. Prisma 7's `migrate dev` no longer runs `generate` automatically, so the script is chained.
- The seed script must not depend on `src/env.js` (which validates Clerk keys); it builds its own `PrismaPg` adapter from `process.env.DATABASE_URL`.
- Replace the untracked placeholder `pnpm-workspace.yaml` (which contains the literal text `set this to true or false` as values) with a valid `allowBuilds` map and commit it.

**Decisions Made:**

- `datasource.url: process.env.DATABASE_URL` over `env("DATABASE_URL")`: the `env()` helper from `prisma/config` returns `string` and throws when the variable is missing, and it would run during `prisma generate` in `postinstall`. Prisma's config reference recommends `process.env` for exactly this case. Commands that truly need a URL (`migrate`, `db seed`, `studio`) then fail with Prisma's own "datasource url is missing" error, which is acceptable.
- Generator switches from `prisma-client-js` to `prisma-client` (Prisma 7's Rust-free client). Output path stays `../generated/prisma`; the entry module becomes `generated/prisma/client.ts`, so imports change from `generated/prisma` to `generated/prisma/client`.
- `import "dotenv/config"` at the top of `prisma.config.ts` because Prisma 7 no longer loads `.env` automatically. `dotenv` is already a devDependency (`^17.4.2`).
- `pnpm-workspace.yaml` uses `allowBuilds` (pnpm ≥10.26; the repo uses pnpm 12.3.4), which replaced `onlyBuiltDependencies`.

**Out of Scope:**

- Connection-pool tuning for Vercel/Neon (Prisma's pg adapter defaults are kept).
- Changing the dev `log: ["query", "error", "warn"]` setting.
- Any change to `prisma/schema.prisma` models, `prisma/migrations/`, or the SQL in `src/server/campaignStats.ts`.
- Prisma 8, Prisma Accelerate, Prisma Postgres, or the TypeScript-schema authoring mode.

### Background & Context

**Current Behavior**:

- `prisma/schema.prisma` has `generator client { provider = "prisma-client-js"; output = "../generated/prisma" }` and `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }`.
- `src/server/db.ts` imports `PrismaClient` from `../../generated/prisma` and calls `new PrismaClient({ log })` with no adapter.
- `prisma/seed.ts` imports `PrismaClient` from `../generated/prisma` and calls `new PrismaClient()`.
- `package.json` has `"prisma": { "seed": "tsx prisma/seed.ts" }`, `"postinstall": "prisma generate"`, `"db:generate": "prisma migrate dev"`, and `"build": "prisma generate && prisma migrate deploy && next build"`.
- No `prisma.config.ts` exists.
- `pnpm-workspace.yaml` exists untracked with invalid placeholder values.

**Desired Behavior**:

- Prisma 7.10.x is installed; `pnpm install` (with its `postinstall`) succeeds with or without a `.env`.
- `prisma.config.ts` owns the schema path, migrations path, seed command, and datasource URL.
- The app, the SSE stream, the dev donate endpoint, `pnpm donate`, and `pnpm db:seed` all work exactly as before against the docker-compose Postgres.
- `pnpm check`, `pnpm test`, and `pnpm build` pass.

## Detailed Requirements

### Functional Requirements

1. **Dependency upgrade**
   - `@prisma/client` → `^7.10.0` (dependencies), `prisma` → `^7.10.0` (devDependencies), add `@prisma/adapter-pg@^7.10.0` (dependencies; it bundles `pg` and `@types/pg`).
   - Edge case: the `prisma` package's `latest` dist-tag is `8.0.0-rc.15`. Always specify the version range explicitly.

2. **Configuration file**
   - New root file `prisma.config.ts` exporting `defineConfig({...})` with `schema`, `migrations.path`, `migrations.seed`, `datasource.url`.
   - Loads `.env` via `import "dotenv/config"`.
   - Edge case: `DATABASE_URL` unset → `prisma generate` still succeeds; `prisma migrate deploy` fails with Prisma's missing-URL error.

3. **Schema file**
   - Generator provider `prisma-client`, output `../generated/prisma`.
   - Datasource block keeps `provider = "postgresql"` only; `url` line removed.
   - Models unchanged byte-for-byte; no new migration is generated (verify with `prisma migrate status` showing no pending changes, and `prisma migrate dev` creating no new migration directory).

4. **Client construction**
   - `src/server/db.ts` builds a `PrismaPg` adapter from `env.DATABASE_URL` and passes `{ adapter, log }` to `PrismaClient`. Singleton pattern kept.
   - `prisma/seed.ts` builds a `PrismaPg` adapter from `process.env.DATABASE_URL` and passes `{ adapter }`.

5. **Scripts**
   - Remove `package.json#prisma` key.
   - `db:generate` becomes `prisma migrate dev && prisma generate`.
   - All other scripts unchanged (`postinstall`, `build`, `db:migrate`, `db:push`, `db:seed`, `db:studio`, `donate`, `dev`, `test`, `check`, `typecheck`).

6. **pnpm build-script approval**
   - `pnpm-workspace.yaml` becomes a valid `allowBuilds` map and is committed.

### Technical Requirements

- **Technology/Framework**: TypeScript 5.9, Node 25.6 (Prisma 7 needs ≥20.19), Next 16.3.4, pnpm 12.3.4, Prisma 7.10.x, `@prisma/adapter-pg` 7.10.x.
- **Location**: root (`prisma.config.ts`, `package.json`, `pnpm-workspace.yaml`), `prisma/`, `src/server/db.ts`, docs.
- **Dependencies**: `dotenv` (present), `tsx` (present, used by the seed command).
- **Constraints**: `tsconfig.json` already satisfies Prisma 7 (`module: ESNext`, `moduleResolution: Bundler`, `"type": "module"` in `package.json`). `tsconfig.json` excludes `generated`, which stays.

### Non-Functional Requirements

- **Performance**: no regression expected; the Rust-free client is Prisma's default for v7.
- **Security**: Prisma 7's pg adapter validates TLS certificates by default (v6 ignored invalid ones). The local docker Postgres uses no TLS; Neon/Vercel Postgres use valid certificates. No action needed.
- **Backwards Compatibility**: no data or migration changes. Removed v6 environment variables (`PRISMA_GENERATE_SKIP_AUTOINSTALL`, `PRISMA_CLIENT_ENGINE_TYPE`, etc.) are not used anywhere in this repo (verified by grep).
- **Error Handling**: existing typed errors in `src/server/donations.ts` are untouched; Prisma errors keep the same `PrismaClientKnownRequestError` shape.

## Proposed Solution

**High-level approach**: Apply Prisma's official v6→v7 upgrade guide to the existing T3 layout. Move all CLI configuration into `prisma.config.ts`, switch the generator, add the pg driver adapter at the two `PrismaClient` construction sites, fix the scripts, and regenerate.

```
pnpm install ──▶ postinstall: prisma generate ──▶ loads prisma.config.ts
                                                  (process.env.DATABASE_URL may be undefined → OK)
                                                  └─▶ writes generated/prisma/client.ts (git-ignored)

src/server/db.ts ──▶ new PrismaPg({ connectionString: env.DATABASE_URL })
                 └─▶ new PrismaClient({ adapter, log })  ◀── donations.ts, campaignStats.ts, routers

prisma/seed.ts   ──▶ new PrismaPg({ connectionString: process.env.DATABASE_URL })
                 └─▶ new PrismaClient({ adapter })       ◀── `prisma db seed` (migrations.seed in config)
```

### Key Components

1. **`prisma.config.ts` (new)**
   - Single source of truth for the CLI: schema path, migrations path, seed command, datasource URL.
   - Loaded by every `prisma` CLI command; never imported by app code.

2. **`prisma/schema.prisma`**
   - Generator + datasource header edits only.

3. **`src/server/db.ts` and `prisma/seed.ts`**
   - Adapter-based construction; import path `generated/prisma/client`.

4. **`package.json` / `pnpm-workspace.yaml`**
   - Version bumps, script fix, removal of `prisma.seed`, valid build-script approvals.

### Files Likely to Change

- `package.json` — bump `prisma`/`@prisma/client`, add `@prisma/adapter-pg`, remove `prisma.seed`, chain `db:generate`.
- `pnpm-lock.yaml` — regenerated by `pnpm install`.
- `pnpm-workspace.yaml` — replace placeholder with valid `allowBuilds`; commit (currently untracked).
- `prisma.config.ts` — new.
- `prisma/schema.prisma` — generator provider; remove datasource `url`.
- `src/server/db.ts` — adapter + import path.
- `prisma/seed.ts` — adapter + import path.
- `README.md` — mention `prisma.config.ts`, updated `db:generate` description, generated path note.
- `ralph.md` — the `npm run db:migrate    # prisma migrate dev` comment is already stale; correct it to `pnpm db:generate  # prisma migrate dev && prisma generate`.

### Code Patterns to Follow

**Pattern References:**

- **For the client singleton**: keep the exact structure of [`src/server/db.ts`](src/server/db.ts) lines 4-16 (`createPrismaClient` factory, `globalForPrisma` cache, non-production assignment). Only the constructor arguments and the import change.
- **For env access in server code**: use `env.DATABASE_URL` from [`src/env.js`](src/env.js) line 10 in `db.ts` (already validated as a URL). In `prisma/seed.ts` and `prisma.config.ts` use `process.env.DATABASE_URL` directly, because those run outside Next and must not import the Clerk-validating env schema.
- **For the seed lifecycle**: keep the `main().then($disconnect).catch(...)` shape in [`prisma/seed.ts`](prisma/seed.ts) lines 53-61.
- **For bigint handling in raw SQL**: [`src/server/campaignStats.ts`](src/server/campaignStats.ts) lines 57-61 already wrap `seq`, `totalMinor`, `donorCount` in `Number()`, which is correct whether the pg adapter returns `bigint`, `number`, or `string`. Do not change the query. Update only the comment at lines 17-18 to say the values may arrive as `bigint` or `string` depending on the driver adapter.

**Anti-Patterns to Avoid:**

- Don't run `pnpm add prisma@latest` or `pnpm up prisma --latest` — that installs an 8 RC. Always pass `@^7.10.0`.
- Don't use `env("DATABASE_URL")` from `prisma/config` in the config file — it throws during `postinstall` on machines without `.env`.
- Don't import `db` from `src/server/db.ts` inside `prisma/seed.ts` — it drags in `src/env.js`, which requires Clerk keys.
- Don't leave `url = env("DATABASE_URL")` in `schema.prisma` — Prisma 7 rejects it.
- Don't add `prisma generate` output to git; `/generated` stays ignored.

## Implementation Steps

### Phase 1: Dependencies and pnpm configuration

- [ ] Overwrite `pnpm-workspace.yaml` with:
  ```yaml
  allowBuilds:
    '@prisma/client': true
    '@prisma/engines': true
    esbuild: true
    prisma: true
  ```
- [ ] Run, from the repo root:
  ```bash
  pnpm add @prisma/client@^7.10.0 @prisma/adapter-pg@^7.10.0
  pnpm add -D prisma@^7.10.0
  ```
  Verify `package.json` now shows `"@prisma/client": "^7.10.0"`, `"@prisma/adapter-pg": "^7.10.0"` under `dependencies` and `"prisma": "^7.10.0"` under `devDependencies`. Verify `node_modules/prisma/package.json` reports a `7.10.x` version, not `8.x`.
  - Note: `pnpm add` triggers `postinstall` → `prisma generate`, which will **fail** at this point because `schema.prisma` still has `url = env(...)` and no `prisma.config.ts` exists. That failure is expected; continue with Phase 2 and re-run `pnpm install` at the end of Phase 3. If pnpm aborts the install because of the failing postinstall, re-run with `pnpm add --ignore-scripts ...` and proceed.
- [ ] In `package.json`, delete the top-level `"prisma": { "seed": "tsx prisma/seed.ts" }` block.
- [ ] In `package.json` scripts, change `"db:generate": "prisma migrate dev"` to `"db:generate": "prisma migrate dev && prisma generate"`. Leave every other script unchanged.

### Phase 2: Prisma configuration and schema

- [ ] Create `prisma.config.ts` at the repo root:
  ```ts
  // Prisma 7 CLI configuration. Loaded by every `prisma` command (generate, migrate,
  // db seed, studio); never imported by application code. `.env` is loaded here
  // because Prisma 7 no longer loads it automatically.
  //
  // `datasource.url` deliberately reads process.env directly instead of the throwing
  // `env()` helper: `pnpm install` runs `prisma generate` via postinstall on machines
  // (fresh clones, CI) that have no DATABASE_URL, and generate does not need one.
  // Commands that do need it (migrate, db seed) fail with Prisma's own error if unset.
  import "dotenv/config";
  import { defineConfig } from "prisma/config";

  export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
      path: "prisma/migrations",
      seed: "tsx prisma/seed.ts",
    },
    datasource: {
      url: process.env.DATABASE_URL,
    },
  });
  ```
- [ ] Edit `prisma/schema.prisma`: replace the two header blocks so they read exactly
  ```prisma
  generator client {
    provider = "prisma-client"
    output   = "../generated/prisma"
  }

  datasource db {
    provider = "postgresql"
  }
  ```
  Keep the leading comment and both `model` blocks unchanged.

### Phase 3: Client construction sites

- [ ] Rewrite `src/server/db.ts`:
  ```ts
  import { PrismaPg } from "@prisma/adapter-pg";
  import { env } from "~/env";
  import { PrismaClient } from "../../generated/prisma/client";

  // Prisma 7 requires a driver adapter; PrismaPg wraps a node-postgres Pool.
  const createPrismaClient = () =>
    new PrismaClient({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
      log:
        env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });

  const globalForPrisma = globalThis as unknown as {
    prisma: ReturnType<typeof createPrismaClient> | undefined;
  };

  export const db = globalForPrisma.prisma ?? createPrismaClient();

  if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
  ```
- [ ] Edit `prisma/seed.ts` header (lines 1-4) to:
  ```ts
  import "dotenv/config";
  import { PrismaPg } from "@prisma/adapter-pg";
  import { PrismaClient } from "../generated/prisma/client";
  import { formatMoney } from "../src/lib/money";

  // Self-contained client (does not import src/server/db.ts) so seeding needs only
  // DATABASE_URL, not the Clerk variables validated by src/env.js.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  ```
  Leave `SLUG`, `STORY`, `main()`, and the disconnect/catch tail unchanged.
- [ ] In `src/server/campaignStats.ts`, update the comment at lines 17-18 to: `// Raw row shape returned by the joined query. Postgres SUM(bigint) and COUNT may be surfaced as bigint or string depending on the driver adapter; every field is normalised with Number() below.` Change the `SnapshotRow` field types to `bigint | string` for `totalMinor` and `donorCount`. No change to the SQL or to `getSnapshot`'s return mapping.
- [ ] Regenerate and reinstall:
  ```bash
  rm -rf generated
  pnpm install
  ```
  Expected: `postinstall` runs `prisma generate` successfully and `generated/prisma/client.ts` exists. If `pnpm install` was run with `--ignore-scripts` earlier, run `pnpm prisma generate` explicitly.
- [ ] Prove generate works with no env. `prisma.config.ts` imports `dotenv/config`, so simply unsetting the variable is not enough while a `.env` file exists; move the file aside for the check and restore it afterwards:
  ```bash
  mv .env .env.bak; env -u DATABASE_URL pnpm prisma generate; echo "generate exit=$?"; mv .env.bak .env
  ```
  Expected: exit status 0 and `generated/prisma/client.ts` regenerated.

### Phase 4: Verification

- [ ] `pnpm check` exits 0.
- [ ] `pnpm test` passes (existing Vitest suite; no DB needed).
- [ ] With `pnpm db:up` running: `pnpm prisma migrate status` reports the database is up to date with no pending migrations and no schema drift.
- [ ] `pnpm db:generate` — confirm it does **not** create a new directory under `prisma/migrations/` (the schema header edits are not model changes) and that it regenerates `generated/prisma`.
- [ ] `pnpm db:seed` prints `Seeded campaign "save-the-community-center" ...`.
- [ ] `pnpm donate --amount 25` prints `✓ Donated $25.00 ...` and a `New total:` line with integer-looking values (proves the `$queryRaw` bigint path).
- [ ] `pnpm dev`, then open `http://localhost:3000/c/save-the-community-center`: page renders, thermometer updates within ~2s after another `pnpm donate`.
- [ ] `pnpm build` completes (database running).

### Phase 5: Documentation and commit

- [ ] `README.md`:
  - In the Setup section near line 52 (`# 1. Install dependencies (also runs \`prisma generate\` via postinstall)`), add a sentence: Prisma CLI settings (schema path, migrations, seed command, `DATABASE_URL`) live in `prisma.config.ts`.
  - Line ~62: change the comment to `# applies migrations and regenerates the client (prisma migrate dev && prisma generate)`.
  - Scripts table line ~105: `pnpm db:generate` → `Apply Prisma migrations in dev and regenerate the client (\`prisma migrate dev && prisma generate\`).`
  - Project layout block near lines 157-160: add `prisma.config.ts           # Prisma 7 CLI config (schema/migrations/seed/DATABASE_URL)` and change `generated/prisma/` description to `generated Prisma 7 client (git-ignored; entry generated/prisma/client.ts)`.
- [ ] `ralph.md` lines 16-17: replace with
  ```
  pnpm db:generate      # prisma migrate dev && prisma generate
  pnpm db:seed          # idempotent sample campaign
  ```
- [ ] Stage `pnpm-workspace.yaml`, `prisma.config.ts`, and all edited files; confirm `git status` shows nothing under `generated/`.

<details>
<summary><b>Implementation Detail</b></summary>

### 6. Edge Cases & Considerations

#### Edge Cases to Handle

1. **`DATABASE_URL` unset during install**: `prisma generate` must succeed (config uses `process.env`, `datasource.url` is optional in Prisma's types). Verified by the no-`.env` generate check in Phase 3 (move `.env` aside, run `pnpm prisma generate`, restore `.env`).
2. **`DATABASE_URL` unset during `migrate deploy` (e.g. misconfigured Vercel project)**: Prisma prints its own missing-datasource error and the build fails, which is the desired signal.
3. **`?schema=public` in `DATABASE_URL`**: node-postgres ignores unknown query parameters and Prisma's pg adapter defaults to the `public` schema, so the existing connection string works unchanged. Do not pass a `schema` option to `PrismaPg`.
4. **Raw-query numeric types**: `getSnapshot` already normalises with `Number()`; the type widening to `bigint | string` keeps `tsc` honest without changing runtime behaviour.
5. **Stale `generated/` from the v6 generator**: delete it before the first v7 generate so no v6 artefacts (`index.js`, `libquery_engine-*.dylib.node`) linger.
6. **Next.js bundling of the generated client**: Prisma 7's `prisma-client` output is plain TypeScript plus a wasm query compiler loaded at runtime in the Node runtime. Both DB-touching route handlers already declare `runtime = "nodejs"`. If `next build` or `next dev` fails to locate a `*.wasm` file inside `generated/prisma`, add `serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"]` to `next.config.js` as the first remedy; this is a documented Prisma/Next workaround and is not expected to be needed.

#### Potential Challenges

- ⚠️ **Prisma 8 RC on `latest`**: any tooling that resolves `latest` (Dependabot, `pnpm up --latest`) will offer 8.x. The explicit `^7.10.0` ranges prevent accidental adoption; Prisma 8 is a separate future decision.
- ⚠️ **postinstall failure mid-upgrade**: between bumping the packages and adding `prisma.config.ts`, `pnpm add` will run a failing `prisma generate`. The plan orders the steps so the final `pnpm install` in Phase 3 is the one that must succeed; use `--ignore-scripts` on the intermediate `pnpm add` if pnpm aborts.
- ⚠️ **`pnpm-workspace.yaml` semantics**: `allowBuilds` requires pnpm ≥10.26. The repo uses 12.3.4. If a contributor on older pnpm sees an unknown-setting warning, that is harmless.
- ⚠️ **Generated TypeScript under strict flags**: the `prisma-client` generator emits `.ts` files that Next and `tsc` compile because they are imported from `src/server/db.ts`. Prisma targets strict TypeScript, and `tsconfig.json` already excludes `generated` from root-file discovery. If `pnpm check` reports errors originating inside `generated/prisma/`, report them verbatim rather than editing generated files.

#### Security Considerations

- `.env` stays git-ignored; `prisma.config.ts` contains no secrets, only `process.env` reads.
- TLS certificate validation is now enforced by the pg adapter (a security improvement over v6). No `rejectUnauthorized: false` is added.
- Approving build scripts in `pnpm-workspace.yaml` is limited to the four packages that actually need them (`prisma`, `@prisma/engines`, `@prisma/client`, `esbuild`).

### 7. Technical Considerations

#### Dependencies

- `@prisma/client@^7.10.0` — runtime client (Rust-free query compiler).
- `@prisma/adapter-pg@^7.10.0` — required driver adapter for PostgreSQL; bundles `pg@^8.16.3` and `@types/pg`.
- `prisma@^7.10.0` — CLI (generate, migrate, db seed, studio); requires Node `^20.19 || ^22.12 || >=24`.
- `dotenv@^17.4.2` — already present; used by `prisma.config.ts` and `prisma/seed.ts`.
- `tsx@^4.23.13` — already present; runs the seed command declared in `migrations.seed`.

#### Configuration Changes

- New `prisma.config.ts` (root). No changes to `.hublaunch/hublaunch.config.js`, `next.config.js`, `tsconfig.json`, `vitest.config.mts`, or `.gitignore`.
- `pnpm-workspace.yaml` becomes a tracked file.

#### Environment Variables

- `DATABASE_URL` — unchanged semantics; now consumed by `prisma.config.ts` (CLI) and by the `PrismaPg` adapter (runtime). Optional at `prisma generate` time, required for everything else.
- No new variables. The removed Prisma 6 `PRISMA_*` toggles are not referenced in this repo.

#### Error Handling Strategies

- CLI errors (missing URL, connection refused) surface from Prisma unchanged.
- Runtime Prisma errors keep their v6 class names (`PrismaClientKnownRequestError` etc.) and continue to propagate through `src/server/donations.ts` and the tRPC error formatter untouched.

### 8. Testing Requirements

#### Unit Tests

- [ ] Existing suites under `src/**/__tests__` pass unchanged (`pnpm test`). They never open a DB connection (`SKIP_ENV_VALIDATION=1` in `vitest.config.mts`).
- [ ] No new unit tests are required for a tooling migration.

#### Integration Tests

- [ ] `pnpm prisma migrate status` reports up to date.
- [ ] `pnpm db:seed` is idempotent (run twice; second run updates, does not duplicate).
- [ ] `pnpm donate` end-to-end (write path + raw snapshot query).

#### Manual Testing Checklist

1. **Setup**: `cp .env.example .env` (fill Clerk keys), `pnpm db:up`, `pnpm install`.
2. **Generate without env**: `mv .env .env.bak; env -u DATABASE_URL pnpm prisma generate; mv .env.bak .env` — Expected: the generate step exits 0 (the `.env` file must be moved aside because `prisma.config.ts` loads it via `dotenv/config`).
3. **Migrate + seed**: `pnpm db:generate` then `pnpm db:seed` — Expected: no new migration folder; seed prints the campaign summary.
4. **App**: `pnpm dev`, open `/c/save-the-community-center` — Expected: page renders with the thermometer; `pnpm donate --amount 25` in another terminal moves it within ~2s.
5. **Dev endpoint**: with `ALLOW_FAKE_DONATIONS="true"`, `curl -X POST localhost:3000/api/dev/donate -H 'content-type: application/json' -d '{"slug":"save-the-community-center","amountMinor":500}'` — Expected: 200 and a new total.
6. **Build**: `pnpm build` — Expected: `prisma generate`, `migrate deploy` (no-op), `next build` all succeed.
7. **Version sanity**: `pnpm ls prisma @prisma/client @prisma/adapter-pg` — Expected: all `7.10.x`.

#### Test Data Requirements

- The seeded `save-the-community-center` campaign from `prisma/seed.ts`.

### 9. Documentation Updates

#### User-Facing Documentation

- [ ] `README.md` — as listed in Phase 5 (config file mention, `db:generate` wording, layout block).
- [ ] `ralph.md` — corrected setup commands.

#### Code Documentation

- [ ] Header comment in `prisma.config.ts` explaining the `process.env` choice (included in the Phase 2 snippet).
- [ ] Comment in `prisma/seed.ts` explaining why it does not import `src/server/db.ts` (included in the Phase 3 snippet).
- [ ] Updated bigint/string comment in `src/server/campaignStats.ts`.

#### Examples to Include

```bash
# Fresh clone, no .env yet — still installs and generates the client
pnpm install

# Apply migrations and regenerate the client after a schema change
pnpm db:generate

# Seed the sample campaign (uses migrations.seed from prisma.config.ts)
pnpm db:seed
```

### 10. Acceptance Criteria

- [ ] **AC1**: `package.json` lists `@prisma/client` and `@prisma/adapter-pg` at `^7.10.0` in `dependencies` and `prisma` at `^7.10.0` in `devDependencies`; `pnpm ls prisma` resolves to a 7.10.x version.
- [ ] **AC2**: `package.json` has no top-level `prisma` key; `db:generate` is `prisma migrate dev && prisma generate`; all other scripts are unchanged.
- [ ] **AC3**: `prisma.config.ts` exists at the repo root with the content specified in Phase 2, and `prisma/schema.prisma` uses `provider = "prisma-client"` with no `url` in the datasource block; models are unchanged.
- [ ] **AC4**: With `.env` moved aside and `DATABASE_URL` unset, `pnpm prisma generate` exits 0 (the Phase 3 no-`.env` check).
- [ ] **AC5**: `src/server/db.ts` and `prisma/seed.ts` construct `PrismaClient` with a `PrismaPg` adapter and import from `generated/prisma/client`.
- [ ] **AC6**: `pnpm check`, `pnpm test`, and `pnpm build` (with the dev database running) all pass.
- [ ] **AC7**: `pnpm prisma migrate status` shows no pending migrations and `pnpm db:generate` creates no new migration directory.
- [ ] **AC8**: `pnpm db:seed`, `pnpm donate`, the `/c/[slug]` page, and the SSE thermometer update all work as before.
- [ ] **AC9**: `pnpm-workspace.yaml` is committed with a valid `allowBuilds` map; nothing under `generated/` is tracked.
- [ ] **AC10**: `README.md` and `ralph.md` reflect the new config file and script behaviour.

#### Definition of Done

- All acceptance criteria met.
- All tests passing.
- Code reviewed and approved.
- Documentation updated.
- No breaking changes to the data model or migration history.

### 11. Dependencies & Related Work

#### Dependencies

- [ ] Depends on: nothing pending. The earlier plan `.hublaunch/plans/errors/2026-09-01-18:31-fix-missing-prisma-generated-client.md` established the `postinstall`/`build` generate steps this plan preserves.
- [ ] Required external setup: docker-compose Postgres for the verification phase.

#### Blockers

- [ ] None.

#### Related Issues/PRs

- Prisma 7 upgrade guide: https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7
- Prisma config reference: https://www.prisma.io/docs/orm/reference/prisma-config-reference
- pnpm `allowBuilds`: https://pnpm.io/settings/build

</details>
