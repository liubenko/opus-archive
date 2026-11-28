"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Shield, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface AdminWorkEnrichButtonProps {
  workId: number;
  missingFields: string[];
}

export function AdminWorkEnrichButton({
  workId,
  missingFields,
}: AdminWorkEnrichButtonProps) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "info" | "error";
    text: string;
  } | null>(null);

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
        body: JSON.stringify({ workId }),
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

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleEnrich}
        disabled={enriching}
        title={
          missingFields.length > 0
            ? `Missing: ${missingFields.join(", ")}`
            : "Check IMSLP, Wikipedia & MusicBrainz for additional metadata"
        }
        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-amber-300/80 dark:border-amber-700/70 bg-amber-50/80 dark:bg-amber-950/40 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100/80 dark:hover:bg-amber-900/50 transition-colors cursor-pointer disabled:opacity-60"
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
              ? `Enrich Missing Metadata (${missingFields.length})`
              : "Re-check Open Metadata"}
        </span>
        <Shield className="w-3 h-3 opacity-60" />
      </button>

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
    </div>
  );
}
