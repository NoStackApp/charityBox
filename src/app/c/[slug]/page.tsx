import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSnapshot } from "@/lib/campaignStats";
import { LiveCampaignDashboard } from "@/components/LiveCampaignDashboard";

// Always render fresh so the server-rendered totals reflect the live DB.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Public campaign page `/c/[slug]`.
 *
 * Server-renders campaign details and a consistent initial snapshot so the page is
 * meaningful without JavaScript and never flashes $0. The live region (thermometer,
 * donor count, countdown) is a client component seeded with that snapshot.
 */
export default async function CampaignPage({ params }: PageProps) {
  const { slug } = await params;

  const campaign = await prisma.campaign.findUnique({ where: { slug } });
  if (!campaign) {
    notFound();
  }

  const snapshot = (await getSnapshot(slug)) ?? {
    seq: campaign.version,
    totalMinor: 0,
    donorCount: 0,
  };

  const storyParagraphs = campaign.story.split("\n\n").filter(Boolean);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <div className="overflow-hidden rounded-2xl shadow-sm">
        <div className="relative aspect-video w-full bg-stone-200">
          <Image
            src={campaign.heroImagePath}
            alt={campaign.title}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      </div>

      <header className="mt-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          {campaign.orgName}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-stone-900 sm:text-4xl">
          {campaign.title}
        </h1>
      </header>

      <section className="mt-6">
        <LiveCampaignDashboard
          slug={campaign.slug}
          goalMinor={campaign.goalMinor}
          currency={campaign.currency}
          deadline={campaign.deadline.toISOString()}
          timezone={campaign.timezone}
          initial={snapshot}
        />
      </section>

      <article className="prose prose-stone mt-8 max-w-none">
        {storyParagraphs.map((paragraph, i) => (
          <p key={i} className="mt-4 leading-relaxed text-stone-700">
            {paragraph}
          </p>
        ))}
      </article>
    </main>
  );
}
