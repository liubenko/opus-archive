"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  FileMusic,
  Loader2,
  Music,
  Sparkles,
  User,
  Wand2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ERA_ORDER } from "@/lib/constants";
import { ComposerAvatar } from "./ComposerAvatar";
import { SelectMenu } from "./SelectMenu";
import type {
  EnrichedComposerCandidate,
  EnrichedWorkCandidate,
} from "@/app/api/v1/suggest/lookup/route";

export interface OpenSuggestModalDetail {
  mode?: "work" | "composer";
  query?: string;
}

export function openSuggestCatalogModal(detail: OpenSuggestModalDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("opus:open-suggest-modal", { detail })
  );
}

const GENRE_OPTIONS = [
  "Orchestral",
  "Symphony",
  "Concerto",
  "Chamber",
  "Piano Solo",
  "Solo Instrumental",
  "Choral & Vocal",
  "Opera",
  "Sacred",
  "Ballet",
  "Stage & Incidental",
];

export function SuggestCatalogModal() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"work" | "composer">("work");

  // Search / lookup state
  const [composerInput, setComposerInput] = useState("");
  const [workInput, setWorkInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [composerCandidates, setComposerCandidates] = useState<
    EnrichedComposerCandidate[]
  >([]);
  const [workCandidates, setWorkCandidates] = useState<EnrichedWorkCandidate[]>(
    []
  );

  // Editable fields (Work)
  const [genre, setGenre] = useState("Orchestral");
  const [catalogDisplay, setCatalogDisplay] = useState("");
  const [yearComposed, setYearComposed] = useState("");
  const [keySignature, setKeySignature] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [instrumentation, setInstrumentation] = useState("");
  const [description, setDescription] = useState("");
  const [workImslpUrl, setWorkImslpUrl] = useState("");

  // Editable fields (Composer — used directly in Composer mode, or attached when composer is also new in Work mode)
  const [birthYear, setBirthYear] = useState("");
  const [deathYear, setDeathYear] = useState("");
  const [nationality, setNationality] = useState("");
  const [era, setEra] = useState("Contemporary");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [shortBio, setShortBio] = useState("");
  const [composerImslpUrl, setComposerImslpUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [submitterNote, setSubmitterNote] = useState("");

  // Submission status
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultState, setResultState] = useState<{
    status: "created" | "upvoted" | "already_exists";
    occurrence_count?: number;
    entity_type?: "composer" | "work";
    slug?: string;
  } | null>(null);

  const resetForm = useCallback(
    (nextMode: "work" | "composer", rawQuery = "") => {
      setMode(nextMode);
      setComposerCandidates([]);
      setWorkCandidates([]);
      setGenre("Orchestral");
      setCatalogDisplay("");
      setYearComposed("");
      setKeySignature("");
      setDurationMinutes("");
      setInstrumentation("");
      setDescription("");
      setWorkImslpUrl("");
      setBirthYear("");
      setDeathYear("");
      setNationality("");
      setEra("Contemporary");
      setAvatarUrl("");
      setShortBio("");
      setComposerImslpUrl("");
      setSourceUrl("");
      setSubmitterNote("");
      setErrorMsg(null);
      setResultState(null);

      const q = rawQuery.trim();
      if (!q) {
        setComposerInput("");
        setWorkInput("");
        return;
      }

      const sep = q.match(/^([^:—–-]{3,45})\s*(?::|—|–|\s-\s)\s*(.+)$/);
      if (sep) {
        setMode("work");
        setComposerInput(sep[1].trim());
        setWorkInput(sep[2].trim());
      } else if (nextMode === "composer") {
        setComposerInput(q);
        setWorkInput("");
      } else {
        setComposerInput("");
        setWorkInput(q);
      }
    },
    []
  );

  useEffect(() => {
    function onOpen(e: Event) {
      const custom = e as CustomEvent<OpenSuggestModalDetail>;
      const nextMode = custom.detail?.mode || "work";
      const rawQuery = custom.detail?.query || "";
      resetForm(nextMode, rawQuery);
      setOpen(true);
    }
    window.addEventListener("opus:open-suggest-modal", onOpen);
    return () => window.removeEventListener("opus:open-suggest-modal", onOpen);
  }, [resetForm]);

  const runLookup = useCallback(async () => {
    const q = mode === "composer" ? composerInput.trim() : workInput.trim();
    const comp = composerInput.trim();
    if (mode === "composer" && q.length < 2) return;
    if (mode === "work" && q.length < 2 && comp.length < 2) return;

    setLookingUp(true);
    try {
      const params = new URLSearchParams({
        type: mode,
        q: mode === "composer" ? comp : q,
        ...(mode === "work" && comp ? { composer: comp } : {}),
      });
      const res = await fetch(`/api/v1/suggest/lookup?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        type: "work" | "composer";
        candidates: EnrichedComposerCandidate[] | EnrichedWorkCandidate[];
      };
      if (mode === "composer") {
        setComposerCandidates(data.candidates as EnrichedComposerCandidate[]);
      } else {
        setWorkCandidates(data.candidates as EnrichedWorkCandidate[]);
      }
    } finally {
      setLookingUp(false);
    }
  }, [mode, composerInput, workInput]);

  // Auto-lookup after typing pauses (500ms debounce)
  useEffect(() => {
    if (!open || resultState) return;
    const primary = mode === "composer" ? composerInput.trim() : workInput.trim();
    if (primary.length < 3) return;
    const t = setTimeout(() => {
      runLookup();
    }, 520);
    return () => clearTimeout(t);
  }, [open, mode, composerInput, workInput, runLookup, resultState]);

  function applyComposerCandidate(c: EnrichedComposerCandidate) {
    setComposerInput(c.name);
    setBirthYear(c.birth_year ? String(c.birth_year) : "");
    setDeathYear(c.death_year ? String(c.death_year) : "");
    setNationality(c.nationality || "");
    setEra(c.era || "Contemporary");
    setAvatarUrl(c.avatar_url || "");
    setShortBio(c.short_bio || "");
    setComposerImslpUrl(c.imslp_url || "");
    setSourceUrl(c.source_url || "");
  }

  function applyWorkCandidate(w: EnrichedWorkCandidate) {
    setWorkInput(w.title);
    if (w.composer_name) setComposerInput(w.composer_name);
    setGenre(w.genre || "Orchestral");
    setCatalogDisplay(w.catalog_display || "");
    setYearComposed(w.year_composed ? String(w.year_composed) : "");
    setKeySignature(w.key_signature || "");
    setDurationMinutes(w.duration_minutes ? String(w.duration_minutes) : "");
    setInstrumentation(w.instrumentation || "");
    setDescription(w.description || "");
    setWorkImslpUrl(w.imslp_url || "");
    setSourceUrl(w.source_url || "");

    if (w.composer_meta) {
      setBirthYear(
        w.composer_meta.birth_year ? String(w.composer_meta.birth_year) : ""
      );
      setDeathYear(
        w.composer_meta.death_year ? String(w.composer_meta.death_year) : ""
      );
      setNationality(w.composer_meta.nationality || "");
      setEra(w.composer_meta.era || "Contemporary");
      setAvatarUrl(w.composer_meta.avatar_url || "");
      setShortBio(w.composer_meta.short_bio || "");
      setComposerImslpUrl(w.composer_meta.imslp_url || "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const payload = {
        suggestion_type: mode,
        composer_name: composerInput.trim(),
        work_title: mode === "work" ? workInput.trim() : "",
        genre,
        catalog_display: catalogDisplay.trim() || null,
        year_composed: yearComposed ? Number(yearComposed) : null,
        key_signature: keySignature.trim() || null,
        duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        instrumentation: instrumentation.trim() || null,
        description: description.trim() || null,
        imslp_url: workImslpUrl.trim() || null,
        composer_birth_year: birthYear ? Number(birthYear) : null,
        composer_death_year: deathYear ? Number(deathYear) : null,
        composer_nationality: nationality.trim() || null,
        composer_era: era || null,
        composer_avatar_url: avatarUrl.trim() || null,
        composer_short_bio: shortBio.trim() || null,
        composer_imslp_url: composerImslpUrl.trim() || null,
        source_url: sourceUrl.trim() || null,
        submitter_note: submitterNote.trim() || null,
      };

      const res = await fetch("/api/v1/suggest/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        error?: string;
        status?: "created" | "upvoted" | "already_exists";
        occurrence_count?: number;
        entity_type?: "composer" | "work";
        slug?: string;
      };

      if (!res.ok || data.error || !data.status) {
        setErrorMsg(data.error || "Could not submit suggestion.");
        return;
      }

      setResultState({
        status: data.status,
        occurrence_count: data.occurrence_count,
        entity_type: data.entity_type,
        slug: data.slug,
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-start justify-center pt-[6vh] px-4 pb-6 overflow-y-auto print:hidden"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#191714] rounded-3xl border border-stone-200 dark:border-stone-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a]/20 text-[#d4af6a] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6] leading-tight">
                Propose Missing Work or Composer
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Auto-fetches metadata from Wikipedia, MusicBrainz, OpenOpus &amp;
                IMSLP for moderator review
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success / Already Exists State */}
        {resultState ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>

            {resultState.status === "already_exists" ? (
              <>
                <h3 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6]">
                  Already in Opus Archive!
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md mx-auto">
                  We found an exact match already published in the catalog.
                </p>
                {resultState.slug && (
                  <Link
                    href={
                      resultState.entity_type === "composer"
                        ? `/composers/${resultState.slug}`
                        : `/works/${resultState.slug}`
                    }
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold"
                  >
                    Open in Catalog
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </>
            ) : resultState.status === "upvoted" ? (
              <>
                <h3 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6]">
                  Priority Boosted ({resultState.occurrence_count}× Requested)
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md mx-auto">
                  Another musician already proposed this entry — we merged your
                  metadata and bumped its priority in the moderator queue.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h3 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6]">
                  Sent to Moderator Queue!
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md mx-auto">
                  Thank you — your enriched proposal is now waiting in the
                  Opus Archive Admin Inbox for 1-click review and publication.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#f3efe8] dark:bg-[#12100e] border border-stone-200 dark:border-stone-800">
              <button
                type="button"
                onClick={() => {
                  setMode("work");
                  setErrorMsg(null);
                }}
                className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === "work"
                    ? "bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e]"
                    : "text-stone-600 dark:text-stone-400"
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                Missing Work
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("composer");
                  setErrorMsg(null);
                }}
                className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === "composer"
                    ? "bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e]"
                    : "text-stone-600 dark:text-stone-400"
                }`}
              >
                <User className="w-3.5 h-3.5" />
                Missing Composer
              </button>
            </div>

            {/* Primary Search Inputs + Fetch Button */}
            <div className="space-y-3">
              {mode === "work" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1 block text-xs">
                    <span className="font-semibold text-stone-700 dark:text-stone-300">
                      Composer Name *
                    </span>
                    <input
                      type="text"
                      required
                      value={composerInput}
                      onChange={(e) => setComposerInput(e.target.value)}
                      placeholder="e.g. Florence Price, Fazıl Say..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#d4af6a]"
                    />
                  </label>
                  <label className="space-y-1 block text-xs">
                    <span className="font-semibold text-stone-700 dark:text-stone-300">
                      Work Title *
                    </span>
                    <input
                      type="text"
                      required
                      value={workInput}
                      onChange={(e) => setWorkInput(e.target.value)}
                      placeholder="e.g. Symphony No. 1 in E minor..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#d4af6a]"
                    />
                  </label>
                </div>
              ) : (
                <label className="space-y-1 block text-xs">
                  <span className="font-semibold text-stone-700 dark:text-stone-300">
                    Composer Full Name *
                  </span>
                  <input
                    type="text"
                    required
                    value={composerInput}
                    onChange={(e) => setComposerInput(e.target.value)}
                    placeholder="e.g. Valentin Silvestrov, Florence Price, Unsuk Chin..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#d4af6a]"
                  />
                </label>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-stone-500 dark:text-stone-400">
                  {lookingUp
                    ? "Searching Wikipedia, MusicBrainz, OpenOpus & IMSLP..."
                    : "Click a match below to auto-fill all fields, or edit manually:"}
                </span>
                <button
                  type="button"
                  onClick={runLookup}
                  disabled={lookingUp}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-700 text-xs font-semibold text-[#9a7432] dark:text-[#d4af6a] hover:border-[#d4af6a] cursor-pointer"
                >
                  {lookingUp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  Auto-Fetch Metadata
                </button>
              </div>
            </div>

            {/* Smart Candidate Picker Cards */}
            {mode === "composer" && composerCandidates.length > 0 && (
              <div className="space-y-2 p-3 rounded-2xl bg-[#faf8f4] dark:bg-[#12100e] border border-stone-200/80 dark:border-stone-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 block">
                  Open-Library Matches (click to auto-fill)
                </span>
                <div className="space-y-2">
                  {composerCandidates.map((cand) => (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => applyComposerCandidate(cand)}
                      className="w-full text-left p-2.5 rounded-xl bg-white dark:bg-[#191714] border border-stone-200/80 dark:border-stone-800 hover:border-[#d4af6a] transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ComposerAvatar
                          name={cand.name}
                          avatarUrl={cand.avatar_url}
                          era={cand.era}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-stone-900 dark:text-[#f3efe6] truncate">
                            {cand.name}
                          </p>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                            {[
                              cand.birth_year
                                ? `${cand.birth_year}–${cand.death_year ?? ""}`
                                : null,
                              cand.nationality,
                              cand.era,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {cand.sources.map((s) => (
                          <span
                            key={s}
                            className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-[#9a7432] dark:text-[#e3c27d] border border-amber-500/25"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === "work" && workCandidates.length > 0 && (
              <div className="space-y-2 p-3 rounded-2xl bg-[#faf8f4] dark:bg-[#12100e] border border-stone-200/80 dark:border-stone-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 block">
                  Open-Library Matches (click to auto-fill)
                </span>
                <div className="space-y-2">
                  {workCandidates.map((cand) => (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => applyWorkCandidate(cand)}
                      className="w-full text-left p-2.5 rounded-xl bg-white dark:bg-[#191714] border border-stone-200/80 dark:border-stone-800 hover:border-[#d4af6a] transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-stone-900 dark:text-[#f3efe6] truncate">
                          {cand.title}{" "}
                          {cand.catalog_display ? `(${cand.catalog_display})` : ""}
                        </p>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                          {[
                            cand.composer_name,
                            cand.genre,
                            cand.year_composed,
                            cand.key_signature,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {cand.imslp_url && (
                          <FileMusic className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        {cand.sources.map((s) => (
                          <span
                            key={s}
                            className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-[#9a7432] dark:text-[#e3c27d] border border-amber-500/25"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Editable Metadata Review Fields */}
            {mode === "work" ? (
              <div className="space-y-3 pt-2 border-t border-stone-100 dark:border-stone-800 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="space-y-1">
                    <span className="text-stone-500">Genre</span>
                    <SelectMenu
                      value={genre}
                      onChange={setGenre}
                      ariaLabel="Work genre"
                      className="w-full"
                      buttonClassName="w-full justify-between"
                      options={GENRE_OPTIONS.map((g) => ({ value: g, label: g }))}
                    />
                  </div>
                  <label className="space-y-1 block">
                    <span className="text-stone-500">Catalog / Opus</span>
                    <input
                      type="text"
                      value={catalogDisplay}
                      onChange={(e) => setCatalogDisplay(e.target.value)}
                      placeholder="Op. 19, BWV..."
                      className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 font-mono text-stone-900 dark:text-stone-100"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-stone-500">Year</span>
                    <input
                      type="number"
                      value={yearComposed}
                      onChange={(e) => setYearComposed(e.target.value)}
                      placeholder="1932"
                      className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 font-mono text-stone-900 dark:text-stone-100"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-stone-500">Duration (min)</span>
                    <input
                      type="number"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      placeholder="28"
                      className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 font-mono text-stone-900 dark:text-stone-100"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="space-y-1 block">
                    <span className="text-stone-500">Key Signature</span>
                    <input
                      type="text"
                      value={keySignature}
                      onChange={(e) => setKeySignature(e.target.value)}
                      placeholder="e.g. E minor"
                      className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-stone-500">Instrumentation</span>
                    <input
                      type="text"
                      value={instrumentation}
                      onChange={(e) => setInstrumentation(e.target.value)}
                      placeholder="e.g. Cello and Piano / Orchestra"
                      className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                </div>

                <label className="space-y-1 block">
                  <span className="text-stone-500">IMSLP Score URL (auto-filled when available)</span>
                  <input
                    type="url"
                    value={workImslpUrl}
                    onChange={(e) => setWorkImslpUrl(e.target.value)}
                    placeholder="https://imslp.org/wiki/..."
                    className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-stone-500">Program Notes / Summary</span>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Historical context or description..."
                    className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>

                {shortBio && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3 py-2">
                    ✓ Also captured Wikipedia biography &amp; dates for{" "}
                    <strong>{composerInput}</strong> in case this composer isn&apos;t
                    in Opus Archive yet.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 pt-2 border-t border-stone-100 dark:border-stone-800 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <label className="space-y-1 block">
                    <span className="text-stone-500">Birth Year</span>
                    <input
                      type="number"
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      placeholder="1887"
                      className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 font-mono text-stone-900 dark:text-stone-100"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-stone-500">Death Year</span>
                    <input
                      type="number"
                      value={deathYear}
                      onChange={(e) => setDeathYear(e.target.value)}
                      placeholder="Living if blank"
                      className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 font-mono text-stone-900 dark:text-stone-100"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-stone-500">Nationality</span>
                    <input
                      type="text"
                      value={nationality}
                      onChange={(e) => setNationality(e.target.value)}
                      placeholder="Ukrainian, American..."
                      className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                  <div className="space-y-1">
                    <span className="text-stone-500">Era</span>
                    <SelectMenu
                      value={era}
                      onChange={setEra}
                      ariaLabel="Composer era"
                      align="right"
                      className="w-full"
                      buttonClassName="w-full justify-between"
                      options={ERA_ORDER.map((e) => ({ value: e, label: e }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="space-y-1 block">
                    <span className="text-stone-500">Portrait Image URL</span>
                    <input
                      type="url"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://upload.wikimedia.org/..."
                      className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-stone-500">IMSLP Category URL</span>
                    <input
                      type="url"
                      value={composerImslpUrl}
                      onChange={(e) => setComposerImslpUrl(e.target.value)}
                      placeholder="https://imslp.org/wiki/Category:..."
                      className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                </div>

                <label className="space-y-1 block">
                  <span className="text-stone-500">Biography Summary</span>
                  <textarea
                    rows={3}
                    value={shortBio}
                    onChange={(e) => setShortBio(e.target.value)}
                    placeholder="Auto-filled from Wikipedia..."
                    className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                {errorMsg}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Submit Proposal for Review
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
