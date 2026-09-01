"use client";

import { useEffect, useState } from "react";
import { computeRemaining, formatDeadline, type Remaining } from "@/lib/countdown";

interface CountdownProps {
  /** Deadline as an ISO 8601 string (absolute UTC instant). */
  deadline: string;
  /** IANA timezone used only to format the human-readable deadline date line. */
  timezone: string;
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="tabular-nums text-2xl font-bold text-stone-800 sm:text-3xl">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-xs uppercase tracking-wide text-stone-500">
        {label}
      </span>
    </div>
  );
}

/**
 * Live countdown to the campaign deadline.
 *
 * Ticks every second and shows days/hours/minutes/seconds; at or past the deadline it
 * renders "Campaign ended" (the page itself stays live/read-only). To avoid a React
 * hydration mismatch — server and client compute "now" at different instants — the
 * live numbers are gated behind a `mounted` flag and a stable placeholder renders
 * until the client takes over.
 */
export function Countdown({ deadline, timezone }: CountdownProps) {
  const deadlineMs = new Date(deadline).getTime();
  const [remaining, setRemaining] = useState<Remaining | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(computeRemaining(deadlineMs, Date.now()));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [deadlineMs]);

  const deadlineLabel = formatDeadline(deadline, timezone);

  if (remaining === null) {
    // Hydration-safe placeholder (client hasn't mounted yet).
    return (
      <div className="text-center">
        <div className="h-9 text-sm text-stone-400">Loading countdown…</div>
        <div className="mt-1 text-sm text-stone-500">Ends {deadlineLabel}</div>
      </div>
    );
  }

  if (remaining.ended) {
    return (
      <div className="text-center">
        <div className="text-xl font-semibold text-rose-600">Campaign ended</div>
        <div className="mt-1 text-sm text-stone-500">Ended {deadlineLabel}</div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="flex items-start justify-center gap-4 sm:gap-6">
        <Unit value={remaining.days} label="Days" />
        <Unit value={remaining.hours} label="Hours" />
        <Unit value={remaining.minutes} label="Min" />
        <Unit value={remaining.seconds} label="Sec" />
      </div>
      <div className="mt-2 text-sm text-stone-500">Ends {deadlineLabel}</div>
    </div>
  );
}
