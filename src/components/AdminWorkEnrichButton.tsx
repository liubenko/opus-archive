"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Shield, Sparkles, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

const WORK_GENRES = [
  "Symphony",
  "Concerto",
  "Piano Solo",
  "Chamber",
  "Opera",
  "Choral & Vocal",
  "Orchestral",
  "Ballet",
  "Solo Instrumental",
  "Sacred",
  "Stage & Incidental",
] as const;

export interface EditableWorkSnapshot {
  id: number;
  title: string;
  nickname: string | null;
  genre: string;
  year_composed: number | null;
  key_signature: string | null;
  duration_minutes: number | null;
  movements_count: number | null;
  catalog_system: string | null;
  catalog_number: string | null;
  instrumentation: string | null;
  description: string | null;
  imslp_url: string | null;
  youtube_url: string | null;
  spotify_url: string | null;
  apple_music_url: string | null;
  is_popular: boolean;
}

interface AdminWorkEnrichButtonProps {
  work: EditableWorkSnapshot;
  missingFields: string[];
}

export function AdminWorkEnrichButton({
  work,
  missingFields,
}: AdminWorkEnrichButtonProps) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "info" | "error";
    text: string;
  } | null>(null);

  const [form, setForm] = useState({
    title: work.title,
    nickname: work.nickname ?? "",
    genre: work.genre,
    year_composed: work.year_composed != null ? String(work.year_composed) : "",
    key_signature: work.key_signature ?? "",
    duration_minutes:
      work.duration_minutes != null ? String(work.duration_minutes) : "",
    movements_count:
      work.movements_count != null ? String(work.movements_count) : "",
    catalog_system: work.catalog_system ?? "",
    catalog_number: work.catalog_number ?? "",
    instrumentation: work.instrumentation ?? "",
    description: work.description ?? "",
    imslp_url: work.imslp_url ?? "",
    youtube_url: work.youtube_url ?? "",
    spotify_url: work.spotify_url ?? "",
    apple_music_url: work.apple_music_url ?? "",
    is_popular: work.is_popular,
  });

  // Keep modal fields synced whenever server props refresh (e.g. after Auto-Enrich)
  useEffect(() => {
    setForm({
      title: work.title,
      nickname: work.nickname ?? "",
      genre: work.genre,
      year_composed:
        work.year_composed != null ? String(work.year_composed) : "",
      key_signature: work.key_signature ?? "",
      duration_minutes:
        work.duration_minutes != null ? String(work.duration_minutes) : "",
      movements_count:
        work.movements_count != null ? String(work.movements_count) : "",
      catalog_system: work.catalog_system ?? "",
      catalog_number: work.catalog_number ?? "",
      instrumentation: work.instrumentation ?? "",
      description: work.description ?? "",
      imslp_url: work.imslp_url ?? "",
      youtube_url: work.youtube_url ?? "",
      spotify_url: work.spotify_url ?? "",
      apple_music_url: work.apple_music_url ?? "",
      is_popular: work.is_popular,
    });
  }, [work]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setIsAdmin(session?.user?.app_metadata?.role === "admin");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(session?.user?.app_metadata?.role === "admin");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!isAdmin) return null;

  async function handleEnrich() {
    setEnriching(true);
    setStatus(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setStatus({ type: "error", text: "Admin session expired." });
        return;
      }

      const res = await fetch("/api/admin/enrich-work", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workId: work.id }),
      });
      const json = (await res.json()) as {
        error?: string;
        updatedFields?: string[];
        sources?: string[];
      };

      if (!res.ok) {
        setStatus({
          type: "error",
          text: json.error || "Failed to enrich work.",
        });
        return;
      }

      const updated = json.updatedFields ?? [];
      if (updated.length === 0) {
        setStatus({
          type: "info",
          text: "No additional open-data fields found.",
        });
      } else {
        const srcText =
          json.sources && json.sources.length > 0
            ? ` (${json.sources.join(" · ")})`
            : "";
        setStatus({
          type: "success",
          text: `Updated ${updated.join(", ")}${srcText}`,
        });
        router.refresh();
      }
    } catch {
      setStatus({ type: "error", text: "Network error during enrichment." });
    } finally {
      setEnriching(false);
    }
  }

  async function handleSaveManualEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setStatus(null);

    const parseOptionalInt = (val: string) => {
      const t = val.trim();
      if (!t) return null;
      const n = parseInt(t, 10);
      return Number.isFinite(n) ? n : null;
    };

    // Note: `catalog_display` is GENERATED ALWAYS — update `catalog_system` + `catalog_number` only
    const payload: Database["public"]["Tables"]["works"]["Update"] = {
      title: form.title.trim(),
      nickname: form.nickname.trim() || null,
      genre: form.genre,
      year_composed: parseOptionalInt(form.year_composed),
      key_signature: form.key_signature.trim() || null,
      duration_minutes: parseOptionalInt(form.duration_minutes),
      movements_count: parseOptionalInt(form.movements_count),
      catalog_system: form.catalog_system.trim() || null,
      catalog_number: form.catalog_number.trim() || null,
      instrumentation: form.instrumentation.trim() || null,
      description: form.description.trim() || null,
      imslp_url: form.imslp_url.trim() || null,
      youtube_url: form.youtube_url.trim() || null,
      spotify_url: form.spotify_url.trim() || null,
      apple_music_url: form.apple_music_url.trim() || null,
      is_popular: form.is_popular,
    };

    try {
      const { error } = await supabase
        .from("works")
        .update(payload)
        .eq("id", work.id);

      if (error) {
        setStatus({ type: "error", text: error.message });
        return;
      }

      setEditOpen(false);
      setStatus({ type: "success", text: "Saved changes to catalog." });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleEnrich}
          disabled={enriching}
          title={
            missingFields.length > 0
              ? `Missing: ${missingFields.join(", ")}`
              : "Check IMSLP, Wikipedia & MusicBrainz for additional metadata"
          }
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300/80 dark:border-amber-700/70 bg-amber-50/80 dark:bg-amber-950/40 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100/80 dark:hover:bg-amber-900/50 transition-colors cursor-pointer disabled:opacity-60"
        >
          {enriching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          <span>
            {enriching
              ? "Enriching..."
              : missingFields.length > 0
                ? `Enrich (${missingFields.length})`
                : "Re-check"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setEditOpen(true)}
          title="Edit work metadata manually (Admin)"
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#211e1a] text-xs font-semibold text-stone-700 dark:text-stone-200 hover:border-[#9a7432] dark:hover:border-[#d4af6a] transition-colors cursor-pointer"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>
      </div>

      {status && (
        <p
          className={`text-[11px] leading-snug px-2.5 py-1.5 rounded-lg border flex items-start gap-1.5 ${
            status.type === "success"
              ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-200"
              : status.type === "error"
                ? "bg-red-50/80 dark:bg-red-950/40 border-red-200 dark:border-red-800/70 text-red-700 dark:text-red-300"
                : "bg-stone-100 dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400"
          }`}
        >
          {status.type === "success" && (
            <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          )}
          <span>{status.text}</span>
        </p>
      )}

      {/* Manual Edit Modal */}
      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => !saving && setEditOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-800 shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 dark:border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#9a7432] dark:text-[#d4af6a]" />
                <h2 className="font-serif text-lg font-semibold text-stone-900 dark:text-[#f3efe6]">
                  Edit Work Metadata
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="sm:col-span-2 block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Work Title *
                  </span>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-sm text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Nickname
                  </span>
                  <input
                    type="text"
                    placeholder='e.g. "Eroica"'
                    value={form.nickname}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nickname: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-sm text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Genre
                  </span>
                  <select
                    value={form.genre}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, genre: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-sm text-stone-900 dark:text-stone-100"
                  >
                    {WORK_GENRES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Catalog System
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. Op., G., BWV, K."
                    value={form.catalog_system}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, catalog_system: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-sm font-mono text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Catalog Number
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. 479, 55, 1007"
                    value={form.catalog_number}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, catalog_number: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-sm font-mono text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Year Composed
                  </span>
                  <input
                    type="number"
                    placeholder="e.g. 1770"
                    value={form.year_composed}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, year_composed: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-sm font-mono text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Key Signature
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. D major"
                    value={form.key_signature}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, key_signature: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-sm text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Duration (minutes)
                  </span>
                  <input
                    type="number"
                    placeholder="e.g. 22"
                    value={form.duration_minutes}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        duration_minutes: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-sm font-mono text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Movements Count
                  </span>
                  <input
                    type="number"
                    placeholder="e.g. 3"
                    value={form.movements_count}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        movements_count: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-sm font-mono text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="sm:col-span-2 block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Instrumentation & Scoring
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. Solo Cello & Orchestra"
                    value={form.instrumentation}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        instrumentation: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-sm text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="sm:col-span-2 block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Program Note / Description
                  </span>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-sm text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="sm:col-span-2 block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    IMSLP Score URL
                  </span>
                  <input
                    type="url"
                    placeholder="https://imslp.org/wiki/..."
                    value={form.imslp_url}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, imslp_url: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-xs font-mono text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    YouTube URL
                  </span>
                  <input
                    type="url"
                    value={form.youtube_url}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, youtube_url: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-xs font-mono text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Spotify URL
                  </span>
                  <input
                    type="url"
                    value={form.spotify_url}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, spotify_url: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-[#faf8f4] dark:bg-[#141210] text-xs font-mono text-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="sm:col-span-2 flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_popular}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, is_popular: e.target.checked }))
                    }
                    className="rounded border-stone-300 dark:border-stone-600"
                  />
                  <span className="text-xs font-medium text-stone-700 dark:text-stone-300">
                    Mark as Essential Repertoire
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
