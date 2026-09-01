"use client";

import { formatMoney, percentRaised } from "@/lib/money";

interface ThermometerProps {
  totalMinor: number;
  goalMinor: number;
  currency: string;
}

/**
 * Horizontal goal thermometer.
 *
 * The fill width is capped at 100% visually, while the label shows the true, uncapped
 * percentage (e.g. "127% of goal"). The fill animates smoothly whenever the total
 * changes via a CSS width transition.
 *
 * Accessibility: exposes `role="progressbar"` with `aria-valuenow` set to the uncapped
 * percentage and `aria-valuemax=100`, plus the raised/goal amounts in visible text.
 */
export function Thermometer({
  totalMinor,
  goalMinor,
  currency,
}: ThermometerProps) {
  const percent = percentRaised(totalMinor, goalMinor);
  const cappedPercent = Math.min(100, percent);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-bold text-emerald-700 sm:text-4xl">
            {formatMoney(totalMinor, currency)}
          </div>
          <div className="text-sm text-stone-500">
            raised of {formatMoney(goalMinor, currency)} goal
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-stone-800 sm:text-3xl">
            {percent}%
          </div>
          <div className="text-sm text-stone-500">of goal</div>
        </div>
      </div>

      <div
        className="h-6 w-full overflow-hidden rounded-full bg-stone-200 shadow-inner"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${formatMoney(totalMinor, currency)} raised of ${formatMoney(
          goalMinor,
          currency,
        )} goal, ${percent} percent`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-[width] duration-[600ms] ease-out"
          style={{ width: `${cappedPercent}%` }}
        />
      </div>
    </div>
  );
}
