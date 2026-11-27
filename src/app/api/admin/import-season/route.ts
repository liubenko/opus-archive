import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  buildComposerMatcher,
  buildWorkMatcher,
  extractCatalog,
  normalizeText,
  slugify,
} from "../../../../../scripts/lib/dedup.mjs";
import {
  buildSuggestionMetadata,
  parseIcsCalendar,
  parseMusicEventsFromHtml,
  parseNyPhilPrograms,
  splitComposerAndWork,
} from "../../../../../scripts/lib/season-parser.mjs";

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
    mode?: "url" | "nyphil_live" | "manual";
    url?: string;
    defaultVenueId?: number;
    defaultPerformerId?: number;
    manualEvent?: {
      title: string;
      startsAt: string;
      venueId: number;
      performerIds: number[];
      programText: string;
      ticketUrl?: string;
    };
  };

  // Load venues, performers, composers & works
  const [venuesRes, performersRes, composersRes] = await Promise.all([
    client.from("venues").select("*"),
    client.from("performers").select("*"),
    client
      .from("composers")
      .select("id, name, full_name, sort_name, slug, birth_year, death_year"),
  ]);

  const venues = venuesRes.data ?? [];
  const performers = performersRes.data ?? [];
  const composers = composersRes.data ?? [];

  // Paginate works cleanly
  const allWorks: {
    id: number;
    composer_id: number;
    title: string;
    slug: string | null;
    catalog_system: string | null;
    catalog_number: string | null;
  }[] = [];
  let from = 0;
  while (true) {
    const { data } = await client
      .from("works")
      .select("id, composer_id, title, slug, catalog_system, catalog_number")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    allWorks.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const composerMatcher = buildComposerMatcher(composers);
  const worksByComp = new Map<number, typeof allWorks>();
  for (const w of allWorks) {
    const arr = worksByComp.get(w.composer_id) ?? [];
    arr.push(w);
    worksByComp.set(w.composer_id, arr);
  }
  const workMatchers = new Map<
    number,
    ReturnType<typeof buildWorkMatcher>
  >();
  for (const [cid, list] of worksByComp.entries()) {
    workMatchers.set(cid, buildWorkMatcher(list));
  }

  type NormalizedIncoming = {
    externalKey?: string;
    title: string;
    subtitle?: string | null;
    startsAt: string;
    venueId?: number;
    venueName?: string | null;
    sourceUrl?: string | null;
    ticketUrl?: string | null;
    performerIds?: number[];
    performers?: { name: string; role: string; instrument?: string | null }[];
    works: { composerName: string; workTitle: string }[];
  };

  const incoming: NormalizedIncoming[] = [];

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
    const parsed = parseNyPhilPrograms(json, "2026-10-15").slice(-14);
    incoming.push(...parsed);
  } else if (body.mode === "manual" && body.manualEvent) {
    const me = body.manualEvent;
    const works = me.programText
      .split(/\r?\n/)
      .map((l) => splitComposerAndWork(l))
      .filter(
        (x): x is { composerName: string; workTitle: string } => Boolean(x)
      );
    incoming.push({
      title: me.title,
      startsAt: me.startsAt,
      venueId: me.venueId,
      performerIds: me.performerIds,
      ticketUrl: me.ticketUrl || null,
      sourceUrl: me.ticketUrl || null,
      works,
    });
  } else if (body.url) {
    const res = await fetch(body.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OpusArchiveSeasonSync/1.0; +https://github.com/liubenko/opus-archive)",
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Target URL returned HTTP ${res.status}` },
        { status: 502 }
      );
    }
    const text = await res.text();
    const parsed =
      body.url.endsWith(".ics") || text.includes("BEGIN:VCALENDAR")
        ? parseIcsCalendar(text, body.url)
        : parseMusicEventsFromHtml(text, body.url);

    for (const p of parsed) {
      incoming.push({
        ...p,
        works: (p.works || []).filter(
          (x): x is { composerName: string; workTitle: string } => Boolean(x)
        ),
        venueId: body.defaultVenueId,
        performerIds: body.defaultPerformerId ? [body.defaultPerformerId] : [],
      });
    }
  } else {
    return NextResponse.json(
      { error: "Provide url, manualEvent, or mode='nyphil_live'." },
      { status: 400 }
    );
  }

  let importedEvents = 0;
  let matchedWorks = 0;
  let queuedSuggestions = 0;
  const nowIso = new Date().toISOString();

  for (const ev of incoming) {
    let venue = ev.venueId
      ? venues.find((v) => v.id === ev.venueId)
      : undefined;
    if (!venue && ev.venueName) {
      const nv = normalizeText(ev.venueName);
      venue = venues.find(
        (v) =>
          nv.includes(normalizeText(v.short_name || v.name)) ||
          normalizeText(v.name).includes(nv)
      );
    }
    if (!venue) continue;

    const extKey =
      ev.externalKey ||
      `${venue.slug}:${String(ev.startsAt).slice(0, 10)}:${slugify(ev.title).slice(0, 40)}`;
    const evSlug = `${String(ev.startsAt).slice(0, 10)}-${venue.slug}-${slugify(ev.title).slice(0, 48)}`;

    const { data: savedEvent, error: evErr } = await client
      .from("concert_events")
      .upsert(
        {
          slug: evSlug,
          external_key: extKey,
          title: ev.title,
          subtitle: ev.subtitle || null,
          starts_at: ev.startsAt,
          season: "2026/27",
          venue_id: venue.id,
          source_url: ev.sourceUrl || venue.calendar_url,
          ticket_url: ev.ticketUrl || ev.sourceUrl || venue.calendar_url,
          status: "scheduled",
          updated_at: nowIso,
        },
        { onConflict: "external_key" }
      )
      .select("*")
      .single();

    if (evErr || !savedEvent) continue;
    importedEvents++;

    // Link explicit performer IDs
    const linkedPerfs: { id: number; name: string; role: string }[] = [];
    for (const pid of ev.performerIds ?? []) {
      const found = performers.find((p) => p.id === pid);
      if (found) {
        linkedPerfs.push({
          id: found.id,
          name: found.name,
          role: found.performer_type,
        });
      }
    }

    // Link parsed performers by name
    for (const pRef of ev.performers ?? []) {
      let found = performers.find(
        (p) => normalizeText(p.name) === normalizeText(pRef.name)
      );
      if (!found && pRef.name) {
        const { data: created } = await client
          .from("performers")
          .upsert(
            {
              slug: slugify(pRef.name),
              name: pRef.name,
              performer_type: pRef.role || "soloist",
              instrument_or_role: pRef.instrument || "Guest Artist",
              is_featured: false,
            },
            { onConflict: "slug" }
          )
          .select("*")
          .single();
        if (created) {
          performers.push(created);
          found = created;
        }
      }
      if (found && !linkedPerfs.some((lp) => lp.id === found.id)) {
        linkedPerfs.push({
          id: found.id,
          name: found.name,
          role: pRef.role || found.performer_type,
        });
      }
    }

    for (let i = 0; i < linkedPerfs.length; i++) {
      await client.from("concert_event_performers").upsert(
        {
          event_id: savedEvent.id,
          performer_id: linkedPerfs[i].id,
          billing_role: linkedPerfs[i].role,
          display_order: i + 1,
        },
        { onConflict: "event_id,performer_id,billing_role" }
      );
    }

    await client
      .from("concert_event_works")
      .delete()
      .eq("event_id", savedEvent.id);

    for (let wIdx = 0; wIdx < ev.works.length; wIdx++) {
      const wItem = ev.works[wIdx];
      const matchedComp = composerMatcher.findMatch({
        musicbrainz_id: undefined,
        openopus_id: undefined,
        name: wItem.composerName,
        full_name: wItem.composerName,
        sort_name: undefined,
        slug: slugify(wItem.composerName),
        birth_year: undefined,
        death_year: undefined,
      });

      let matchedWork: { id: number } | null = null;
      if (matchedComp) {
        const wm = workMatchers.get(matchedComp.id);
        const cat = extractCatalog(wItem.workTitle);
        if (wm) {
          matchedWork = wm.findMatch({
            musicbrainz_id: undefined,
            openopus_id: undefined,
            title: wItem.workTitle,
            catalog_system: cat.catalog_system,
            catalog_number: cat.catalog_number,
          });
        }
      }

      let suggestionId: number | null = null;
      if (matchedWork) {
        matchedWorks++;
      } else {
        const meta = buildSuggestionMetadata(
          wItem.composerName,
          wItem.workTitle
        );
        const perfName = linkedPerfs[0]?.name || venue.short_name || venue.name;
        const ctx = `Performed by ${perfName} at ${venue.short_name || venue.name} (${String(ev.startsAt).slice(0, 10)})`;

        const { data: exSug } = await client
          .from("catalog_suggestions")
          .select("*")
          .eq("dedup_key", meta.dedupKey)
          .maybeSingle();

        if (exSug) {
          suggestionId = exSug.id;
          if (exSug.resolved_work_id) {
            matchedWork = { id: exSug.resolved_work_id };
          } else {
            await client
              .from("catalog_suggestions")
              .update({
                occurrence_count: (exSug.occurrence_count || 1) + 1,
                updated_at: nowIso,
              })
              .eq("id", exSug.id);
          }
        } else {
          const { data: newSug } = await client
            .from("catalog_suggestions")
            .insert({
              dedup_key: meta.dedupKey,
              status: "pending",
              suggested_work_title: wItem.workTitle,
              suggested_composer_name: matchedComp?.name || wItem.composerName,
              matched_composer_id: matchedComp?.id ?? null,
              suggested_genre: meta.genre,
              suggested_catalog_display: meta.catalogDisplay,
              source_context: ctx,
              source_url: ev.sourceUrl || venue.calendar_url,
              sample_event_id: savedEvent.id,
              occurrence_count: 1,
            })
            .select("*")
            .single();
          if (newSug) {
            suggestionId = newSug.id;
            queuedSuggestions++;
          }
        }
      }

      await client.from("concert_event_works").insert({
        event_id: savedEvent.id,
        display_order: wIdx + 1,
        work_id: matchedWork?.id ?? null,
        composer_id: matchedComp?.id ?? null,
        raw_composer_name: matchedComp?.name || wItem.composerName,
        raw_work_title: wItem.workTitle,
        suggestion_id: matchedWork ? null : suggestionId,
      });
    }
  }

  return NextResponse.json({
    importedEvents,
    matchedWorks,
    queuedSuggestions,
  });
}
