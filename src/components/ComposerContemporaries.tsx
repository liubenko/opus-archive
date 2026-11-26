import Link from "next/link";
import { Users } from "lucide-react";
import type { Composer } from "@/types/database";
import { formatLifespan, getEraStyle } from "@/lib/constants";

type ContemporaryItem = Pick<
  Composer,
  "id" | "slug" | "name" | "era" | "nationality" | "birth_year" | "death_year" | "avatar_url"
>;

interface ComposerContemporariesProps {
  composer: Pick<Composer, "id" | "name" | "birth_year" | "death_year">;
  allComposers: ContemporaryItem[];
}

const CURRENT_YEAR = 2026;

export function ComposerContemporaries({
  composer,
  allComposers,
}: ComposerContemporariesProps) {
  const cStart = composer.birth_year;
  const cEnd = composer.death_year ?? CURRENT_YEAR;

  const overlaps = allComposers
    .filter((other) => {
      if (other.id === composer.id) return false;
      const oStart = other.birth_year;
      const oEnd = other.death_year ?? CURRENT_YEAR;
      const shared = Math.min(cEnd, oEnd) - Math.max(cStart, oStart);
      return shared >= 10;
    })
    .map((other) => {
      const oStart = other.birth_year;
      const oEnd = other.death_year ?? CURRENT_YEAR;
      const overlapYears = Math.min(cEnd, oEnd) - Math.max(cStart, oStart);
      return { other, oStart, oEnd, overlapYears };
    })
    .sort(
      (a, b) =>
        b.overlapYears - a.overlapYears ||
        Math.abs(a.oStart - cStart) - Math.abs(b.oStart - cStart)
    )
    .slice(0, 10);

  if (overlaps.length === 0) return null;

  const minYear = Math.min(cStart, ...overlaps.map((o) => o.oStart)) - 5;
  const maxYear = Math.max(cEnd, ...overlaps.map((o) => o.oEnd)) + 5;
  const span = Math.max(1, maxYear - minYear);

  const cLeftPct = ((cStart - minYear) / span) * 100;
  const cWidthPct = Math.max(1.5, ((cEnd - cStart) / span) * 100);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
          <Users className="w-5 h-5 text-[#9a7432] dark:text-[#d4af6a]" />
          Who Was Alive Then?
        </h2>
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
          Composers whose lifetimes overlapped with {composer.name} (
          {formatLifespan(composer.birth_year, composer.death_year)})
        </p>
      </div>

      <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-5 sm:p-6 space-y-3 overflow-x-auto">
        {/* Year Ruler */}
        <div className="flex items-center justify-between text-[10px] font-mono text-stone-400 pb-1 border-b border-stone-100 dark:border-stone-800">
          <span>{minYear}</span>
          <span>{Math.round((minYear + maxYear) / 2)}</span>
          <span>{maxYear}</span>
        </div>

        {/* Subject Composer Reference Row */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-serif font-bold text-[#9a7432] dark:text-[#d4af6a]">
              {composer.name}
            </span>
            <span className="font-mono text-[11px] text-stone-500">
              {formatLifespan(composer.birth_year, composer.death_year)}
            </span>
          </div>
          <div className="relative h-3 rounded-full bg-stone-100 dark:bg-[#141210] overflow-hidden">
            <div
              className="absolute top-0 bottom-0 rounded-full bg-[#9a7432] dark:bg-[#d4af6a]"
              style={{ left: `${cLeftPct}%`, width: `${cWidthPct}%` }}
            />
          </div>
        </div>

        {/* Overlapping Contemporaries */}
        <div className="space-y-2.5 pt-2">
          {overlaps.map(({ other, oStart, oEnd, overlapYears }) => {
            const leftPct = ((oStart - minYear) / span) * 100;
            const widthPct = Math.max(1.5, ((oEnd - oStart) / span) * 100);
            const eraStyle = getEraStyle(other.era);

            return (
              <Link
                key={other.id}
                href={`/composers/${other.slug}`}
                className="block group space-y-1"
              >
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="font-medium text-stone-800 dark:text-stone-200 group-hover:text-[#9a7432] dark:group-hover:text-[#d4af6a] transition-colors truncate">
                    {other.name}{" "}
                    <span className="text-[11px] text-stone-400 font-normal">
                      · {other.nationality}
                    </span>
                  </span>
                  <span className="text-[11px] font-mono text-stone-400 shrink-0">
                    {overlapYears}y overlap ({formatLifespan(other.birth_year, other.death_year)})
                  </span>
                </div>
                <div className="relative h-2.5 rounded-full bg-stone-100 dark:bg-[#141210] overflow-hidden">
                  {/* Shaded subject composer lifespan band */}
                  <div
                    className="absolute top-0 bottom-0 bg-amber-500/10 dark:bg-amber-400/10"
                    style={{ left: `${cLeftPct}%`, width: `${cWidthPct}%` }}
                  />
                  <div
                    className={`absolute top-0 bottom-0 rounded-full opacity-80 group-hover:opacity-100 transition-opacity ${eraStyle.color}`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
