import { describe, it, expect } from "vitest";
import { applySnapshot } from "~/hooks/applySnapshot";
import type { CampaignSnapshot } from "~/server/campaignStats";

const snap = (
  seq: number,
  totalMinor: number,
  donorCount: number,
): CampaignSnapshot => ({ seq, totalMinor, donorCount });

describe("applySnapshot (monotonicity invariant)", () => {
  it("applies a strictly-newer seq", () => {
    const prev = snap(1, 1000, 1);
    const next = snap(2, 3000, 2);
    expect(applySnapshot(prev, next)).toBe(next);
  });

  it("discards an equal seq", () => {
    const prev = snap(5, 5000, 5);
    const next = snap(5, 9999, 9);
    expect(applySnapshot(prev, next)).toBe(prev);
  });

  it("discards an older seq", () => {
    const prev = snap(5, 5000, 5);
    const next = snap(3, 3000, 3);
    expect(applySnapshot(prev, next)).toBe(prev);
  });

  it("discards an older seq EVEN IF its total is higher (out-of-order delivery)", () => {
    const prev = snap(10, 10_000, 10);
    // A stale snapshot computed later but with a larger total must NOT be applied —
    // this is the case that would otherwise let the total jump/regress incorrectly.
    const stale = snap(9, 999_999, 99);
    expect(applySnapshot(prev, stale)).toBe(prev);
  });

  it("works from the initial server-rendered state", () => {
    const initial = snap(0, 0, 0);
    const first = snap(1, 500, 1);
    expect(applySnapshot(initial, first)).toBe(first);
    // Applying the same initial again is a no-op.
    expect(applySnapshot(initial, snap(0, 0, 0))).toBe(initial);
  });
});
