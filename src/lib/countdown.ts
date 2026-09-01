/**
 * Countdown helpers — pure functions, unit-tested directly.
 */

export interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** True once the deadline has been reached or passed. */
  ended: boolean;
}

/**
 * Break the time remaining until `deadlineMs` (an absolute UTC instant in ms) down
 * into whole days/hours/minutes/seconds, measured from `nowMs`.
 *
 * At or after the deadline every field is 0 and `ended` is true. The countdown is
 * computed purely from absolute UTC instants; timezone only affects the separately
 * rendered deadline date string, never this arithmetic.
 */
export function computeRemaining(deadlineMs: number, nowMs: number): Remaining {
  const diff = deadlineMs - nowMs;
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, ended: false };
}

/**
 * Format an absolute deadline in a campaign's own IANA timezone, e.g.
 * "Sep 2, 2026, 6:00 PM EDT". Uses `Intl.DateTimeFormat` with the `timeZone` option.
 */
export function formatDeadline(deadlineIso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(deadlineIso));
}
