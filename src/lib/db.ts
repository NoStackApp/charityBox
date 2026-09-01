import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient singleton.
 *
 * Next.js dev hot-reload re-evaluates modules on every change; instantiating a
 * fresh PrismaClient each time exhausts the database connection pool. Caching the
 * instance on `globalThis` (the documented Prisma pattern) keeps a single client
 * across reloads. In production a module is evaluated once, so the cache is a no-op.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
