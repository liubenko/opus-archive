"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Calendar,
  Clock,
  ExternalLink,
  FileMusic,
  MapPin,
  Music2,
  Sparkles,
} from "lucide-react";

export interface HydratedEventPerformer {
  performer_id: number;
  slug: string;
  name: string;
  performer_type: string;
  billing_role: string;
  instrument_label: string | null;
  avatar_url: string | null;
}

export interface HydratedEventWork {
  id: number;
  display_order: number;
  work_id: number | null;
  work_slug: string | null;
  work_catalog: string | null;
  work_imslp_url: string | null;
  composer_id: number | null;
  composer_slug: string | null;
  raw_composer_name: string;
  raw_work_title: string;
}

export interface HydratedConcertEvent {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  starts_at: string;
  season: string;
  venue_id: number;
  venue_slug: string;
  venue_name: string;
  venue_short_name: string | null;
  venue_city: string;
  venue_country: string;
  latitude: number;
  longitude: number;
  source_url: string | null;
  ticket_url: string | null;
  performers: HydratedEventPerformer[];
  works: HydratedEventWork[];
}

interface ConcertEventCardProps {
  event: HydratedConcertEvent;
  onSelectPerformer?: (slug: string) => void;
  onSelectVenue?: (slug: string) => void;
}

export function ConcertEventCard({
  event,
  onSelectPerformer,
  onSelectVenue,
}: ConcertEventCardProps) {
  const dt = new Date(event.starts_at);
  const monthShort = dt.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const dayNum = dt.toLocaleDateString("en-US", {
    day: "2-digit",
    timeZone: "UTC",
  });
  const yearNum = dt.getUTCFullYear();
  const timeStr = dt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <article className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-5 shadow-xs hover:border-[#9a7432]/50 dark:hover:border-[#d4af6a]/40 transition-colors">
      <div className="flex flex-col md:flex-row gap-4 md:items-start justify-between">
        {/* Left: Date Tile + Event Header */}
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="w-16 shrink-0 rounded-2xl bg-[#faf8f4] dark:bg-[#12100e] border border-stone-200/80 dark:border-stone-800 py-2.5 px-2 text-center">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#9a7432] dark:text-[#d4af6a] block font-semibold">
              {monthShort} {yearNum}
            </span>
            <span className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6] leading-tight block">
              {dayNum}
            </span>
            <span className="text-[10px] font-mono text-stone-400 flex items-center justify-center gap-0.5 mt-0.5">
              <Clock className="w-2.5 h-2.5" />
              {timeStr}
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {onSelectVenue ? (
                <button
                  type="button"
                  onClick={() => onSelectVenue(event.venue_slug)}
                  className="inline-flex items-center gap-1 font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {event.venue_short_name || event.venue_name} ·{" "}
                  {event.venue_city}
                </button>
              ) : (
                <Link
                  href={`/stage/venues/${event.venue_slug}`}
                  className="inline-flex items-center gap-1 font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {event.venue_short_name || event.venue_name} ·{" "}
                  {event.venue_city}
                </Link>
              )}
              <Link
                href={`/stage/venues/${event.venue_slug}`}
                className="text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 inline-flex items-center gap-0.5"
                title="Open full venue season page"
              >
                Hall Page
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            <div>
              <h3 className="font-serif text-lg sm:text-xl font-bold text-stone-900 dark:text-[#f3efe6] leading-snug">
                {event.title}
              </h3>
              {event.subtitle && (
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  {event.subtitle}
                </p>
              )}
            </div>

            {/* Performers Roster Pills */}
            {event.performers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {event.performers.map((p) => {
                  const roleBadge =
                    p.billing_role === "orchestra"
                      ? "Orchestra"
                      : p.billing_role === "conductor"
                        ? "Conductor"
                        : p.instrument_label || "Soloist";

                  return (
                    <div
                      key={`${p.performer_id}-${p.billing_role}`}
                      className="inline-flex items-center rounded-full bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/80 dark:border-stone-800 text-xs overflow-hidden"
                    >
                      {onSelectPerformer ? (
                        <button
                          type="button"
                          onClick={() => onSelectPerformer(p.slug)}
                          className="px-2.5 py-1 font-medium text-stone-800 dark:text-stone-200 hover:text-[#9a7432] dark:hover:text-[#d4af6a] cursor-pointer"
                        >
                          {p.name}
                        </button>
                      ) : (
                        <Link
                          href={`/stage/artists/${p.slug}`}
                          className="px-2.5 py-1 font-medium text-stone-800 dark:text-stone-200 hover:text-[#9a7432] dark:hover:text-[#d4af6a]"
                        >
                          {p.name}
                        </Link>
                      )}
                      <Link
                        href={`/stage/artists/${p.slug}`}
                        className="px-2 py-1 text-[10px] font-mono text-stone-500 dark:text-stone-400 bg-stone-100/80 dark:bg-stone-900/80 border-l border-stone-200/70 dark:border-stone-800 hover:text-[#d4af6a]"
                        title={`View ${p.name}'s full season calendar`}
                      >
                        {roleBadge} ↗
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Official Event / Ticket Link */}
        {event.ticket_url && (
          <a
            href={event.ticket_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#d4af6a] shrink-0 self-start"
          >
            <Calendar className="w-3.5 h-3.5 text-[#9a7432] dark:text-[#d4af6a]" />
            Official Site
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>
        )}
      </div>

      {/* Program Repertoire List */}
      {event.works.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-stone-100 dark:border-stone-800/80 space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 block mb-1">
            Concert Program
          </span>
          {event.works.map((w) => {
            const isLinked = Boolean(w.work_id);
            const workHref = w.work_slug
              ? `/works/${w.work_slug}`
              : w.work_id
                ? `/works/${w.work_id}`
                : null;

            return (
              <div
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 py-1.5 px-3 rounded-xl bg-[#faf8f4]/80 dark:bg-[#13110e] border border-stone-200/60 dark:border-stone-800/70"
              >
                <div className="flex flex-wrap items-center gap-2 min-w-0 text-xs">
                  <Music2
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isLinked
                        ? "text-[#9a7432] dark:text-[#d4af6a]"
                        : "text-stone-400"
                    }`}
                  />
                  {w.composer_slug ? (
                    <Link
                      href={`/composers/${w.composer_slug}`}
                      className="font-semibold text-stone-700 dark:text-stone-300 hover:text-[#9a7432] dark:hover:text-[#d4af6a]"
                    >
                      {w.raw_composer_name}:
                    </Link>
                  ) : (
                    <span className="font-semibold text-stone-700 dark:text-stone-300">
                      {w.raw_composer_name}:
                    </span>
                  )}

                  {workHref ? (
                    <Link
                      href={workHref}
                      className="font-serif font-semibold text-stone-900 dark:text-[#f3efe6] hover:text-[#9a7432] dark:hover:text-[#d4af6a] underline decoration-[#d4af6a]/40 underline-offset-3"
                    >
                      {w.raw_work_title}
                    </Link>
                  ) : (
                    <span className="font-serif text-stone-700 dark:text-stone-300">
                      {w.raw_work_title}
                    </span>
                  )}

                  {w.work_catalog && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                      {w.work_catalog}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {workHref ? (
                    <>
                      {w.work_imslp_url && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                          <FileMusic className="w-2.5 h-2.5" />
                          IMSLP
                        </span>
                      )}
                      <Link
                        href={workHref}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#9a7432] dark:text-[#d4af6a] hover:underline"
                      >
                        In Library
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </>
                  ) : (
                    <span
                      title="Queued in Admin Suggestions Inbox for library review"
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      Cataloging Pending
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
