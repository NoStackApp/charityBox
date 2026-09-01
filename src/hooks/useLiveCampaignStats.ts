"use client";

import { useEffect, useRef, useState } from "react";
import type { CampaignSnapshot } from "@/lib/campaignStats";

export type ConnectionState = "sse" | "polling";

const POLL_INTERVAL_MS = 5_000;

/**
 * The monotonicity reducer — the core of the "never moves backwards" guarantee.
 *
 * Returns `next` ONLY if its sequence number is strictly greater than the one already
 * applied; otherwise it returns `prev` unchanged. This is what makes an out-of-order
 * snapshot (e.g. a slow polling response computed before, but delivered after, a
 * newer SSE event) harmless: it is simply discarded. Pure and side-effect free so it
 * can be unit-tested directly.
 *
 * @param prev the highest snapshot applied so far
 * @param next an incoming snapshot from SSE or polling
 */
export function applySnapshot(
  prev: CampaignSnapshot,
  next: CampaignSnapshot,
): CampaignSnapshot {
  return next.seq > prev.seq ? next : prev;
}

/**
 * Subscribes to a campaign's live stats.
 *
 * Transport state machine:
 *  - Primary: an EventSource on `/api/campaigns/[slug]/stream`.
 *  - Fallback: on EventSource `error`, poll `/api/campaigns/[slug]/snapshot` every 5s
 *    while the EventSource keeps trying to reconnect. Polling stops on the next `open`.
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
          const res = await fetch(`/api/campaigns/${slug}/snapshot`, {
            cache: "no-store",
          });
          if (!res.ok) return;
          const data = (await res.json()) as CampaignSnapshot;
          if (!closed) apply(data);
        } catch {
          // Network error during fallback — try again next interval.
        }
      };
      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
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
        const data = JSON.parse(event.data) as CampaignSnapshot;
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
  }, [slug]);

  return {
    totalMinor: snapshot.totalMinor,
    donorCount: snapshot.donorCount,
    seq: snapshot.seq,
    connection,
  };
}
