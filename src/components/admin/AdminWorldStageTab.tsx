"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  ExternalLink,
  Globe2,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
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
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

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

  // Live search for "Link to Existing Work"
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

  /**
   * 1-Click Approve & Add to Library:
   * - Uses existing `matched_composer_id` OR creates a new Contemporary composer profile
   * - Inserts the work into `public.works`
   * - Updates all `concert_event_works` rows pointing to this suggestion so every
   *   concert playing this piece immediately becomes clickable on `/stage`!
   */
  async function handleApproveSuggestion(sug: CatalogSuggestion) {
    setBusyId(sug.id);
    try {
      let composerId = sug.matched_composer_id;

      if (!composerId) {
        const parts = sug.suggested_composer_name.trim().split(/\s+/);
        const last = parts[parts.length - 1] || sug.suggested_composer_name;
        const first = parts.slice(0, -1).join(" ");
        const sortName = first ? `${last}, ${first}` : last;
        const compSlug = slugify(sug.suggested_composer_name);

        const { data: existingComp } = await supabase
          .from("composers")
          .select("id")
          .eq("slug", compSlug)
          .maybeSingle();

        if (existingComp) {
          composerId = existingComp.id;
        } else {
          const { data: createdComp, error: compErr } = await supabase
            .from("composers")
            .insert({
              name: sug.suggested_composer_name.trim(),
              full_name: sug.suggested_composer_name.trim(),
              sort_name: sortName,
              slug: compSlug,
              era: "Contemporary",
              nationality: "International",
              birth_year: 1970,
              short_bio: `${sug.suggested_composer_name} — added from World Stage 2026/27 season programming (${sug.source_context || "live orchestral calendar"}).`,
            })
            .select("id")
            .single();

          if (compErr || !createdComp) {
            showToast(
              "error",
              compErr?.message || "Could not create composer profile."
            );
            setBusyId(null);
            return;
          }
          composerId = createdComp.id;
        }
      }

      const { data: newWork, error: workErr } = await supabase
        .from("works")
        .insert({
          composer_id: composerId,
          title: sug.suggested_work_title.trim(),
          genre: sug.suggested_genre || "Orchestral",
          catalog_display: sug.suggested_catalog_display?.trim() || null,
          year_composed: sug.suggested_year || null,
          instrumentation: sug.suggested_instrumentation?.trim() || null,
          is_popular: false,
        })
        .select("id")
        .single();

      if (workErr || !newWork) {
        showToast("error", workErr?.message || "Failed to add work.");
        setBusyId(null);
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
          resolved_work_id: newWork.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sug.id);

      showToast(
        "success",
        `Added "${sug.suggested_work_title}" to library & linked live concerts!`
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
    showToast("success", "Concert program linked to existing library work!");
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
  }

  async function updateLocalSuggestionField(
    id: number,
    patch: Partial<CatalogSuggestion>
  ) {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
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
    } finally {
      setImporting(false);
    }
  }

  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const visibleSuggestions = suggestions.filter(
    (s) => s.status === statusFilter
  );
  const composerById = new Map(composers.map((c) => [c.id, c]));

  return (
    <div className="space-y-8">
      {/* 1. Missing-Work Suggestions Inbox */}
      <section className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#9a7432] dark:text-[#d4af6a]" />
              Season Repertoire Suggestions Inbox ({pendingCount} pending)
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Works spotted on NY Philharmonic, Berliner Philharmoniker, and
              soloist season bills that aren&apos;t linked in Opus Archive yet.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
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
                        ? "bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] border-transparent"
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
            Loading suggestions...
          </div>
        ) : visibleSuggestions.length === 0 ? (
          <p className="py-8 text-center text-xs text-stone-500">
            No {statusFilter} repertoire suggestions right now.
          </p>
        ) : (
          <div className="space-y-3">
            {visibleSuggestions.map((sug) => {
              const matchedComp = sug.matched_composer_id
                ? composerById.get(sug.matched_composer_id)
                : null;
              const isBusy = busyId === sug.id;

              return (
                <div
                  key={sug.id}
                  className="p-4 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/80 dark:border-stone-800 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[#9a7432] dark:text-[#d4af6a] font-medium">
                      {sug.source_context || "Season Program Import"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                        {sug.occurrence_count}× on stage
                      </span>
                      {matchedComp ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          Composer in DB: {matchedComp.name}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                          New Composer (will auto-create)
                        </span>
                      )}
                    </div>
                  </div>

                  {sug.status === "pending" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                      <input
                        type="text"
                        value={sug.suggested_composer_name}
                        onChange={(e) =>
                          updateLocalSuggestionField(sug.id, {
                            suggested_composer_name: e.target.value,
                          })
                        }
                        className="sm:col-span-3 px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
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
                        className="sm:col-span-5 px-3 py-2 text-xs font-medium rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        placeholder="Work Title"
                      />
                      <select
                        value={sug.suggested_genre || "Orchestral"}
                        onChange={(e) =>
                          updateLocalSuggestionField(sug.id, {
                            suggested_genre: e.target.value,
                          })
                        }
                        className="sm:col-span-2 px-2.5 py-2 text-xs rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
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
                        className="sm:col-span-2 px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        placeholder="Catalog (Op. 42)"
                      />
                    </div>
                  ) : (
                    <p className="font-serif text-sm font-bold text-stone-900 dark:text-[#f3efe6]">
                      {sug.suggested_composer_name} — {sug.suggested_work_title}
                    </p>
                  )}

                  {sug.status === "pending" && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleApproveSuggestion(sug)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve &amp; Add to Library
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setLinkingSug(sug);
                          setLinkSearch(
                            sug.suggested_work_title.split(",")[0].slice(0, 24)
                          );
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#d4af6a] cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Link to Existing Work
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
                  )}

                  {sug.resolved_work_id && (
                    <Link
                      href={`/works/${sug.resolved_work_id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Open Linked Library Work #{sug.resolved_work_id}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
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
                defaultVenueId: defaultVenueId ? Number(defaultVenueId) : undefined,
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
              Enter one piece per line as <code className="font-mono">Composer: Work Title</code>; known works link automatically and unknown ones enter the inbox.
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
            placeholder={"Antonín Dvořák: Cello Concerto in B minor, Op. 104\nUnsuk Chin: Cello Concerto"}
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
