import Link from "next/link";

/**
 * Minimal landing page. Campaign listing/index pages are out of scope for this PR;
 * this simply links to the seeded sample campaign.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-4xl font-bold text-stone-900 sm:text-5xl">
        charity<span className="text-emerald-700">Box</span>
      </h1>
      <p className="mt-4 max-w-md text-lg text-stone-600">
        Short, high-intensity fundraising campaigns with a live goal thermometer.
      </p>
      <Link
        href="/c/save-the-community-center"
        className="mt-8 rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
      >
        View the sample campaign →
      </Link>
    </main>
  );
}
