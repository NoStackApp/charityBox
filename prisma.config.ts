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
