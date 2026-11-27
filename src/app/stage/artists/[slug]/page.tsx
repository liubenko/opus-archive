import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Globe,
  MapPin,
} from "lucide-react";
import { fetchWorldStageData } from "@/lib/stage";
import { ComposerAvatar } from "@/components/ComposerAvatar";
import { ArtistTourClient } from "@/components/stage/VenueSeasonFilter";

export const dynamic = "force-dynamic";

interface ArtistPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ArtistPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { performers } = await fetchWorldStageData();
  const perf = performers.find((p) => p.slug === slug);
  if (!perf) return { title: "Artist Not Found | Opus Archive" };
  return {
    title: `${perf.name} — 2026/27 Season Tour & Repertoire Calendar | Opus Archive`,
    description:
      perf.short_bio ||
      `View ${perf.name}'s upcoming 2026/27 concert schedule, tour venues, and clickable classical repertoire on Opus Archive.`,
  };
}

export default async function ArtistCalendarPage({ params }: ArtistPageProps) {
  const { slug } = await params;
  const { venues, performers, events } = await fetchWorldStageData();
  const performer = performers.find((p) => p.slug === slug);
  if (!performer) notFound();

  const artistEvents = events.filter((ev) =>
    ev.performers.some((p) => p.performer_id === performer.id)
  );
  const residentVenue = performer.resident_venue_id
    ? venues.find((v) => v.id === performer.resident_venue_id)
    : null;

  const uniqueCities = new Set(artistEvents.map((e) => e.venue_city));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      <Link
        href="/stage"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to World Stage Atlas
      </Link>

      {/* Performer Hero Card */}
      <section className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200/90 dark:border-stone-800/90 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <ComposerAvatar
            name={performer.name}
            avatarUrl={performer.avatar_url}
            era={
              performer.performer_type === "orchestra"
                ? "Classical"
                : performer.instrument_or_role === "Cello"
                  ? "Romantic"
                  : "Late Romantic"
            }
            size="lg"
          />

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[#9a7432] dark:text-[#d4af6a]">
                {performer.instrument_or_role || performer.performer_type}
              </span>
              {performer.nationality && (
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  {performer.nationality}
                </span>
              )}
              {residentVenue && (
                <Link
                  href={`/stage/venues/${residentVenue.slug}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Home: {residentVenue.short_name || residentVenue.name}
                </Link>
              )}
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 dark:text-[#f3efe6]">
              {performer.name}
            </h1>

            {performer.short_bio && (
              <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed max-w-3xl">
                {performer.short_bio}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-stone-500 dark:text-stone-400">
              <span>
                <strong className="text-stone-900 dark:text-stone-100">
                  {artistEvents.length}
                </strong>{" "}
                scheduled 2026/27 concerts
              </span>
              <span>·</span>
              <span>
                <strong className="text-stone-900 dark:text-stone-100">
                  {uniqueCities.size}
                </strong>{" "}
                cities on tour
              </span>
              {performer.last_synced_at && (
                <>
                  <span>·</span>
                  <span className="font-mono text-[11px]">
                    Synced{" "}
                    {new Date(performer.last_synced_at).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" }
                    )}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5 pt-2">
              {performer.calendar_url && (
                <a
                  href={performer.calendar_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Official Schedule
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {performer.website_url && (
                <a
                  href={performer.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#d4af6a]"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Artist Site
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Tour Map + Chronological Bookings */}
      <ArtistTourClient
        performerName={performer.name}
        venues={venues}
        events={artistEvents}
      />
    </div>
  );
}
