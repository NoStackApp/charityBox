import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 CLI configuration (generate / migrate / db seed / studio).
 *
 * The datasource URL lives here, not in prisma/schema.prisma. It is read from
 * process.env directly (not Prisma's env() helper) so that `prisma generate` —
 * which runs from the `postinstall` script — still works on a fresh clone before
 * `.env` exists. Commands that need a database fail with Prisma's own
 * "Connection url is empty" error when DATABASE_URL is unset.
 *
 * Prisma 7 does not load .env automatically, hence the dotenv import.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
