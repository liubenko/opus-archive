"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookmarkPlus,
  BookmarkCheck,
  ListPlus,
  Check,
  Loader2,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { RecitalProgram } from "@/types/database";

const STATUS_OPTIONS = [
  { value: "wishlist", label: "Wish List" },
  { value: "learning", label: "Learning" },
  { value: "ready", label: "Performance Ready" },
  { value: "performed", label: "Performed" },
] as const;

interface WorkWorkspaceActionsProps {
  workId: number;
  defaultDuration?: number | null;
}

export function WorkWorkspaceActions({
  workId,
  defaultDuration,
}: WorkWorkspaceActionsProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackedStatus, setTrackedStatus] = useState<string | null>(null);
  const [programs, setPrograms] = useState<RecitalProgram[]>([]);
  const [showProgramMenu, setShowProgramMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!mounted) return;
      const u = data.user ?? null;
      setUser(u);
      if (u) {
        const [repRes, progRes] = await Promise.all([
          supabase
            .from("user_repertoire")
            .select("status")
            .eq("work_id", workId)
            .maybeSingle(),
          supabase
            .from("recital_programs")
            .select("*")
            .order("created_at", { ascending: false }),
        ]);
        if (mounted) {
          setTrackedStatus(repRes.data?.status ?? null);
          setPrograms(progRes.data ?? []);
        }
      }
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [workId]);

  function flash(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2800);
  }

  async function handleTrackStatus(newStatus: string) {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("user_repertoire").upsert(
      {
        user_id: user.id,
        work_id: workId,
        status: newStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,work_id" }
    );
    setBusy(false);
    if (!error) {
      setTrackedStatus(newStatus);
      flash("Saved to My Studio");
    }
  }

  async function handleAddToProgram(programId: number, half: 1 | 2) {
    if (!user) return;
    setBusy(true);
    const { count } = await supabase
      .from("recital_program_items")
      .select("*", { count: "exact", head: true })
      .eq("program_id", programId)
      .eq("half", half);

    const { error } = await supabase.from("recital_program_items").insert({
      program_id: programId,
      user_id: user.id,
      work_id: workId,
      half,
      position: (count ?? 0) + 1,
      custom_duration_minutes: defaultDuration ?? null,
    });
    setBusy(false);
    setShowProgramMenu(false);
    if (!error) {
      flash(`Added to Half ${half === 1 ? "I" : "II"}`);
    }
  }

  if (loading) return null;

  if (!user) {
    return (
      <Link
        href="/studio"
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-600 dark:text-stone-300 hover:border-[#9a7432] dark:hover:border-[#d4af6a] hover:text-stone-900 dark:hover:text-white transition-colors"
      >
        <BookmarkPlus className="w-3.5 h-3.5" />
        Track in My Studio
      </Link>
    );
  }

  return (
    <div className="space-y-2 relative">
      <div className="flex flex-wrap items-center gap-2">
        {trackedStatus ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200 text-xs font-medium">
            <BookmarkCheck className="w-3.5 h-3.5 shrink-0" />
            <select
              value={trackedStatus}
              disabled={busy}
              onChange={(e) => handleTrackStatus(e.target.value)}
              aria-label="Repertoire status"
              className="bg-transparent focus:outline-none cursor-pointer font-semibold"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  className="bg-white dark:bg-[#191714] text-stone-900 dark:text-stone-100"
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleTrackStatus("learning")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-[#faf8f4] dark:bg-[#141210] hover:border-[#9a7432] dark:hover:border-[#d4af6a] text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer transition-colors"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <BookmarkPlus className="w-3.5 h-3.5" />
            )}
            Track Repertoire
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowProgramMenu((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-[#faf8f4] dark:bg-[#141210] hover:border-[#9a7432] dark:hover:border-[#d4af6a] text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer transition-colors"
          >
            <ListPlus className="w-3.5 h-3.5" />
            Add to Program
          </button>

          {showProgramMenu && (
            <div className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-[#1f1c18] rounded-xl border border-stone-200 dark:border-stone-700 shadow-xl z-40 p-2 space-y-1.5">
              {programs.length === 0 ? (
                <div className="p-2 text-xs text-stone-500 dark:text-stone-400 space-y-2">
                  <p>No recital programs yet.</p>
                  <Link
                    href="/studio"
                    className="inline-block font-semibold text-[#9a7432] dark:text-[#d4af6a] hover:underline"
                  >
                    Create one in My Studio →
                  </Link>
                </div>
              ) : (
                programs.map((prog) => (
                  <div
                    key={prog.id}
                    className="p-2 rounded-lg bg-[#faf8f4] dark:bg-[#141210] space-y-1.5"
                  >
                    <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                      {prog.title}
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAddToProgram(prog.id, 1)}
                        className="flex-1 py-1 text-[11px] font-medium rounded-md bg-white dark:bg-[#23201c] border border-stone-200 dark:border-stone-700 hover:border-[#d4af6a] cursor-pointer"
                      >
                        + Half I
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddToProgram(prog.id, 2)}
                        className="flex-1 py-1 text-[11px] font-medium rounded-md bg-white dark:bg-[#23201c] border border-stone-200 dark:border-stone-700 hover:border-[#d4af6a] cursor-pointer"
                      >
                        + Half II
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 font-medium">
          <Check className="w-3 h-3" />
          {feedback}
        </p>
      )}
    </div>
  );
}
