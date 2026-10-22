import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { formatMoney } from "../src/lib/money";

// Standalone client (does not import src/server/db.ts) so that seeding needs only
// DATABASE_URL, not the Clerk variables validated by src/env.js. Prisma 7 no
// longer injects DATABASE_URL into the seed process, hence the dotenv import.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SLUG = "save-the-community-center";

const STORY = [
  "The Riverside Community Center has been the beating heart of our neighborhood for over forty years. From after-school tutoring and senior lunches to holiday celebrations and a food pantry that never turns anyone away, its doors have stayed open through every season.",
  "This winter a burst pipe flooded the main hall and kitchen, and the repairs the building needs go far beyond what our reserves can cover. Without urgent help, the programs that thousands of families rely on will go dark for the first time in a generation.",
  "For the next 24 hours we are coming together to save it. Every dollar you give restores a wall, a stove, a chair in the classroom — and keeps this home for our community alive. Please, be part of bringing it back.",
].join("\n\n");

async function main() {
  // Deadline is 24 hours after seed time. `upsert` keeps the seed idempotent so
  // `prisma db seed` and `prisma migrate reset` can be re-run safely.
  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const campaign = await prisma.campaign.upsert({
    where: { slug: SLUG },
    update: {
      // Refresh the deadline on re-seed so the demo countdown is always ~24h out,
      // and keep the sample copy in sync with this file.
      deadline,
      orgName: "Riverside Community Center",
      title: "Save the Community Center",
      story: STORY,
    },
    create: {
      slug: SLUG,
      orgName: "Riverside Community Center",
      title: "Save the Community Center",
      story: STORY,
      heroImagePath: "/images/hero-sample.svg",
      goalMinor: 10_000_000, // $100,000.00
      currency: "USD",
      deadline,
      timezone: "America/New_York",
    },
  });

  console.log(
    `Seeded campaign "${campaign.slug}" (id=${campaign.id}) — goal ${formatMoney(
      campaign.goalMinor,
      campaign.currency,
    )}, deadline ${campaign.deadline.toISOString()}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
