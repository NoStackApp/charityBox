# charityBox

Greenfield repository containing only a `README.md` and a HubLaunch implementation plan (`.hublaunch/plans/campaign/2026-09-01-15:00-public-campaign-page-live-thermometer.md`). No `package.json`, lockfile, source code, build tooling, or CI configuration exists yet, so no package manager, install command, or verification commands can be determined from repo state.

## Setup

Requires Node 20+ and a PostgreSQL 14+ database. This container has **no Docker**, so
Postgres 14 is installed natively (`sudo apt-get install -y postgresql`); start it with
`sudo pg_ctlcluster 14 main start`. The `charitybox` role/db and `.env`'s `DATABASE_URL`
(`postgresql://charitybox:charitybox@localhost:5432/charitybox`) are already provisioned.

Install dependencies and prepare the DB:

```bash
npm install
npm run db:migrate    # prisma migrate dev (apply migrations)
npm run db:seed       # idempotent sample campaign
```

## Verification

<!-- RALPH_CHECK_COMMANDS
npm run typecheck
npm run test
RALPH_CHECK_COMMANDS_END -->

<!-- RALPH_BUILD_COMMANDS
npm run build
RALPH_BUILD_COMMANDS_END -->

<!-- RALPH_REGRESSION_COMMANDS
npm run test
RALPH_REGRESSION_COMMANDS_END -->
