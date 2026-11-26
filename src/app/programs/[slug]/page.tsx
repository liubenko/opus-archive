import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Clock, FileMusic, ExternalLink, Calendar, MapPin, Music2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { RecitalProgram, RecitalProgramItem, Work } from "@/types/database";
import { PrintProgramButton } from "@/components/PrintProgramButton";

export const dynamic = "force-dynamic";

interface SharedProgramPageProps {
  params: Promise<{ slug: string }>;
}

type SharedItem = RecitalProgramItem & {
  works:
    | (Pick<
        Work,
        | "id"
        | "slug"
        | "title"
        | "nickname"
        | "catalog_display"
        | "genre"
        | "key_signature"
        | "year_composed"
        | "duration_minutes"
        | "description"
        | "imslp_url"
      > & {
        composers: {
          name: string;
          slug: string;
          birth_year: number;
          death_year: number | null;
        } | null;
      })
    | null;
};

async function fetchSharedProgram(slug: string) {
  const { data: program } = await supabase
    .from("recital_programs")
    .select("*")
    .eq("share_slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (!program) return null;

  const { data: items } = await supabase
    .from("recital_program_items")
    .select(
      "*, works(id, slug, title, nickname, catalog_display, genre, key_signature, year_composed, duration_minutes, description, imslp_url, composers(name, slug, birth_year, death_year))"
    )
    .eq("program_id", program.id)
    .order("half", { ascending: true })
    .order("position", { ascending: true });

  return {
    program: program as RecitalProgram,
    items: (items ?? []) as SharedItem[],
  };
}

export async function generateMetadata({
  params,
}: SharedProgramPageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = await fetchSharedProgram(slug);
  if (!found) {
    return { title: "Program Not Found — Opus Archive" };
  }
  const { program } = found;
  const sub = [program.performer_name, program.venue, program.event_date]
    .filter(Boolean)
    .join(" · ");
  return {
    title: `${program.title} — Concert Program | Opus Archive`,
    description: sub
      ? `${program.title} (${sub}) — Recital program created on Opus Archive.`
      : `${program.title} — Concert program with works, durations, and scores on Opus Archive.`,
  };
}

export default async function SharedProgramPage({
  params,
}: SharedProgramPageProps) {
  const { slug } = await params;
  const found = await fetchSharedProgram(slug);

  if (!found) {
    notFound();
  }

  const { program, items } = found;
  const half1 = items.filter((i) => i.half === 1);
  const half2 = items.filter((i) => i.half === 2);

  const sumDur = (arr: SharedItem[]) =>
    arr.reduce(
      (acc, i) =>
        acc + (i.custom_duration_minutes ?? i.works?.duration_minutes ?? 0),
      0
    );

  const half1Mins = sumDur(half1);
  const half2Mins = sumDur(half2);
  const intermissionMins = half2.length > 0 ? program.intermission_minutes : 0;
  const totalMins = half1Mins + intermissionMins + half2Mins;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      {/* Top Action Bar (hidden when printing) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
        >
          <Music2 className="w-3.5 h-3.5 text-[#9a7432] dark:text-[#d4af6a]" />
          Opus Archive Concert Sheet
        </Link>
        <PrintProgramButton />
      </div>

      {/* Concert Hall Program Sheet */}
      <article className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200/90 dark:border-stone-800/90 p-8 sm:p-12 shadow-sm space-y-10 print:border-0 print:p-0 print:shadow-none">
        {/* Program Header */}
        <header className="text-center space-y-3 border-b border-stone-200 dark:border-stone-800 pb-8">
          <span className="text-[11px] uppercase tracking-[0.24em] font-semibold text-[#9a7432] dark:text-[#d4af6a] block">
            Recital Program
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1a1816] dark:text-[#f3efe6]">
            {program.title}
          </h1>
          {program.performer_name && (
            <p className="font-serif text-base sm:text-lg text-stone-700 dark:text-stone-200">
              {program.performer_name}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-stone-500 dark:text-stone-400 pt-1">
            {program.venue && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {program.venue}
              </span>
            )}
            {program.event_date && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {program.event_date}
              </span>
            )}
            {totalMins > 0 && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5" />~{totalMins} min total
              </span>
            )}
          </div>

          {program.notes && (
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 max-w-xl mx-auto pt-2 leading-relaxed">
              {program.notes}
            </p>
          )}
        </header>

        {/* Halves */}
        {([1, 2] as const).map((halfNum) => {
          const list = halfNum === 1 ? half1 : half2;
          if (list.length === 0) return null;
          const mins = halfNum === 1 ? half1Mins : half2Mins;

          return (
            <div key={halfNum} className="space-y-5">
              <div className="flex items-baseline justify-between border-b border-stone-100 dark:border-stone-800/80 pb-2">
                <h2 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6]">
                  {half2.length > 0
                    ? halfNum === 1
                      ? "Part I"
                      : "Part II"
                    : "Program"}
                </h2>
                {mins > 0 && (
                  <span className="font-mono text-xs text-stone-400">
                    ~{mins} min
                  </span>
                )}
              </div>

              <div className="space-y-6">
                {list.map((item) => {
                  const w = item.works;
                  const c = w?.composers;
                  const dur =
                    item.custom_duration_minutes ?? w?.duration_minutes ?? null;
                  const note = item.program_note || w?.description;

                  return (
                    <div key={item.id} className="space-y-1.5">
                      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                        <div>
                          {c && (
                            <Link
                              href={`/composers/${c.slug}`}
                              className="text-xs font-semibold uppercase tracking-wider text-[#9a7432] dark:text-[#d4af6a] hover:underline block"
                            >
                              {c.name}{" "}
                              <span className="font-normal text-stone-400">
                                ({c.birth_year}–{c.death_year ?? ""})
                              </span>
                            </Link>
                          )}
                          <Link
                            href={w ? `/works/${w.slug || w.id}` : "#"}
                            className="font-serif text-lg font-semibold text-stone-900 dark:text-[#f3efe6] hover:text-[#9a7432] dark:hover:text-[#d4af6a] transition-colors"
                          >
                            {w?.title}
                            {w?.catalog_display ? `, ${w.catalog_display}` : ""}
                          </Link>
                          {w?.nickname && (
                            <span className="ml-2 text-xs italic text-stone-500 dark:text-stone-400">
                              &ldquo;{w.nickname}&rdquo;
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400 shrink-0">
                          {dur && <span className="font-mono">~{dur} min</span>}
                          {w?.imslp_url && (
                            <a
                              href={w.imslp_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#8a6526] dark:text-[#e3c27d] hover:underline print:hidden"
                            >
                              <FileMusic className="w-3 h-3" />
                              Score
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {note && (
                        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                          {note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {halfNum === 1 && half2.length > 0 && (
                <div className="py-4 text-center text-xs uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500 border-y border-dashed border-stone-200 dark:border-stone-800">
                  — Intermission ({program.intermission_minutes} minutes) —
                </div>
              )}
            </div>
          );
        })}
      </article>
    </div>
  );
}
