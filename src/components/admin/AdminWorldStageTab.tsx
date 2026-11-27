"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  Download,
  ExternalLink,
  FileMusic,
  Globe2,
  Link2,
  Loader2,
  Music,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  CatalogSuggestion,
  Composer,
  Performer,
  Venue,
  Work,
} from "@/types/database";
import { ERA_ORDER } from "@/lib/constants";
import { ComposerAvatar } from "@/components/ComposerAvatar";

const WORK_GENRES = [
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

function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface AdminWorldStageTabProps {
  composers: Composer[];
  onCatalogChanged: () => void;
  showToast: (type: "success" | "error", text: string) => void;
}

export function AdminWorldStageTab({
  composers,
  onCatalogChanged,
  showToast,
}: AdminWorldStageTabProps) {
  const [suggestions, setSuggestions] = useState<CatalogSuggestion[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "approved" | "linked" | "dismissed"
  >("pending");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "user_search" | "season_sync"
  >("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [enrichingId, setEnrichingId] = useState<number | null>(null);
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [enrichedSources, setEnrichedSources] = useState<
    Record<number, string[]>
  >({});

  // Inline "Link to Existing Work" modal state
  const [linkingSug, setLinkingSug] = useState<CatalogSuggestion | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<
    (Pick<Work, "id" | "title" | "catalog_display" | "slug"> & {
      composers: { name: string } | null;
    })[]
  >([]);

  // Season Importer state
  const [importUrl, setImportUrl] = useState("");
  const [defaultVenueId, setDefaultVenueId] = useState("");
  const [defaultPerformerId, setDefaultPerformerId] = useState("");
  const [importing, setImporting] = useState(false);

  // Quick Manual Event state
  const [manualTitle, setManualTitle] = useState("");
  const [manualStartsAt, setManualStartsAt] = useState("2027-01-15T20:00");
  const [manualVenueId, setManualVenueId] = useState("");
  const [manualPerformerId, setManualPerformerId] = useState("");
  const [manualProgram, setManualProgram] = useState("");
  const [manualTicketUrl, setManualTicketUrl] = useState("");

  const loadStageAdmin = useCallback(async () => {
    setLoading(true);
    const [sugRes, venRes, perfRes] = await Promise.all([
      supabase
        .from("catalog_suggestions")
        .select("*")
        .order("occurrence_count", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("venues").select("*").order("name", { ascending: true }),
      supabase
        .from("performers")
        .select("*")
        .order("is_featured", { ascending: false })
        .order("name", { ascending: true }),
    ]);
    setSuggestions(sugRes.data ?? []);
    setVenues(venRes.data ?? []);
    setPerformers(perfRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStageAdmin();
  }, [loadStageAdmin]);

  useEffect(() => {
    if (!linkingSug) return;
    const q = linkSearch.trim();
    if (q.length < 2) {
      setLinkResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("works")
        .select("id, title, catalog_display, slug, composers(name)")
        .ilike("title", `%${q}%`)
        .limit(12);
      setLinkResults(
        (data ?? []) as unknown as (Pick<
          Work,
          "id" | "title" | "catalog_display" | "slug"
        > & { composers: { name: string } | null })[]
      );
    }, 180);
    return () => clearTimeout(t);
  }, [linkingSug, linkSearch]);

  async function importWorksForComposerId(composerId: number) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const res = await fetch("/api/admin/import-composer-works", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ composerId }),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      importedWorks?: number;
      linkedImslpScores?: number;
    };
  }

  async function ensureOrCreateComposer(
    sug: CatalogSuggestion
  ): Promise<number | null> {
    if (sug.matched_composer_id) return sug.matched_composer_id;

    const cleanName = sug.suggested_composer_name.trim();
    const parts = cleanName.split(/\s+/);
    const last = parts[parts.length - 1] || cleanName;
    const first = parts.slice(0, -1).join(" ");
    const sortName = first ? `${last}, ${first}` : last;
    const compSlug = slugify(cleanName);

    const { data: existingComp } = await supabase
      .from("composers")
      .select("id")
      .eq("slug", compSlug)
      .maybeSingle();

    if (existingComp) return existingComp.id;

    const { data: createdComp, error: compErr } = await supabase
      .from("composers")
      .insert({
        name: cleanName,
        full_name: cleanName,
        sort_name: sortName,
        slug: compSlug,
        era: sug.composer_era || "Contemporary",
        nationality: sug.composer_nationality?.trim() || "International",
        birth_year: sug.composer_birth_year || 1950,
        death_year: sug.composer_death_year ?? null,
        birth_place: sug.composer_birth_place?.trim() || null,
        avatar_url: sug.composer_avatar_url?.trim() || null,
        imslp_url: sug.composer_imslp_url?.trim() || null,
        short_bio:
          sug.composer_short_bio?.trim() ||
          `${cleanName} — classical composer added via Opus Archive moderation queue.`,
      })
      .select("id")
      .single();

    if (compErr || !createdComp) {
      showToast("error", compErr?.message || "Could not create composer.");
      return null;
    }
    return createdComp.id;
  }

  /**
   * Approves a Composer proposal (and optionally imports their top works + IMSLP scores!)
   */
  async function handleApproveComposerSuggestion(
    sug: CatalogSuggestion,
    withWorksImport: boolean
  ) {
    setBusyId(sug.id);
    try {
      const composerId = await ensureOrCreateComposer(sug);
      if (!composerId) return;

      let importSummary = "";
      if (withWorksImport) {
        const imported = await importWorksForComposerId(composerId);
        if (imported) {
          importSummary = ` + ${imported.importedWorks ?? 0} works (${imported.linkedImslpScores ?? 0} IMSLP scores)`;
        }
      }

      await supabase
        .from("catalog_suggestions")
        .update({
          status: "approved",
          matched_composer_id: composerId,
          resolved_composer_id: composerId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sug.id);

      showToast(
        "success",
        `Published ${sug.suggested_composer_name}${importSummary}!`
      );
      loadStageAdmin();
      onCatalogChanged();
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Approves a Work proposal (creating composer with full Wikipedia metadata if needed)
   * and retroactively links any World Stage concerts performing it.
   */
  async function handleApproveWorkSuggestion(sug: CatalogSuggestion) {
    setBusyId(sug.id);
    try {
      const composerId = await ensureOrCreateComposer(sug);
      if (!composerId) return;

      const catRaw = sug.suggested_catalog_display?.trim() || null;
      const catMatch = catRaw?.match(/^([A-Za-z]+\.?)\s*(.+)$/);

      const { data: newWork, error: workErr } = await supabase
        .from("works")
        .insert({
          composer_id: composerId,
          title: sug.suggested_work_title.trim(),
          genre: sug.suggested_genre || "Orchestral",
          catalog_system: catMatch ? catMatch[1] : null,
          catalog_number: catMatch ? catMatch[2] : null,
          year_composed: sug.suggested_year ?? null,
          key_signature: sug.suggested_key_signature?.trim() || null,
          duration_minutes: sug.suggested_duration_minutes ?? null,
          instrumentation: sug.suggested_instrumentation?.trim() || null,
          description: sug.suggested_description?.trim() || null,
          imslp_url: sug.suggested_imslp_url?.trim() || null,
          is_popular: false,
        })
        .select("id")
        .single();

      if (workErr || !newWork) {
        showToast("error", workErr?.message || "Failed to add work.");
        return;
      }

      await supabase
        .from("concert_event_works")
        .update({ work_id: newWork.id, composer_id: composerId })
        .eq("suggestion_id", sug.id);

      await supabase
        .from("catalog_suggestions")
        .update({
          status: "approved",
          matched_composer_id: composerId,
          resolved_composer_id: composerId,
          resolved_work_id: newWork.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sug.id);

      showToast(
        "success",
        `Published "${sug.suggested_work_title}" to Opus Archive!`
      );
      loadStageAdmin();
      onCatalogChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function handleLinkToExistingWork(
    sug: CatalogSuggestion,
    targetWorkId: number
  ) {
    setBusyId(sug.id);
    await supabase
      .from("concert_event_works")
      .update({ work_id: targetWorkId })
      .eq("suggestion_id", sug.id);

    await supabase
      .from("catalog_suggestions")
      .update({
        status: "linked",
        resolved_work_id: targetWorkId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sug.id);

    setBusyId(null);
    setLinkingSug(null);
    setLinkSearch("");
    showToast("success", "Linked to existing library work!");
    loadStageAdmin();
  }

  async function handleDismissSuggestion(sug: CatalogSuggestion) {
    setBusyId(sug.id);
    await supabase
      .from("catalog_suggestions")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("id", sug.id);
    setBusyId(null);
    loadStageAdmin();
    onCatalogChanged();
  }

  function updateLocalSuggestionField(
    id: number,
    patch: Partial<CatalogSuggestion>
  ) {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  async function handleEnrichSuggestion(
    sug: CatalogSuggestion,
    opts?: { silent?: boolean }
  ): Promise<boolean> {
    const isComposerProposal = sug.suggestion_type === "composer";
    setEnrichingId(sug.id);
    try {
      const params = new URLSearchParams({
        type: isComposerProposal ? "composer" : "work",
        q: isComposerProposal
          ? sug.suggested_composer_name
          : sug.suggested_work_title,
        composer: sug.suggested_composer_name,
      });
      const res = await fetch(`/api/v1/suggest/lookup?${params.toString()}`);
      if (!res.ok) {
        if (!opts?.silent) {
          showToast("error", "Metadata lookup failed.");
        }
        return false;
      }

      const data = (await res.json()) as {
        candidates?: {
          title?: string;
          name?: string;
          genre?: string;
          catalog_display?: string | null;
          key_signature?: string | null;
          year_composed?: number | null;
          duration_minutes?: number | null;
          instrumentation?: string | null;
          description?: string | null;
          imslp_url?: string | null;
          birth_year?: number | null;
          death_year?: number | null;
          nationality?: string;
          era?: string;
          avatar_url?: string | null;
          short_bio?: string;
          sources?: string[];
          composer_meta?: {
            birth_year?: number | null;
            death_year?: number | null;
            nationality?: string;
            era?: string;
            avatar_url?: string | null;
            short_bio?: string;
            imslp_url?: string | null;
          } | null;
        }[];
      };

      const top = data.candidates?.[0];
      if (!top) {
        if (!opts?.silent) {
          showToast(
            "error",
            `No open-library metadata found for "${
              isComposerProposal
                ? sug.suggested_composer_name
                : sug.suggested_work_title
            }".`
          );
        }
        return false;
      }

      const patch: Partial<Omit<CatalogSuggestion, "id">> = {};
      if (isComposerProposal) {
        if (top.birth_year) patch.composer_birth_year = top.birth_year;
        if (top.death_year) patch.composer_death_year = top.death_year;
        if (top.nationality && top.nationality !== "International") {
          patch.composer_nationality = top.nationality;
        }
        if (top.era) patch.composer_era = top.era;
        if (top.avatar_url) patch.composer_avatar_url = top.avatar_url;
        if (top.imslp_url) patch.composer_imslp_url = top.imslp_url;
        if (top.short_bio) patch.composer_short_bio = top.short_bio;
      } else {
        if (!sug.suggested_catalog_display && top.catalog_display) {
          patch.suggested_catalog_display = top.catalog_display;
        }
        if (top.year_composed && !sug.suggested_year) {
          patch.suggested_year = top.year_composed;
        }
        if (top.key_signature && !sug.suggested_key_signature) {
          patch.suggested_key_signature = top.key_signature;
        }
        if (top.duration_minutes && !sug.suggested_duration_minutes) {
          patch.suggested_duration_minutes = top.duration_minutes;
        }
        if (top.instrumentation && !sug.suggested_instrumentation) {
          patch.suggested_instrumentation = top.instrumentation;
        }
        if (top.imslp_url && !sug.suggested_imslp_url) {
          patch.suggested_imslp_url = top.imslp_url;
        }
        if (top.description && !sug.suggested_description) {
          patch.suggested_description = top.description;
        }
        if (
          top.genre &&
          (!sug.suggested_genre || sug.suggested_genre === "Orchestral")
        ) {
          patch.suggested_genre = top.genre;
        }
        if (top.composer_meta && !sug.matched_composer_id) {
          if (top.composer_meta.birth_year && !sug.composer_birth_year) {
            patch.composer_birth_year = top.composer_meta.birth_year;
          }
          if (top.composer_meta.death_year && !sug.composer_death_year) {
            patch.composer_death_year = top.composer_meta.death_year;
          }
          if (
            top.composer_meta.nationality &&
            !sug.composer_nationality
          ) {
            patch.composer_nationality = top.composer_meta.nationality;
          }
          if (top.composer_meta.era && !sug.composer_era) {
            patch.composer_era = top.composer_meta.era;
          }
          if (top.composer_meta.avatar_url && !sug.composer_avatar_url) {
            patch.composer_avatar_url = top.composer_meta.avatar_url;
          }
          if (top.composer_meta.short_bio && !sug.composer_short_bio) {
            patch.composer_short_bio = top.composer_meta.short_bio;
          }
          if (top.composer_meta.imslp_url && !sug.composer_imslp_url) {
            patch.composer_imslp_url = top.composer_meta.imslp_url;
          }
        }
      }

      const filledCount = Object.keys(patch).length;
      if (filledCount === 0) {
        if (!opts?.silent) {
          showToast(
            "success",
            `Already up to date (checked ${(top.sources || []).join(" · ") || "open libraries"}).`
          );
        }
        return false;
      }

      updateLocalSuggestionField(sug.id, patch);
      if (top.sources?.length) {
        setEnrichedSources((prev) => ({
          ...prev,
          [sug.id]: top.sources || [],
        }));
      }

      await supabase
        .from("catalog_suggestions")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", sug.id);

      if (!opts?.silent) {
        showToast(
          "success",
          `Auto-filled ${filledCount} field${filledCount === 1 ? "" : "s"} from ${(top.sources || ["open libraries"]).join(" · ")}.`
        );
      }
      return true;
    } finally {
      setEnrichingId(null);
    }
  }

  async function handleEnrichAllPending() {
    const targets = visibleSuggestions.filter((s) => {
      if (s.status !== "pending") return false;
      if (s.suggestion_type === "composer") {
        return !s.composer_birth_year || !s.composer_short_bio;
      }
      return (
        !s.suggested_year ||
        !s.suggested_key_signature ||
        !s.suggested_instrumentation ||
        !s.suggested_imslp_url
      );
    });
    if (targets.length === 0) {
      showToast("success", "All visible pending items already have metadata.");
      return;
    }
    setEnrichingAll(true);
    let updated = 0;
    try {
      for (const sug of targets) {
        const didUpdate = await handleEnrichSuggestion(sug, { silent: true });
        if (didUpdate) updated++;
      }
      showToast(
        "success",
        `Auto-enriched ${updated} of ${targets.length} pending item${targets.length === 1 ? "" : "s"}!`
      );
    } finally {
      setEnrichingAll(false);
    }
  }

  async function callImportApi(payload: Record<string, unknown>) {
    setImporting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showToast("error", "Admin session expired — please sign in again.");
        return;
      }
      const res = await fetch("/api/admin/import-season", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        error?: string;
        importedEvents?: number;
        matchedWorks?: number;
        queuedSuggestions?: number;
      };
      if (!res.ok) {
        showToast("error", data.error || "Season import failed.");
        return;
      }
      showToast(
        "success",
        `Imported ${data.importedEvents} events · ${data.matchedWorks} works linked · ${data.queuedSuggestions} new suggestions!`
      );
      loadStageAdmin();
      onCatalogChanged();
    } finally {
      setImporting(false);
    }
  }

  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const visibleSuggestions = suggestions.filter((s) => {
    if (s.status !== statusFilter) return false;
    if (sourceFilter !== "all" && s.source_type !== sourceFilter) return false;
    return true;
  });
  const composerById = new Map(composers.map((c) => [c.id, c]));

  return (
    <div className="space-y-8">
      {/* 1. Unified Moderation & Suggestions Inbox */}
      <section className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#9a7432] dark:text-[#d4af6a]" />
              Catalog Moderation Inbox ({pendingCount} pending)
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Review auto-enriched Community Search proposals and missing works
              spotted on World Stage concert programs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {statusFilter === "pending" && visibleSuggestions.length > 0 && (
              <button
                type="button"
                disabled={enrichingAll || enrichingId !== null}
                onClick={handleEnrichAllPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#9a7432]/15 dark:bg-[#d4af6a]/15 border border-[#d4af6a]/40 text-[#9a7432] dark:text-[#e3c27d] text-xs font-semibold hover:bg-[#d4af6a]/25 cursor-pointer disabled:opacity-50"
              >
                {enrichingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {enrichingAll ? "Enriching..." : "Auto-enrich Pending"}
              </button>
            )}

            {/* Source filter pills */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#f3efe8] dark:bg-[#12100e] border border-stone-200 dark:border-stone-800">
              {(
                [
                  { id: "all", label: "All Sources" },
                  { id: "user_search", label: "Community Search" },
                  { id: "season_sync", label: "Concert Seasons" },
                ] as const
              ).map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setSourceFilter(src.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    sourceFilter === src.id
                      ? "bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e]"
                      : "text-stone-600 dark:text-stone-400"
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>

            {/* Status filter pills */}
            <div className="flex flex-wrap gap-1">
              {(["pending", "approved", "linked", "dismissed"] as const).map(
                (st) => {
                  const cnt = suggestions.filter((s) => s.status === st).length;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize border cursor-pointer ${
                        statusFilter === st
                          ? "bg-[#1a1816] dark:bg-[#f3efe6] text-white dark:text-[#11100e] border-transparent"
                          : "bg-[#faf8f4] dark:bg-[#141210] border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400"
                      }`}
                    >
                      {st} ({cnt})
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </div>

        {/* Link-to-Existing Work Modal */}
        {linkingSug && (
          <div className="p-4 rounded-2xl bg-[#faf8f4] dark:bg-[#12100e] border border-[#d4af6a]/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-900 dark:text-[#f3efe6]">
                Link &ldquo;{linkingSug.suggested_composer_name}:{" "}
                {linkingSug.suggested_work_title}&rdquo; to an existing library
                work:
              </span>
              <button
                type="button"
                onClick={() => setLinkingSug(null)}
                className="p-1 text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="Type work title or catalog (e.g. Symphony No. 9, Piano Concerto No. 2)..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
              />
            </div>
            {linkResults.length > 0 && (
              <div className="divide-y divide-stone-200/70 dark:divide-stone-800 max-h-52 overflow-y-auto">
                {linkResults.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleLinkToExistingWork(linkingSug, w.id)}
                    className="w-full text-left py-2 px-2.5 hover:bg-stone-100 dark:hover:bg-[#1f1c18] flex items-center justify-between gap-2 text-xs cursor-pointer rounded-lg"
                  >
                    <span>
                      <strong>{w.composers?.name}:</strong> {w.title}{" "}
                      {w.catalog_display ? `(${w.catalog_display})` : ""}
                    </span>
                    <span className="text-[#9a7432] dark:text-[#d4af6a] font-semibold">
                      Link →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-xs text-stone-400">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading moderation queue...
          </div>
        ) : visibleSuggestions.length === 0 ? (
          <p className="py-8 text-center text-xs text-stone-500">
            No {statusFilter} items match the selected filter.
          </p>
        ) : (
          <div className="space-y-3.5">
            {visibleSuggestions.map((sug) => {
              const isComposerProposal = sug.suggestion_type === "composer";
              const isUserSearch = sug.source_type === "user_search";
              const matchedComp = sug.matched_composer_id
                ? composerById.get(sug.matched_composer_id)
                : null;
              const isBusy = busyId === sug.id;

              return (
                <div
                  key={sug.id}
                  className="p-4 sm:p-5 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/80 dark:border-stone-800 space-y-3.5"
                >
                  {/* Top Badges Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          isComposerProposal
                            ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                            : "bg-amber-500/10 text-[#9a7432] dark:text-[#e3c27d] border-amber-500/30"
                        }`}
                      >
                        {isComposerProposal ? (
                          <User className="w-3 h-3" />
                        ) : (
                          <Music className="w-3 h-3" />
                        )}
                        {isComposerProposal ? "Composer" : "Work"}
                      </span>

                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          isUserSearch
                            ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30"
                            : "bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-300/60 dark:border-stone-700"
                        }`}
                      >
                        {isUserSearch
                          ? "Community Search Proposal"
                          : sug.source_context || "Season Sync"}
                      </span>

                      {sug.source_url && (
                        <a
                          href={sug.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#9a7432] dark:text-[#d4af6a] hover:underline"
                        >
                          Source
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                        {sug.occurrence_count}× requested
                      </span>
                      {!isComposerProposal &&
                        (matchedComp ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            Composer in DB: {matchedComp.name}
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                            New Composer (enriched)
                          </span>
                        ))}
                    </div>
                  </div>

                  {/* Editable Fields for Pending Proposals */}
                  {sug.status === "pending" ? (
                    isComposerProposal ? (
                      <div className="space-y-3 text-xs">
                        <div className="flex items-start gap-3">
                          <ComposerAvatar
                            name={sug.suggested_composer_name}
                            avatarUrl={sug.composer_avatar_url}
                            era={sug.composer_era || "Contemporary"}
                            size="md"
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 flex-1">
                            <input
                              type="text"
                              value={sug.suggested_composer_name}
                              onChange={(e) =>
                                updateLocalSuggestionField(sug.id, {
                                  suggested_composer_name: e.target.value,
                                })
                              }
                              placeholder="Composer Name"
                              className="sm:col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 font-semibold text-stone-900 dark:text-stone-100"
                            />
                            <input
                              type="text"
                              value={sug.composer_nationality || ""}
                              onChange={(e) =>
                                updateLocalSuggestionField(sug.id, {
                                  composer_nationality: e.target.value,
                                })
                              }
                              placeholder="Nationality"
                              className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                            />
                            <select
                              value={sug.composer_era || "Contemporary"}
                              onChange={(e) =>
                                updateLocalSuggestionField(sug.id, {
                                  composer_era: e.target.value,
                                })
                              }
                              className="px-2.5 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                            >
                              {ERA_ORDER.map((e) => (
                                <option key={e} value={e}>
                                  {e}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <input
                            type="number"
                            value={sug.composer_birth_year ?? ""}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                composer_birth_year: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
                            }
                            placeholder="Birth Year"
                            className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 font-mono text-stone-900 dark:text-stone-100"
                          />
                          <input
                            type="number"
                            value={sug.composer_death_year ?? ""}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                composer_death_year: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
                            }
                            placeholder="Death Year"
                            className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 font-mono text-stone-900 dark:text-stone-100"
                          />
                          <input
                            type="url"
                            value={sug.composer_avatar_url || ""}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                composer_avatar_url: e.target.value,
                              })
                            }
                            placeholder="Portrait URL"
                            className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                          />
                          <input
                            type="url"
                            value={sug.composer_imslp_url || ""}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                composer_imslp_url: e.target.value,
                              })
                            }
                            placeholder="IMSLP Category URL"
                            className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                          />
                        </div>

                        <textarea
                          rows={2}
                          value={sug.composer_short_bio || ""}
                          onChange={(e) =>
                            updateLocalSuggestionField(sug.id, {
                              composer_short_bio: e.target.value,
                            })
                          }
                          placeholder="Short biography..."
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        />

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleApproveComposerSuggestion(sug, true)
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            Approve + Import Top Works &amp; IMSLP
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleApproveComposerSuggestion(sug, false)
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#d4af6a] cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve Profile Only
                          </button>
                          <button
                            type="button"
                            disabled={
                              isBusy || enrichingAll || enrichingId === sug.id
                            }
                            onClick={() => handleEnrichSuggestion(sug)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#d4af6a]/40 bg-[#d4af6a]/10 text-[#9a7432] dark:text-[#e3c27d] text-xs font-semibold hover:bg-[#d4af6a]/20 cursor-pointer disabled:opacity-50"
                          >
                            {enrichingId === sug.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            Auto-fetch Metadata
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDismissSuggestion(sug)}
                            className="px-3 py-1.5 rounded-xl text-xs text-stone-500 hover:text-red-500 cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                          <input
                            type="text"
                            value={sug.suggested_composer_name}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                suggested_composer_name: e.target.value,
                              })
                            }
                            className="sm:col-span-3 px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                            placeholder="Composer"
                          />
                          <input
                            type="text"
                            value={sug.suggested_work_title}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                suggested_work_title: e.target.value,
                              })
                            }
                            className="sm:col-span-5 px-3 py-2 font-medium rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                            placeholder="Work Title"
                          />
                          <select
                            value={sug.suggested_genre || "Orchestral"}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                suggested_genre: e.target.value,
                              })
                            }
                            className="sm:col-span-2 px-2.5 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                          >
                            {WORK_GENRES.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={sug.suggested_catalog_display || ""}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                suggested_catalog_display: e.target.value,
                              })
                            }
                            className="sm:col-span-2 px-3 py-2 font-mono rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                            placeholder="Op. / BWV"
                          />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <input
                            type="number"
                            value={sug.suggested_year ?? ""}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                suggested_year: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
                            }
                            placeholder="Year"
                            className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 font-mono text-stone-900 dark:text-stone-100"
                          />
                          <input
                            type="text"
                            value={sug.suggested_key_signature || ""}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                suggested_key_signature: e.target.value,
                              })
                            }
                            placeholder="Key (e.g. D minor)"
                            className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                          />
                          <input
                            type="text"
                            value={sug.suggested_instrumentation || ""}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                suggested_instrumentation: e.target.value,
                              })
                            }
                            placeholder="Instrumentation"
                            className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                          />
                          <input
                            type="url"
                            value={sug.suggested_imslp_url || ""}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                suggested_imslp_url: e.target.value,
                              })
                            }
                            placeholder="IMSLP Score URL"
                            className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                          />
                        </div>

                        {sug.suggested_description && (
                          <textarea
                            rows={2}
                            value={sug.suggested_description}
                            onChange={(e) =>
                              updateLocalSuggestionField(sug.id, {
                                suggested_description: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                          />
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleApproveWorkSuggestion(sug)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Approve &amp; Add to Library
                          </button>
                          <button
                            type="button"
                            disabled={
                              isBusy || enrichingAll || enrichingId === sug.id
                            }
                            onClick={() => handleEnrichSuggestion(sug)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#d4af6a]/40 bg-[#d4af6a]/10 text-[#9a7432] dark:text-[#e3c27d] text-xs font-semibold hover:bg-[#d4af6a]/20 cursor-pointer disabled:opacity-50"
                          >
                            {enrichingId === sug.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            Auto-fetch Metadata
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setLinkingSug(sug);
                              setLinkSearch(
                                sug.suggested_work_title
                                  .split(",")[0]
                                  .slice(0, 24)
                              );
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#d4af6a] cursor-pointer"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            Link to Existing Work
                          </button>
                          {enrichedSources[sug.id]?.length ? (
                            <span className="text-[10px] px-2 py-1 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 font-medium">
                              via {enrichedSources[sug.id].join(" · ")}
                            </span>
                          ) : null}
                          {sug.suggested_imslp_url && (
                            <a
                              href={sug.suggested_imslp_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium"
                            >
                              <FileMusic className="w-3 h-3" />
                              Preview IMSLP
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDismissSuggestion(sug)}
                            className="px-3 py-1.5 rounded-xl text-xs text-stone-500 hover:text-red-500 cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-serif text-sm font-bold text-stone-900 dark:text-[#f3efe6]">
                        {sug.suggested_composer_name}
                        {sug.suggested_work_title
                          ? ` — ${sug.suggested_work_title}`
                          : " (Composer Profile)"}
                      </p>
                      {sug.resolved_work_id ? (
                        <Link
                          href={`/works/${sug.resolved_work_id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          Open Work #{sug.resolved_work_id}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : sug.resolved_composer_id ? (
                        <Link
                          href={`/composers/${slugify(
                            sug.suggested_composer_name
                          )}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          Open Composer Profile
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Season Importer (JSON-LD / .ics / Live NYPhil Feed) + Manual Event Creator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-[#d4af6a]" />
              Season URL / iCal / Open Feed Importer
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Fetch any concert page with Schema.org{" "}
              <code className="font-mono">MusicEvent</code> JSON-LD, an{" "}
              <code className="font-mono">.ics</code> calendar URL, or trigger a
              live NY Philharmonic sync.
            </p>
          </div>

          <button
            type="button"
            disabled={importing}
            onClick={() => callImportApi({ mode: "nyphil_live" })}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-700 hover:border-[#d4af6a] text-xs font-semibold text-stone-900 dark:text-[#f3efe6] cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[#d4af6a] ${
                importing ? "animate-spin" : ""
              }`}
            />
            Sync Live NY Philharmonic 2026/27 Open Feed Now
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!importUrl.trim()) return;
              callImportApi({
                mode: "url",
                url: importUrl.trim(),
                defaultVenueId: defaultVenueId
                  ? Number(defaultVenueId)
                  : undefined,
                defaultPerformerId: defaultPerformerId
                  ? Number(defaultPerformerId)
                  : undefined,
              });
            }}
            className="space-y-3 pt-2 border-t border-stone-100 dark:border-stone-800 text-xs"
          >
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://... (concert page with MusicEvent JSON-LD or .ics)"
              className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={defaultVenueId}
                onChange={(e) => setDefaultVenueId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              >
                <option value="">Auto-detect Venue...</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.short_name || v.name}
                  </option>
                ))}
              </select>
              <select
                value={defaultPerformerId}
                onChange={(e) => setDefaultPerformerId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              >
                <option value="">Optional Default Artist...</option>
                {performers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={importing || !importUrl.trim()}
              className="px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {importing ? "Importing..." : "Fetch & Import Season URL"}
            </button>
          </form>
        </div>

        {/* Manual Concert Entry */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!manualTitle.trim() || !manualVenueId) return;
            callImportApi({
              mode: "manual",
              manualEvent: {
                title: manualTitle.trim(),
                startsAt: new Date(manualStartsAt).toISOString(),
                venueId: Number(manualVenueId),
                performerIds: manualPerformerId
                  ? [Number(manualPerformerId)]
                  : [],
                programText: manualProgram,
                ticketUrl: manualTicketUrl.trim() || undefined,
              },
            });
            setManualTitle("");
            setManualProgram("");
          }}
          className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-3 text-xs"
        >
          <div>
            <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#d4af6a]" />
              Add Concert Date &amp; Auto-Match Program
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Enter one piece per line as{" "}
              <code className="font-mono">Composer: Work Title</code>; known
              works link automatically and unknown ones enter the inbox.
            </p>
          </div>

          <input
            type="text"
            required
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="Event Title (e.g. Yo-Yo Ma & Berliner Philharmoniker)"
            className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="datetime-local"
              required
              value={manualStartsAt}
              onChange={(e) => setManualStartsAt(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
            />
            <select
              required
              value={manualVenueId}
              onChange={(e) => setManualVenueId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
            >
              <option value="">Select Hall...</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.short_name || v.name}
                </option>
              ))}
            </select>
            <select
              value={manualPerformerId}
              onChange={(e) => setManualPerformerId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
            >
              <option value="">Orchestra / Soloist...</option>
              {performers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <textarea
            rows={3}
            value={manualProgram}
            onChange={(e) => setManualProgram(e.target.value)}
            placeholder={
              "Antonín Dvořák: Cello Concerto in B minor, Op. 104\nUnsuk Chin: Cello Concerto"
            }
            className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 font-mono text-[11px]"
          />

          <input
            type="url"
            value={manualTicketUrl}
            onChange={(e) => setManualTicketUrl(e.target.value)}
            placeholder="Official Event / Ticket URL (optional)"
            className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
          />

          <button
            type="submit"
            disabled={importing}
            className="px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
          >
            Publish Concert &amp; Match Repertoire
          </button>
        </form>
      </div>
    </div>
  );
}
