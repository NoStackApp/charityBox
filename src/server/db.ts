import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "~/env";
import { PrismaClient } from "../../generated/prisma/client";

/**
 * Prisma 7 requires an explicit driver adapter. node-postgres (`pg`) is used for
 * every environment — Docker Postgres locally, Neon / Vercel Postgres in prod —
 * over the standard DATABASE_URL connection string.
 */
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
