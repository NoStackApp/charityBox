/**
 * Demo CLI: insert a fake donation and print the new campaign total.
 *
 *   npm run donate -- [--slug <slug>] [--amount <dollars>] [--name <name>] [--anonymous]
 *
 * Defaults: slug "save-the-community-center", a random $10–$500 amount, and a random
 * name from the built-in list. `--amount` takes dollars (optional decimals) and is
 * converted to integer cents. Calls the same createDonation() write path used by the
 * app, so the thermometer on an open page climbs within ~2s.
 */
import "dotenv/config";
import {
  createDonation,
  CampaignNotFoundError,
  InvalidDonationError,
} from "../src/server/donations";
import { getSnapshot } from "../src/server/campaignStats";
import { formatMoney } from "../src/lib/money";
import {
  DEFAULT_SLUG,
  randomAmountMinor,
  randomDonorName,
} from "../src/lib/donationDefaults";
import { db } from "../src/server/db";

interface ParsedArgs {
  slug: string;
  amountMinor: number;
  donorName: string | null;
  anonymous: boolean;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): ParsedArgs {
  let slug = DEFAULT_SLUG;
  let amountMinor: number | null = null;
  let donorName: string | null | undefined = undefined;
  let anonymous = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--slug":
        slug = argv[++i] ?? "";
        if (!slug) fail("--slug requires a value.");
        break;
      case "--amount": {
        const raw = argv[++i];
        if (raw === undefined) fail("--amount requires a value (in dollars).");
        const dollars = parseFloat(raw);
        if (Number.isNaN(dollars) || dollars <= 0) {
          fail(`--amount must be a positive number of dollars, got "${raw}".`);
        }
        amountMinor = Math.round(dollars * 100);
        if (amountMinor <= 0) fail("--amount rounds to zero cents.");
        break;
      }
      case "--name":
        donorName = argv[++i] ?? "";
        if (!donorName) fail("--name requires a value.");
        break;
      case "--anonymous":
        anonymous = true;
        break;
      default:
        fail(`Unknown argument "${arg}".`);
    }
  }

  return {
    slug,
    amountMinor: amountMinor ?? randomAmountMinor(),
    donorName: donorName === undefined ? randomDonorName() : donorName,
    anonymous,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const donation = await createDonation({
    slug: args.slug,
    amountMinor: args.amountMinor,
    donorName: args.donorName,
    anonymous: args.anonymous,
  });

  const snapshot = await getSnapshot(args.slug);

  const who = args.anonymous
    ? "Anonymous"
    : (donation.donorName ?? "Anonymous");
  console.log(
    `✓ Donated ${formatMoney(donation.amountMinor, "USD")} from ${who} to "${args.slug}".`,
  );
  if (snapshot) {
    console.log(
      `  New total: ${formatMoney(snapshot.totalMinor, "USD")} from ${snapshot.donorCount} donor(s) (seq ${snapshot.seq}).`,
    );
  }
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (err) => {
    await db.$disconnect();
    if (err instanceof CampaignNotFoundError || err instanceof InvalidDonationError) {
      fail(err.message);
    }
    console.error(err);
    process.exit(1);
  });
