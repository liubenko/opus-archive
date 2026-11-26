"use client";

import { useEffect, useState } from "react";
import { FileMusic, ExternalLink, Loader2, BookMarked } from "lucide-react";

interface ImslpEdition {
  description: string;
  publisher: string | null;
  editor: string | null;
  copyright: string | null;
  fileName: string | null;
  imslpId: string | null;
  url: string;
}

interface WorkImslpEditionsProps {
  imslpUrl: string;
}

export function WorkImslpEditions({ imslpUrl }: WorkImslpEditionsProps) {
  const [editions, setEditions] = useState<ImslpEdition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/imslp/editions?url=${encodeURIComponent(imslpUrl)}`)
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{ editions?: ImslpEdition[] }>)
          : { editions: [] }
      )
      .then((data) => {
        if (!cancelled) {
          setEditions(data.editions ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imslpUrl]);

  return (
    <section className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 overflow-hidden">
      <div className="px-6 py-4 border-b border-stone-200/80 dark:border-stone-800/80 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
          <BookMarked className="w-4 h-4 text-[#9a7432] dark:text-[#d4af6a]" />
          IMSLP Sheet Music Editions
        </h2>
        <a
          href={imslpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline"
        >
          View all files on IMSLP
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {loading ? (
        <div className="px-6 py-8 text-center text-xs text-stone-500 dark:text-stone-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading public-domain editions from IMSLP...
        </div>
      ) : editions.length === 0 ? (
        <div className="px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-500 dark:text-stone-400">
          <span>
            Browse available scores, parts, and editions directly on IMSLP.
          </span>
          <a
            href={imslpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/70 text-[#8a6526] dark:text-[#e3c27d] font-medium shrink-0"
          >
            <FileMusic className="w-3.5 h-3.5" />
            Open IMSLP Page
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800/80">
          {editions.map((ed, idx) => (
            <li
              key={`${ed.imslpId ?? idx}-${ed.description}`}
              className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#faf8f4]/60 dark:hover:bg-[#221f1b]/60 transition-colors"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                    {ed.description}
                  </span>
                  {ed.imslpId && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                      {ed.imslpId}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
                  {ed.publisher && <span>{ed.publisher}</span>}
                  {ed.editor && <span>Ed. {ed.editor}</span>}
                  {ed.copyright && (
                    <span className="text-[11px] opacity-80">
                      {ed.copyright}
                    </span>
                  )}
                </div>
              </div>

              <a
                href={ed.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/70 text-xs font-medium text-[#8a6526] dark:text-[#e3c27d] hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors shrink-0 self-start sm:self-center"
              >
                <FileMusic className="w-3.5 h-3.5" />
                Open Score
                <ExternalLink className="w-3 h-3 opacity-75" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
