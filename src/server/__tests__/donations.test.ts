import { describe, it, expect } from "vitest";
import { assertValidAmount, InvalidDonationError } from "~/server/donations";

describe("assertValidAmount", () => {
  it("accepts a positive integer number of minor units", () => {
    expect(() => assertValidAmount(1)).not.toThrow();
    expect(() => assertValidAmount(18000)).not.toThrow();
  });

  it("rejects zero", () => {
    expect(() => assertValidAmount(0)).toThrow(InvalidDonationError);
  });

  it("rejects negative amounts", () => {
    expect(() => assertValidAmount(-100)).toThrow(InvalidDonationError);
  });

  it("rejects non-integer amounts", () => {
    expect(() => assertValidAmount(10.5)).toThrow(InvalidDonationError);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => assertValidAmount(Number.NaN)).toThrow(InvalidDonationError);
    expect(() => assertValidAmount(Number.POSITIVE_INFINITY)).toThrow(
      InvalidDonationError,
    );
  });
});
