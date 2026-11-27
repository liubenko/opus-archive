import type { Metadata } from "next";
import { fetchWorldStageData } from "@/lib/stage";
import { WorldStageExplorer } from "@/components/stage/WorldStageExplorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "World Stage — Concert Venues, Orchestras & Soloist Seasons | Opus Archive",
  description:
    "Explore iconic classical concert halls around the world, orchestra subscription seasons, soloist tour calendars, and clickable repertoire linked to scores and recordings.",
};

export default async function WorldStagePage() {
  const { venues, performers, events } = await fetchWorldStageData();

  const linkedWorksCount = events.reduce(
    (sum, ev) => sum + ev.works.filter((w) => Boolean(w.work_id)).length,
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10">
      {/* Hero Header + Live World Stage KPIs */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7432] dark:text-[#d4af6a]">
            World Stage · 2026/27 Season Atlas
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1a1816] dark:text-[#f3efe6]">
            Global Venues, Orchestras &amp; Soloist Calendars
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 max-w-2xl">
            Navigate world concert halls, filter by visiting orchestras or
            featured soloists, trace international tour paths, and jump straight
            from any concert bill to verified IMSLP scores in our library.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          {[
            { label: "Concert Halls", val: venues.length.toLocaleString() },
            {
              label: "Artists & Orchestras",
              val: performers.filter((p) => p.is_featured).length.toLocaleString(),
            },
            { label: "2026/27 Events", val: events.length.toLocaleString() },
            {
              label: "Linked Scores",
              val: linkedWorksCount.toLocaleString(),
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#191714] border border-stone-200/90 dark:border-stone-800/90"
            >
              <span className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6] block">
                {stat.val}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-stone-400">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <WorldStageExplorer
        venues={venues}
        performers={performers}
        events={events}
      />
    </div>
  );
}
