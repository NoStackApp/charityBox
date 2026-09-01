/**
 * Money helpers.
 *
 * Money is stored and transported as integer minor units (cents). The ONLY place a
 * division by 100 happens is here, at render time, inside `formatMoney`. Never store
 * or transport a float amount.
 */

/**
 * Format an integer minor-unit amount as a localized currency string.
 *
 * @param minor    Amount in minor units (cents). e.g. 123456 → "$1,234.56" for USD.
 * @param currency ISO 4217 currency code, e.g. "USD".
 */
export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

/**
 * Uncapped, integer percentage of the goal that has been raised.
 *
 * Guards against a goal of 0 (data-entry edge): returns 100 if anything has been
 * raised, otherwise 0 — never divides by zero. The returned value is NOT capped at
 * 100; callers cap the *visual* bar separately while showing the true percentage.
 *
 * @returns floor(totalMinor / goalMinor * 100), or the goal-0 guard value.
 */
export function percentRaised(totalMinor: number, goalMinor: number): number {
  if (goalMinor <= 0) {
    return totalMinor > 0 ? 100 : 0;
  }
  return Math.floor((totalMinor / goalMinor) * 100);
}
