import type { CampaignSnapshot } from "~/server/campaignStats";

/**
 * The monotonicity reducer — the core of the "never moves backwards" guarantee.
 *
 * Returns `next` ONLY if its sequence number is strictly greater than the one already
 * applied; otherwise it returns `prev` unchanged. This is what makes an out-of-order
 * snapshot (e.g. a slow polling response computed before, but delivered after, a
 * newer SSE event) harmless: it is simply discarded. Pure and side-effect free so it
 * can be unit-tested directly.
 *
 * @param prev the highest snapshot applied so far
 * @param next an incoming snapshot from SSE or polling
 */
export function applySnapshot(
  prev: CampaignSnapshot,
  next: CampaignSnapshot,
): CampaignSnapshot {
  return next.seq > prev.seq ? next : prev;
}
