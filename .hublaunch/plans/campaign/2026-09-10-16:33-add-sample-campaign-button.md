# Add "Add sample campaign" button to the landing page

## Plan Summary

- **What/why**: Replaces the landing page's single hardcoded "View the sample campaign →" link with a live list of all campaigns, and adds a demo-only **"Add sample campaign"** button beneath it that creates a new sample campaign from the browser (no CLI needed on a fresh deployment).
- **Key decisions**: (1) The button is a tRPC mutation (`campaign.createSample`) gated by the existing `ALLOW_FAKE_DONATIONS` flag, both in the UI (button not rendered) and on the server (mutation refuses). (2) Each click creates an **additional** campaign, rotating through a built-in list of sample orgs/stories, with numeric slug suffixes for uniqueness. (3) The sample content and DB write logic move to shared modules that `prisma/seed.ts` also uses, so the seed and the button can never drift. The server helper takes a `PrismaClient` argument so `seed.ts` does not have to import `src/env.js` (which would require Clerk env vars just to seed).
- **Most important files**: `src/server/sampleCampaign.ts` (new, DB write), `src/lib/sampleCampaigns.ts` (new, templates + pure helpers), `src/app/page.tsx` (landing page), `src/components/AddSampleCampaignButton.tsx` (new client component), `src/server/api/routers/campaign.ts` (new mutation), `prisma/seed.ts` (refactored to use the shared helper).
- **Priority/complexity**: Medium priority, Medium complexity (touches UI, tRPC, seed, and tests, but no schema change).

## Problem Statement

The only way to get a campaign into the database today is the CLI seed (`pnpm db:seed`). On a fresh deployment (e.g. Vercel + an empty Neon database) or for anyone demoing without a terminal, the landing page's "View the sample campaign →" link 404s and there is no in-app way to fix it. This plan adds an in-app "Add sample campaign" button (demo-tooling only) and makes the landing page reflect what actually exists in the database.

### Planning Context

> **Note**: This section captures key points from the planning discussion to provide complete context for implementation.

**Key Requirements Discussed:**

- The button sits **underneath** the campaign link area on the landing page (`src/app/page.tsx`) and is labelled exactly **"Add sample campaign"**.
- The button is **secondary** in style (outlined/neutral), visually subordinate to the primary emerald buttons used elsewhere.
- Each click creates a **new, additional** campaign (not an upsert of one canonical campaign). Content rotates through a built-in list of **4 sample organisations/stories**; slugs get a numeric suffix (`-2`, `-3`, …) when the base slug is already taken, and titles get a matching ` #2`, ` #3` suffix so campaigns remain distinguishable.
- The single hardcoded "View the sample campaign →" link is **replaced by a server-rendered list of all campaigns** in the database (title + org, linking to `/c/[slug]`), with an empty-state message when there are none.
- After a successful click the user **stays on the landing page** and sees an inline **"Sample campaign added"** message with a link to the new campaign's `/c/[slug]` page; the campaign list refreshes to include it.
- Visibility/authorisation is gated by the **existing `ALLOW_FAKE_DONATIONS` env flag** (exact string `"true"`), reusing it as the single "demo mode" switch. No new env var. No Clerk auth gating.
- `prisma/seed.ts` is **refactored** to call the shared helper. Its observable behaviour is unchanged: idempotent upsert of `save-the-community-center` (the Riverside Community Center campaign), refreshing the deadline to 24 hours out on every run.

**Decisions Made:**

- **tRPC mutation over a Route Handler or Server Action**: the app already has `campaignRouter`, `TRPCReactProvider` wrapping every page, and typed `api` hooks, so a mutation needs no new plumbing and gives typed errors to the client.
- **Gate on the server too, not only in the UI**: hiding the button is cosmetic; the mutation itself must refuse when the flag is off, otherwise anyone can call `/api/trpc/campaign.createSample` directly in production.
- **Server helper takes a `PrismaClient` parameter** rather than importing the `~/server/db` singleton: `src/server/db.ts` imports `src/env.js`, which validates `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at import time. The seed must keep working with only `DATABASE_URL` set (as it does today, using its own `new PrismaClient()`), so the helper must not pull in env validation. The tRPC procedure passes `ctx.db`.
- **Pure helpers in `src/lib/`, DB writes in `src/server/`**: matches the existing split (`src/lib/donationDefaults.ts` vs `src/server/donations.ts`) and makes the slug/rotation logic unit-testable without a database (Vitest runs with no DB).
- **Rotation is by total campaign count** (`count % templates.length`): deterministic, needs no extra column, and because the seed creates template 0 the first click naturally produces template 1.
- **Unique-constraint race is handled by one retry, then a CONFLICT error**: two simultaneous clicks can compute the same slug; Prisma throws `P2002`. Recomputing once covers the realistic case; a second failure surfaces a clear message rather than a 500.
- **All templates reuse `/images/hero-sample.svg`**: it is the only hero image in `public/images/`. Adding artwork is out of scope.

**Out of Scope:**

- Deleting or editing campaigns; any campaign-creation form; admin UI.
- Authentication gating (Clerk remains installed but ungated, as today).
- Changes to the donation tooling (`scripts/donate.ts`, `POST /api/dev/donate`).
- New hero images per template.
- A Prisma schema change or migration (none is needed).

### Background & Context

- **Why**: Demo deployments need a zero-terminal way to create campaigns; the landing page should not link to something that may not exist.
- **Current state**: `src/app/page.tsx` is a static server component with one `<Link href="/c/save-the-community-center">`. Campaign creation exists only in `prisma/seed.ts` (upsert of one slug). `campaignRouter` has one query (`snapshot`) and no mutations.
- **Who is affected**: developers/demoers of charityBox; end users see a landing page that lists real campaigns.

**Current Behavior**:

- Landing page always shows "View the sample campaign →" pointing at `/c/save-the-community-center`, which 404s until `pnpm db:seed` has been run.
- No way to create a campaign from the app.

**Desired Behavior**:

- Landing page lists every campaign in the DB (newest first) or shows "No campaigns yet." when empty.
- When `ALLOW_FAKE_DONATIONS="true"`, an "Add sample campaign" button appears beneath the list; clicking it creates a new sample campaign, shows "Sample campaign added" with a link to it, and the list updates without a full page reload.
- When the flag is not `"true"`, the button is absent and the mutation returns `NOT_FOUND`.
- `pnpm db:seed` behaves exactly as before.

## Detailed Requirements

### Functional Requirements

1. **Sample campaign templates** (`src/lib/sampleCampaigns.ts`, new)

   - Export `interface SampleCampaignTemplate { slug: string; orgName: string; title: string; story: string; goalMinor: number; currency: string; timezone: string; heroImagePath: string }`.
   - Export `SAMPLE_CAMPAIGN_TEMPLATES: readonly SampleCampaignTemplate[]` with exactly 4 entries. **Entry 0 must be the existing Riverside Community Center campaign, copied verbatim from `prisma/seed.ts`** (slug `save-the-community-center`, orgName `Riverside Community Center`, title `Save the Community Center`, the three-paragraph `STORY` joined with `"\n\n"`, `goalMinor: 10_000_000`, `currency: "USD"`, `timezone: "America/New_York"`, `heroImagePath: "/images/hero-sample.svg"`). Entries 1–3 are new nondenominational sample orgs (see Proposed Solution for the exact content). All use `/images/hero-sample.svg`.
   - Export `CANONICAL_SAMPLE_SLUG = "save-the-community-center"` (equal to `SAMPLE_CAMPAIGN_TEMPLATES[0].slug`).
   - Export `SAMPLE_DEADLINE_MS = 24 * 60 * 60 * 1000` and `sampleDeadline(now: Date = new Date()): Date` returning `now + 24h`.
   - Export `pickTemplate(existingCampaignCount: number): SampleCampaignTemplate` returning `SAMPLE_CAMPAIGN_TEMPLATES[existingCampaignCount % SAMPLE_CAMPAIGN_TEMPLATES.length]`. Negative or non-integer input: treat as `0` (use `Math.max(0, Math.floor(n))`).
   - Export `nextAvailableSlug(baseSlug: string, takenSlugs: Iterable<string>): { slug: string; ordinal: number }`: returns `{ slug: baseSlug, ordinal: 1 }` if `baseSlug` is not taken; otherwise the smallest `n >= 2` such that `` `${baseSlug}-${n}` `` is not taken, with `ordinal: n`.
   - Export `titleForOrdinal(title: string, ordinal: number): string`: returns `title` when `ordinal === 1`, otherwise `` `${title} #${ordinal}` ``.

2. **Server write helper** (`src/server/sampleCampaign.ts`, new)

   - `upsertCanonicalSampleCampaign(client: PrismaClient): Promise<Campaign>` — identical semantics to today's `prisma/seed.ts`: `client.campaign.upsert({ where: { slug: CANONICAL_SAMPLE_SLUG }, update: { deadline, orgName, title, story }, create: { ...template0, deadline } })` with `deadline = sampleDeadline()`.
   - `createSampleCampaign(client: PrismaClient): Promise<Campaign>` — creates a **new** row:
     1. `count = await client.campaign.count()`; `template = pickTemplate(count)`.
     2. `taken = await client.campaign.findMany({ where: { slug: { startsWith: template.slug } }, select: { slug: true } })`.
     3. `{ slug, ordinal } = nextAvailableSlug(template.slug, taken.map(t => t.slug))`.
     4. `client.campaign.create({ data: { slug, orgName, title: titleForOrdinal(template.title, ordinal), story, heroImagePath, goalMinor, currency, timezone, deadline: sampleDeadline() } })`.
     5. If `create` throws `Prisma.PrismaClientKnownRequestError` with `code === "P2002"`, repeat steps 2–4 **once**. If it throws `P2002` again, throw `SampleCampaignConflictError` (new error class exported from this file, message: `"A sample campaign with that slug was just created. Please try again."`).
   - The file must **not** import `~/server/db` or `~/env` (see Decisions Made). Import types from `../../generated/prisma` (`PrismaClient`, `Prisma`, `Campaign`).

3. **tRPC mutation** (`src/server/api/routers/campaign.ts`)

   - Add `createSample: publicProcedure.mutation(async ({ ctx }) => { ... })`.
   - First line: `if (env.ALLOW_FAKE_DONATIONS !== "true") throw new TRPCError({ code: "NOT_FOUND", message: "Not found" })` — same 404 semantics as `src/app/api/dev/donate/route.ts` lines 30–32.
   - Call `createSampleCampaign(ctx.db)`; map `SampleCampaignConflictError` to `TRPCError({ code: "CONFLICT", message: err.message })`; rethrow anything else.
   - Return `{ slug: campaign.slug, title: campaign.title }`.

4. **Landing page** (`src/app/page.tsx`)

   - Becomes an `async` server component with `export const dynamic = "force-dynamic"` (same as `src/app/c/[slug]/page.tsx` line 8) so the list reflects the live DB.
   - Fetches `db.campaign.findMany({ orderBy: { createdAt: "desc" }, select: { slug: true, title: true, orgName: true } })`.
   - Keeps the existing `<h1>` and tagline unchanged.
   - Replaces the single `<Link>` with a "Campaigns" section:
     - If the list is non-empty: `<ul>` of `<li><Link href={`/c/${slug}`}>` items showing the title (bold) and the org name (muted, smaller). Newest first.
     - If empty: `<p>No campaigns yet.</p>` in muted text.
   - Beneath the list: `{env.ALLOW_FAKE_DONATIONS === "true" && <AddSampleCampaignButton />}`. The flag is read server-side from `~/env`, so when it is off the button component is never rendered or shipped.
   - Update the file's JSDoc comment (currently "Minimal landing page … simply links to the seeded sample campaign") to describe the list + demo button.

5. **Client button** (`src/components/AddSampleCampaignButton.tsx`, new, `"use client"`)

   - Uses `api.campaign.createSample.useMutation()` from `~/trpc/react` and `useRouter()` from `next/navigation`.
   - Renders a `<button type="button">` labelled **"Add sample campaign"**; while `mutation.isPending` the label is "Adding…" and the button is `disabled`.
   - Secondary style: `rounded-full border border-stone-300 bg-white px-6 py-3 font-semibold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60`.
   - `onSuccess(data)`: store `data` in local state and call `router.refresh()` so the server-rendered list re-fetches and includes the new campaign.
   - Below the button, when a success result exists: `<p role="status">Sample campaign added: <Link href={`/c/${slug}`}>{title} →</Link></p>` (emerald text). Multiple clicks replace the message with the latest campaign.
   - When `mutation.error` exists: `<p role="alert">` with `mutation.error.message` in red (`text-red-600`). The message is cleared on the next successful click (mutation state resets automatically on `mutate`).

6. **Seed refactor** (`prisma/seed.ts`)

   - Remove the inline `SLUG`, `STORY`, and upsert; import `upsertCanonicalSampleCampaign` from `../src/server/sampleCampaign` and call `await upsertCanonicalSampleCampaign(prisma)` with the file's existing `new PrismaClient()` from `../generated/prisma`.
   - Keep the existing console log line (goal via `formatMoney`, deadline ISO) and the disconnect/error handling.
   - Behaviour must be byte-for-byte equivalent for the canonical campaign (same slug, org, title, story, goal, currency, timezone, hero, deadline refresh on re-run).

7. **De-duplicate the slug constant** (`src/lib/donationDefaults.ts`)

   - Change line 7 to `export const DEFAULT_SLUG = CANONICAL_SAMPLE_SLUG;` importing from `~/lib/sampleCampaigns`. The exported name and value stay the same, so `scripts/donate.ts` and the dev route are unaffected.

### Technical Requirements

- **Technology/Framework**: Next.js 16 App Router, React 19, tRPC v11, Prisma 6 (client generated to `generated/prisma`), Tailwind v4, Vitest 4, TypeScript strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use `import type` for type-only imports).
- **Location**: files listed in "Files Likely to Change" below.
- **Dependencies**: no new npm packages.
- **Constraints**: no schema change; no new env vars; `pnpm typecheck`, `pnpm test`, and `pnpm build` must stay green; seed must keep working with only `DATABASE_URL` in the environment.

### Non-Functional Requirements

- **Performance**: the landing page does one `findMany` (select of three columns) per request; the mutation does at most 2×(`count` + `findMany` + `create`). Fine at demo scale.
- **Security**: the mutation is refused server-side unless `ALLOW_FAKE_DONATIONS === "true"`. No user input is accepted by the mutation (no body), so there is nothing to sanitise. Never key the gate off `NODE_ENV` (see the comment in `src/env.js` lines 13–16).
- **Backwards Compatibility**: `pnpm db:seed`, `pnpm donate`, `/c/[slug]`, and the dev donate endpoint are unchanged in behaviour. The `/c/save-the-community-center` URL keeps working after seeding.
- **Error Handling**: tRPC errors (`NOT_FOUND`, `CONFLICT`, unexpected) are shown inline under the button via `mutation.error.message`; no thrown errors reach React error boundaries.

## Proposed Solution

**High-level approach**: extract the sample-campaign content and creation logic out of `prisma/seed.ts` into shared modules, expose creation through a flag-gated tRPC mutation, and turn the landing page into a dynamic list with a client-side button beneath it.

```
 src/app/page.tsx (RSC)                          src/components/AddSampleCampaignButton.tsx
 ┌──────────────────────────────┐                ┌─────────────────────────────────────┐
 │ db.campaign.findMany ──▶ list │                │ api.campaign.createSample.useMutation│
 │ env.ALLOW_FAKE_DONATIONS ─┐   │  renders when  │   onSuccess ──▶ router.refresh()     │
 │                           └───┼──── "true" ───▶│   shows "Sample campaign added" link │
 └──────────────────────────────┘                └──────────────────┬──────────────────┘
                                                                    │ POST /api/trpc
                                                                    ▼
 prisma/seed.ts                     src/server/api/routers/campaign.ts  (createSample)
 ┌──────────────────┐               ┌──────────────────────────────────────────────┐
 │ new PrismaClient │──▶            │ flag check ──▶ createSampleCampaign(ctx.db)  │
 └──────────────────┘   │           └──────────────────────┬───────────────────────┘
                        ▼                                  ▼
              src/server/sampleCampaign.ts  ──uses──▶  src/lib/sampleCampaigns.ts
              (upsertCanonical / createSample)         (templates, pickTemplate,
                                                        nextAvailableSlug, titleForOrdinal)
```

### Key Components

1. **`src/lib/sampleCampaigns.ts`** (new, pure)

   - Holds the 4 templates and the pure helpers. No imports from `~/server` or `~/env`, so it is safe in unit tests, the seed, and the client bundle alike.
   - Template content for entries 1–3 (entry 0 is the existing Riverside text, copied verbatim from `prisma/seed.ts` lines 8–12):

     ```ts
     {
       slug: "rebuild-the-food-pantry",
       orgName: "Harbor Street Food Pantry",
       title: "Rebuild the Food Pantry",
       story: [
         "For twelve years the Harbor Street Food Pantry has handed out groceries to any neighbor who walks through the door, no questions asked. Last month our only walk-in refrigerator failed for good, and the fresh produce, dairy, and meat we depend on is spoiling within hours.",
         "A commercial refrigerator, a backup generator, and new shelving will cost far more than a volunteer-run pantry can absorb. Without them, we will have to cut fresh food from every bag we pack.",
         "We have 24 hours to raise what we need before the next delivery arrives. Every gift keeps real food on real tables this week.",
       ].join("\n\n"),
       goalMinor: 2_500_000, // $25,000.00
       currency: "USD",
       timezone: "America/Chicago",
       heroImagePath: "/images/hero-sample.svg",
     },
     {
       slug: "keep-the-library-open",
       orgName: "Friends of the Maple Grove Library",
       title: "Keep the Library Open",
       story: [
         "The Maple Grove branch library is the only free, quiet, warm place for miles where kids do homework, job seekers print résumés, and seniors meet every Tuesday. This year's budget cuts have left it three months of operating costs short of staying open.",
         "We are not asking for a new building. We are asking to keep the lights on, the staff paid, and the doors unlocked until the next fiscal year.",
         "Today, for one day only, our community is closing the gap together. Please give what you can and share this page.",
       ].join("\n\n"),
       goalMinor: 5_000_000, // $50,000.00
       currency: "USD",
       timezone: "America/Denver",
       heroImagePath: "/images/hero-sample.svg",
     },
     {
       slug: "new-roof-for-the-shelter",
       orgName: "Westside Animal Shelter",
       title: "A New Roof for the Shelter",
       story: [
         "Westside Animal Shelter takes in every stray, surrender, and rescue in the county, and finds homes for more than 900 animals a year. After this spring's storms the roof over the kennel wing is leaking into the cages whenever it rains.",
         "A full roof replacement is the one repair we cannot patch our way around. Until it is done, every wet night means moving frightened animals into hallways and offices.",
         "We are raising the full cost in the next 24 hours so work can start Monday. Your gift keeps them warm and dry.",
       ].join("\n\n"),
       goalMinor: 7_500_000, // $75,000.00
       currency: "USD",
       timezone: "America/Los_Angeles",
       heroImagePath: "/images/hero-sample.svg",
     }
     ```

2. **`src/server/sampleCampaign.ts`** (new, server-only DB writes)

   - Signature-level sketch:

     ```ts
     import type { Campaign, PrismaClient } from "../../generated/prisma";
     import { Prisma } from "../../generated/prisma";
     import {
       CANONICAL_SAMPLE_SLUG, SAMPLE_CAMPAIGN_TEMPLATES, nextAvailableSlug,
       pickTemplate, sampleDeadline, titleForOrdinal,
     } from "~/lib/sampleCampaigns";

     export class SampleCampaignConflictError extends Error {
       constructor() {
         super("A sample campaign with that slug was just created. Please try again.");
         this.name = "SampleCampaignConflictError";
       }
     }

     export async function upsertCanonicalSampleCampaign(client: PrismaClient): Promise<Campaign> { /* §2 above */ }

     export async function createSampleCampaign(client: PrismaClient): Promise<Campaign> {
       for (let attempt = 0; attempt < 2; attempt++) {
         const count = await client.campaign.count();
         const template = pickTemplate(count);
         const taken = await client.campaign.findMany({
           where: { slug: { startsWith: template.slug } }, select: { slug: true },
         });
         const { slug, ordinal } = nextAvailableSlug(template.slug, taken.map((t) => t.slug));
         try {
           return await client.campaign.create({ data: { ...template, slug, title: titleForOrdinal(template.title, ordinal), deadline: sampleDeadline() } });
         } catch (err) {
           if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt === 0) continue;
           if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new SampleCampaignConflictError();
           throw err;
         }
       }
       throw new SampleCampaignConflictError(); // unreachable; satisfies the return type
     }
     ```

   - Note: the `create` uses `...template` then overrides `slug` and `title`; `heroImagePath`, `goalMinor`, `currency`, `timezone`, `orgName`, `story` come from the template. Do not spread any non-column fields (the template interface has exactly the column names, so this is safe; if a field is added to the template later that is not a column, destructure explicitly instead).

3. **`campaign.createSample` mutation** — see Functional Requirement 3.

4. **Landing page + button** — see Functional Requirements 4–5.

5. **Seed refactor** — see Functional Requirement 6.

### Files Likely to Change

- `src/lib/sampleCampaigns.ts` — **new**: templates, `CANONICAL_SAMPLE_SLUG`, `pickTemplate`, `nextAvailableSlug`, `titleForOrdinal`, `sampleDeadline`.
- `src/lib/__tests__/sampleCampaigns.test.ts` — **new**: unit tests for the pure helpers.
- `src/server/sampleCampaign.ts` — **new**: `upsertCanonicalSampleCampaign`, `createSampleCampaign`, `SampleCampaignConflictError`.
- `src/server/api/routers/campaign.ts` — add `createSample` mutation.
- `src/app/page.tsx` — dynamic list of campaigns, flag-gated button, updated JSDoc.
- `src/components/AddSampleCampaignButton.tsx` — **new** client component.
- `prisma/seed.ts` — call the shared helper; remove the inline `SLUG`/`STORY`/upsert.
- `src/lib/donationDefaults.ts` — `DEFAULT_SLUG` re-exports `CANONICAL_SAMPLE_SLUG`.
- `README.md` — document the landing page list, the button, and the new files in the project structure.

### Code Patterns to Follow

**Pattern References:**

- **For the flag gate (server)**: follow [`src/app/api/dev/donate/route.ts`](src/app/api/dev/donate/route.ts) lines 30–32 (`if (env.ALLOW_FAKE_DONATIONS !== "true") return 404`). In tRPC the equivalent is `throw new TRPCError({ code: "NOT_FOUND" })`.
- **For tRPC procedures and error mapping**: follow [`src/server/api/routers/campaign.ts`](src/server/api/routers/campaign.ts) lines 14–25 (`publicProcedure`, `TRPCError` with `NOT_FOUND`). Use `.mutation()` instead of `.query()`; no `.input()` since the mutation takes no arguments.
- **For a server component reading the DB and rendering with `force-dynamic`**: follow [`src/app/c/[slug]/page.tsx`](src/app/c/[slug]/page.tsx) lines 7–8 and 22–24 (`export const dynamic = "force-dynamic"`, `db.campaign.findUnique`).
- **For a client component using hooks**: follow [`src/components/LiveCampaignDashboard.tsx`](src/components/LiveCampaignDashboard.tsx) lines 1–6 (`"use client"`, typed props, imports via `~/`). The tRPC hook object is `api` from [`src/trpc/react.tsx`](src/trpc/react.tsx) line 25.
- **For a shared server write path with typed errors**: follow [`src/server/donations.ts`](src/server/donations.ts) lines 3–17 (custom `Error` subclasses with `name` set) and lines 56–99 (single exported async function doing the DB work).
- **For pure helpers + tests**: follow [`src/lib/donationDefaults.ts`](src/lib/donationDefaults.ts) and [`src/lib/__tests__/money.test.ts`](src/lib/__tests__/money.test.ts) (Vitest `describe`/`it`/`expect`, imports via `~/`).
- **For button styling**: primary style reference is [`src/app/page.tsx`](src/app/page.tsx) lines 16–21; the header's neutral text button at [`src/app/layout.tsx`](src/app/layout.tsx) lines 32–34 shows the muted palette (`text-stone-700`, `hover:text-stone-900`). The new secondary button uses the exact class string in Functional Requirement 5.
- **For the seed's Prisma client**: keep [`prisma/seed.ts`](prisma/seed.ts) lines 1–4 and 47–56 (own `new PrismaClient()` from `../generated/prisma`, disconnect in `then`/`catch`).

**Anti-Patterns to Avoid:**

- Don't import `~/server/db` or `~/env` from `src/server/sampleCampaign.ts` or `src/lib/sampleCampaigns.ts` (would force Clerk env vars onto the seed and break the pure unit tests).
- Don't gate on `NODE_ENV` (explicitly forbidden by the comment in `src/env.js` lines 13–16).
- Don't rely only on hiding the button; the mutation must check the flag itself.
- Don't use floats for money; `goalMinor` is integer cents like everywhere else.
- Don't compute uniqueness with `count + 1` as the suffix; use `nextAvailableSlug` against the actual taken slugs so gaps and deletions never produce a collision.
- Don't add `.input()` with user-controllable fields to `createSample`; the templates are fixed by design.

## Implementation Steps

### Phase 1: Shared modules (no UI yet)

- [ ] Create `src/lib/sampleCampaigns.ts` with the interface, the 4 templates (entry 0 copied verbatim from `prisma/seed.ts` lines 6–12 and 31–39), `CANONICAL_SAMPLE_SLUG`, `SAMPLE_DEADLINE_MS`, `sampleDeadline`, `pickTemplate`, `nextAvailableSlug`, `titleForOrdinal`. Add JSDoc to each export.
- [ ] Create `src/lib/__tests__/sampleCampaigns.test.ts` (see Testing Requirements).
- [ ] Create `src/server/sampleCampaign.ts` with `SampleCampaignConflictError`, `upsertCanonicalSampleCampaign`, `createSampleCampaign` (per Functional Requirement 2 and the sketch in Key Components).
- [ ] Update `src/lib/donationDefaults.ts` line 7 to re-export `CANONICAL_SAMPLE_SLUG` as `DEFAULT_SLUG`.
- [ ] Run `pnpm test` and `pnpm typecheck`.

### Phase 2: Seed refactor

- [ ] Rewrite `prisma/seed.ts` `main()` to `const campaign = await upsertCanonicalSampleCampaign(prisma);` and keep the console log. Delete the now-unused `SLUG` and `STORY` constants.
- [ ] Run `pnpm db:seed` twice; confirm the second run logs the same slug/id and only the deadline changes (idempotent).

### Phase 3: tRPC mutation

- [ ] In `src/server/api/routers/campaign.ts` import `env` from `~/env`, `createSampleCampaign` and `SampleCampaignConflictError` from `~/server/sampleCampaign`; add the `createSample` mutation per Functional Requirement 3.
- [ ] Run `pnpm typecheck`.

### Phase 4: UI

- [ ] Create `src/components/AddSampleCampaignButton.tsx` per Functional Requirement 5.
- [ ] Rewrite `src/app/page.tsx` per Functional Requirement 4 (async RSC, `force-dynamic`, list, empty state, flag-gated button, updated JSDoc).
- [ ] Run `pnpm typecheck` and `pnpm build`.

### Phase 5: Docs & verification

- [ ] Update `README.md` (see Documentation Updates).
- [ ] Complete the Manual Testing Checklist.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm build` one final time.

Dependencies: Phase 1 before everything else; Phases 2, 3 can run in parallel after Phase 1; Phase 4 depends on Phase 3.

<details>
<summary><b>Implementation Detail</b></summary>

### 6. Edge Cases & Considerations

#### Edge Cases to Handle

1. **Empty database**: landing page shows "No campaigns yet." and (when flagged on) the button. First click: `count = 0` → template 0 → slug `save-the-community-center`, ordinal 1, title unchanged. So the button can fully replace the seed on a fresh deployment.
2. **Seeded database, first click**: `count = 1` → template 1 (`rebuild-the-food-pantry`).
3. **Fifth click and beyond**: rotation wraps (`count % 4`); base slug taken → `-2` suffix and title ` #2`.
4. **Slug prefix overlap**: `startsWith(template.slug)` may match unrelated slugs sharing a prefix; `nextAvailableSlug` only cares whether the exact candidates (`base`, `base-2`, …) are present, so extra matches are harmless.
5. **Manually deleted campaigns / gaps**: `nextAvailableSlug` picks the smallest free ordinal, so `base-2` can be reused after deletion; `count`-based rotation may pick a different template than a naive sequence would, which is acceptable.
6. **Two simultaneous clicks** compute the same slug → the second `create` throws `P2002` → one retry recomputes → success with the next ordinal. A second `P2002` surfaces `CONFLICT` with the "try again" message.
7. **Flag off**: button absent; a direct call to the mutation gets `NOT_FOUND`.
8. **Flag on but DB unreachable**: `findMany` on the landing page throws → Next's default error UI (same as `/c/[slug]` today). Mutation → tRPC `INTERNAL_SERVER_ERROR`, shown inline under the button.
9. **Double-click while pending**: button is `disabled` during `isPending`.
10. **`router.refresh()` timing**: the success message is stored in client state, so it survives the refresh; the list re-renders with the new row.

#### Potential Challenges

- ⚠️ **Type of the `client` parameter**: `PrismaClient` from `generated/prisma` is generic over client options; annotate the parameter as `PrismaClient` (default generics) — both `seed.ts`'s `new PrismaClient()` and `ctx.db` (created with a `log` option) are assignable. If TypeScript complains about the `log`-typed client, widen the parameter to `Pick<PrismaClient, "campaign">`.
- ⚠️ **`verbatimModuleSyntax`**: type-only imports (`Campaign`, `PrismaClient` as a type) must use `import type`; `Prisma` (a runtime namespace used for `instanceof`) must be a value import.
- ⚠️ **`generated/` is excluded from tsconfig `include`** but is still resolvable via relative import (as `src/server/db.ts` already does). Use the relative path `../../generated/prisma` from `src/server/`.
- ⚠️ **Dev-mode artificial delay**: `timingMiddleware` in `src/server/api/trpc.ts` adds 100–500 ms in dev; the "Adding…" state makes that visible and expected.

#### Security Considerations

- Mutation is unauthenticated by design (demo tooling) but only enabled when `ALLOW_FAKE_DONATIONS="true"`; README already instructs leaving it unset in real deployments.
- No user input reaches the DB (templates are constants); no XSS surface beyond rendering DB strings React-escaped.
- `CLERK_SECRET_KEY` and other secrets are untouched.

### 7. Technical Considerations

#### Dependencies

- None added. Uses existing `@trpc/*`, `@prisma/client`, `next`, `react`, `vitest`.

#### Configuration Changes

- None.

#### Environment Variables

- Reuses `ALLOW_FAKE_DONATIONS` (already in `src/env.js` and `.env.example`). Update the description comment in `.env.example` line 16 and the README env table to say it also enables the "Add sample campaign" button.

#### API Rate Limiting

- Not applicable (demo tooling, no external APIs).

#### Error Handling Strategies

- Server: typed `SampleCampaignConflictError` → `TRPCError CONFLICT`; flag off → `NOT_FOUND`; everything else propagates as `INTERNAL_SERVER_ERROR`.
- Client: `mutation.error?.message` rendered in a `role="alert"` paragraph; no toasts library.

### 8. Testing Requirements

#### Unit Tests (`src/lib/__tests__/sampleCampaigns.test.ts`)

- [ ] `SAMPLE_CAMPAIGN_TEMPLATES` has 4 entries, all slugs unique, kebab-case (`/^[a-z0-9]+(-[a-z0-9]+)*$/`), every string field non-empty, `goalMinor` a positive integer, `heroImagePath` starts with `/images/`.
- [ ] `SAMPLE_CAMPAIGN_TEMPLATES[0].slug === CANONICAL_SAMPLE_SLUG === "save-the-community-center"` and `[0].title === "Save the Community Center"`, `[0].goalMinor === 10_000_000`.
- [ ] `pickTemplate(0)` is entry 0, `pickTemplate(1)` entry 1, `pickTemplate(4)` entry 0 (wrap), `pickTemplate(-1)` entry 0.
- [ ] `nextAvailableSlug("x", [])` → `{ slug: "x", ordinal: 1 }`; with `["x"]` → `x-2`/2; with `["x","x-2"]` → `x-3`/3; with `["x","x-3"]` → `x-2`/2 (fills gaps); with `["x-2"]` → `x`/1.
- [ ] `titleForOrdinal("T", 1) === "T"`, `titleForOrdinal("T", 2) === "T #2"`.
- [ ] `sampleDeadline(new Date(0)).getTime() === 24 * 60 * 60 * 1000`.
- [ ] `DEFAULT_SLUG` from `~/lib/donationDefaults` equals `CANONICAL_SAMPLE_SLUG` (add to the existing test file or the new one).

#### Integration Tests

- No DB-backed automated tests exist in this repo (Vitest runs with `SKIP_ENV_VALIDATION` and no database); do not add any. Cover DB behaviour via the manual checklist.

#### Manual Testing Checklist

1. **Setup**: `pnpm db:up`, `pnpm db:generate`, `.env` with `ALLOW_FAKE_DONATIONS="true"`, `pnpm dev`.
2. **Empty DB**: truncate `"Campaign"` (`TRUNCATE "Campaign" RESTART IDENTITY CASCADE;`), open `/` → "No campaigns yet." and the "Add sample campaign" button. Click → "Sample campaign added: Save the Community Center →", list shows one item, link opens `/c/save-the-community-center` and renders the Riverside page.
3. **Rotation**: click three more times → Food Pantry, Library, Animal Shelter appear (newest first); click a fifth time → "Save the Community Center #2" at `/c/save-the-community-center-2`.
4. **Seed still works**: `pnpm db:seed` twice → same slug/id logged both times, deadline refreshed, no duplicate row.
5. **Donations unaffected**: `pnpm donate` (defaults to `save-the-community-center`) still succeeds; thermometer on that page moves.
6. **Flag off**: restart with `ALLOW_FAKE_DONATIONS=false pnpm dev` (per `.hublaunch/lessons/campaign-page_RALPH_LESSONS.md`, Next does not override already-set env vars, so pass it on the command line) → button absent; `curl -X POST localhost:3000/api/trpc/campaign.createSample -H 'content-type: application/json' -d '{}'` → tRPC `NOT_FOUND`.
7. **Build**: `pnpm build` succeeds; `/` is listed as dynamic.

#### Test Data Requirements

- None beyond the templates themselves; the dev Postgres container from `docker-compose.yml`.

### 9. Documentation Updates

#### User-Facing Documentation

- [ ] `README.md` "Local setup" step 4/5 note: the landing page now lists campaigns, and with `ALLOW_FAKE_DONATIONS="true"` you can click **Add sample campaign** instead of running `pnpm db:seed`.
- [ ] `README.md` "Environment variables" table: extend the `ALLOW_FAKE_DONATIONS` description to "…enables `POST /api/dev/donate` and the landing page's **Add sample campaign** button".
- [ ] `README.md` "Project structure": add `src/lib/sampleCampaigns.ts`, `src/server/sampleCampaign.ts`, `src/components/AddSampleCampaignButton.tsx`; update the `page.tsx` line to "landing page: campaign list + demo 'Add sample campaign' button"; update `seed.ts` line to "seeds the canonical sample campaign via src/server/sampleCampaign.ts".
- [ ] `.env.example` line 16 comment: mention the button.

#### Code Documentation

- [ ] JSDoc on every export in `src/lib/sampleCampaigns.ts` and `src/server/sampleCampaign.ts` (explain the `PrismaClient` parameter rationale in the module comment).
- [ ] JSDoc on `createSample` explaining the flag gate and rotation.
- [ ] Update the JSDoc at the top of `src/app/page.tsx`.

#### Examples to Include

```bash
# Demo without a terminal: set the flag, open the landing page, click "Add sample campaign"
ALLOW_FAKE_DONATIONS="true" pnpm dev   # then visit http://localhost:3000

# CLI seed is unchanged
pnpm db:seed
```

### 10. Acceptance Criteria

- [ ] **AC1**: With `ALLOW_FAKE_DONATIONS="true"`, `/` shows an "Add sample campaign" button beneath the campaign list; clicking it creates a new campaign, shows "Sample campaign added" with a working link, and the list updates without a manual reload.
- [ ] **AC2**: Repeated clicks rotate through the 4 templates and produce unique slugs/titles (`-2` / ` #2` suffixes after wrap-around).
- [ ] **AC3**: With the flag unset or `"false"`, the button is not rendered and `campaign.createSample` returns `NOT_FOUND`.
- [ ] **AC4**: `/` lists all campaigns newest-first, or "No campaigns yet." when empty.
- [ ] **AC5**: `pnpm db:seed` remains idempotent and produces the identical canonical campaign (slug, org, title, story, goal, currency, timezone, hero) with a refreshed deadline.
- [ ] **AC6**: `src/lib/__tests__/sampleCampaigns.test.ts` exists and `pnpm test`, `pnpm typecheck`, `pnpm build` all pass.
- [ ] **AC7**: README and `.env.example` document the button and the reused flag.

#### Definition of Done

- All acceptance criteria met
- All tests passing
- Code reviewed and approved
- Documentation updated
- No breaking changes

### 11. Dependencies & Related Work

#### Dependencies

- [ ] Depends on: nothing outstanding; builds on the merged campaign page work (PR #2).
- [ ] Required external setup: local Postgres (Docker) for manual testing only.

#### Blockers

- [ ] None.

#### Related Issues/PRs

- Builds on "Public Campaign Page with Live Goal Thermometer" (#2) and its plan at `.hublaunch/plans/campaign/2026-09-01-15:00-public-campaign-page-live-thermometer.md`.

</details>
