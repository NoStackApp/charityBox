import { describe, it, expect } from "vitest";
import { formatMoney, percentRaised } from "~/lib/money";

describe("formatMoney", () => {
  it("formats USD cents as a grouped dollar string", () => {
    expect(formatMoney(123456, "USD")).toBe("$1,234.56");
  });

  it("formats zero", () => {
    expect(formatMoney(0, "USD")).toBe("$0.00");
  });

  it("formats large values with grouping", () => {
    expect(formatMoney(10_000_000, "USD")).toBe("$100,000.00");
  });

  it("respects a different currency", () => {
    // Non-USD still divides by 100 at format time; exact glyph varies by ICU but
    // the numeric grouping is stable.
    expect(formatMoney(123456, "EUR")).toContain("1,234.56");
  });
});

describe("percentRaised", () => {
  it("computes a normal under-goal percentage (floored)", () => {
    expect(percentRaised(2_500_000, 10_000_000)).toBe(25);
    // 3333/10000 -> 33.33 -> floored to 33
    expect(percentRaised(3_333_333, 10_000_000)).toBe(33);
  });

  it("returns exactly 100 at the goal", () => {
    expect(percentRaised(10_000_000, 10_000_000)).toBe(100);
  });

  it("is uncapped over the goal", () => {
    expect(percentRaised(12_700_000, 10_000_000)).toBe(127);
  });

  it("guards divide-by-zero when goal is 0", () => {
    expect(percentRaised(0, 0)).toBe(0);
    expect(percentRaised(500, 0)).toBe(100);
  });
});
