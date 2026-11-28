"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Calendar,
  Check,
  Download,
  ExternalLink,
  FileMusic,
  GitMerge,
  Globe2,
  Link2,
  Loader2,
  MapPin,
  Music,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  CatalogSuggestion,
  Composer,
  ConcertEvent,
  ConcertEventProposal,
  Database,
  Performer,
  StageEntityProposal,
  Venue,
  Work,
} from "@/types/database";
import type {
  EnrichedComposerCandidate,
  EnrichedPerformerCandidate,
  EnrichedVenueCandidate,
  EnrichedWorkCandidate,
} from "@/lib/catalog-lookup";
import type {
  StagedPerformerPayloadItem,
  StagedWorkPayloadItem,
} from "@/lib/stage-staging";
import { ERA_ORDER } from "@/lib/constants";
import { ComposerAvatar } from "@/components/ComposerAvatar";
import { slugify } from "../../../scripts/lib/dedup.mjs";

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

const PERFORMER_ROLES = [
  { value: "soloist", label: "Soloist" },
  { value: "conductor", label: "Conductor" },
  { value: "orchestra", label: "Orchestra" },
  { value: "ensemble", label: "Ensemble / Choir" },
] as const;

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
  const [entityProposals, setEntityProposals] = useState<StageEntityProposal[]>(
    []
  );
  const [concertProposals, setConcertProposals] = useState<
    ConcertEventProposal[]
  >([]);
  const [liveEvents, setLiveEvents] = useState<ConcertEvent[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [performers, setPerformers] = useState<Performer[]>([]);

  const [inboxCategory, setInboxCategory] = useState<
    "all" | "concerts" | "performers" | "venues" | "works"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "approved" | "linked" | "dismissed"
  >("pending");
  const [loading, setLoading] = useState(true);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [enrichingKey, setEnrichingKey] = useState<string | null>(null);
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [enrichedSources, setEnrichedSources] = useState<
    Record<string, string[]>
  >({});

  // Inline "Link to Existing Work" modal state
  const [linkingSug, setLinkingSug] = useState<CatalogSuggestion | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<
    (Pick<Work, "id" | "title" | "catalog_display" | "slug"> & {
      composers: { name: string } | null;
    })[]
  >([]);

  // Season & Tour Crawler state
  const [importUrl, setImportUrl] = useState("");
  const [defaultVenueId, setDefaultVenueId] = useState("");
  const [defaultPerformerId, setDefaultPerformerId] = useState("");
  const [tourPerformerId, setTourPerformerId] = useState("");
  const [importing, setImporting] = useState(false);

  // Quick Propose Performer / Venue state
  const [quickEntityType, setQuickEntityType] = useState<"performer" | "venue">(
    "performer"
  );
  const [quickEntityName, setQuickEntityName] = useState("");
  const [quickEntityCity, setQuickEntityCity] = useState("");
  const [creatingEntityProp, setCreatingEntityProp] = useState(false);

  // Quick Manual Event state
  const [manualTitle, setManualTitle] = useState("");
  const [manualStartsAt, setManualStartsAt] = useState("2027-01-15T20:00");
  const [manualVenueId, setManualVenueId] = useState("");
  const [manualPerformerId, setManualPerformerId] = useState("");
  const [manualProgram, setManualProgram] = useState("");
  const [manualTicketUrl, setManualTicketUrl] = useState("");

  const loadStageAdmin = useCallback(async () => {
    setLoading(true);
    const [sugRes, entRes, cpRes, evRes, venRes, perfRes] = await Promise.all([
      supabase
        .from("catalog_suggestions")
        .select("*")
        .order("occurrence_count", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("stage_entity_proposals")
        .select("*")
        .order("occurrence_count", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("concert_event_proposals")
        .select("*")
        .order("match_confidence", { ascending: false })
        .order("starts_at", { ascending: true }),
      supabase
        .from("concert_events")
        .select("*")
        .order("starts_at", { ascending: true }),
      supabase.from("venues").select("*").order("name", { ascending: true }),
      supabase
        .from("performers")
        .select("*")
        .order("is_featured", { ascending: false })
        .order("name", { ascending: true }),
    ]);

    setSuggestions(sugRes.data ?? []);
    setEntityProposals(entRes.data ?? []);
    setConcertProposals(cpRes.data ?? []);
    setLiveEvents(evRes.data ?? []);
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

  // Local patch helpers
  function updateLocalSuggestionField(
    id: number,
    patch: Partial<CatalogSuggestion>
  ) {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  function updateLocalEntityProposal(
    id: number,
    patch: Partial<StageEntityProposal>
  ) {
    setEntityProposals((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  }

  function updateLocalConcertProposal(
    id: number,
    patch: Partial<ConcertEventProposal>
  ) {
    setConcertProposals((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  async function getAdminToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      showToast("error", "Admin session expired — please sign in again.");
      return null;
    }
    return session.access_token;
  }

  // =========================================================================
  // OPEN-LIBRARY AUTO-ENRICHMENT (Works, Composers, Performers & Venues)
  // =========================================================================
  async function handleEnrichWorkOrComposer(
    sug: CatalogSuggestion,
    opts?: { silent?: boolean }
  ): Promise<boolean> {
    const isComp = sug.suggestion_type === "composer";
    const key = `sug:${sug.id}`;
    setEnrichingKey(key);
    try {
      const params = new URLSearchParams({
        type: isComp ? "composer" : "work",
        q: isComp ? sug.suggested_composer_name : sug.suggested_work_title,
        composer: sug.suggested_composer_name,
      });
      const res = await fetch(`/api/v1/suggest/lookup?${params.toString()}`);
      if (!res.ok) return false;
      const data = (await res.json()) as {
        candidates?: (EnrichedComposerCandidate & EnrichedWorkCandidate)[];
      };
      const top = data.candidates?.[0];
      if (!top) {
        if (!opts?.silent) {
          showToast("error", "No open-library metadata found.");
        }
        return false;
      }

      const patch: Partial<Omit<CatalogSuggestion, "id">> = {};
      if (isComp) {
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
      }

      if (Object.keys(patch).length === 0) {
        if (!opts?.silent) showToast("success", "Metadata already complete.");
        return false;
      }

      updateLocalSuggestionField(sug.id, patch);
      if (top.sources?.length) {
        setEnrichedSources((prev) => ({
          ...prev,
          [key]: top.sources || [],
        }));
      }
      await supabase
        .from("catalog_suggestions")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", sug.id);

      if (!opts?.silent) {
        showToast(
          "success",
          `Enriched from ${(top.sources || ["open libraries"]).join(" · ")}!`
        );
      }
      return true;
    } finally {
      setEnrichingKey(null);
    }
  }

  async function handleEnrichEntityProposal(
    prop: StageEntityProposal,
    opts?: { silent?: boolean }
  ): Promise<boolean> {
    const key = `ent:${prop.id}`;
    setEnrichingKey(key);
    try {
      const params = new URLSearchParams({
        type: prop.entity_type,
        q: prop.name,
        ...(prop.city ? { city: prop.city } : {}),
      });
      const res = await fetch(`/api/v1/suggest/lookup?${params.toString()}`);
      if (!res.ok) return false;
      const data = (await res.json()) as {
        candidates?: Partial<
          EnrichedPerformerCandidate & EnrichedVenueCandidate
        >[];
      };
      const top = data.candidates?.[0];
      if (!top) {
        if (!opts?.silent) {
          showToast("error", `No open-data match found for "${prop.name}".`);
        }
        return false;
      }

      const patch: Partial<Omit<StageEntityProposal, "id">> = {};
      if (prop.entity_type === "performer") {
        if (
          top.name &&
          /[А-Яа-яІіЇїЄєҐґ]/.test(prop.name) &&
          !/[А-Яа-яІіЇїЄєҐґ]/.test(top.name)
        ) {
          patch.name = top.name;
        }
        if (top.performer_type) patch.performer_type = top.performer_type;
        if (top.instrument_or_role) {
          patch.instrument_or_role = top.instrument_or_role;
        }
        if (top.nationality) patch.nationality = top.nationality;
        if (top.home_city && !prop.city) patch.city = top.home_city;
        if (top.website_url) patch.website_url = top.website_url;
        if (top.calendar_url) patch.calendar_url = top.calendar_url;
        if (top.avatar_url) patch.photo_url = top.avatar_url;
        if (top.short_bio) patch.short_bio = top.short_bio;
        if (top.wikidata_qid) patch.wikidata_qid = top.wikidata_qid;
      } else {
        if (top.short_name && !prop.short_name) {
          patch.short_name = top.short_name;
        }
        if (top.city && (!prop.city || prop.city === "Unknown City")) {
          patch.city = top.city;
        }
        if (top.country && (!prop.country || prop.country === "International")) {
          patch.country = top.country;
        }
        if (top.country_code) patch.country_code = top.country_code;
        if (top.latitude !== null && top.latitude !== undefined) {
          patch.latitude = top.latitude;
        }
        if (top.longitude !== null && top.longitude !== undefined) {
          patch.longitude = top.longitude;
        }
        if (top.capacity) patch.capacity = top.capacity;
        if (top.opened_year) patch.opened_year = top.opened_year;
        if (top.architect_or_acoustics) {
          patch.architect_or_acoustics = top.architect_or_acoustics;
        }
        if (top.website_url) patch.website_url = top.website_url;
        if (top.calendar_url) patch.calendar_url = top.calendar_url;
        if (top.photo_url) patch.photo_url = top.photo_url;
        if (top.short_bio) patch.short_bio = top.short_bio;
        if (top.wikidata_qid) patch.wikidata_qid = top.wikidata_qid;
      }

      if (Object.keys(patch).length === 0) return false;

      updateLocalEntityProposal(prop.id, patch);
      if (top.sources?.length) {
        setEnrichedSources((prev) => ({
          ...prev,
          [key]: top.sources || [],
        }));
      }

      await supabase
        .from("stage_entity_proposals")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", prop.id);

      if (!opts?.silent) {
        showToast(
          "success",
          `Fetched ${prop.entity_type} data via ${(top.sources || ["Wikidata"]).join(" · ")}!`
        );
      }
      return true;
    } finally {
      setEnrichingKey(null);
    }
  }

  async function handleEnrichAllPending() {
    setEnrichingAll(true);
    let count = 0;
    try {
      const pendingEnts = entityProposals.filter(
        (p) =>
          p.status === "pending" &&
          (!p.short_bio || !p.website_url || (p.entity_type === "venue" && p.latitude === null))
      );
      for (const ep of pendingEnts) {
        if (await handleEnrichEntityProposal(ep, { silent: true })) count++;
      }

      const pendingSugs = suggestions.filter(
        (s) =>
          s.status === "pending" &&
          (s.suggestion_type === "composer"
            ? !s.composer_birth_year || !s.composer_short_bio
            : !s.suggested_year || !s.suggested_key_signature || !s.suggested_imslp_url)
      );
      for (const s of pendingSugs) {
        if (await handleEnrichWorkOrComposer(s, { silent: true })) count++;
      }

      showToast(
        "success",
        count > 0
          ? `Auto-enriched ${count} pending proposal${count === 1 ? "" : "s"}!`
          : "All pending items are already enriched."
      );
    } finally {
      setEnrichingAll(false);
    }
  }

  // =========================================================================
  // APPROVAL & MERGE ACTIONS
  // =========================================================================
  async function handleApproveEntity(
    prop: StageEntityProposal,
    crawlTourAfter = false
  ) {
    const key = `ent:${prop.id}`;
    setBusyKey(key);
    try {
      // Persist any inline edits on the card first
      const { id: _ignoreId, ...editable } = prop;
      void _ignoreId;
      await supabase
        .from("stage_entity_proposals")
        .update({ ...editable, updated_at: new Date().toISOString() })
        .eq("id", prop.id);

      const token = await getAdminToken();
      if (!token) return;

      const res = await fetch("/api/admin/stage-approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "approve_entity",
          entityProposalId: prop.id,
          crawlTourAfter,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        tourCrawlSummary?: {
          stagedNewConcerts: number;
          stagedMergeCandidates: number;
        } | null;
      };
      if (!res.ok) {
        showToast("error", json.error || "Approval failed.");
        return;
      }

      const tourExtra = json.tourCrawlSummary
        ? ` · Staged ${json.tourCrawlSummary.stagedNewConcerts} tour dates & ${json.tourCrawlSummary.stagedMergeCandidates} merge candidates!`
        : "";
      showToast(
        "success",
        `Added ${prop.name} to Opus Archive World Stage${tourExtra}`
      );
      loadStageAdmin();
      onCatalogChanged();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDismissEntity(prop: StageEntityProposal) {
    setBusyKey(`ent:${prop.id}`);
    await supabase
      .from("stage_entity_proposals")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("id", prop.id);
    setBusyKey(null);
    loadStageAdmin();
  }

  async function handleApproveOrMergeConcert(
    cp: ConcertEventProposal,
    action: "approve_concert" | "merge_concert"
  ) {
    const key = `cp:${cp.id}`;
    setBusyKey(key);
    try {
      // Save any inline edits (title, starts_at, matched_venue_id, ticket_url)
      await supabase
        .from("concert_event_proposals")
        .update({
          title: cp.title,
          starts_at: cp.starts_at,
          matched_venue_id: cp.matched_venue_id,
          ticket_url: cp.ticket_url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cp.id);

      const token = await getAdminToken();
      if (!token) return;

      const res = await fetch("/api/admin/stage-approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          concertProposalId: cp.id,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        mergedIntoEventId?: number;
        mergedPerformers?: number;
        mergedWorks?: number;
      };
      if (!res.ok) {
        showToast("error", json.error || "Action failed.");
        return;
      }

      if (action === "merge_concert") {
        showToast(
          "success",
          `Merged into Concert #${json.mergedIntoEventId} (+${json.mergedPerformers} artists, +${json.mergedWorks} works)!`
        );
      } else {
        showToast("success", `Published "${cp.title}" to the World Stage map!`);
      }
      loadStageAdmin();
      onCatalogChanged();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDismissConcertProposal(cp: ConcertEventProposal) {
    setBusyKey(`cp:${cp.id}`);
    await supabase
      .from("concert_event_proposals")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("id", cp.id);
    setBusyKey(null);
    loadStageAdmin();
  }

  // Work & Composer approvals (existing catalog_suggestions)
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

  async function handleApproveComposerSuggestion(
    sug: CatalogSuggestion,
    withWorksImport: boolean
  ) {
    setBusyKey(`sug:${sug.id}`);
    try {
      const composerId = await ensureOrCreateComposer(sug);
      if (!composerId) return;

      let importSummary = "";
      if (withWorksImport) {
        const token = await getAdminToken();
        if (token) {
          const r = await fetch("/api/admin/import-composer-works", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ composerId }),
          });
          if (r.ok) {
            const j = (await r.json()) as {
              importedWorks?: number;
              linkedImslpScores?: number;
            };
            importSummary = ` + ${j.importedWorks ?? 0} works (${j.linkedImslpScores ?? 0} IMSLP scores)`;
          }
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
      setBusyKey(null);
    }
  }

  async function handleApproveWorkSuggestion(sug: CatalogSuggestion) {
    setBusyKey(`sug:${sug.id}`);
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
      setBusyKey(null);
    }
  }

  async function handleLinkToExistingWork(
    sug: CatalogSuggestion,
    targetWorkId: number
  ) {
    setBusyKey(`sug:${sug.id}`);
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

    setBusyKey(null);
    setLinkingSug(null);
    setLinkSearch("");
    showToast("success", "Linked to existing library work!");
    loadStageAdmin();
  }

  async function handleDismissWorkSuggestion(sug: CatalogSuggestion) {
    setBusyKey(`sug:${sug.id}`);
    await supabase
      .from("catalog_suggestions")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("id", sug.id);
    setBusyKey(null);
    loadStageAdmin();
    onCatalogChanged();
  }

  // =========================================================================
  // CRAWLER & QUICK PROPOSAL TRIGGERS
  // =========================================================================
  async function callImportApi(payload: Record<string, unknown>) {
    setImporting(true);
    try {
      const token = await getAdminToken();
      if (!token) return;

      const res = await fetch("/api/admin/import-season", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        error?: string;
        stagedNewConcerts?: number;
        stagedMergeCandidates?: number;
        skippedDuplicates?: number;
        proposedPerformers?: number;
        proposedVenues?: number;
        proposedWorks?: number;
      };
      if (!res.ok) {
        showToast("error", data.error || "Import failed.");
        return;
      }

      if (payload.mode === "manual") {
        showToast(
          "success",
          `Published concert! (${data.proposedPerformers || 0} artist & ${data.proposedWorks || 0} work proposals queued)`
        );
      } else {
        showToast(
          "success",
          `Staged ${data.stagedNewConcerts ?? 0} new concerts · ${data.stagedMergeCandidates ?? 0} merge candidates · ${data.skippedDuplicates ?? 0} duplicates skipped · ${(data.proposedPerformers ?? 0) + (data.proposedVenues ?? 0)} artist/venue proposals!`
        );
      }
      loadStageAdmin();
      onCatalogChanged();
    } finally {
      setImporting(false);
    }
  }

  async function handleQuickProposeEntity(e: React.FormEvent) {
    e.preventDefault();
    if (!quickEntityName.trim()) return;
    setCreatingEntityProp(true);
    try {
      const params = new URLSearchParams({
        type: quickEntityType,
        q: quickEntityName.trim(),
        ...(quickEntityCity.trim() ? { city: quickEntityCity.trim() } : {}),
      });
      const res = await fetch(`/api/v1/suggest/lookup?${params.toString()}`);
      const json = res.ok
        ? ((await res.json()) as {
            candidates?: (EnrichedPerformerCandidate & EnrichedVenueCandidate)[];
          })
        : { candidates: [] };
      const top = json.candidates?.[0] || null;

      const dedupKey = `${quickEntityType}::${slugify(quickEntityName)}${
        quickEntityType === "venue" && quickEntityCity.trim()
          ? `::${slugify(quickEntityCity)}`
          : ""
      }`;

      const insertPayload: Database["public"]["Tables"]["stage_entity_proposals"]["Insert"] =
        quickEntityType === "performer"
          ? {
              entity_type: "performer",
              dedup_key: dedupKey,
              status: "pending",
              source_type: "admin_crawl",
              source_context: "Proposed in Admin Panel",
              source_url: top?.source_url || null,
              name: top?.name || quickEntityName.trim(),
              performer_type: top?.performer_type || "soloist",
              instrument_or_role: top?.instrument_or_role || "Soloist",
              nationality: top?.nationality || null,
              city: top?.home_city || quickEntityCity.trim() || null,
              website_url: top?.website_url || null,
              calendar_url: top?.calendar_url || null,
              photo_url: top?.avatar_url || null,
              short_bio: top?.short_bio || null,
              wikidata_qid: top?.wikidata_qid || null,
            }
          : {
              entity_type: "venue",
              dedup_key: dedupKey,
              status: "pending",
              source_type: "admin_crawl",
              source_context: "Proposed in Admin Panel",
              source_url: top?.source_url || null,
              name: top?.name || quickEntityName.trim(),
              short_name:
                top?.short_name || quickEntityName.trim().slice(0, 32),
              city: top?.city || quickEntityCity.trim() || "Unknown City",
              country: top?.country || "International",
              country_code: top?.country_code || null,
              latitude: top?.latitude ?? null,
              longitude: top?.longitude ?? null,
              capacity: top?.capacity ?? null,
              opened_year: top?.opened_year ?? null,
              architect_or_acoustics: top?.architect_or_acoustics ?? null,
              website_url: top?.website_url || null,
              calendar_url: top?.calendar_url || null,
              photo_url: top?.photo_url || null,
              short_bio: top?.short_bio || null,
              wikidata_qid: top?.wikidata_qid || null,
            };

      const { error } = await supabase
        .from("stage_entity_proposals")
        .upsert(insertPayload, { onConflict: "dedup_key" });

      if (error) {
        showToast("error", error.message);
        return;
      }

      setQuickEntityName("");
      setQuickEntityCity("");
      setInboxCategory(
        quickEntityType === "performer" ? "performers" : "venues"
      );
      setStatusFilter("pending");
      showToast(
        "success",
        `Auto-fetched & staged ${quickEntityType} "${insertPayload.name}" for review!`
      );
      loadStageAdmin();
    } finally {
      setCreatingEntityProp(false);
    }
  }

  // =========================================================================
  // FILTERED QUEUES & COUNTS
  // =========================================================================
  const matchStatus = (rowStatus: string) => {
    if (statusFilter === "linked") {
      return rowStatus === "linked" || rowStatus === "merged";
    }
    return rowStatus === statusFilter;
  };

  const pendingWorksCount = suggestions.filter(
    (s) => s.status === "pending"
  ).length;
  const pendingPerformersCount = entityProposals.filter(
    (p) => p.status === "pending" && p.entity_type === "performer"
  ).length;
  const pendingVenuesCount = entityProposals.filter(
    (p) => p.status === "pending" && p.entity_type === "venue"
  ).length;
  const pendingConcertsCount = concertProposals.filter(
    (c) => c.status === "pending"
  ).length;
  const totalPendingCount =
    pendingWorksCount +
    pendingPerformersCount +
    pendingVenuesCount +
    pendingConcertsCount;

  const visibleConcerts =
    inboxCategory === "all" || inboxCategory === "concerts"
      ? concertProposals.filter((c) => matchStatus(c.status))
      : [];

  const visiblePerformers =
    inboxCategory === "all" || inboxCategory === "performers"
      ? entityProposals.filter(
          (p) => p.entity_type === "performer" && matchStatus(p.status)
        )
      : [];

  const visibleVenues =
    inboxCategory === "all" || inboxCategory === "venues"
      ? entityProposals.filter(
          (p) => p.entity_type === "venue" && matchStatus(p.status)
        )
      : [];

  const visibleWorks =
    inboxCategory === "all" || inboxCategory === "works"
      ? suggestions.filter((s) => matchStatus(s.status))
      : [];

  const totalVisible =
    visibleConcerts.length +
    visiblePerformers.length +
    visibleVenues.length +
    visibleWorks.length;

  const composerById = new Map(composers.map((c) => [c.id, c]));
  const venueById = new Map(venues.map((v) => [v.id, v]));
  const liveEventById = new Map(liveEvents.map((e) => [e.id, e]));
  const syncedVenuesCount = venues.filter((v) => v.last_synced_at).length;

  return (
    <div className="space-y-8">
      {/* =================================================================== */}
      {/* 1. UNIFIED WORLD STAGE & CATALOG MODERATION INBOX                   */}
      {/* =================================================================== */}
      <section className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#9a7432] dark:text-[#d4af6a]" />
              World Stage &amp; Catalog Moderation Inbox ({totalPendingCount}{" "}
              pending)
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Review staged concerts &amp; cross-source merge diffs, proposed
              soloists/conductors/orchestras, new tour venues, and missing
              works.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {statusFilter === "pending" && totalPendingCount > 0 && (
              <button
                type="button"
                disabled={enrichingAll || enrichingKey !== null}
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

            {/* Status filter pills */}
            <div className="flex flex-wrap gap-1">
              {(["pending", "approved", "linked", "dismissed"] as const).map(
                (st) => (
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
                    {st === "linked" ? "Merged / Linked" : st}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-[#f3efe8] dark:bg-[#12100e] border border-stone-200 dark:border-stone-800">
          {(
            [
              { id: "all", label: `All (${totalPendingCount})` },
              {
                id: "concerts",
                label: `Staged Concerts & Merges (${pendingConcertsCount})`,
              },
              {
                id: "performers",
                label: `Performers (${pendingPerformersCount})`,
              },
              { id: "venues", label: `Venues (${pendingVenuesCount})` },
              {
                id: "works",
                label: `Works & Composers (${pendingWorksCount})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setInboxCategory(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                inboxCategory === tab.id
                  ? "bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e]"
                  : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
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
        ) : totalVisible === 0 ? (
          <p className="py-8 text-center text-xs text-stone-500">
            No {statusFilter} items in this category. Use the Crawler Deck below
            to fetch venue seasons or artist tour calendars!
          </p>
        ) : (
          <div className="space-y-4">
            {/* ============================================================= */}
            {/* A. STAGED CONCERTS & CROSS-SOURCE MERGE CANDIDATES            */}
            {/* ============================================================= */}
            {visibleConcerts.map((cp) => {
              const isBusy = busyKey === `cp:${cp.id}`;
              const dupEvent = cp.duplicate_of_event_id
                ? liveEventById.get(cp.duplicate_of_event_id)
                : null;
              const matchedVenue = cp.matched_venue_id
                ? venueById.get(cp.matched_venue_id)
                : null;
              const perfs = Array.isArray(cp.performers_payload)
                ? (cp.performers_payload as unknown as StagedPerformerPayloadItem[])
                : [];
              const works = Array.isArray(cp.works_payload)
                ? (cp.works_payload as unknown as StagedWorkPayloadItem[])
                : [];

              return (
                <div
                  key={`cp-${cp.id}`}
                  className={`p-4 sm:p-5 rounded-2xl border space-y-3.5 ${
                    dupEvent
                      ? "bg-amber-500/5 dark:bg-[#19150f] border-amber-500/40"
                      : "bg-[#faf8f4] dark:bg-[#141210] border-stone-200/80 dark:border-stone-800"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      {dupEvent ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40">
                          <GitMerge className="w-3 h-3" />
                          Merge Diff ({cp.match_confidence}% match)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          <Calendar className="w-3 h-3" />
                          Staged Concert
                        </span>
                      )}

                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                        {cp.source_label || cp.source_kind}
                      </span>

                      {cp.source_url && (
                        <a
                          href={cp.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#9a7432] dark:text-[#d4af6a] hover:underline"
                        >
                          Source
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>

                    <span className="font-mono text-[11px] text-stone-500">
                      {cp.starts_at.slice(0, 16).replace("T", " ")}
                    </span>
                  </div>

                  {/* Side-by-Side Comparison Banner if Duplicate/Merge Candidate */}
                  {dupEvent && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
                      <p className="font-semibold text-amber-900 dark:text-amber-200">
                        {cp.match_summary ||
                          `Same venue & date as existing Concert #${dupEvent.id}: "${dupEvent.title}"`}
                      </p>
                      <p className="text-[11px] text-stone-600 dark:text-stone-400">
                        Existing on map: <strong>{dupEvent.title}</strong> (
                        {dupEvent.starts_at.slice(0, 10)}) — Merging appends new
                        performers, works &amp; direct ticket URL without
                        creating a duplicate pin!
                      </p>
                    </div>
                  )}

                  {cp.status === "pending" ? (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <input
                          type="text"
                          value={cp.title}
                          onChange={(e) =>
                            updateLocalConcertProposal(cp.id, {
                              title: e.target.value,
                            })
                          }
                          placeholder="Concert Title"
                          className="sm:col-span-5 px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 font-semibold text-stone-900 dark:text-stone-100"
                        />
                        <input
                          type="text"
                          value={cp.starts_at}
                          onChange={(e) =>
                            updateLocalConcertProposal(cp.id, {
                              starts_at: e.target.value,
                            })
                          }
                          placeholder="ISO Date"
                          className="sm:col-span-3 px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 font-mono text-stone-900 dark:text-stone-100"
                        />
                        <select
                          value={cp.matched_venue_id ?? ""}
                          onChange={(e) =>
                            updateLocalConcertProposal(cp.id, {
                              matched_venue_id: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                          className="sm:col-span-4 px-2.5 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        >
                          <option value="">
                            {cp.raw_venue_name
                              ? `Unmatched Venue: ${cp.raw_venue_name} (${cp.raw_city || "propose venue"})`
                              : "Select Concert Hall..."}
                          </option>
                          {venues.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.short_name || v.name} — {v.city}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Roster & Program preview pills */}
                      <div className="flex flex-wrap gap-1.5">
                        {matchedVenue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-stone-200/70 dark:bg-stone-800 text-[11px] text-stone-700 dark:text-stone-300">
                            <MapPin className="w-3 h-3 text-[#d4af6a]" />
                            {matchedVenue.short_name || matchedVenue.name} (
                            {matchedVenue.city})
                          </span>
                        )}
                        {perfs.map((p, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-0.5 rounded-lg text-[11px] border ${
                              p.matched_performer_id
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                            }`}
                          >
                            {p.name}{" "}
                            {p.matched_performer_id
                              ? "✓"
                              : "(proposed in Performers)"}
                          </span>
                        ))}
                        {works.map((w, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-0.5 rounded-lg text-[11px] border ${
                              w.matched_work_id
                                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                            }`}
                          >
                            {w.composerName}: {w.workTitle}{" "}
                            {w.matched_work_id ? "✓" : "(proposed in Works)"}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {dupEvent ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleApproveOrMergeConcert(cp, "merge_concert")
                              }
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 text-[#11100e] text-xs font-bold hover:opacity-90 cursor-pointer disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <GitMerge className="w-3.5 h-3.5" />
                              )}
                              Merge Additions into Concert #{dupEvent.id}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleApproveOrMergeConcert(
                                  cp,
                                  "approve_concert"
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 cursor-pointer"
                            >
                              Publish as Separate Date
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleApproveOrMergeConcert(cp, "approve_concert")
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Approve &amp; Publish to World Stage
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDismissConcertProposal(cp)}
                          className="px-3 py-1.5 rounded-xl text-xs text-stone-500 hover:text-red-500 cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                      {cp.title} — {cp.starts_at.slice(0, 10)} ({cp.status})
                    </p>
                  )}
                </div>
              );
            })}

            {/* ============================================================= */}
            {/* B. PERFORMER PROPOSALS (Soloists, Conductors, Orchestras)     */}
            {/* ============================================================= */}
            {visiblePerformers.map((prop) => {
              const key = `ent:${prop.id}`;
              const isBusy = busyKey === key;
              const isEnriching = enrichingKey === key;

              return (
                <div
                  key={`perf-${prop.id}`}
                  className="p-4 sm:p-5 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/80 dark:border-stone-800 space-y-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                        <Users className="w-3 h-3" />
                        Performer · {prop.performer_type || "soloist"}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                        {prop.source_context || prop.source_type}
                      </span>
                      {enrichedSources[key]?.length ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                          via {enrichedSources[key].join(" · ")}
                        </span>
                      ) : null}
                    </div>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                      {prop.occurrence_count}× spotted
                    </span>
                  </div>

                  {prop.status === "pending" ? (
                    <div className="space-y-3 text-xs">
                      <div className="flex items-start gap-3">
                        <ComposerAvatar
                          name={prop.name}
                          avatarUrl={prop.photo_url}
                          era="Romantic"
                          size="md"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 flex-1">
                          <input
                            type="text"
                            value={prop.name}
                            onChange={(e) =>
                              updateLocalEntityProposal(prop.id, {
                                name: e.target.value,
                              })
                            }
                            placeholder="Artist / Orchestra Name"
                            className="sm:col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 font-semibold text-stone-900 dark:text-stone-100"
                          />
                          <select
                            value={prop.performer_type || "soloist"}
                            onChange={(e) =>
                              updateLocalEntityProposal(prop.id, {
                                performer_type: e.target.value,
                              })
                            }
                            className="px-2.5 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                          >
                            {PERFORMER_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={prop.instrument_or_role || ""}
                            onChange={(e) =>
                              updateLocalEntityProposal(prop.id, {
                                instrument_or_role: e.target.value,
                              })
                            }
                            placeholder="Instrument / Role (e.g. Piano)"
                            className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <input
                          type="text"
                          value={prop.nationality || ""}
                          onChange={(e) =>
                            updateLocalEntityProposal(prop.id, {
                              nationality: e.target.value,
                            })
                          }
                          placeholder="Nationality"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        />
                        <input
                          type="url"
                          value={prop.website_url || ""}
                          onChange={(e) =>
                            updateLocalEntityProposal(prop.id, {
                              website_url: e.target.value,
                            })
                          }
                          placeholder="Official Website URL"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        />
                        <input
                          type="url"
                          value={prop.calendar_url || ""}
                          onChange={(e) =>
                            updateLocalEntityProposal(prop.id, {
                              calendar_url: e.target.value,
                            })
                          }
                          placeholder="Tour / Concert Calendar URL"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        />
                        <input
                          type="url"
                          value={prop.photo_url || ""}
                          onChange={(e) =>
                            updateLocalEntityProposal(prop.id, {
                              photo_url: e.target.value,
                            })
                          }
                          placeholder="Portrait Photo URL"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        />
                      </div>

                      <textarea
                        rows={2}
                        value={prop.short_bio || ""}
                        onChange={(e) =>
                          updateLocalEntityProposal(prop.id, {
                            short_bio: e.target.value,
                          })
                        }
                        placeholder="Short artist / orchestra biography..."
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                      />

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleApproveEntity(prop, true)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          Approve + Crawl Tour Dates
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleApproveEntity(prop, false)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#d4af6a] cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve Profile Only
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || isEnriching}
                          onClick={() => handleEnrichEntityProposal(prop)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#d4af6a]/40 bg-[#d4af6a]/10 text-[#9a7432] dark:text-[#e3c27d] text-xs font-semibold hover:bg-[#d4af6a]/20 cursor-pointer disabled:opacity-50"
                        >
                          {isEnriching ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          Auto-fetch Bio, Website &amp; Tour URL
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDismissEntity(prop)}
                          className="px-3 py-1.5 rounded-xl text-xs text-stone-500 hover:text-red-500 cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs">
                      <strong>{prop.name}</strong>
                      <Link
                        href={`/stage/artists/${slugify(prop.name)}`}
                        target="_blank"
                        className="text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                      >
                        Open Artist Page <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ============================================================= */}
            {/* C. VENUE PROPOSALS (Tour Halls Outside Top 100)               */}
            {/* ============================================================= */}
            {visibleVenues.map((prop) => {
              const key = `ent:${prop.id}`;
              const isBusy = busyKey === key;
              const isEnriching = enrichingKey === key;

              return (
                <div
                  key={`ven-${prop.id}`}
                  className="p-4 sm:p-5 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/80 dark:border-stone-800 space-y-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                        <Building2 className="w-3 h-3" />
                        Proposed Tour Venue
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                        {prop.source_context || prop.source_type}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                      {prop.occurrence_count}× spotted
                    </span>
                  </div>

                  {prop.status === "pending" ? (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <input
                          type="text"
                          value={prop.name}
                          onChange={(e) =>
                            updateLocalEntityProposal(prop.id, {
                              name: e.target.value,
                            })
                          }
                          placeholder="Concert Hall Name"
                          className="sm:col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 font-semibold text-stone-900 dark:text-stone-100"
                        />
                        <input
                          type="text"
                          value={prop.city || ""}
                          onChange={(e) =>
                            updateLocalEntityProposal(prop.id, {
                              city: e.target.value,
                            })
                          }
                          placeholder="City"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        />
                        <input
                          type="text"
                          value={prop.country || ""}
                          onChange={(e) =>
                            updateLocalEntityProposal(prop.id, {
                              country: e.target.value,
                            })
                          }
                          placeholder="Country"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <input
                          type="number"
                          step="any"
                          value={prop.latitude ?? ""}
                          onChange={(e) =>
                            updateLocalEntityProposal(prop.id, {
                              latitude: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                          placeholder="Latitude"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 font-mono text-stone-900 dark:text-stone-100"
                        />
                        <input
                          type="number"
                          step="any"
                          value={prop.longitude ?? ""}
                          onChange={(e) =>
                            updateLocalEntityProposal(prop.id, {
                              longitude: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                          placeholder="Longitude"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 font-mono text-stone-900 dark:text-stone-100"
                        />
                        <input
                          type="url"
                          value={prop.website_url || ""}
                          onChange={(e) =>
                            updateLocalEntityProposal(prop.id, {
                              website_url: e.target.value,
                            })
                          }
                          placeholder="Website URL"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        />
                        <input
                          type="url"
                          value={prop.calendar_url || ""}
                          onChange={(e) =>
                            updateLocalEntityProposal(prop.id, {
                              calendar_url: e.target.value,
                            })
                          }
                          placeholder="Calendar URL"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleApproveEntity(prop, false)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <MapPin className="w-3.5 h-3.5" />
                          )}
                          Approve &amp; Pin Hall to World Map
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || isEnriching}
                          onClick={() => handleEnrichEntityProposal(prop)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#d4af6a]/40 bg-[#d4af6a]/10 text-[#9a7432] dark:text-[#e3c27d] text-xs font-semibold hover:bg-[#d4af6a]/20 cursor-pointer"
                        >
                          {isEnriching ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          Auto-fetch Coordinates &amp; Metadata
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDismissEntity(prop)}
                          className="px-3 py-1.5 rounded-xl text-xs text-stone-500 hover:text-red-500 cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold">
                      {prop.name} — {prop.city}, {prop.country}
                    </p>
                  )}
                </div>
              );
            })}

            {/* ============================================================= */}
            {/* D. WORK & COMPOSER PROPOSALS (`catalog_suggestions`)          */}
            {/* ============================================================= */}
            {visibleWorks.map((sug) => {
              const isComposerProposal = sug.suggestion_type === "composer";
              const isUserSearch = sug.source_type === "user_search";
              const matchedComp = sug.matched_composer_id
                ? composerById.get(sug.matched_composer_id)
                : null;
              const key = `sug:${sug.id}`;
              const isBusy = busyKey === key;
              const isEnriching = enrichingKey === key;

              return (
                <div
                  key={`sug-${sug.id}`}
                  className="p-4 sm:p-5 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/80 dark:border-stone-800 space-y-3.5"
                >
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

                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
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
                            New Composer
                          </span>
                        ))}
                    </div>
                  </div>

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
                            disabled={isBusy || isEnriching}
                            onClick={() => handleEnrichWorkOrComposer(sug)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#d4af6a]/40 bg-[#d4af6a]/10 text-[#9a7432] dark:text-[#e3c27d] text-xs font-semibold hover:bg-[#d4af6a]/20 cursor-pointer"
                          >
                            {isEnriching ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            Auto-fetch Metadata
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDismissWorkSuggestion(sug)}
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
                            disabled={isBusy || isEnriching}
                            onClick={() => handleEnrichWorkOrComposer(sug)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#d4af6a]/40 bg-[#d4af6a]/10 text-[#9a7432] dark:text-[#e3c27d] text-xs font-semibold hover:bg-[#d4af6a]/20 cursor-pointer"
                          >
                            {isEnriching ? (
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
                            onClick={() => handleDismissWorkSuggestion(sug)}
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
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* 2. TOP-100 VENUE CRAWLER, ARTIST TOUR FETCHER & MANUAL STAGE TOOLS  */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Card: Automated Crawlers (Top 100 Venues + Artist Tour Calendars + URL) */}
        <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-5 text-xs">
          <div>
            <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-[#d4af6a]" />
              Top-100 Venues &amp; Artist Tour Crawler
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              All crawled concerts &amp; tour dates are staged in the inbox
              above with cross-source duplicate detection ({syncedVenuesCount} /{" "}
              {venues.length} halls synced).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={importing}
              onClick={() => callImportApi({ mode: "venue_batch", batchSize: 8 })}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] font-semibold cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${importing ? "animate-spin" : ""}`}
              />
              Crawl Next 8 Top-100 Venues
            </button>

            <button
              type="button"
              disabled={importing}
              onClick={() => callImportApi({ mode: "nyphil_live" })}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-700 hover:border-[#d4af6a] font-semibold text-stone-900 dark:text-[#f3efe6] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#d4af6a] ${
                  importing ? "animate-spin" : ""
                }`}
              />
              Crawl NY Philharmonic Feed
            </button>
          </div>

          {/* Crawl Specific Artist / Orchestra Tour Website */}
          <div className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-2">
            <label className="block font-semibold text-stone-800 dark:text-stone-200">
              Crawl Soloist / Conductor / Orchestra Tour Website:
            </label>
            <div className="flex gap-2">
              <select
                value={tourPerformerId}
                onChange={(e) => setTourPerformerId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              >
                <option value="">Select cataloged artist or orchestra...</option>
                {performers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.instrument_or_role || p.performer_type})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={importing || !tourPerformerId}
                onClick={() =>
                  callImportApi({
                    mode: "artist_tour",
                    performerId: Number(tourPerformerId),
                  })
                }
                className="px-3.5 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-[#d4af6a]/50 text-[#9a7432] dark:text-[#e3c27d] font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                Fetch Tour Dates
              </button>
            </div>
          </div>

          {/* Custom URL Importer */}
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
            className="space-y-2.5 pt-3 border-t border-stone-100 dark:border-stone-800"
          >
            <label className="block font-semibold text-stone-800 dark:text-stone-200">
              Crawl Any Venue Calendar, Artist Tour URL, or .ics Feed:
            </label>
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://... (JSON-LD, Next/CMS JSON, HTML schedule, or .ics)"
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
                    {v.short_name || v.name} ({v.city})
                  </option>
                ))}
              </select>
              <select
                value={defaultPerformerId}
                onChange={(e) => setDefaultPerformerId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              >
                <option value="">Optional Artist Context...</option>
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
              className="px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] font-semibold cursor-pointer disabled:opacity-50"
            >
              {importing ? "Crawling & Comparing..." : "Crawl & Stage in Inbox"}
            </button>
          </form>
        </div>

        {/* Right Card: Quick Auto-Fetch Performer/Venue Proposal + Manual Concert Creator */}
        <div className="space-y-6">
          <form
            onSubmit={handleQuickProposeEntity}
            className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-3 text-xs"
          >
            <div>
              <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#d4af6a]" />
                Propose &amp; Auto-Enrich New Performer or Venue
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Type any soloist, conductor, orchestra, or concert hall — we
                auto-fetch their bio, website, tour URL, photo &amp; coordinates
                into the inbox above.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <select
                value={quickEntityType}
                onChange={(e) =>
                  setQuickEntityType(e.target.value as "performer" | "venue")
                }
                className="sm:col-span-3 px-2.5 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 font-semibold"
              >
                <option value="performer">Performer</option>
                <option value="venue">Venue</option>
              </select>
              <input
                type="text"
                required
                value={quickEntityName}
                onChange={(e) => setQuickEntityName(e.target.value)}
                placeholder={
                  quickEntityType === "performer"
                    ? "e.g. Augustin Hadelich, Mirga Gražinytė-Tyla, Berliner..."
                    : "e.g. Konzerthaus Dortmund, Teatro Real..."
                }
                className="sm:col-span-6 px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              />
              <input
                type="text"
                value={quickEntityCity}
                onChange={(e) => setQuickEntityCity(e.target.value)}
                placeholder="City (optional)"
                className="sm:col-span-3 px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100"
              />
            </div>

            <button
              type="submit"
              disabled={creatingEntityProp || !quickEntityName.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] font-semibold cursor-pointer disabled:opacity-50"
            >
              {creatingEntityProp ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Auto-Fetch &amp; Propose in Inbox
            </button>
          </form>

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
                Direct Concert Publisher
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Enter one piece per line as{" "}
                <code className="font-mono">Composer: Work Title</code>.
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
                    {v.short_name || v.name} ({v.city})
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
              rows={2}
              value={manualProgram}
              onChange={(e) => setManualProgram(e.target.value)}
              placeholder={
                "Antonín Dvořák: Cello Concerto in B minor, Op. 104\nUnsuk Chin: Cello Concerto"
              }
              className="w-full px-3 py-2 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 font-mono text-[11px]"
            />

            <button
              type="submit"
              disabled={importing}
              className="px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] font-semibold cursor-pointer"
            >
              Publish Concert &amp; Match Repertoire
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
