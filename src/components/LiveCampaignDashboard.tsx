"use client";

import { useLiveCampaignStats } from "@/hooks/useLiveCampaignStats";
import type { CampaignSnapshot } from "@/lib/campaignStats";
import { Thermometer } from "@/components/Thermometer";
import { Countdown } from "@/components/Countdown";

interface LiveCampaignDashboardProps {
  slug: string;
  goalMinor: number;
  currency: string;
  deadline: string; // ISO string
  timezone: string;
  initial: CampaignSnapshot;
}

/**
 * Client-side live region of the campaign page: subscribes to the SSE/polling hook and
 * renders the thermometer, donor count, and countdown. Seeded with the server-rendered
 * snapshot so there is no zero-flash and the monotonicity baseline starts correct.
 */
export function LiveCampaignDashboard({
  slug,
  goalMinor,
  currency,
  deadline,
  timezone,
  initial,
}: LiveCampaignDashboardProps) {
  const { totalMinor, donorCount, connection } = useLiveCampaignStats(
    slug,
    initial,
  );

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <Thermometer
        totalMinor={totalMinor}
        goalMinor={goalMinor}
        currency={currency}
      />

      <div className="mt-6 flex items-center justify-between border-t border-stone-100 pt-6">
        <div>
          <div className="text-2xl font-bold text-stone-800 tabular-nums">
            {donorCount.toLocaleString("en-US")}
          </div>
          <div className="text-sm text-stone-500">
            {donorCount === 1 ? "donor" : "donors"}
          </div>
        </div>
        <div>
          <Countdown deadline={deadline} timezone={timezone} />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs">
        {connection === "sse" ? (
          <span className="flex items-center gap-1.5 text-emerald-600">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-amber-600">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            Reconnecting…
          </span>
        )}
      </div>
    </div>
  );
}
