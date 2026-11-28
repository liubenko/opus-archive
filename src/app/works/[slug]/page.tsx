import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  FileMusic,
  Layers,
  Music,
  Sparkles,
  BookOpen,
  Tag,
  ListMusic,
  ChevronRight,
  Globe2,
  MapPin,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Composer, Work, WorkMovement } from "@/types/database";
import { formatLifespan, getEraStyle } from "@/lib/constants";
import { ComposerAvatar } from "@/components/ComposerAvatar";
import { WorkListeningPanel } from "@/components/WorkListeningPanel";
import { WorkImslpEditions } from "@/components/WorkImslpEditions";
import { WorkWorkspaceActions } from "@/components/WorkWorkspaceActions";
import { AdminWorkEnrichButton } from "@/components/AdminWorkEnrichButton";

export const dynamic = "force-dynamic";

interface WorkPageProps {
  params: Promise<{ slug: string }>;
}

const ROMAN_NUMERALS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
  "XV",
  "XVI",
  "XVII",
  "XVIII",
  "XIX",
  "XX",
];

function formatMovementDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

async function fetchWorkBySlugOrId(slugOrId: string) {
  const isNumericId = /^\d+$/.test(slugOrId);
  const query = supabase
    .from("works")
    .select("*, composers(*)");

  const { data } = isNumericId
    ? await query.eq("id", Number(slugOrId)).maybeSingle()
    : await query.eq("slug", slugOrId).maybeSingle();

  if (!data) return null;
  const { composers, ...work } = data as Work & { composers: Composer | null };
  return { work: work as Work, composer: composers };
}

export async function generateMetadata({
  params,
}: WorkPageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = await fetchWorkBySlugOrId(slug);
  if (!found) {
    return { title: "Work Not Found — Opus Archive" };
  }
  const { work, composer } = found;
  const titleParts = [
    work.title,
    work.catalog_display ? `(${work.catalog_display})` : null,
    composer ? `— ${composer.name}` : null,
  ].filter(Boolean);

  const descriptionParts = [
    composer ? `${work.genre} by ${composer.name}` : work.genre,
    work.year_composed ? `composed in ${work.year_composed}` : null,
    work.key_signature ? `in ${work.key_signature}` : null,
    work.instrumentation ? `for ${work.instrumentation}` : null,
    work.duration_minutes ? `(~${work.duration_minutes} min)` : null,
  ].filter(Boolean);

  return {
    title: `${titleParts.join(" ")} | Opus Archive`,
    description:
      work.description ||
      `${descriptionParts.join(", ")}. View metadata, movements, and IMSLP sheet music on Opus Archive.`,
  };
}

export default async function WorkDetailPage({ params }: WorkPageProps) {
  const { slug } = await params;
  const found = await fetchWorkBySlugOrId(slug);

  if (!found) {
    notFound();
  }

  const { work, composer } = found;

  const [movementsRes, moreByComposerRes, similarWorksRes, liveEventsRes] = await Promise.all([
    supabase
      .from("work_movements")
      .select("*")
      .eq("work_id", work.id)
      .order("movement_number", { ascending: true }),
    composer
      ? supabase
          .from("works")
          .select("id, slug, title, nickname, catalog_display, genre, year_composed, is_popular, imslp_url")
          .eq("composer_id", composer.id)
          .neq("id", work.id)
          .order("is_popular", { ascending: false })
          .order("year_composed", { ascending: true })
          .limit(6)
      : Promise.resolve({ data: [] }),
    supabase
      .from("works")
      .select(
        "id, slug, title, catalog_display, genre, year_composed, imslp_url, composers(name, slug, era)"
      )
      .eq("genre", work.genre)
      .neq("composer_id", work.composer_id)
      .eq("is_popular", true)
      .order("year_composed", { ascending: true })
      .limit(4),
    supabase
      .from("concert_event_works")
      .select(
        "event_id, concert_events(id, title, starts_at, ticket_url, venues(slug, name, short_name, city, country))"
      )
      .eq("work_id", work.id),
  ]);

  const movements = (movementsRes.data ?? []) as WorkMovement[];
  const moreByComposer = (moreByComposerRes.data ?? []) as Pick<
    Work,
    | "id"
    | "slug"
    | "title"
    | "nickname"
    | "catalog_display"
    | "genre"
    | "year_composed"
    | "is_popular"
    | "imslp_url"
  >[];
  const similarWorks = (similarWorksRes.data ?? []) as (Pick<
    Work,
    "id" | "slug" | "title" | "catalog_display" | "genre" | "year_composed" | "imslp_url"
  > & {
    composers: { name: string; slug: string; era: string } | null;
  })[];

  const eraStyle = getEraStyle(composer?.era ?? "");
  const effectiveMovementsCount =
    work.movements_count ?? (movements.length > 0 ? movements.length : null);

  const livePerformances = ((liveEventsRes.data ?? []) as unknown as {
    event_id: number;
    concert_events: {
      id: number;
      title: string;
      starts_at: string;
      ticket_url: string | null;
      venues: {
        slug: string;
        name: string;
        short_name: string | null;
        city: string;
        country: string;
      } | null;
    } | null;
  }[])
    .map((r) => r.concert_events)
    .filter((ev): ev is NonNullable<typeof ev> => Boolean(ev))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 flex-wrap"
      >
        <Link
          href="/works"
          className="inline-flex items-center gap-1 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Works Index
        </Link>
        {composer && (
          <>
            <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            <Link
              href={`/composers/${composer.slug}`}
              className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              {composer.name}
            </Link>
          </>
        )}
        <ChevronRight className="w-3.5 h-3.5 opacity-50" />
        <span className="text-stone-800 dark:text-stone-200 font-medium truncate max-w-xs sm:max-w-md">
          {work.catalog_display || work.title}
        </span>
      </nav>

      {/* Main Work Hero Card */}
      <section className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200/90 dark:border-stone-800/90 p-6 sm:p-8 lg:p-10 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-3 min-w-0 flex-1">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {work.catalog_display && (
                <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700">
                  {work.catalog_display}
                </span>
              )}
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                {work.genre}
              </span>
              {composer && (
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${eraStyle.bg} ${eraStyle.border} ${eraStyle.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${eraStyle.color}`} />
                  {composer.era}
                </span>
              )}
              {work.is_popular && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/70">
                  <Sparkles className="w-3 h-3" />
                  Essential Repertoire
                </span>
              )}
            </div>

            {/* Title & Nickname */}
            <div>
              <h1 className="font-serif text-2xl sm:text-4xl font-bold text-[#1a1816] dark:text-[#f3efe6] leading-tight">
                {work.title}
              </h1>
              {work.nickname && (
                <p className="text-base sm:text-lg font-serif italic text-[#9a7432] dark:text-[#d4af6a] mt-1">
                  &ldquo;{work.nickname}&rdquo;
                </p>
              )}
            </div>

            {/* Composer Mini-Card */}
            {composer && (
              <Link
                href={`/composers/${composer.slug}`}
                className="inline-flex items-center gap-3 pt-1 group"
              >
                <ComposerAvatar
                  name={composer.name}
                  avatarUrl={composer.avatar_url}
                  era={composer.era}
                  size="sm"
                />
                <div className="leading-tight">
                  <span className="font-serif font-semibold text-sm text-stone-900 dark:text-[#f3efe6] group-hover:text-[#9a7432] dark:group-hover:text-[#d4af6a] transition-colors block">
                    {composer.name}
                  </span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    {formatLifespan(composer.birth_year, composer.death_year)} ·{" "}
                    {composer.nationality}
                  </span>
                </div>
              </Link>
            )}
          </div>

          {/* Primary Score Actions */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0">
            {work.imslp_url ? (
              <a
                href={work.imslp_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-sm font-semibold hover:opacity-90 transition-opacity shadow-xs"
              >
                <FileMusic className="w-4 h-4" />
                Open IMSLP Score
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>
            ) : composer?.imslp_url ? (
              <a
                href={composer.imslp_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-amber-300/80 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/40 text-[#8a6526] dark:text-[#e3c27d] text-sm font-semibold hover:bg-amber-100/70 dark:hover:bg-amber-900/40 transition-colors"
              >
                <FileMusic className="w-4 h-4" />
                Composer on IMSLP
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>
            ) : null}

            <a
              href={`/api/v1/works/${work.slug || work.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#221f1b] transition-colors"
            >
              View JSON API
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>

            <WorkWorkspaceActions
              workId={work.id}
              defaultDuration={work.duration_minutes}
            />

            <AdminWorkEnrichButton
              workId={work.id}
              missingFields={[
                !work.year_composed ? "Year" : null,
                !work.key_signature ? "Key" : null,
                !work.duration_minutes ? "Duration" : null,
                !effectiveMovementsCount ? "Movements" : null,
                !work.catalog_display ? "Catalog" : null,
                !work.instrumentation ? "Instrumentation" : null,
                !work.description ? "Program Note" : null,
                !work.imslp_url ? "IMSLP URL" : null,
              ].filter((x): x is string => Boolean(x))}
            />
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-4 border-t border-stone-100 dark:border-stone-800/80">
          <div className="p-3 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/60 dark:border-stone-800/60">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Year
            </span>
            <p className="mt-1 font-mono text-sm font-semibold text-stone-900 dark:text-stone-100">
              {work.year_composed ?? "—"}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/60 dark:border-stone-800/60">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 flex items-center gap-1">
              <Music className="w-3 h-3" />
              Key
            </span>
            <p className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
              {work.key_signature ?? "—"}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/60 dark:border-stone-800/60">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Duration
            </span>
            <p className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
              {work.duration_minutes ? `~${work.duration_minutes} min` : "—"}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/60 dark:border-stone-800/60">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 flex items-center gap-1">
              <Layers className="w-3 h-3" />
              Movements
            </span>
            <p className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
              {effectiveMovementsCount ?? "—"}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/60 dark:border-stone-800/60 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Catalog
            </span>
            <p className="mt-1 font-mono text-sm font-semibold text-stone-900 dark:text-stone-100">
              {work.catalog_display ?? "—"}
            </p>
          </div>
        </div>

        {/* Instrumentation */}
        {work.instrumentation && (
          <div className="p-4 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800/70">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 block mb-1">
              Instrumentation &amp; Scoring
            </span>
            <p className="text-sm text-stone-800 dark:text-stone-200 font-medium leading-relaxed">
              {work.instrumentation}
            </p>
          </div>
        )}
      </section>

      {/* Program Notes */}
      {work.description && (
        <section className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-6 sm:p-7 space-y-2.5">
          <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#9a7432] dark:text-[#d4af6a]" />
            Program Notes &amp; Historical Context
          </h2>
          <p className="text-sm sm:text-base text-stone-700 dark:text-stone-300 leading-relaxed">
            {work.description}
          </p>
        </section>
      )}

      {/* Listen & Reference Recordings */}
      <WorkListeningPanel
        workId={work.id}
        title={work.title}
        composerName={composer?.name}
        catalogDisplay={work.catalog_display}
        youtubeUrl={work.youtube_url}
        spotifyUrl={work.spotify_url}
        appleMusicUrl={work.apple_music_url}
        recordingNotes={work.recording_notes}
      />

      {/* IMSLP Sheet Music Editions */}
      {work.imslp_url && (
        <WorkImslpEditions workId={work.id} imslpUrl={work.imslp_url} />
      )}

      {/* Live Performances on World Stage */}
      {livePerformances.length > 0 && (
        <section className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-[#9a7432] dark:text-[#d4af6a]" />
              Live on the World Stage ({livePerformances.length})
            </h2>
            <Link
              href="/stage"
              className="text-xs font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline"
            >
              Open World Atlas →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {livePerformances.map((ev) => (
              <div
                key={ev.id}
                className="p-3.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/80 dark:border-stone-800 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <span className="font-mono text-[11px] font-semibold text-[#9a7432] dark:text-[#d4af6a] block">
                    {new Date(ev.starts_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                  <p className="text-xs font-bold text-stone-900 dark:text-[#f3efe6] line-clamp-1">
                    {ev.title}
                  </p>
                  {ev.venues && (
                    <Link
                      href={`/stage/venues/${ev.venues.slug}`}
                      className="inline-flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400 hover:text-[#d4af6a]"
                    >
                      <MapPin className="w-3 h-3" />
                      {ev.venues.short_name || ev.venues.name} · {ev.venues.city}
                    </Link>
                  )}
                </div>
                {ev.ticket_url && (
                  <a
                    href={ev.ticket_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:text-[#d4af6a] shrink-0"
                    title="Official event page"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Structured Movements */}
      {movements.length > 0 && (
        <section className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-200/80 dark:border-stone-800/80 flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-[#9a7432] dark:text-[#d4af6a]" />
              Movements &amp; Sections ({movements.length})
            </h2>
          </div>
          <ol className="divide-y divide-stone-100 dark:divide-stone-800/80">
            {movements.map((m) => {
              const roman =
                ROMAN_NUMERALS[m.movement_number - 1] ?? `${m.movement_number}`;
              const dur = formatMovementDuration(m.duration_seconds);
              return (
                <li
                  key={m.id}
                  className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-[#faf8f4]/60 dark:hover:bg-[#221f1b]/60 transition-colors"
                >
                  <div className="flex items-baseline gap-3 min-w-0">
                    <span className="font-serif font-semibold text-xs text-[#9a7432] dark:text-[#d4af6a] w-7 shrink-0">
                      {roman}.
                    </span>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                        {m.title}
                      </span>
                      {m.tempo_marking && (
                        <span className="ml-2 text-xs italic text-stone-500 dark:text-stone-400">
                          {m.tempo_marking}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400 shrink-0">
                    {m.key_signature && <span>{m.key_signature}</span>}
                    {dur && <span className="font-mono">{dur}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* More by Composer */}
      {composer && moreByComposer.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
              More Works by {composer.name}
            </h2>
            <Link
              href={`/composers/${composer.slug}`}
              className="text-xs font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline shrink-0"
            >
              View full catalog →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {moreByComposer.map((w) => (
              <Link
                key={w.id}
                href={`/works/${w.slug || w.id}`}
                className="group bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-4 hover:border-[#9a7432]/60 dark:hover:border-[#d4af6a]/60 transition-all space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
                  <span className="font-mono font-semibold text-stone-700 dark:text-stone-300">
                    {w.catalog_display || w.genre}
                  </span>
                  {w.year_composed && (
                    <span className="font-mono">{w.year_composed}</span>
                  )}
                </div>
                <h3 className="font-serif font-semibold text-sm text-stone-900 dark:text-[#f3efe6] group-hover:text-[#9a7432] dark:group-hover:text-[#d4af6a] transition-colors line-clamp-2">
                  {w.title}
                </h3>
                {w.nickname && (
                  <p className="text-xs text-[#9a7432] dark:text-[#d4af6a] truncate">
                    &ldquo;{w.nickname}&rdquo;
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Similar Repertoire */}
      {similarWorks.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
            Related {work.genre} Repertoire
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {similarWorks.map((w) => (
              <Link
                key={w.id}
                href={`/works/${w.slug || w.id}`}
                className="group bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-4 hover:border-[#9a7432]/60 dark:hover:border-[#d4af6a]/60 transition-all flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <h3 className="font-serif font-semibold text-sm text-stone-900 dark:text-[#f3efe6] group-hover:text-[#9a7432] dark:group-hover:text-[#d4af6a] transition-colors line-clamp-1">
                    {w.title}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {w.composers?.name}
                    {w.catalog_display ? ` · ${w.catalog_display}` : ""}
                  </p>
                </div>
                {w.year_composed && (
                  <span className="font-mono text-xs text-stone-400 dark:text-stone-500 shrink-0">
                    {w.year_composed}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
