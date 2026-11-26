"use client";

import { useEffect, useState } from "react";
import {
  Play,
  Copy,
  Check,
  KeyRound,
  Loader2,
  Code2,
  Lock,
  Globe,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface EndpointSpec {
  id: string;
  method: "GET" | "POST";
  path: string;
  samplePath: string;
  title: string;
  description: string;
  authRequired?: boolean;
  params?: string[];
}

const ENDPOINTS: EndpointSpec[] = [
  {
    id: "index",
    method: "GET",
    path: "/api/v1",
    samplePath: "/api/v1",
    title: "API Index & Catalog Stats",
    description:
      "Returns live counts of composers, works, movements, and lineage connections plus all endpoint URLs.",
  },
  {
    id: "composers",
    method: "GET",
    path: "/api/v1/composers",
    samplePath: "/api/v1/composers?era=Romantic&limit=5",
    title: "List Composers",
    description:
      "Paginated directory of composers with optional era, nationality, and text filters.",
    params: ["era", "nationality", "q", "limit (max 500)", "offset"],
  },
  {
    id: "composer_detail",
    method: "GET",
    path: "/api/v1/composers/:slug",
    samplePath: "/api/v1/composers/johann-sebastian-bach?limit=5",
    title: "Composer Detail + Works + Lineage",
    description:
      "Full composer profile, IMSLP catalog link, paginated works, and historical connections.",
    params: ["genre", "popular=true", "limit (max 500)", "offset"],
  },
  {
    id: "works",
    method: "GET",
    path: "/api/v1/works",
    samplePath: "/api/v1/works?instrumentation=cello&popular=true&limit=5",
    title: "List & Filter Works",
    description:
      "Filter across 20,500+ works by composer, era, genre, catalog system, key, instrumentation, or search text.",
    params: [
      "composer",
      "era",
      "genre",
      "catalog",
      "key",
      "instrumentation",
      "popular=true",
      "q",
      "limit (max 200)",
      "offset",
    ],
  },
  {
    id: "work_detail",
    method: "GET",
    path: "/api/v1/works/:slug",
    samplePath: "/api/v1/works/das-lied-von-der-glocke-op-45-15576",
    title: "Work Detail + Movements + Related Works",
    description:
      "Resolves by SEO slug or numeric ID. Includes full metadata, IMSLP URL, curated recording links, structured movements, and related repertoire.",
  },
  {
    id: "search",
    method: "GET",
    path: "/api/v1/search",
    samplePath: "/api/v1/search?q=BWV+1007",
    title: "Instant Fuzzy Catalog Search",
    description:
      "Full-text + pg_trgm trigram fuzzy search across composers, titles, nicknames, and opus numbers.",
    params: ["q (required)", "era", "genre", "limit (max 50)"],
  },
  {
    id: "graph",
    method: "GET",
    path: "/api/v1/graph",
    samplePath: "/api/v1/graph?connected_only=true",
    title: "Composer Influence Graph",
    description:
      "Nodes and directed edges (teacher_of, influenced, contemporary, rival) for network visualization.",
    params: ["connected_only=true"],
  },
  {
    id: "imslp",
    method: "GET",
    path: "/api/v1/imslp/editions",
    samplePath:
      "/api/v1/imslp/editions?url=https%3A%2F%2Fimslp.org%2Fwiki%2FCello_Suite_No.1_in_G_major%2C_BWV_1007_(Bach%2C_Johann_Sebastian)",
    title: "IMSLP Public-Domain Editions",
    description:
      "Parses available scores, publishers, editors, and manuscript scans from an IMSLP work page (24h edge-cached).",
    params: ["url (https://imslp.org/wiki/...)"],
  },
  {
    id: "me_repertoire",
    method: "GET",
    path: "/api/v1/me/repertoire",
    samplePath: "/api/v1/me/repertoire",
    title: "Personal Repertoire Tracker (Authenticated)",
    description:
      "Returns the signed-in musician's tracked works, statuses, difficulty ratings, practice dates, and notes. Also supports POST to upsert a work.",
    authRequired: true,
    params: ["status (wishlist | learning | ready | performed)"],
  },
  {
    id: "me_programs",
    method: "GET",
    path: "/api/v1/me/programs",
    samplePath: "/api/v1/me/programs",
    title: "Personal Recital Programs (Authenticated)",
    description:
      "Returns the signed-in musician's recital programs with nested Half I / Half II works and auto-calculated concert durations.",
    authRequired: true,
  },
];

export function ApiDocsPlayground() {
  const [origin, setOrigin] = useState(
    "https://opus-archive.mykolaliubenko.workers.dev"
  );
  const [token, setToken] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<
    Record<string, { status: number; body: string; loading: boolean }>
  >({});

  useEffect(() => {
    setOrigin(window.location.origin);
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  function copyText(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function runEndpoint(ep: EndpointSpec) {
    setResponses((prev) => ({
      ...prev,
      [ep.id]: { status: 0, body: "", loading: true },
    }));
    try {
      const headers: Record<string, string> = {};
      if (ep.authRequired && token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`${origin}${ep.samplePath}`, { headers });
      const json = await res.json();
      setResponses((prev) => ({
        ...prev,
        [ep.id]: {
          status: res.status,
          body: JSON.stringify(json, null, 2).slice(0, 4000),
          loading: false,
        },
      }));
    } catch (err) {
      setResponses((prev) => ({
        ...prev,
        [ep.id]: {
          status: 500,
          body: String(err),
          loading: false,
        },
      }));
    }
  }

  return (
    <div className="space-y-6">
      {/* Auth Token Helper Banner */}
      <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-serif text-base font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#9a7432] dark:text-[#d4af6a]" />
            Companion App Authentication
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            All public catalog endpoints are free &amp; CORS-enabled (no API key
            required). Personal{" "}
            <code className="font-mono">/api/v1/me/*</code> endpoints use your
            Supabase Bearer JWT.
          </p>
        </div>

        {token ? (
          <button
            type="button"
            onClick={() => copyText("bearer", token)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold shrink-0 cursor-pointer"
          >
            {copiedId === "bearer" ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copied Bearer Token
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy My Bearer Token
              </>
            )}
          </button>
        ) : (
          <a
            href="/studio"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#d4af6a] shrink-0"
          >
            Sign in at My Studio to get token →
          </a>
        )}
      </div>

      {/* Endpoints List */}
      <div className="space-y-4">
        {ENDPOINTS.map((ep) => {
          const fullUrl = `${origin}${ep.samplePath}`;
          const curlCmd = ep.authRequired
            ? `curl -H "Authorization: Bearer YOUR_TOKEN" "${fullUrl}"`
            : `curl "${fullUrl}"`;
          const resp = responses[ep.id];

          return (
            <div
              key={ep.id}
              className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 overflow-hidden"
            >
              <div className="p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {ep.method}
                    </span>
                    <code className="font-mono text-sm font-semibold text-stone-900 dark:text-[#f3efe6]">
                      {ep.path}
                    </code>
                    {ep.authRequired ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70">
                        <Lock className="w-2.5 h-2.5" />
                        Bearer JWT
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                        <Globe className="w-2.5 h-2.5" />
                        Public
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyText(ep.id, curlCmd)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:border-stone-400 cursor-pointer"
                    >
                      {copiedId === ep.id ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      curl
                    </button>
                    <button
                      type="button"
                      disabled={resp?.loading}
                      onClick={() => runEndpoint(ep)}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      {resp?.loading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 fill-current" />
                      )}
                      Try It
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {ep.title}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    {ep.description}
                  </p>
                </div>

                {ep.params && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-stone-400 font-medium mr-1">
                      Query params:
                    </span>
                    {ep.params.map((p) => (
                      <code
                        key={p}
                        className="px-2 py-0.5 rounded bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 font-mono"
                      >
                        {p}
                      </code>
                    ))}
                  </div>
                )}

                <div className="p-2.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800/70 font-mono text-[11px] text-stone-600 dark:text-stone-300 overflow-x-auto flex items-center gap-2">
                  <Code2 className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{curlCmd}</span>
                </div>
              </div>

              {resp && !resp.loading && (
                <div className="border-t border-stone-200 dark:border-stone-800 bg-[#141210] text-stone-200 p-4 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span
                      className={
                        resp.status >= 200 && resp.status < 300
                          ? "text-emerald-400"
                          : "text-red-400"
                      }
                    >
                      HTTP {resp.status}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setResponses((prev) => {
                          const next = { ...prev };
                          delete next[ep.id];
                          return next;
                        })
                      }
                      className="text-stone-400 hover:text-white cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono overflow-x-auto max-h-72 leading-relaxed text-stone-300">
                    {resp.body}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
