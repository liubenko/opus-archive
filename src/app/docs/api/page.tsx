import type { Metadata } from "next";
import { ApiDocsPlayground } from "@/components/ApiDocsPlayground";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "REST API Documentation — Opus Archive",
  description:
    "Interactive REST API documentation for Opus Archive: composers, works, movements, IMSLP editions, influence graph, and personal musician endpoints.",
};

export default function ApiDocsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7432] dark:text-[#d4af6a]">
          Developer Portal · REST API v1
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1a1816] dark:text-[#f3efe6]">
          Opus Archive Public &amp; Personal API
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-400 max-w-2xl">
          Connect mobile apps, practice trackers, Notion syncs, or custom
          classical music tools directly to Opus Archive. Test every endpoint
          live below.
        </p>
      </div>

      <ApiDocsPlayground />
    </div>
  );
}
