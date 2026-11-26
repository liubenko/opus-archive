"use client";

import { useState } from "react";
import { Headphones, Play, ExternalLink, Sparkles } from "lucide-react";

interface WorkListeningPanelProps {
  title: string;
  composerName?: string | null;
  catalogDisplay?: string | null;
  youtubeUrl?: string | null;
  spotifyUrl?: string | null;
  appleMusicUrl?: string | null;
  recordingNotes?: string | null;
}

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export function WorkListeningPanel({
  title,
  composerName,
  catalogDisplay,
  youtubeUrl,
  spotifyUrl,
  appleMusicUrl,
  recordingNotes,
}: WorkListeningPanelProps) {
  const [showPlayer, setShowPlayer] = useState(false);

  const searchQuery = [composerName, title, catalogDisplay]
    .filter(Boolean)
    .join(" ");
  const encodedQuery = encodeURIComponent(searchQuery);

  const ytId = extractYouTubeId(youtubeUrl);
  const ytHref =
    youtubeUrl ||
    `https://www.youtube.com/results?search_query=${encodedQuery}`;
  const spotifyHref =
    spotifyUrl || `https://open.spotify.com/search/${encodedQuery}`;
  const appleHref =
    appleMusicUrl || `https://music.apple.com/search?term=${encodedQuery}`;

  const hasCurated = Boolean(youtubeUrl || spotifyUrl || appleMusicUrl);

  return (
    <section className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
          <Headphones className="w-4 h-4 text-[#9a7432] dark:text-[#d4af6a]" />
          Listen &amp; Reference Recordings
        </h2>
        {hasCurated && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/70">
            <Sparkles className="w-2.5 h-2.5" />
            Curated Reference
          </span>
        )}
      </div>

      {recordingNotes && (
        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800/70 rounded-xl px-3.5 py-2.5">
          <strong className="text-stone-900 dark:text-stone-100">
            Recommended Recording:
          </strong>{" "}
          {recordingNotes}
        </p>
      )}

      {/* Lazy-loaded YouTube embed if a curated YouTube URL is set */}
      {ytId && (
        <div className="rounded-xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-black">
          {showPlayer ? (
            <div className="aspect-video w-full">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1`}
                title={`${title} — Reference Recording`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPlayer(true)}
              className="w-full py-8 px-4 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#1a1816] to-[#2c251d] text-[#f3efe6] hover:opacity-95 transition-opacity cursor-pointer"
            >
              <span className="w-12 h-12 rounded-full bg-[#d4af6a] text-[#11100e] flex items-center justify-center shadow-md">
                <Play className="w-5 h-5 fill-current ml-0.5" />
              </span>
              <span className="text-sm font-semibold">
                Play Curated Reference Recording on YouTube
              </span>
              {recordingNotes && (
                <span className="text-xs text-stone-300 max-w-md text-center">
                  {recordingNotes}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Streaming service buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <a
          href={ytHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-[#faf8f4] dark:bg-[#141210] hover:border-red-400/60 dark:hover:border-red-500/50 text-xs font-medium text-stone-800 dark:text-stone-200 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {youtubeUrl ? "Watch on YouTube" : "Search YouTube"}
          </span>
          <ExternalLink className="w-3.5 h-3.5 opacity-60" />
        </a>

        <a
          href={spotifyHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-[#faf8f4] dark:bg-[#141210] hover:border-emerald-400/60 dark:hover:border-emerald-500/50 text-xs font-medium text-stone-800 dark:text-stone-200 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {spotifyUrl ? "Open on Spotify" : "Search Spotify"}
          </span>
          <ExternalLink className="w-3.5 h-3.5 opacity-60" />
        </a>

        <a
          href={appleHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-[#faf8f4] dark:bg-[#141210] hover:border-pink-400/60 dark:hover:border-pink-500/50 text-xs font-medium text-stone-800 dark:text-stone-200 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-pink-500" />
            {appleMusicUrl ? "Open Apple Music" : "Search Apple Music"}
          </span>
          <ExternalLink className="w-3.5 h-3.5 opacity-60" />
        </a>
      </div>
    </section>
  );
}
