"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  Shield,
  LogOut,
  Users,
  Music,
  Network,
  Settings,
  BarChart3,
  Plus,
  Pencil,
  Trash2,
  Search,
  Check,
  X,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  Composer,
  ComposerRelation,
  SiteSettings,
  Work,
} from "@/types/database";
import { ERA_ORDER, RELATION_META, formatLifespan } from "@/lib/constants";
import { ComposerAvatar } from "@/components/ComposerAvatar";

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

type TabId = "overview" | "composers" | "works" | "relations" | "settings";

function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AdminPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<
    "password" | "magic_link" | "forgot_password" | "set_new_password"
  >("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Overview stats
  const [stats, setStats] = useState({
    composers: 0,
    works: 0,
    relations: 0,
    missingAvatars: 0,
    missingYears: 0,
    missingDescriptions: 0,
    missingDurations: 0,
  });

  // Composers tab
  const [composers, setComposers] = useState<Composer[]>([]);
  const [composerSearch, setComposerSearch] = useState("");
  const [editingComposer, setEditingComposer] = useState<Partial<Composer> | null>(
    null
  );
  const [savingComposer, setSavingComposer] = useState(false);

  // Works tab
  const [works, setWorks] = useState<
    (Work & { composers?: { name: string; slug: string } | null })[]
  >([]);
  const [workSearch, setWorkSearch] = useState("");
  const [workComposerFilter, setWorkComposerFilter] = useState<string>("");
  const [worksLoading, setWorksLoading] = useState(false);
  const [editingWork, setEditingWork] = useState<Partial<Work> | null>(null);
  const [savingWork, setSavingWork] = useState(false);

  // Relations tab
  const [relations, setRelations] = useState<ComposerRelation[]>([]);
  const [newRel, setNewRel] = useState({
    source_composer_id: "",
    target_composer_id: "",
    relation_type: "influenced",
    strength: 4,
    description: "",
  });

  // Site settings tab
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const isAdmin = user?.app_metadata?.role === "admin";

  const showToast = useCallback((type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setUser(data.user ?? null);
        setAuthLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((ev, session) => {
      setUser(session?.user ?? null);
      if (ev === "PASSWORD_RECOVERY") {
        setAuthMode("set_new_password");
        setAuthNotice("Enter a new password for your admin account.");
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadCoreData = useCallback(async () => {
    const [
      compListRes,
      relListRes,
      settingsRes,
      worksCountRes,
      missingAvatarsRes,
      missingYearsRes,
      missingDescRes,
      missingDurRes,
    ] = await Promise.all([
      supabase.from("composers").select("*").order("sort_name", { ascending: true }),
      supabase.from("composer_relations").select("*").order("id", { ascending: false }),
      supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("works").select("*", { count: "exact", head: true }),
      supabase
        .from("composers")
        .select("*", { count: "exact", head: true })
        .is("avatar_url", null),
      supabase
        .from("works")
        .select("*", { count: "exact", head: true })
        .is("year_composed", null),
      supabase
        .from("works")
        .select("*", { count: "exact", head: true })
        .is("description", null),
      supabase
        .from("works")
        .select("*", { count: "exact", head: true })
        .is("duration_minutes", null),
    ]);

    const compList = compListRes.data ?? [];
    const relList = relListRes.data ?? [];
    setComposers(compList);
    setRelations(relList);
    if (settingsRes.data) setSettings(settingsRes.data);

    setStats({
      composers: compList.length,
      works: worksCountRes.count ?? 0,
      relations: relList.length,
      missingAvatars: missingAvatarsRes.count ?? 0,
      missingYears: missingYearsRes.count ?? 0,
      missingDescriptions: missingDescRes.count ?? 0,
      missingDurations: missingDurRes.count ?? 0,
    });
  }, []);

  const loadWorks = useCallback(async () => {
    setWorksLoading(true);
    let query = supabase
      .from("works")
      .select("*, composers(name, slug)")
      .order("id", { ascending: false })
      .limit(80);

    if (workComposerFilter) {
      query = query.eq("composer_id", Number(workComposerFilter));
    }
    if (workSearch.trim()) {
      const q = workSearch.trim();
      query = query.or(
        `title.ilike.%${q}%,nickname.ilike.%${q}%,catalog_display.ilike.%${q}%`
      );
    }

    const { data } = await query;
    setWorks(
      (data ?? []) as (Work & { composers?: { name: string; slug: string } | null })[]
    );
    setWorksLoading(false);
  }, [workComposerFilter, workSearch]);

  useEffect(() => {
    if (isAdmin) {
      loadCoreData();
    }
  }, [isAdmin, loadCoreData]);

  useEffect(() => {
    if (isAdmin && activeTab === "works") {
      const t = setTimeout(() => loadWorks(), 200);
      return () => clearTimeout(t);
    }
  }, [isAdmin, activeTab, loadWorks]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    setSigningIn(true);

    const redirectTo = `${window.location.origin}/admin`;

    if (authMode === "magic_link") {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      setSigningIn(false);
      if (error) {
        setAuthError(error.message);
      } else {
        setAuthNotice(
          `Login link sent to ${email.trim()}. Check your inbox and click the link to sign in.`
        );
      }
      return;
    }

    if (authMode === "forgot_password") {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo }
      );
      setSigningIn(false);
      if (error) {
        setAuthError(error.message);
      } else {
        setAuthNotice(
          `Password reset link sent to ${email.trim()}. Open the link from your email to set a new password.`
        );
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSigningIn(false);
    if (error) {
      setAuthError(error.message);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    if (newPassword.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }
    setSigningIn(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSigningIn(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setNewPassword("");
    setAuthMode("password");
    showToast("success", "Password updated!");
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  // Composer CRUD
  async function handleSaveComposer(e: React.FormEvent) {
    e.preventDefault();
    if (!editingComposer?.name || !editingComposer?.birth_year) return;
    setSavingComposer(true);

    const payload = {
      name: editingComposer.name.trim(),
      full_name: (editingComposer.full_name || editingComposer.name).trim(),
      sort_name: (editingComposer.sort_name || editingComposer.name).trim(),
      slug: (editingComposer.slug || slugify(editingComposer.name)).trim(),
      era: editingComposer.era || "Classical",
      nationality: (editingComposer.nationality || "European").trim(),
      birth_year: Number(editingComposer.birth_year),
      death_year: editingComposer.death_year
        ? Number(editingComposer.death_year)
        : null,
      birth_place: editingComposer.birth_place?.trim() || null,
      avatar_url: editingComposer.avatar_url?.trim() || null,
      short_bio: (editingComposer.short_bio || "").trim(),
      notable_for: editingComposer.notable_for?.trim() || null,
      rank_order: editingComposer.rank_order
        ? Number(editingComposer.rank_order)
        : null,
    };

    const res = editingComposer.id
      ? await supabase
          .from("composers")
          .update(payload)
          .eq("id", editingComposer.id)
      : await supabase.from("composers").insert(payload);

    setSavingComposer(false);
    if (res.error) {
      showToast("error", res.error.message);
      return;
    }

    showToast(
      "success",
      editingComposer.id ? "Composer updated." : "Composer added."
    );
    setEditingComposer(null);
    loadCoreData();
  }

  async function handleDeleteComposer(c: Composer) {
    if (
      !window.confirm(
        `Delete ${c.name}? This will also delete all of their cataloged works and lineage connections.`
      )
    ) {
      return;
    }
    const { error } = await supabase.from("composers").delete().eq("id", c.id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", `Deleted ${c.name}.`);
    loadCoreData();
  }

  // Work CRUD
  async function handleSaveWork(e: React.FormEvent) {
    e.preventDefault();
    if (!editingWork?.title || !editingWork?.composer_id) return;
    setSavingWork(true);

    const payload = {
      composer_id: Number(editingWork.composer_id),
      title: editingWork.title.trim(),
      nickname: editingWork.nickname?.trim() || null,
      catalog_system: editingWork.catalog_system?.trim() || null,
      catalog_number: editingWork.catalog_number?.trim() || null,
      genre: editingWork.genre || "Chamber",
      key_signature: editingWork.key_signature?.trim() || null,
      year_composed: editingWork.year_composed
        ? Number(editingWork.year_composed)
        : null,
      instrumentation: editingWork.instrumentation?.trim() || null,
      movements_count: editingWork.movements_count
        ? Number(editingWork.movements_count)
        : null,
      duration_minutes: editingWork.duration_minutes
        ? Number(editingWork.duration_minutes)
        : null,
      is_popular: Boolean(editingWork.is_popular),
      description: editingWork.description?.trim() || null,
    };

    const res = editingWork.id
      ? await supabase.from("works").update(payload).eq("id", editingWork.id)
      : await supabase.from("works").insert(payload);

    setSavingWork(false);
    if (res.error) {
      showToast("error", res.error.message);
      return;
    }

    showToast("success", editingWork.id ? "Work updated." : "Work added.");
    setEditingWork(null);
    loadWorks();
    loadCoreData();
  }

  async function handleDeleteWork(w: Work) {
    if (!window.confirm(`Delete "${w.title}"?`)) return;
    const { error } = await supabase.from("works").delete().eq("id", w.id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", "Work deleted.");
    loadWorks();
    loadCoreData();
  }

  // Relation CRUD
  async function handleAddRelation(e: React.FormEvent) {
    e.preventDefault();
    if (!newRel.source_composer_id || !newRel.target_composer_id) return;
    const { error } = await supabase.from("composer_relations").insert({
      source_composer_id: Number(newRel.source_composer_id),
      target_composer_id: Number(newRel.target_composer_id),
      relation_type: newRel.relation_type,
      strength: Number(newRel.strength),
      description: newRel.description.trim() || null,
    });
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", "Lineage connection added.");
    setNewRel({
      source_composer_id: "",
      target_composer_id: "",
      relation_type: "influenced",
      strength: 4,
      description: "",
    });
    loadCoreData();
  }

  async function handleDeleteRelation(id: number) {
    if (!window.confirm("Remove this lineage connection?")) return;
    const { error } = await supabase
      .from("composer_relations")
      .delete()
      .eq("id", id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", "Connection removed.");
    loadCoreData();
  }

  // Site settings update
  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("site_settings")
      .update({
        site_name: settings.site_name.trim(),
        site_tagline: settings.site_tagline.trim(),
        hero_badge: settings.hero_badge.trim(),
        hero_title: settings.hero_title.trim(),
        hero_subtitle: settings.hero_subtitle.trim(),
        footer_note: settings.footer_note.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    setSavingSettings(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", "Site settings saved — live immediately!");
  }

  if (authLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center text-stone-500 dark:text-stone-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
        Checking session...
      </div>
    );
  }

  if (authMode === "set_new_password" && user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 sm:py-24">
        <div className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200 dark:border-stone-800 p-8 shadow-sm space-y-6">
          <div className="space-y-2 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#1a1816] dark:bg-[#d4af6a] text-[#e8d5b0] dark:text-[#11100e] flex items-center justify-center mx-auto">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
              Set New Password
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Choose a new password for <strong>{user.email}</strong>.
            </p>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-stone-700 dark:text-stone-300 block">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#9a7432] dark:focus:border-[#d4af6a]"
              />
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/70 text-xs text-red-800 dark:text-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={signingIn}
              className="w-full py-2.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {signingIn ? "Updating..." : "Save New Password"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 sm:py-24">
        <div className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200 dark:border-stone-800 p-8 shadow-sm space-y-6">
          <div className="space-y-2 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#1a1816] dark:bg-[#d4af6a] text-[#e8d5b0] dark:text-[#11100e] flex items-center justify-center mx-auto">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
              Opus Archive Admin
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {authMode === "password" &&
                "Sign in with your Opus Archive admin account."}
              {authMode === "magic_link" &&
                "Enter your email to receive a one-click sign-in link."}
              {authMode === "forgot_password" &&
                "Enter your email to receive a password reset link."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#f3efe8] dark:bg-[#141210] border border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={() => {
                setAuthMode("password");
                setAuthError(null);
                setAuthNotice(null);
              }}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                authMode === "password" || authMode === "forgot_password"
                  ? "bg-white dark:bg-[#23201c] text-stone-900 dark:text-stone-100 shadow-xs"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("magic_link");
                setAuthError(null);
                setAuthNotice(null);
              }}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                authMode === "magic_link"
                  ? "bg-white dark:bg-[#23201c] text-stone-900 dark:text-stone-100 shadow-xs"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
              }`}
            >
              Email Login Link
            </button>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-stone-700 dark:text-stone-300 block">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#9a7432] dark:focus:border-[#d4af6a]"
              />
            </div>

            {authMode === "password" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-stone-700 dark:text-stone-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("forgot_password");
                      setAuthError(null);
                      setAuthNotice(null);
                    }}
                    className="text-xs text-[#9a7432] dark:text-[#d4af6a] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#9a7432] dark:focus:border-[#d4af6a]"
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
              disabled={signingIn}
              className="w-full py-2.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {signingIn
                ? "Please wait..."
                : authMode === "magic_link"
                  ? "Send Login Link"
                  : authMode === "forgot_password"
                    ? "Send Password Reset Link"
                    : "Sign In"}
            </button>

            {authMode === "forgot_password" && (
              <button
                type="button"
                onClick={() => {
                  setAuthMode("password");
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                className="w-full text-xs text-stone-500 dark:text-stone-400 hover:underline cursor-pointer"
              >
                Back to password sign-in
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-8 space-y-3">
          <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
          <h1 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6]">
            Admin Role Required
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Signed in as <strong>{user.email}</strong>, but this account does
            not have <code className="font-mono">app_metadata.role = &quot;admin&quot;</code>.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const filteredComposers = composers.filter((c) => {
    const q = composerSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.nationality.toLowerCase().includes(q) ||
      c.era.toLowerCase().includes(q)
    );
  });

  const composerById = new Map(composers.map((c) => [c.id, c]));

  const TABS: { id: TabId; label: string; icon: typeof Users }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "composers", label: `Composers (${composers.length})`, icon: Users },
    { id: "works", label: `Works (${stats.works})`, icon: Music },
    { id: "relations", label: `Connections (${relations.length})`, icon: Network },
    { id: "settings", label: "Site Tweaks", icon: Settings },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7432] dark:text-[#d4af6a]">
            Administration
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900 dark:text-[#f3efe6]">
            Opus Archive Control Panel
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {user.email}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#191714] text-xs font-medium text-stone-700 dark:text-stone-300 hover:border-stone-400 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 ${
            toast.type === "success"
              ? "bg-emerald-950 text-emerald-100 border-emerald-800"
              : "bg-red-950 text-red-100 border-red-800"
          }`}
        >
          {toast.type === "success" ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {toast.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              activeTab === id
                ? "bg-[#1a1816] dark:bg-[#f3efe6] text-white dark:text-[#11100e]"
                : "bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:border-stone-400"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Composers", value: stats.composers },
              { label: "Total Works", value: stats.works.toLocaleString() },
              { label: "Lineage Connections", value: stats.relations },
              { label: "Composers Missing Avatar", value: stats.missingAvatars },
            ].map((card) => (
              <div
                key={card.label}
                className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-5"
              >
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  {card.label}
                </span>
                <p className="font-serif text-3xl font-bold text-stone-900 dark:text-[#f3efe6] mt-1">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-3">
              <h2 className="font-serif text-lg font-semibold text-stone-900 dark:text-[#f3efe6]">
                Work Metadata Health
              </h2>
              <div className="space-y-2 text-xs text-stone-600 dark:text-stone-400">
                <div className="flex justify-between py-1.5 border-b border-stone-100 dark:border-stone-800">
                  <span>Missing composition year</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100">
                    {stats.missingYears.toLocaleString()}
                  </strong>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-100 dark:border-stone-800">
                  <span>Missing program description</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100">
                    {stats.missingDescriptions.toLocaleString()}
                  </strong>
                </div>
                <div className="flex justify-between py-1.5">
                  <span>Missing duration</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100">
                    {stats.missingDurations.toLocaleString()}
                  </strong>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-3">
              <h2 className="font-serif text-lg font-semibold text-stone-900 dark:text-[#f3efe6]">
                Quick Shortcuts
              </h2>
              <div className="flex flex-wrap gap-2">
                <a
                  href="https://github.com/liubenko/opus-archive/actions"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200 hover:border-[#d4af6a]"
                >
                  GitHub Actions Sync
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <Link
                  href="/api/v1"
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200 hover:border-[#d4af6a]"
                >
                  Public REST API v1
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COMPOSERS */}
      {activeTab === "composers" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={composerSearch}
                onChange={(e) => setComposerSearch(e.target.value)}
                placeholder="Search composers by name, era, nationality..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#d4af6a]"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setEditingComposer({
                  name: "",
                  full_name: "",
                  sort_name: "",
                  slug: "",
                  era: "Romantic",
                  nationality: "",
                  birth_year: 1850,
                  death_year: null,
                  birth_place: "",
                  avatar_url: "",
                  short_bio: "",
                  notable_for: "",
                  rank_order: null,
                })
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Composer
            </button>
          </div>

          {/* Composer Editor Modal */}
          {editingComposer && (
            <form
              onSubmit={handleSaveComposer}
              className="bg-white dark:bg-[#191714] rounded-2xl border border-[#9a7432]/60 dark:border-[#d4af6a]/60 p-6 space-y-4 shadow-md"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6]">
                  {editingComposer.id ? "Edit Composer" : "New Composer"}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingComposer(null)}
                  className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-stone-500">Display Name *</span>
                  <input
                    required
                    value={editingComposer.name || ""}
                    onChange={(e) =>
                      setEditingComposer({
                        ...editingComposer,
                        name: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-500">Sort Name (Last, First)</span>
                  <input
                    value={editingComposer.sort_name || ""}
                    onChange={(e) =>
                      setEditingComposer({
                        ...editingComposer,
                        sort_name: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-500">URL Slug</span>
                  <input
                    value={editingComposer.slug || ""}
                    onChange={(e) =>
                      setEditingComposer({
                        ...editingComposer,
                        slug: e.target.value,
                      })
                    }
                    placeholder="auto-generated if blank"
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-500">Era *</span>
                  <select
                    value={editingComposer.era || "Romantic"}
                    onChange={(e) =>
                      setEditingComposer({
                        ...editingComposer,
                        era: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  >
                    {ERA_ORDER.map((era) => (
                      <option key={era} value={era}>
                        {era}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-stone-500">Nationality *</span>
                  <input
                    required
                    value={editingComposer.nationality || ""}
                    onChange={(e) =>
                      setEditingComposer({
                        ...editingComposer,
                        nationality: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-stone-500">Birth Year *</span>
                    <input
                      type="number"
                      required
                      value={editingComposer.birth_year ?? ""}
                      onChange={(e) =>
                        setEditingComposer({
                          ...editingComposer,
                          birth_year: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-stone-500">Death Year</span>
                    <input
                      type="number"
                      value={editingComposer.death_year ?? ""}
                      onChange={(e) =>
                        setEditingComposer({
                          ...editingComposer,
                          death_year: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                </div>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-stone-500">Avatar / Portrait URL</span>
                  <input
                    value={editingComposer.avatar_url || ""}
                    onChange={(e) =>
                      setEditingComposer({
                        ...editingComposer,
                        avatar_url: e.target.value,
                      })
                    }
                    placeholder="https://..."
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-500">Birth Place</span>
                  <input
                    value={editingComposer.birth_place || ""}
                    onChange={(e) =>
                      setEditingComposer({
                        ...editingComposer,
                        birth_place: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
                <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <span className="text-stone-500">Short Bio *</span>
                  <textarea
                    required
                    rows={3}
                    value={editingComposer.short_bio || ""}
                    onChange={(e) =>
                      setEditingComposer({
                        ...editingComposer,
                        short_bio: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingComposer(null)}
                  className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingComposer}
                  className="px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
                >
                  {savingComposer ? "Saving..." : "Save Composer"}
                </button>
              </div>
            </form>
          )}

          {/* Composers Table */}
          <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#faf8f4] dark:bg-[#141210] border-b border-stone-200 dark:border-stone-800 text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Composer</th>
                    <th className="py-3 px-4">Era</th>
                    <th className="py-3 px-4">Nationality</th>
                    <th className="py-3 px-4">Lifespan</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                  {filteredComposers.slice(0, 100).map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-[#faf8f4]/70 dark:hover:bg-[#221f1b]"
                    >
                      <td className="py-2.5 px-4 flex items-center gap-3">
                        <ComposerAvatar
                          name={c.name}
                          avatarUrl={c.avatar_url}
                          era={c.era}
                          size="sm"
                        />
                        <div>
                          <span className="font-serif font-semibold text-sm text-stone-900 dark:text-[#f3efe6] block">
                            {c.name}
                          </span>
                          <span className="font-mono text-[10px] text-stone-400">
                            /{c.slug}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-stone-600 dark:text-stone-300">
                        {c.era}
                      </td>
                      <td className="py-2.5 px-4 text-stone-600 dark:text-stone-300">
                        {c.nationality}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-stone-500">
                        {formatLifespan(c.birth_year, c.death_year)}
                      </td>
                      <td className="py-2.5 px-4 text-right space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setEditingComposer(c)}
                          className="p-1.5 rounded-lg hover:bg-stone-200/70 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteComposer(c)}
                          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-950 text-red-600 dark:text-red-400 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WORKS */}
      {activeTab === "works" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 justify-between">
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={workSearch}
                  onChange={(e) => setWorkSearch(e.target.value)}
                  placeholder="Search works by title, nickname, opus..."
                  className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#d4af6a]"
                />
              </div>

              <select
                value={workComposerFilter}
                onChange={(e) => setWorkComposerFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-800 rounded-xl text-stone-800 dark:text-stone-200"
              >
                <option value="">All Composers</option>
                {composers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sort_name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() =>
                setEditingWork({
                  composer_id: workComposerFilter
                    ? Number(workComposerFilter)
                    : composers[0]?.id,
                  title: "",
                  nickname: "",
                  catalog_system: "",
                  catalog_number: "",
                  genre: "Chamber",
                  key_signature: "",
                  year_composed: null,
                  instrumentation: "",
                  movements_count: null,
                  duration_minutes: null,
                  is_popular: false,
                  description: "",
                })
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Work
            </button>
          </div>

          {editingWork && (
            <form
              onSubmit={handleSaveWork}
              className="bg-white dark:bg-[#191714] rounded-2xl border border-[#9a7432]/60 dark:border-[#d4af6a]/60 p-6 space-y-4 shadow-md"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6]">
                  {editingWork.id ? "Edit Work" : "New Work"}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingWork(null)}
                  className="p-1 text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-stone-500">Composer *</span>
                  <select
                    required
                    value={editingWork.composer_id ?? ""}
                    onChange={(e) =>
                      setEditingWork({
                        ...editingWork,
                        composer_id: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  >
                    {composers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sort_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-stone-500">Title *</span>
                  <input
                    required
                    value={editingWork.title || ""}
                    onChange={(e) =>
                      setEditingWork({ ...editingWork, title: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-500">Nickname</span>
                  <input
                    value={editingWork.nickname || ""}
                    onChange={(e) =>
                      setEditingWork({
                        ...editingWork,
                        nickname: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-stone-500">Catalog Sys.</span>
                    <input
                      placeholder="Op. / BWV / K."
                      value={editingWork.catalog_system || ""}
                      onChange={(e) =>
                        setEditingWork({
                          ...editingWork,
                          catalog_system: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-stone-500">Catalog No.</span>
                    <input
                      placeholder="27, No. 2"
                      value={editingWork.catalog_number || ""}
                      onChange={(e) =>
                        setEditingWork({
                          ...editingWork,
                          catalog_number: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                </div>
                <label className="space-y-1">
                  <span className="text-stone-500">Genre *</span>
                  <select
                    value={editingWork.genre || "Chamber"}
                    onChange={(e) =>
                      setEditingWork({ ...editingWork, genre: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  >
                    {WORK_GENRES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-stone-500">Key Signature</span>
                  <input
                    value={editingWork.key_signature || ""}
                    onChange={(e) =>
                      setEditingWork({
                        ...editingWork,
                        key_signature: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-stone-500">Scoring / Instrumentation</span>
                  <input
                    value={editingWork.instrumentation || ""}
                    onChange={(e) =>
                      setEditingWork({
                        ...editingWork,
                        instrumentation: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1">
                    <span className="text-stone-500">Year</span>
                    <input
                      type="number"
                      value={editingWork.year_composed ?? ""}
                      onChange={(e) =>
                        setEditingWork({
                          ...editingWork,
                          year_composed: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      className="w-full px-2.5 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-stone-500">Mvts</span>
                    <input
                      type="number"
                      value={editingWork.movements_count ?? ""}
                      onChange={(e) =>
                        setEditingWork({
                          ...editingWork,
                          movements_count: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      className="w-full px-2.5 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-stone-500">Min</span>
                    <input
                      type="number"
                      value={editingWork.duration_minutes ?? ""}
                      onChange={(e) =>
                        setEditingWork({
                          ...editingWork,
                          duration_minutes: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      className="w-full px-2.5 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </label>
                </div>
                <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <span className="text-stone-500">Description / Program Notes</span>
                  <textarea
                    rows={2}
                    value={editingWork.description || ""}
                    onChange={(e) =>
                      setEditingWork({
                        ...editingWork,
                        description: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
                  />
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingWork.is_popular)}
                    onChange={(e) =>
                      setEditingWork({
                        ...editingWork,
                        is_popular: e.target.checked,
                      })
                    }
                  />
                  <span className="text-stone-700 dark:text-stone-300 font-medium">
                    Mark as Essential repertoire
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingWork(null)}
                  className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingWork}
                  className="px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
                >
                  {savingWork ? "Saving..." : "Save Work"}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            {worksLoading ? (
              <div className="p-10 text-center text-xs text-stone-500">
                Loading works...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#faf8f4] dark:bg-[#141210] border-b border-stone-200 dark:border-stone-800 text-stone-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Catalog</th>
                      <th className="py-3 px-4">Work</th>
                      <th className="py-3 px-4">Composer</th>
                      <th className="py-3 px-4">Metadata</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                    {works.map((w) => (
                      <tr
                        key={w.id}
                        className="hover:bg-[#faf8f4]/70 dark:hover:bg-[#221f1b]"
                      >
                        <td className="py-2.5 px-4 font-mono text-stone-600 dark:text-stone-300 whitespace-nowrap">
                          {w.catalog_display || "—"}
                        </td>
                        <td className="py-2.5 px-4 max-w-sm">
                          <span className="font-serif font-semibold text-sm text-stone-900 dark:text-[#f3efe6] block truncate">
                            {w.title}
                          </span>
                          {w.nickname && (
                            <span className="text-[11px] text-[#9a7432] dark:text-[#d4af6a]">
                              {w.nickname}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-stone-600 dark:text-stone-300 whitespace-nowrap">
                          {w.composers?.name || "—"}
                        </td>
                        <td className="py-2.5 px-4 text-stone-500 whitespace-nowrap">
                          {[
                            w.genre,
                            w.year_composed,
                            w.duration_minutes ? `${w.duration_minutes}m` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </td>
                        <td className="py-2.5 px-4 text-right space-x-1 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setEditingWork(w)}
                            className="p-1.5 rounded-lg hover:bg-stone-200/70 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWork(w)}
                            className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-950 text-red-600 dark:text-red-400 cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CONNECTIONS */}
      {activeTab === "relations" && (
        <div className="space-y-6">
          <form
            onSubmit={handleAddRelation}
            className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-5 space-y-4"
          >
            <h2 className="font-serif text-lg font-semibold text-stone-900 dark:text-[#f3efe6]">
              Add Musical Lineage Connection
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <select
                required
                value={newRel.source_composer_id}
                onChange={(e) =>
                  setNewRel({ ...newRel, source_composer_id: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              >
                <option value="">Source Composer...</option>
                {composers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sort_name}
                  </option>
                ))}
              </select>

              <select
                value={newRel.relation_type}
                onChange={(e) =>
                  setNewRel({ ...newRel, relation_type: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              >
                {Object.entries(RELATION_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>

              <select
                required
                value={newRel.target_composer_id}
                onChange={(e) =>
                  setNewRel({ ...newRel, target_composer_id: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              >
                <option value="">Target Composer...</option>
                {composers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sort_name}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                max={5}
                value={newRel.strength}
                onChange={(e) =>
                  setNewRel({ ...newRel, strength: Number(e.target.value) })
                }
                placeholder="Strength 1-5"
                className="px-3 py-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={newRel.description}
                onChange={(e) =>
                  setNewRel({ ...newRel, description: e.target.value })
                }
                placeholder="Historical note (e.g. 'Studied counterpoint together in Vienna...')"
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Connection
              </button>
            </div>
          </form>

          <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
            {relations.map((r) => {
              const src = composerById.get(r.source_composer_id);
              const tgt = composerById.get(r.target_composer_id);
              const meta = RELATION_META[r.relation_type];
              return (
                <div
                  key={r.id}
                  className="p-4 flex items-start justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="font-serif text-sm text-stone-900 dark:text-[#f3efe6]">
                        {src?.name ?? `#${r.source_composer_id}`}
                      </strong>
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${meta?.badgeClass}`}
                      >
                        {meta?.label ?? r.relation_type}
                      </span>
                      <strong className="font-serif text-sm text-stone-900 dark:text-[#f3efe6]">
                        {tgt?.name ?? `#${r.target_composer_id}`}
                      </strong>
                    </div>
                    {r.description && (
                      <p className="text-stone-500 dark:text-stone-400">
                        {r.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteRelation(r.id)}
                    className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-950 text-red-600 dark:text-red-400 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: SITE SETTINGS */}
      {activeTab === "settings" && settings && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-5 max-w-2xl"
        >
          <div>
            <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6]">
              Live Site Tweaks
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Changes saved here update the live homepage immediately without
              redeploying.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <label className="space-y-1 block">
              <span className="text-stone-500 font-medium">Site Name</span>
              <input
                value={settings.site_name}
                onChange={(e) =>
                  setSettings({ ...settings, site_name: e.target.value })
                }
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-stone-500 font-medium">Hero Badge Pill</span>
              <input
                value={settings.hero_badge}
                onChange={(e) =>
                  setSettings({ ...settings, hero_badge: e.target.value })
                }
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-stone-500 font-medium">Hero Headline</span>
              <input
                value={settings.hero_title}
                onChange={(e) =>
                  setSettings({ ...settings, hero_title: e.target.value })
                }
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-stone-500 font-medium">Hero Subtitle</span>
              <textarea
                rows={3}
                value={settings.hero_subtitle}
                onChange={(e) =>
                  setSettings({ ...settings, hero_subtitle: e.target.value })
                }
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={savingSettings}
            className="px-5 py-2.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
          >
            {savingSettings ? "Saving..." : "Save Live Site Settings"}
          </button>
        </form>
      )}
    </div>
  );
}
