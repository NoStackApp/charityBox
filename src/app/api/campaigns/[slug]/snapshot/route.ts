import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/campaignStats";

// Prisma needs the Node runtime (not Edge); force-dynamic so the snapshot is never
// cached and always reflects the live database.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/[slug]/snapshot
 *
 * Returns the current absolute snapshot `{ seq, totalMinor, donorCount }` as JSON,
 * or 404 for an unknown slug. Used by the client's polling fallback.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const snapshot = await getSnapshot(slug);

  if (!snapshot) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
