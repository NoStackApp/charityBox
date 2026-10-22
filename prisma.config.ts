// Prisma 7 CLI configuration (generate / migrate / db seed / studio).
//
// The datasource URL lives here, not in prisma/schema.prisma. It is read from
// process.env directly rather than through Prisma's env() helper, because env()
// throws while this file loads and would break `prisma generate` — which runs
// from the `postinstall` script — on a fresh clone before `.env` exists or on a
// CI/Vercel install step. Commands that need a database (migrate, db seed, db
// push, studio) fail with Prisma's own "datasource.url property is required"
// error when DATABASE_URL is unset.
//
// Prisma 7 does not load .env automatically, hence the dotenv import.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
