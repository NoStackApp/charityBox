/**
 * Shared demo defaults for fake donations, used by both the CLI (`scripts/donate.ts`)
 * and the dev HTTP endpoint (`POST /api/dev/donate`). Keeping them here means the two
 * demo paths behave identically.
 */

export const DEFAULT_SLUG = "save-the-community-center";

const RANDOM_NAMES = [
  "Sarah Cohen",
  "David Levi",
  "Miriam Katz",
  "Jonah Adler",
  "Rachel Stern",
  "Benjamin Roth",
  "Hannah Weiss",
  "Eli Friedman",
  "Naomi Berger",
  "Samuel Klein",
];

const MIN_DOLLARS = 10;
const MAX_DOLLARS = 500;

/** A random donation amount in whole cents, between $10 and $500 inclusive. */
export function randomAmountMinor(): number {
  const dollars =
    Math.floor(Math.random() * (MAX_DOLLARS - MIN_DOLLARS + 1)) + MIN_DOLLARS;
  return dollars * 100;
}

/** A random donor display name from the built-in demo list. */
export function randomDonorName(): string {
  // The index is always in range; the fallback only satisfies noUncheckedIndexedAccess.
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] ?? "Anonymous";
}
