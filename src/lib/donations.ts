import { prisma } from "@/lib/db";

/** Thrown when a donation targets a slug that does not exist. */
export class CampaignNotFoundError extends Error {
  constructor(slug: string) {
    super(`Campaign "${slug}" not found. Did you run: npm run db:seed?`);
    this.name = "CampaignNotFoundError";
  }
}

/** Thrown when donation input fails validation. */
export class InvalidDonationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDonationError";
  }
}

export interface CreateDonationInput {
  slug: string;
  amountMinor: number;
  donorName?: string | null;
  anonymous?: boolean;
}

const MAX_NAME_LENGTH = 100;

/**
 * Validate a donation's minor-unit amount.
 *
 * Exported for unit testing. Amount must be a positive, safe, integer number of
 * minor units. Throws {@link InvalidDonationError} otherwise.
 */
export function assertValidAmount(amountMinor: number): void {
  if (
    typeof amountMinor !== "number" ||
    !Number.isFinite(amountMinor) ||
    !Number.isInteger(amountMinor) ||
    amountMinor <= 0
  ) {
    throw new InvalidDonationError(
      "amountMinor must be a positive integer number of minor units (cents).",
    );
  }
}

/**
 * Insert a donation and bump the campaign's version counter atomically.
 *
 * This is the single write path shared by the CLI, the dev HTTP endpoint, and any
 * future payment webhook. In one transaction it inserts the Donation row and runs
 * `UPDATE "Campaign" SET version = version + 1` for that campaign, so the sequence
 * number advances exactly once per donation and can never be observed out of step
 * with the donation it corresponds to.
 *
 * @throws {@link InvalidDonationError} on a bad amount or over-long name.
 * @throws {@link CampaignNotFoundError} when the slug does not exist.
 */
export async function createDonation(input: CreateDonationInput) {
  const { slug, amountMinor, anonymous = false } = input;
  assertValidAmount(amountMinor);

  let donorName = input.donorName ?? null;
  if (donorName !== null) {
    donorName = donorName.trim();
    if (donorName.length === 0) {
      donorName = null;
    } else if (donorName.length > MAX_NAME_LENGTH) {
      throw new InvalidDonationError(
        `donorName must be at most ${MAX_NAME_LENGTH} characters.`,
      );
    }
  }

  const campaign = await prisma.campaign.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!campaign) {
    throw new CampaignNotFoundError(slug);
  }

  const [donation] = await prisma.$transaction([
    prisma.donation.create({
      data: {
        campaignId: campaign.id,
        amountMinor,
        donorName,
        anonymous,
      },
    }),
    prisma.campaign.update({
      where: { id: campaign.id },
      data: { version: { increment: 1 } },
    }),
  ]);

  return donation;
}
