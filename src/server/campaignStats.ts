import { db } from "~/server/db";

/**
 * An absolute snapshot of a campaign's live totals.
 *
 * Snapshots are always absolute (never deltas): `seq` is the campaign's `version`
 * counter, `totalMinor` the summed donations, `donorCount` the number of donations.
 * Because they are absolute, a client that misses events self-heals on the next
 * snapshot, and reconnecting SSE streams need no replay.
 */
export interface CampaignSnapshot {
  seq: number;
  totalMinor: number;
  donorCount: number;
}

// Raw row shape returned by the joined query. Postgres SUM(bigint) and COUNT come
// back as bigint via node-postgres, which Prisma surfaces as JS bigint.
interface SnapshotRow {
  seq: number;
  totalMinor: bigint;
  donorCount: bigint;
}

/**
 * Read a consistent {seq, totalMinor, donorCount} snapshot for a campaign.
 *
 * Uses a SINGLE SQL statement on purpose: one statement sees one MVCC snapshot in
 * Postgres, so the `version`, the SUM, and the COUNT are guaranteed mutually
 * consistent — a donation cannot land "between" reading the version and reading the
 * sum. Splitting this into multiple queries would open that race.
 *
 * The LEFT JOIN + COALESCE means a campaign with zero donations returns
 * {seq: 0, totalMinor: 0, donorCount: 0} rather than no row.
 *
 * @returns the snapshot, or `null` if no campaign has the given slug.
 */
export async function getSnapshot(
  slug: string,
): Promise<CampaignSnapshot | null> {
  const rows = await db.$queryRaw<SnapshotRow[]>`
    SELECT c."version" AS seq,
           COALESCE(SUM(d."amountMinor"), 0)::bigint AS "totalMinor",
           COUNT(d.id)::bigint AS "donorCount"
    FROM "Campaign" c
    LEFT JOIN "Donation" d ON d."campaignId" = c.id
    WHERE c."slug" = ${slug}
    GROUP BY c.id
  `;

  const row = rows[0];
  if (!row) {
    return null;
  }

  // bigint → number is safe here: campaign totals stay far below 2^53.
  return {
    seq: Number(row.seq),
    totalMinor: Number(row.totalMinor),
    donorCount: Number(row.donorCount),
  };
}
