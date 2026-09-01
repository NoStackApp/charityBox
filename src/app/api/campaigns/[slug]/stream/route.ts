import { getSnapshot, type CampaignSnapshot } from "@/lib/campaignStats";

// Prisma requires the Node runtime (Edge cannot run it). force-dynamic prevents any
// caching of the stream. maxDuration keeps us under Vercel's function duration cap.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POLL_INTERVAL_MS = 2_000; // DB re-check cadence
const HEARTBEAT_INTERVAL_MS = 15_000; // proxy keep-alive comment cadence
const STREAM_LIFETIME_MS = 55_000; // self-close under the 60s function cap

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function encodeSnapshot(snapshot: CampaignSnapshot): string {
  return `data: ${JSON.stringify(snapshot)}\n\n`;
}

/**
 * GET /api/campaigns/[slug]/stream — Server-Sent Events transport.
 *
 * IMPORTANT (serverless constraint): this loop reads the DATABASE every 2s. It must
 * NOT use an in-process event emitter. On Vercel the instance handling a donation
 * POST is not the instance holding this SSE connection, so in-memory pub/sub would
 * silently never fire. DB polling inside the stream is the correct serverless-safe
 * approach; do not "optimize" it into a shared-memory emitter.
 *
 * Behavior: emits the current snapshot immediately, then re-checks every 2s and
 * emits ONLY when `seq` advanced. A heartbeat comment keeps proxies from idling the
 * connection out. Snapshots are absolute, so after this stream self-closes (~55s)
 * the browser's EventSource auto-reconnects with no replay needed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // 404 for unknown slug before opening a stream.
  const initial = await getSnapshot(slug);
  if (!initial) {
    return new Response(JSON.stringify({ error: "Campaign not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const startedAt = Date.now();
      let lastSentSeq = initial.seq;
      let lastHeartbeat = Date.now();

      const safeEnqueue = (chunk: string): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          // Controller already closed (client gone) — stop the loop.
          closed = true;
          return false;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Client disconnected — abort the loop and release resources.
      request.signal.addEventListener("abort", close);

      // Emit the initial snapshot immediately so a fresh EventSource is current.
      safeEnqueue(encodeSnapshot(initial));

      while (!closed) {
        await sleep(POLL_INTERVAL_MS);
        if (closed) break;

        if (Date.now() - startedAt >= STREAM_LIFETIME_MS) {
          // Graceful self-close under the function duration cap; the browser
          // EventSource will auto-reconnect.
          break;
        }

        try {
          const snapshot = await getSnapshot(slug);
          if (snapshot && snapshot.seq > lastSentSeq) {
            if (safeEnqueue(encodeSnapshot(snapshot))) {
              lastSentSeq = snapshot.seq;
            }
          }
        } catch {
          // Transient DB error — skip this tick, keep the stream alive rather than
          // tearing it down.
        }

        if (Date.now() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
          if (safeEnqueue(`: ping\n\n`)) {
            lastHeartbeat = Date.now();
          }
        }
      }

      request.signal.removeEventListener("abort", close);
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
