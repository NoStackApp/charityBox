import { NextResponse } from "next/server";
import { env } from "~/env";
import {
  createDonation,
  CampaignNotFoundError,
  InvalidDonationError,
} from "~/server/donations";
import { getSnapshot } from "~/server/campaignStats";
import {
  DEFAULT_SLUG,
  randomAmountMinor,
  randomDonorName,
} from "~/lib/donationDefaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/dev/donate — insert a fake donation (demo tooling; no payments yet).
 *
 * Gated behind `ALLOW_FAKE_DONATIONS === "true"`: any other value (or unset) makes
 * this endpoint respond 404, so it stays dead by default and is only switchable on
 * for a demo via an env var. Never keyed off NODE_ENV.
 *
 * Body: { slug?, amountMinor?, donorName?, anonymous? } with the same defaults as the
 * CLI (random amount + name). Returns { ok, donation, snapshot }.
 */
export async function POST(request: Request) {
  if (env.ALLOW_FAKE_DONATIONS !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slug =
    typeof body.slug === "string" && body.slug.length > 0
      ? body.slug
      : DEFAULT_SLUG;

  const amountMinor =
    body.amountMinor === undefined || body.amountMinor === null
      ? randomAmountMinor()
      : body.amountMinor;

  if (typeof amountMinor !== "number") {
    return NextResponse.json(
      { error: "amountMinor must be a number (minor units)." },
      { status: 400 },
    );
  }

  const donorName =
    body.donorName === undefined
      ? randomDonorName()
      : body.donorName === null
        ? null
        : typeof body.donorName === "string"
          ? body.donorName
          : undefined;

  if (donorName === undefined && body.donorName !== undefined) {
    return NextResponse.json(
      { error: "donorName must be a string or null." },
      { status: 400 },
    );
  }

  const anonymous = body.anonymous === true;

  try {
    const donation = await createDonation({
      slug,
      amountMinor,
      donorName,
      anonymous,
    });
    const snapshot = await getSnapshot(slug);
    return NextResponse.json({ ok: true, donation, snapshot });
  } catch (err) {
    if (err instanceof InvalidDonationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof CampaignNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
