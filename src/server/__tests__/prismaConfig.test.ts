import { afterEach, describe, expect, it, vi } from "vitest";

// Guards the Prisma 7 CLI config: the schema/migrations/seed wiring must stay
// intact, and the datasource URL must mirror DATABASE_URL (read via process.env,
// never via Prisma's throwing env() helper — see prisma.config.ts).
describe("prisma.config.ts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("declares the schema, migrations path, and seed command", async () => {
    const { default: config } = await import("../../../prisma.config");
    expect(config.schema).toBe("prisma/schema.prisma");
    expect(config.migrations?.path).toBe("prisma/migrations");
    expect(config.migrations?.seed).toBe("tsx prisma/seed.ts");
  });

  it("uses DATABASE_URL from the environment as the datasource url", async () => {
    const url = "postgresql://test:test@localhost:5432/test?schema=public";
    vi.stubEnv("DATABASE_URL", url);
    vi.resetModules();
    const { default: config } = await import("../../../prisma.config");
    expect(config.datasource?.url).toBe(url);
  });
});
