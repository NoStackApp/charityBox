"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "~/trpc/react";
import { applySnapshot } from "~/hooks/applySnapshot";
import type { CampaignSnapshot } from "~/server/campaignStats";

export type ConnectionState = "sse" | "polling";

const POLL_INTERVAL_MS = 5_000;

export { applySnapshot };

/**
 * Subscribes to a campaign's live stats.
 *
 * Transport state machine:
 *  - Primary: an EventSource on `/api/campaigns/[slug]/stream`.
 *  - Fallback: on EventSource `error`, poll the `campaign.snapshot` tRPC query every
 *    5s while the EventSource keeps trying to reconnect. Polling stops on the next
 *    `open`.
 *  - Every incoming snapshot (SSE or poll) goes through {@link applySnapshot}, so the
 *    exposed total is strictly non-decreasing regardless of delivery order.
 *
 * @param slug    the campaign slug
 * @param initial the server-rendered snapshot; seeds the monotonicity baseline so the
 *                page never flashes backwards from its SSR value.
 */
export function useLiveCampaignStats(slug: string, initial: CampaignSnapshot) {
  const [snapshot, setSnapshot] = useState<CampaignSnapshot>(initial);
  const [connection, setConnection] = useState<ConnectionState>("sse");
  const utils = api.useUtils();

  // Ref mirror of the latest applied snapshot so the polling loop can compare seq
  // without being re-created on every update.
  const snapshotRef = useRef<CampaignSnapshot>(initial);

  const apply = (next: CampaignSnapshot) => {
    setSnapshot((prev) => {
      const applied = applySnapshot(prev, next);
      snapshotRef.current = applied;
      return applied;
    });
  };

  useEffect(() => {
    let closed = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPolling = () => {
      if (pollTimer !== null || closed) return;
      const poll = async () => {
        try {
          // staleTime: 0 forces a real network fetch each tick — the polling
          // fallback must never be satisfied from the query cache.
          const data = await utils.campaign.snapshot.fetch(
            { slug },
            { staleTime: 0 },
          );
          if (!closed) apply(data);
        } catch {
          // Network error during fallback — try again next interval.
        }
      };
      pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
      void poll(); // fire immediately so the fallback catches up fast
    };

    const es = new EventSource(`/api/campaigns/${slug}/stream`);

    es.addEventListener("open", () => {
      if (closed) return;
      // Reconnected — leave fallback mode and stop the redundant polling.
      stopPolling();
      setConnection("sse");
    });

    es.addEventListener("message", (event) => {
      if (closed) return;
      try {
        const data = JSON.parse(event.data as string) as CampaignSnapshot;
        apply(data);
      } catch {
        // Ignore malformed frame.
      }
    });

    es.addEventListener("error", () => {
      if (closed) return;
      // EventSource auto-reconnects in the background; cover the gap with polling.
      setConnection("polling");
      startPolling();
    });

    return () => {
      closed = true;
      stopPolling();
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return {
    totalMinor: snapshot.totalMinor,
    donorCount: snapshot.donorCount,
    seq: snapshot.seq,
    connection,
  };
}
