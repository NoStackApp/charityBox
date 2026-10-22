import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getSnapshot } from "~/server/campaignStats";

export const campaignRouter = createTRPCRouter({
  /**
   * Current absolute snapshot `{ seq, totalMinor, donorCount }` for a campaign.
   * Used by the client's polling fallback when SSE is unavailable; the SSE
   * transport itself stays a route handler (see /api/campaigns/[slug]/stream).
   */
  snapshot: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }) => {
      const snapshot = await getSnapshot(input.slug);
      if (!snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found",
        });
      }
      return snapshot;
    }),
});
