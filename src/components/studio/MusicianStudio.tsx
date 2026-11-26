"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  Bookmark,
  Calendar,
  Check,
  Clock,
  Download,
  FileMusic,
  Loader2,
  LogOut,
  Music,
  Plus,
  Printer,
  Search,
  Sparkles,
  Star,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  RecitalProgram,
  RecitalProgramItem,
  UserRepertoire,
  Work,
} from "@/types/database";

const FREE_REPERTOIRE_LIMIT = 20;
const FREE_PROGRAMS_LIMIT = 1;

const STATUS_META: Record<
  string,
  { label: string; badge: string }
> = {
  learning: {
    label: "Learning",
    badge:
      "bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800/70",
  },
  ready: {
    label: "Performance Ready",
    badge:
      "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/70",
  },
  performed: {
    label: "Performed",
    badge:
      "bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200 border-sky-200 dark:border-sky-800/70",
  },
  wishlist: {
    label: "Wish List",
    badge:
      "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700",
  },
};

type RepertoireEntry = UserRepertoire & {
  works:
    | (Pick<
        Work,
        | "id"
        | "slug"
        | "title"
        | "catalog_display"
        | "genre"
        | "key_signature"
        | "duration_minutes"
        | "imslp_url"
      > & { composers: { name: string; slug: string } | null })
    | null;
};

type ProgramItemWithWork = RecitalProgramItem & {
  works:
    | (Pick<
        Work,
        | "id"
        | "slug"
        | "title"
        | "catalog_display"
        | "genre"
        | "key_signature"
        | "duration_minutes"
        | "description"
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

type CatalogSearchHit = Pick<
  Work,
  "id" | "slug" | "title" | "catalog_display" | "genre" | "duration_minutes"
> & {
  composers: { name: string } | null;
};

export function MusicianStudio() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "magic">(
    "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<"repertoire" | "programs">(
    "repertoire"
  );
  const [toast, setToast] = useState<string | null>(null);

  // Repertoire state
  const [repertoire, setRepertoire] = useState<RepertoireEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [repSearch, setRepSearch] = useState("");
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  // Programs state
  const [programs, setPrograms] = useState<RecitalProgram[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(
    null
  );
  const [programItems, setProgramItems] = useState<ProgramItemWithWork[]>([]);
  const [showNewProgram, setShowNewProgram] = useState(false);
  const [newProgram, setNewProgram] = useState({
    title: "",
    venue: "",
    event_date: "",
    intermission_minutes: 15,
  });

  // Catalog picker modal
  const [pickerTarget, setPickerTarget] = useState<
    null | { mode: "repertoire" } | { mode: "program"; half: 1 | 2 }
  >(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<CatalogSearchHit[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const isUnlimited =
    user?.app_metadata?.role === "admin" ||
    user?.app_metadata?.plan === "pro";

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setUser(data.user ?? null);
        setAuthLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loadWorkspace = useCallback(async () => {
    const [repRes, progRes] = await Promise.all([
      supabase
        .from("user_repertoire")
        .select(
          "*, works(id, slug, title, catalog_display, genre, key_signature, duration_minutes, imslp_url, composers(name, slug))"
        )
        .order("updated_at", { ascending: false }),
      supabase
        .from("recital_programs")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    setRepertoire((repRes.data ?? []) as RepertoireEntry[]);
    const progs = progRes.data ?? [];
    setPrograms(progs);
    setSelectedProgramId((prev) =>
      prev && progs.some((p) => p.id === prev) ? prev : progs[0]?.id ?? null
    );
  }, []);

  const loadProgramItems = useCallback(async (programId: number) => {
    const { data } = await supabase
      .from("recital_program_items")
      .select(
        "*, works(id, slug, title, catalog_display, genre, key_signature, duration_minutes, description, composers(name, slug, birth_year, death_year))"
      )
      .eq("program_id", programId)
      .order("half", { ascending: true })
      .order("position", { ascending: true });
    setProgramItems((data ?? []) as ProgramItemWithWork[]);
  }, []);

  useEffect(() => {
    if (user) {
      loadWorkspace();
    }
  }, [user, loadWorkspace]);

  useEffect(() => {
    if (user && selectedProgramId) {
      loadProgramItems(selectedProgramId);
    } else {
      setProgramItems([]);
    }
  }, [user, selectedProgramId, loadProgramItems]);

  // Debounced catalog picker search
  useEffect(() => {
    if (!pickerTarget) return;
    const q = pickerQuery.trim();
    if (!q) {
      setPickerResults([]);
      return;
    }
    let cancelled = false;
    setPickerLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("works")
        .select("id, slug, title, catalog_display, genre, duration_minutes, composers(name)")
        .or(`title.ilike.%${q}%,catalog_display.ilike.%${q}%,nickname.ilike.%${q}%`)
        .order("is_popular", { ascending: false })
        .limit(20);
      if (!cancelled) {
        setPickerResults((data ?? []) as CatalogSearchHit[]);
        setPickerLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pickerTarget, pickerQuery]);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    setAuthBusy(true);
    const redirectTo = `${window.location.origin}/studio`;

    if (authMode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      setAuthBusy(false);
      if (error) setAuthError(error.message);
      else setAuthNotice(`Check ${email.trim()} for your one-click sign-in link.`);
      return;
    }

    if (authMode === "signup") {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectTo },
      });
      setAuthBusy(false);
      if (error) setAuthError(error.message);
      else setAuthNotice("Account created! Check your email to confirm (or sign in now).");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setAuthBusy(false);
    if (error) setAuthError(error.message);
  }

  async function handleAddWorkToRepertoire(work: CatalogSearchHit) {
    if (!user) return;
    if (!isUnlimited && repertoire.length >= FREE_REPERTOIRE_LIMIT) {
      showToast(
        `Free Starter limit (${FREE_REPERTOIRE_LIMIT} works) reached. Upgrade to Pro for unlimited repertoire.`
      );
      return;
    }
    const { error } = await supabase.from("user_repertoire").upsert(
      {
        user_id: user.id,
        work_id: work.id,
        status: "learning",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,work_id" }
    );
    if (!error) {
      setPickerTarget(null);
      setPickerQuery("");
      showToast(`Added "${work.title}" to Repertoire`);
      loadWorkspace();
    }
  }

  async function handleUpdateRepertoire(
    id: number,
    patch: Partial<Omit<UserRepertoire, "id">>
  ) {
    await supabase
      .from("user_repertoire")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    loadWorkspace();
  }

  async function handleDeleteRepertoire(id: number) {
    await supabase.from("user_repertoire").delete().eq("id", id);
    showToast("Removed from repertoire");
    loadWorkspace();
  }

  function handleExportCsv() {
    const headers = [
      "Composer",
      "Catalog",
      "Work",
      "Status",
      "Difficulty",
      "Last Practiced",
      "Duration (min)",
      "Notes",
    ];
    const escape = (v: unknown) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = repertoire.map((r) => [
      r.works?.composers?.name ?? "",
      r.works?.catalog_display ?? "",
      r.works?.title ?? "",
      r.status,
      r.difficulty ?? "",
      r.last_practiced_at ?? "",
      r.works?.duration_minutes ?? "",
      r.notes ?? "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "opus-archive-repertoire.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreateProgram(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newProgram.title.trim()) return;
    if (!isUnlimited && programs.length >= FREE_PROGRAMS_LIMIT) {
      showToast(
        `Free Starter includes ${FREE_PROGRAMS_LIMIT} recital program. Upgrade to Pro for unlimited programs.`
      );
      return;
    }
    const { data, error } = await supabase
      .from("recital_programs")
      .insert({
        user_id: user.id,
        title: newProgram.title.trim(),
        venue: newProgram.venue.trim() || null,
        event_date: newProgram.event_date || null,
        intermission_minutes: Number(newProgram.intermission_minutes) || 15,
      })
      .select()
      .single();
    if (!error && data) {
      setShowNewProgram(false);
      setNewProgram({
        title: "",
        venue: "",
        event_date: "",
        intermission_minutes: 15,
      });
      setSelectedProgramId(data.id);
      showToast(`Created program "${data.title}"`);
      loadWorkspace();
    }
  }

  async function handleDeleteProgram(id: number) {
    if (!window.confirm("Delete this recital program?")) return;
    await supabase.from("recital_programs").delete().eq("id", id);
    showToast("Program deleted");
    loadWorkspace();
  }

  async function handleAddWorkToProgram(work: CatalogSearchHit, half: 1 | 2) {
    if (!user || !selectedProgramId) return;
    const halfItems = programItems.filter((i) => i.half === half);
    const { error } = await supabase.from("recital_program_items").insert({
      program_id: selectedProgramId,
      user_id: user.id,
      work_id: work.id,
      half,
      position: halfItems.length + 1,
      custom_duration_minutes: work.duration_minutes ?? null,
    });
    if (!error) {
      setPickerTarget(null);
      setPickerQuery("");
      showToast(`Added "${work.title}" to Half ${half === 1 ? "I" : "II"}`);
      loadProgramItems(selectedProgramId);
    }
  }

  async function handleMoveItem(item: ProgramItemWithWork, dir: -1 | 1) {
    const halfList = programItems
      .filter((i) => i.half === item.half)
      .sort((a, b) => a.position - b.position);
    const idx = halfList.findIndex((i) => i.id === item.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= halfList.length) return;
    const other = halfList[swapIdx];

    await Promise.all([
      supabase
        .from("recital_program_items")
        .update({ position: other.position })
        .eq("id", item.id),
      supabase
        .from("recital_program_items")
        .update({ position: item.position })
        .eq("id", other.id),
    ]);
    if (selectedProgramId) loadProgramItems(selectedProgramId);
  }

  async function handleSwapHalf(item: ProgramItemWithWork) {
    const nextHalf = item.half === 1 ? 2 : 1;
    const nextCount = programItems.filter((i) => i.half === nextHalf).length;
    await supabase
      .from("recital_program_items")
      .update({ half: nextHalf, position: nextCount + 1 })
      .eq("id", item.id);
    if (selectedProgramId) loadProgramItems(selectedProgramId);
  }

  async function handleRemoveProgramItem(id: number) {
    await supabase.from("recital_program_items").delete().eq("id", id);
    if (selectedProgramId) loadProgramItems(selectedProgramId);
  }

  const filteredRepertoire = useMemo(() => {
    const q = repSearch.trim().toLowerCase();
    return repertoire.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q) {
        const hay = [
          r.works?.title,
          r.works?.catalog_display,
          r.works?.composers?.name,
          r.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [repertoire, statusFilter, repSearch]);

  const activeProgram = programs.find((p) => p.id === selectedProgramId) ?? null;
  const half1 = programItems.filter((i) => i.half === 1);
  const half2 = programItems.filter((i) => i.half === 2);
  const half1Mins = half1.reduce(
    (sum, i) => sum + (i.custom_duration_minutes ?? i.works?.duration_minutes ?? 0),
    0
  );
  const half2Mins = half2.reduce(
    (sum, i) => sum + (i.custom_duration_minutes ?? i.works?.duration_minutes ?? 0),
    0
  );
  const intermissionMins =
    half2.length > 0 ? activeProgram?.intermission_minutes ?? 15 : 0;
  const totalConcertMins = half1Mins + half2Mins + intermissionMins;

  if (authLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center text-stone-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
        Loading My Studio...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-14 sm:py-20">
        <div className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200 dark:border-stone-800 p-8 shadow-sm space-y-6">
          <div className="space-y-2 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#1a1816] dark:bg-[#d4af6a] text-[#e8d5b0] dark:text-[#11100e] flex items-center justify-center mx-auto">
              <Bookmark className="w-6 h-6" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
              Opus Archive Studio
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Sign in to track your repertoire, log practice dates, and build
              timed recital programs with PDF export. Free Starter includes 20
              tracked works &amp; 1 recital program.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#f3efe8] dark:bg-[#141210] border border-stone-200 dark:border-stone-800">
            {(
              [
                ["signin", "Sign In"],
                ["signup", "Sign Up"],
                ["magic", "Email Link"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setAuthMode(m);
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                className={`py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  authMode === m
                    ? "bg-white dark:bg-[#23201c] text-stone-900 dark:text-stone-100 shadow-xs"
                    : "text-stone-500 dark:text-stone-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-stone-700 dark:text-stone-300 block">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="musician@example.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              />
            </div>

            {authMode !== "magic" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-700 dark:text-stone-300 block">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
            )}

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/70 text-xs text-red-800 dark:text-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {authError}
              </div>
            )}

            {authNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                {authNotice}
              </div>
            )}

            <button
              type="submit"
              disabled={authBusy}
              className="w-full py-2.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-sm font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {authBusy
                ? "Please wait..."
                : authMode === "signup"
                  ? "Create Free Account"
                  : authMode === "magic"
                    ? "Send Login Link"
                    : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      {/* Header (hidden when printing recital program) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7432] dark:text-[#d4af6a]">
            Musician Workspace
          </span>
          <h1 className="font-serif text-3xl font-bold text-[#1a1816] dark:text-[#f3efe6]">
            My Studio
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Signed in as <strong>{user.email}</strong> ·{" "}
            {isUnlimited ? (
              <span className="text-[#9a7432] dark:text-[#d4af6a] font-semibold">
                Unlimited Pro Access
              </span>
            ) : (
              <span>
                Free Starter ({repertoire.length}/{FREE_REPERTOIRE_LIMIT} works ·{" "}
                {programs.length}/{FREE_PROGRAMS_LIMIT} program)
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer self-start"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>

      {toast && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2 print:hidden">
          <Check className="w-4 h-4 shrink-0" />
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 dark:border-stone-800 pb-3 print:hidden">
        <button
          type="button"
          onClick={() => setActiveTab("repertoire")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
            activeTab === "repertoire"
              ? "bg-[#1a1816] dark:bg-[#f3efe6] text-white dark:text-[#11100e]"
              : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
          }`}
        >
          <Bookmark className="w-4 h-4" />
          Repertoire &amp; Practice ({repertoire.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("programs")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
            activeTab === "programs"
              ? "bg-[#1a1816] dark:bg-[#f3efe6] text-white dark:text-[#11100e]"
              : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Recital Program Builder ({programs.length})
        </button>
      </div>

      {/* TAB 1: REPERTOIRE TRACKER */}
      {activeTab === "repertoire" && (
        <div className="space-y-5">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["learning", "ready", "performed", "wishlist"] as const).map(
              (st) => {
                const count = repertoire.filter((r) => r.status === st).length;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() =>
                      setStatusFilter(statusFilter === st ? "all" : st)
                    }
                    className={`text-left p-4 rounded-2xl border transition-colors cursor-pointer ${
                      statusFilter === st
                        ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700"
                        : "bg-white dark:bg-[#191714] border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600"
                    }`}
                  >
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
                      {STATUS_META[st].label}
                    </span>
                    <p className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6] mt-1">
                      {count}
                    </p>
                  </button>
                );
              }
            )}
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={repSearch}
                onChange={(e) => setRepSearch(e.target.value)}
                placeholder="Filter your repertoire..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100"
              />
            </div>

            <div className="flex items-center gap-2">
              {repertoire.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#191714] text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-stone-400 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              )}
              <button
                type="button"
                onClick={() => setPickerTarget({ mode: "repertoire" })}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Work
              </button>
            </div>
          </div>

          {/* List */}
          {filteredRepertoire.length === 0 ? (
            <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-10 text-center space-y-3">
              <Music className="w-8 h-8 text-stone-400 mx-auto" />
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {repertoire.length === 0
                  ? "Your repertoire library is empty. Add your first piece from the 20,599-work catalog!"
                  : "No pieces match your current filter."}
              </p>
              {repertoire.length === 0 && (
                <button
                  type="button"
                  onClick={() => setPickerTarget({ mode: "repertoire" })}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add First Work
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-stone-200/70 dark:divide-stone-800/80 bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
              {filteredRepertoire.map((entry) => {
                const w = entry.works;
                const today = new Date().toISOString().slice(0, 10);
                return (
                  <div
                    key={entry.id}
                    className="p-4 sm:p-5 space-y-3 hover:bg-[#faf8f4]/50 dark:hover:bg-[#221f1b]/50 transition-colors"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {w?.catalog_display && (
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                              {w.catalog_display}
                            </span>
                          )}
                          <Link
                            href={`/works/${w?.slug || entry.work_id}`}
                            className="font-serif text-base font-semibold text-stone-900 dark:text-[#f3efe6] hover:text-[#9a7432] dark:hover:text-[#d4af6a]"
                          >
                            {w?.title ?? `Work #${entry.work_id}`}
                          </Link>
                        </div>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {w?.composers?.name}
                          {w?.duration_minutes ? ` · ~${w.duration_minutes} min` : ""}
                          {entry.last_practiced_at
                            ? ` · Last practiced ${entry.last_practiced_at}`
                            : ""}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* Status Select */}
                        <select
                          value={entry.status}
                          onChange={(e) =>
                            handleUpdateRepertoire(entry.id, {
                              status: e.target.value,
                            })
                          }
                          aria-label="Piece status"
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer ${
                            STATUS_META[entry.status]?.badge ?? ""
                          }`}
                        >
                          {Object.entries(STATUS_META).map(([k, v]) => (
                            <option
                              key={k}
                              value={k}
                              className="bg-white dark:bg-[#191714] text-stone-900 dark:text-stone-100"
                            >
                              {v.label}
                            </option>
                          ))}
                        </select>

                        {/* Difficulty 1-5 */}
                        <div className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              title={`Difficulty ${n}/5`}
                              onClick={() =>
                                handleUpdateRepertoire(entry.id, {
                                  difficulty: entry.difficulty === n ? null : n,
                                })
                              }
                              className="cursor-pointer"
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${
                                  (entry.difficulty ?? 0) >= n
                                    ? "text-amber-500 fill-amber-500"
                                    : "text-stone-300 dark:text-stone-700"
                                }`}
                              />
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRepertoire(entry.id, {
                              last_practiced_at: today,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#d4af6a] cursor-pointer"
                        >
                          <Calendar className="w-3 h-3" />
                          Practiced Today
                        </button>

                        {w?.imslp_url && (
                          <a
                            href={w.imslp_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 text-xs font-medium text-[#8a6526] dark:text-[#e3c27d]"
                          >
                            <FileMusic className="w-3 h-3" />
                            Score
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteRepertoire(entry.id)}
                          title="Remove"
                          className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Private Notes */}
                    {editingNotesId === entry.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={notesDraft}
                          onChange={(e) => setNotesDraft(e.target.value)}
                          placeholder="Bowings, fingerings, tempo target, edition notes..."
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await handleUpdateRepertoire(entry.id, {
                              notes: notesDraft.trim() || null,
                            });
                            setEditingNotesId(null);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNotesId(entry.id);
                          setNotesDraft(entry.notes ?? "");
                        }}
                        className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer text-left"
                      >
                        {entry.notes ? (
                          <span>📝 {entry.notes}</span>
                        ) : (
                          <span className="italic opacity-70">
                            + Add private practice / fingering notes...
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RECITAL PROGRAM BUILDER */}
      {activeTab === "programs" && (
        <div className="space-y-6">
          {/* Program Selector Bar (hidden on print) */}
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              {programs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProgramId(p.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    selectedProgramId === p.id
                      ? "bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] border-transparent"
                      : "bg-white dark:bg-[#191714] border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-200"
                  }`}
                >
                  {p.title}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowNewProgram((v) => !v)}
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:border-[#d4af6a] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Program
              </button>
            </div>

            {activeProgram && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteProgram(activeProgram.id)}
                  className="p-2 rounded-xl border border-stone-200 dark:border-stone-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer"
                  title="Delete Program"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* New Program Form */}
          {showNewProgram && (
            <form
              onSubmit={handleCreateProgram}
              className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-5 space-y-4 print:hidden"
            >
              <h2 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6]">
                Create Recital Program
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <input
                  required
                  placeholder="Program Title (e.g. Spring Cello Recital)"
                  value={newProgram.title}
                  onChange={(e) =>
                    setNewProgram({ ...newProgram, title: e.target.value })
                  }
                  className="px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                />
                <input
                  placeholder="Venue (optional)"
                  value={newProgram.venue}
                  onChange={(e) =>
                    setNewProgram({ ...newProgram, venue: e.target.value })
                  }
                  className="px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                />
                <input
                  type="date"
                  value={newProgram.event_date}
                  onChange={(e) =>
                    setNewProgram({ ...newProgram, event_date: e.target.value })
                  }
                  className="px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                />
                <input
                  type="number"
                  min={0}
                  max={45}
                  value={newProgram.intermission_minutes}
                  onChange={(e) =>
                    setNewProgram({
                      ...newProgram,
                      intermission_minutes: Number(e.target.value),
                    })
                  }
                  placeholder="Intermission (min)"
                  className="px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewProgram(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
                >
                  Create Program
                </button>
              </div>
            </form>
          )}

          {/* Active Program Sheet (styled beautifully for both screen & PDF print) */}
          {!activeProgram ? (
            <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-10 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-stone-400 mx-auto" />
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Build a concert program with Half I, Intermission, Half II, and
                auto-calculated stage timing.
              </p>
              <button
                type="button"
                onClick={() => setShowNewProgram(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Create First Recital Program
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200 dark:border-stone-800 p-6 sm:p-10 space-y-8 print:border-0 print:p-0 print:shadow-none">
              {/* Program Header */}
              <div className="text-center space-y-2 border-b border-stone-200 dark:border-stone-800 pb-6">
                <span className="text-[10px] uppercase tracking-[0.22em] text-[#9a7432] dark:text-[#d4af6a] font-semibold">
                  Concert Program
                </span>
                <h2 className="font-serif text-3xl font-bold text-stone-900 dark:text-[#f3efe6]">
                  {activeProgram.title}
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {[activeProgram.venue, activeProgram.event_date]
                    .filter(Boolean)
                    .join(" · ") || "Opus Archive Recital Sheet"}
                </p>

                {/* Auto Timing Summary */}
                <div className="pt-3 flex flex-wrap items-center justify-center gap-3 text-xs font-mono">
                  <span className="px-3 py-1 rounded-full bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800">
                    Half I: <strong>{half1Mins}m</strong>
                  </span>
                  {intermissionMins > 0 && (
                    <span className="px-3 py-1 rounded-full bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800">
                      Intermission: <strong>{intermissionMins}m</strong>
                    </span>
                  )}
                  {half2.length > 0 && (
                    <span className="px-3 py-1 rounded-full bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800">
                      Half II: <strong>{half2Mins}m</strong>
                    </span>
                  )}
                  <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[#8a6526] dark:text-[#e3c27d]">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Total: <strong>{totalConcertMins} min</strong>
                  </span>
                </div>
              </div>

              {/* Half I & Half II */}
              {([1, 2] as const).map((halfNum) => {
                const list = halfNum === 1 ? half1 : half2;
                const mins = halfNum === 1 ? half1Mins : half2Mins;
                return (
                  <div key={halfNum} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6]">
                        {halfNum === 1 ? "First Half" : "Second Half"}{" "}
                        <span className="text-xs font-mono font-normal text-stone-400">
                          (~{mins} min)
                        </span>
                      </h3>
                      <button
                        type="button"
                        onClick={() =>
                          setPickerTarget({ mode: "program", half: halfNum })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#d4af6a] cursor-pointer print:hidden"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Work
                      </button>
                    </div>

                    {list.length === 0 ? (
                      <p className="text-xs italic text-stone-400 py-3 print:hidden">
                        No works in {halfNum === 1 ? "First" : "Second"} Half yet.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {list.map((item, idx) => {
                          const w = item.works;
                          const c = w?.composers;
                          const dur =
                            item.custom_duration_minutes ??
                            w?.duration_minutes ??
                            0;
                          return (
                            <div
                              key={item.id}
                              className="p-4 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/80 dark:border-stone-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-0.5 min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-wider text-[#9a7432] dark:text-[#d4af6a]">
                                  {c?.name}
                                  {c
                                    ? ` (${c.birth_year}–${c.death_year ?? ""})`
                                    : ""}
                                </p>
                                <Link
                                  href={`/works/${w?.slug || item.work_id}`}
                                  className="font-serif text-base font-semibold text-stone-900 dark:text-[#f3efe6] hover:underline block"
                                >
                                  {w?.title}
                                  {w?.catalog_display
                                    ? `, ${w.catalog_display}`
                                    : ""}
                                </Link>
                                {w?.description && (
                                  <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2 pt-0.5">
                                    {w.description}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-mono text-xs text-stone-500 dark:text-stone-400 mr-1">
                                  {dur ? `~${dur} min` : "—"}
                                </span>
                                <div className="flex items-center gap-1 print:hidden">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => handleMoveItem(item, -1)}
                                    className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 disabled:opacity-30 cursor-pointer"
                                    title="Move up"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === list.length - 1}
                                    onClick={() => handleMoveItem(item, 1)}
                                    className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 disabled:opacity-30 cursor-pointer"
                                    title="Move down"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSwapHalf(item)}
                                    className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 cursor-pointer"
                                    title="Move to other half"
                                  >
                                    <ArrowLeftRight className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveProgramItem(item.id)
                                    }
                                    className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60 cursor-pointer"
                                    title="Remove"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {halfNum === 1 && half2.length > 0 && (
                      <div className="py-3 text-center text-xs uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 border-y border-dashed border-stone-200 dark:border-stone-800">
                        — Intermission ({activeProgram.intermission_minutes}{" "}
                        minutes) —
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Catalog Search Picker Modal */}
      {pickerTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="w-full max-w-lg bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
              <h3 className="font-serif font-bold text-base text-stone-900 dark:text-[#f3efe6]">
                {pickerTarget.mode === "repertoire"
                  ? "Add Work to Repertoire"
                  : `Add Work to Half ${pickerTarget.half === 1 ? "I" : "II"}`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setPickerTarget(null);
                  setPickerQuery("");
                }}
                className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  type="text"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Search 20,599 works (e.g. Cello Suite, Op. 67, BWV 1007)..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
                {pickerLoading ? (
                  <p className="py-6 text-center text-xs text-stone-500">
                    Searching...
                  </p>
                ) : pickerResults.length === 0 ? (
                  <p className="py-6 text-center text-xs text-stone-500">
                    {pickerQuery.trim()
                      ? "No matching works found."
                      : "Type a title, opus, or BWV/K. number to search."}
                  </p>
                ) : (
                  pickerResults.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() =>
                        pickerTarget.mode === "repertoire"
                          ? handleAddWorkToRepertoire(w)
                          : handleAddWorkToProgram(w, pickerTarget.half)
                      }
                      className="w-full text-left py-2.5 px-2 hover:bg-[#faf8f4] dark:hover:bg-[#221f1b] flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                          {w.catalog_display ? `${w.catalog_display} · ` : ""}
                          {w.title}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {w.composers?.name} · {w.genre}
                          {w.duration_minutes ? ` · ~${w.duration_minutes}m` : ""}
                        </p>
                      </div>
                      <Plus className="w-4 h-4 text-[#9a7432] dark:text-[#d4af6a] shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
