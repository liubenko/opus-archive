import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  extractEventsMultiTier,
  fetchKyivPhilharmonicEvents,
  parseNyPhilPrograms,
  splitComposerAndWork,
} from "../../../../../scripts/lib/season-parser.mjs";
import { createPoliteSession } from "../../../../../scripts/lib/polite-fetcher.mjs";
import {
  resolvePerformerTourUrl,
  stageIncomingEvents,
  type IncomingStageEvent,
} from "@/lib/stage-staging";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing Bearer token." },
      { status: 401 }
    );
  }

  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authErr,
  } = await client.auth.getUser();

  if (authErr || !user || user.app_metadata?.role !== "admin") {
    return NextResponse.json(
      { error: "Admin privileges required." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "url" | "nyphil_live" | "artist_tour" | "venue_batch" | "manual";
    url?: string;
    defaultVenueId?: number;
    defaultPerformerId?: number;
    performerId?: number;
    batchSize?: number;
    manualEvent?: {
      title: string;
      startsAt: string;
      venueId: number;
      performerIds: number[];
      programText: string;
      ticketUrl?: string;
    };
  };

  // 1. Live NY Philharmonic Open Data Sync -> Staged in `/admin` with duplicate detection!
  if (body.mode === "nyphil_live") {
    const res = await fetch(
      "https://raw.githubusercontent.com/nyphilarchive/PerformanceHistory/main/Programs/json/2024-25_TO_NOW.json"
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch NYPhil archive (${res.status})` },
        { status: 502 }
      );
    }
    const json = await res.json();
    const parsed = parseNyPhilPrograms(json, "2026-10-15").slice(
      -18
    ) as IncomingStageEvent[];

    const summary = await stageIncomingEvents(client, parsed, {
      sourceKind: "venue_sync",
      sourceLabel: "NY Philharmonic Open Data",
      autoPublish: false,
    });

    return NextResponse.json({ mode: "nyphil_live", ...summary });
  }

  // 2. Crawl an Artist / Orchestra's Official Tour Website -> Propose Tour Dates & Merge Diffs in `/admin`!
  if (body.mode === "artist_tour" && body.performerId) {
    const { data: perf } = await client
      .from("performers")
      .select("*")
      .eq("id", body.performerId)
      .maybeSingle();

    if (!perf) {
      return NextResponse.json(
        { error: "Performer not found." },
        { status: 404 }
      );
    }

    const tourUrl = await resolvePerformerTourUrl(perf);
    if (!tourUrl) {
      return NextResponse.json(
        {
          error: `No website or tour calendar URL on file for ${perf.name}.`,
        },
        { status: 400 }
      );
    }

    if (tourUrl !== perf.calendar_url) {
      await client
        .from("performers")
        .update({ calendar_url: tourUrl })
        .eq("id", perf.id);
    }

    const polite = createPoliteSession({
      minDelayMs: 1200,
      maxDelayMs: 2600,
      timeoutMs: 9000,
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY || "",
    });
    const fetchRes = await polite.fetchText(tourUrl, {
      skipDelay: true,
      allowFirecrawlFallback: true,
    });
    if (!fetchRes.ok || !fetchRes.text) {
      return NextResponse.json(
        {
          error: fetchRes.blocked
            ? `Circuit breaker triggered for ${tourUrl} (${fetchRes.reason}). Stopped immediately to protect IP — wait until next run or crawl from a residential IP.`
            : `Could not reach ${tourUrl} (${fetchRes.reason || "timeout"}).`,
        },
        { status: fetchRes.blocked ? 429 : 502 }
      );
    }
    const html = fetchRes.text;

    const { events: rawEvents, tierUsed } = extractEventsMultiTier(
      html,
      tourUrl,
      { defaultTitlePrefix: perf.name }
    );

    const incoming: IncomingStageEvent[] = rawEvents.map((ev) => {
      const existingPerfs = ev.performers || [];
      const hasPrimary = existingPerfs.some(
        (p: { name?: string }) =>
          (p.name || "").toLowerCase() === perf.name.toLowerCase()
      );
      return {
        ...ev,
        performers: hasPrimary
          ? existingPerfs
          : [
              {
                id: perf.id,
                name: perf.name,
                role: perf.performer_type,
                instrument: perf.instrument_or_role,
              },
              ...existingPerfs,
            ],
      };
    });

    await client
      .from("performers")
      .update({
        last_synced_at: new Date().toISOString(),
        feed_type: tierUsed !== "none" ? tierUsed : perf.feed_type,
      })
      .eq("id", perf.id);

    const summary = await stageIncomingEvents(client, incoming, {
      sourceKind: "artist_tour",
      sourceLabel: `${perf.name} Tour Calendar`,
      autoPublish: false,
    });

    return NextResponse.json({
      mode: "artist_tour",
      performer: perf.name,
      tourUrl,
      tierUsed,
      extractedRawEvents: incoming.length,
      ...summary,
    });
  }

  // 3. Batch-Crawl Due Venues from our Top 100 Global Halls Directory!
  if (body.mode === "venue_batch") {
    const batchSize = Math.min(Math.max(body.batchSize || 6, 1), 12);
    const { data: dueVenues } = await client
      .from("venues")
      .select("*")
      .not("calendar_url", "is", null)
      .order("last_synced_at", { ascending: true, nullsFirst: true })
      .limit(batchSize);

    const targets = dueVenues ?? [];
    const totals = {
      crawledVenues: 0,
      venuesWithEvents: 0,
      stagedNewConcerts: 0,
      stagedMergeCandidates: 0,
      skippedDuplicates: 0,
      proposedPerformers: 0,
      proposedVenues: 0,
      proposedWorks: 0,
      blockedHosts: [] as { host: string; status: number; reason: string }[],
    };

    const polite = createPoliteSession({
      minDelayMs: 1200,
      maxDelayMs: 2800,
      timeoutMs: 7000,
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY || "",
    });

    const nowIso = new Date().toISOString();

    for (const v of targets) {
      totals.crawledVenues++;
      let incoming: IncomingStageEvent[] = [];
      let detectedFeed = v.feed_type;

      if (v.feed_type === "nyphil_json") {
        const r = await fetch(
          "https://raw.githubusercontent.com/nyphilarchive/PerformanceHistory/main/Programs/json/2024-25_TO_NOW.json"
        ).catch(() => null);
        if (r?.ok) {
          const j = await r.json();
          incoming = parseNyPhilPrograms(j, "2026-10-15").slice(
            -12
          ) as IncomingStageEvent[];
        }
      } else if (v.feed_type === "kyiv_phil_wp") {
        const kpEvents = (await fetchKyivPhilharmonicEvents(12)) as IncomingStageEvent[];
        incoming = kpEvents.map((ev) => ({
          ...ev,
          venueId: v.id,
          venueName: v.short_name || v.name,
          city: v.city,
          country: v.country,
        }));
      } else if (v.calendar_url) {
        const fetchRes = await polite.fetchText(v.calendar_url, {
          allowFirecrawlFallback: true,
        });
        if (fetchRes.ok && fetchRes.text) {
          const { events, tierUsed } = extractEventsMultiTier(
            fetchRes.text,
            v.calendar_url
          );
          if (tierUsed !== "none") detectedFeed = tierUsed;
          incoming = events.slice(0, 15).map((ev) => ({
            ...ev,
            venueId: v.id,
            venueName: v.short_name || v.name,
            city: v.city,
            country: v.country,
          }));
        }
      }

      await client
        .from("venues")
        .update({ last_synced_at: nowIso, feed_type: detectedFeed })
        .eq("id", v.id);

      if (incoming.length > 0) {
        totals.venuesWithEvents++;
        const sub = await stageIncomingEvents(client, incoming, {
          sourceKind: "venue_sync",
          sourceLabel: `${v.short_name || v.name} (${v.city})`,
          autoPublish: false,
        });
        totals.stagedNewConcerts += sub.stagedNewConcerts;
        totals.stagedMergeCandidates += sub.stagedMergeCandidates;
        totals.skippedDuplicates += sub.skippedDuplicates;
        totals.proposedPerformers += sub.proposedPerformers;
        totals.proposedVenues += sub.proposedVenues;
        totals.proposedWorks += sub.proposedWorks;
      }
    }

    totals.blockedHosts = polite.getBlockedSummary().map((b) => ({
      host: b.host,
      status: b.status,
      reason: b.reason,
    }));
    return NextResponse.json({ mode: "venue_batch", ...totals });
  }

  // 4. Manual Admin Concert Form -> Direct Publish
  if (body.mode === "manual" && body.manualEvent) {
    const me = body.manualEvent;
    const works = me.programText
      .split(/\r?\n/)
      .map((l) => splitComposerAndWork(l))
      .filter(
        (x): x is { composerName: string; workTitle: string } => Boolean(x)
      );

    const summary = await stageIncomingEvents(
      client,
      [
        {
          title: me.title,
          startsAt: me.startsAt,
          venueId: me.venueId,
          performers: (me.performerIds || []).map((id) => ({
            id,
            name: "",
            role: "soloist",
          })),
          ticketUrl: me.ticketUrl || null,
          sourceUrl: me.ticketUrl || null,
          works,
        },
      ],
      {
        sourceKind: "manual",
        sourceLabel: "Manual Admin Entry",
        autoPublish: true,
      }
    );

    return NextResponse.json({ mode: "manual", ...summary });
  }

  // 5. Custom URL (Venue Page, Artist Tour URL, or .ics) -> Staged in `/admin`
  if (body.url) {
    if (/philarmonia\.com\.ua/i.test(body.url)) {
      const kpEvents = (await fetchKyivPhilharmonicEvents(12)) as IncomingStageEvent[];
      const summary = await stageIncomingEvents(client, kpEvents, {
        sourceKind: "venue_sync",
        sourceLabel: "Kyiv Philharmonic (philarmonia.com.ua)",
        autoPublish: false,
      });
      return NextResponse.json({
        mode: "url",
        tierUsed: "kyiv_phil_wp",
        extractedRawEvents: kpEvents.length,
        ...summary,
      });
    }

    const polite = createPoliteSession({
      minDelayMs: 1200,
      maxDelayMs: 2600,
      timeoutMs: 9000,
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY || "",
    });
    const fetchRes = await polite.fetchText(body.url, {
      skipDelay: true,
      allowFirecrawlFallback: true,
    });
    if (!fetchRes.ok || !fetchRes.text) {
      return NextResponse.json(
        {
          error: fetchRes.blocked
            ? `Circuit breaker tripped for this host (${fetchRes.reason}) — stopped immediately to protect IP.`
            : `Target URL could not be fetched (${fetchRes.reason || "timeout"}).`,
        },
        { status: fetchRes.blocked ? 429 : 502 }
      );
    }
    const text = fetchRes.text;

    let defaultPerf: {
      id: number;
      name: string;
      performer_type: string;
      instrument_or_role: string | null;
    } | null = null;
    if (body.defaultPerformerId) {
      const { data } = await client
        .from("performers")
        .select("id, name, performer_type, instrument_or_role")
        .eq("id", body.defaultPerformerId)
        .maybeSingle();
      defaultPerf = data;
    }

    const { events: parsed, tierUsed } = extractEventsMultiTier(
      text,
      body.url,
      { defaultTitlePrefix: defaultPerf?.name || "" }
    );

    const incoming: IncomingStageEvent[] = parsed.map((p) => ({
      ...p,
      venueId: body.defaultVenueId || undefined,
      performers: [
        ...(defaultPerf
          ? [
              {
                id: defaultPerf.id,
                name: defaultPerf.name,
                role: defaultPerf.performer_type,
                instrument: defaultPerf.instrument_or_role,
              },
            ]
          : []),
        ...(p.performers || []),
      ],
    }));

    const hostLabel = (() => {
      try {
        return new URL(body.url).hostname.replace(/^www\./, "");
      } catch {
        return "Custom URL";
      }
    })();

    const summary = await stageIncomingEvents(client, incoming, {
      sourceKind: defaultPerf ? "artist_tour" : "url_import",
      sourceLabel: defaultPerf ? `${defaultPerf.name} (${hostLabel})` : hostLabel,
      autoPublish: false,
    });

    return NextResponse.json({
      mode: "url",
      tierUsed,
      extractedRawEvents: incoming.length,
      ...summary,
    });
  }

  return NextResponse.json(
    {
      error:
        "Provide mode ('nyphil_live' | 'artist_tour' | 'venue_batch' | 'manual') or url.",
    },
    { status: 400 }
  );
}
