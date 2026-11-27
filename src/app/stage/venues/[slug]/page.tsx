import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Building2,
  Calendar,
  ExternalLink,
  Globe,
  MapPin,
  Users,
} from "lucide-react";
import { fetchWorldStageData } from "@/lib/stage";
import { VenueSeasonFilter } from "@/components/stage/VenueSeasonFilter";

export const dynamic = "force-dynamic";

interface VenuePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: VenuePageProps): Promise<Metadata> {
  const { slug } = await params;
  const { venues } = await fetchWorldStageData();
  const venue = venues.find((v) => v.slug === slug);
  if (!venue) return { title: "Venue Not Found | Opus Archive" };
  return {
    title: `${venue.name} — 2026/27 Season & Repertoire | Opus Archive`,
    description:
      venue.description ||
      `Explore ${venue.name} in ${venue.city}, ${venue.country}: upcoming orchestra residencies, soloists, and clickable classical repertoire.`,
  };
}

export default async function VenueDetailPage({ params }: VenuePageProps) {
  const { slug } = await params;
  const { venues, performers, events } = await fetchWorldStageData();
  const venue = venues.find((v) => v.slug === slug);
  if (!venue) notFound();

  const venueEvents = events.filter((ev) => ev.venue_id === venue.id);
  const residentOrchestras = performers.filter(
    (p) => p.resident_venue_id === venue.id && p.performer_type === "orchestra"
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      <Link
        href="/stage"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to World Stage Atlas
      </Link>

      {/* Venue Hero Card */}
      <section className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200/90 dark:border-stone-800/90 overflow-hidden shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-12">
          {venue.photo_url && (
            <div className="md:col-span-5 h-56 md:h-auto bg-stone-900 relative overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={venue.photo_url}
                alt={venue.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div
            className={`${
              venue.photo_url ? "md:col-span-7" : "md:col-span-12"
            } p-6 sm:p-8 space-y-4`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9a7432] dark:text-[#d4af6a]">
              <MapPin className="w-3.5 h-3.5" />
              {venue.city}, {venue.country}
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900 dark:text-[#f3efe6]">
              {venue.name}
            </h1>

            {venue.description && (
              <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
                {venue.description}
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              {venue.capacity && (
                <div className="p-3 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 block">
                    Seating Capacity
                  </span>
                  <span className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6]">
                    {venue.capacity.toLocaleString()}
                  </span>
                </div>
              )}
              {venue.opened_year && (
                <div className="p-3 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 block">
                    Inaugurated
                  </span>
                  <span className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6]">
                    {venue.opened_year}
                  </span>
                </div>
              )}
              <div className="p-3 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800">
                <span className="text-[10px] uppercase tracking-wider text-stone-400 block">
                  2026/27 Listed
                </span>
                <span className="font-serif text-lg font-bold text-[#9a7432] dark:text-[#d4af6a]">
                  {venueEvents.length} concerts
                </span>
              </div>
            </div>

            {venue.architect_or_acoustics && (
              <p className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#d4af6a]" />
                <span>
                  <strong>Architecture &amp; Acoustics:</strong>{" "}
                  {venue.architect_or_acoustics}
                </span>
              </p>
            )}

            {residentOrchestras.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-stone-400 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  Resident:
                </span>
                {residentOrchestras.map((orch) => (
                  <Link
                    key={orch.id}
                    href={`/stage/artists/${orch.slug}`}
                    className="px-3 py-1 rounded-full text-xs font-semibold bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-[#f3efe6] hover:border-[#d4af6a]"
                  >
                    {orch.name} →
                  </Link>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2.5 pt-2">
              {venue.calendar_url && (
                <a
                  href={venue.calendar_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Official Hall Season
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {venue.website_url && (
                <a
                  href={venue.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#d4af6a]"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Website
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Filterable Season Schedule at this Hall */}
      <VenueSeasonFilter events={venueEvents} />
    </div>
  );
}
