import { describe, it, expect } from "vitest";
import { computeRemaining } from "@/lib/countdown";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("computeRemaining", () => {
  it("breaks a duration into D/H/M/S", () => {
    const now = 0;
    const deadline = 2 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND;
    expect(computeRemaining(deadline, now)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      ended: false,
    });
  });

  it("handles sub-minute remaining", () => {
    expect(computeRemaining(45 * SECOND, 0)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 45,
      ended: false,
    });
  });

  it("reports ended exactly at the deadline", () => {
    expect(computeRemaining(1000, 1000)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      ended: true,
    });
  });

  it("reports ended after the deadline", () => {
    expect(computeRemaining(1000, 5000).ended).toBe(true);
  });

  it("floors partial seconds", () => {
    // 1500ms remaining -> 1 whole second
    const r = computeRemaining(1500, 0);
    expect(r.seconds).toBe(1);
    expect(r.ended).toBe(false);
  });
});
