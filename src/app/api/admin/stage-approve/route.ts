import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { slugify } from "../../../../../scripts/lib/dedup.mjs";
import { extractEventsMultiTier } from "../../../../../scripts/lib/season-parser.mjs";
import {
  resolvePerformerTourUrl,
  stageIncomingEvents,
  type StagedPerformerPayloadItem,
  type StagedWorkPayloadItem,
} from "@/lib/stage-staging";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const UA =
  "Mozilla/5.0 (compatible; OpusArchiveSeasonSync/2.0; +https://github.com/liubenko/opus-archive)";

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
    action?: "approve_entity" | "approve_concert" | "merge_concert";
    entityProposalId?: number;
    crawlTourAfter?: boolean;
    concertProposalId?: number;
  };

  const nowIso = new Date().toISOString();

  // =========================================================================
  // 1. APPROVE PERFORMER OR VENUE PROPOSAL (`stage_entity_proposals`)
  // =========================================================================
  if (body.action === "approve_entity" && body.entityProposalId) {
    const { data: prop } = await client
      .from("stage_entity_proposals")
      .select("*")
      .eq("id", body.entityProposalId)
      .maybeSingle();

    if (!prop) {
      return NextResponse.json(
        { error: "Entity proposal not found." },
        { status: 404 }
      );
    }

    if (prop.entity_type === "performer") {
      const pSlug = slugify(prop.name);
      const { data: savedPerf, error: pErr } = await client
        .from("performers")
        .upsert(
          {
            slug: pSlug,
            name: prop.name.trim(),
            performer_type: prop.performer_type || "soloist",
            instrument_or_role: prop.instrument_or_role || "Soloist",
            nationality: prop.nationality || null,
            home_city: prop.city || null,
            website_url: prop.website_url || null,
            calendar_url: prop.calendar_url || prop.website_url || null,
            avatar_url: prop.photo_url || null,
            short_bio:
              prop.short_bio ||
              `${prop.name} — performing artist on the Opus Archive World Stage.`,
            wikidata_qid: prop.wikidata_qid || null,
            is_featured: true,
            updated_at: nowIso,
          },
          { onConflict: "slug" }
        )
        .select("*")
        .single();

      if (pErr || !savedPerf) {
        return NextResponse.json(
          { error: pErr?.message || "Failed to create performer." },
          { status: 400 }
        );
      }

      await client
        .from("stage_entity_proposals")
        .update({
          status: "approved",
          resolved_performer_id: savedPerf.id,
          updated_at: nowIso,
        })
        .eq("id", prop.id);

      // Retroactively resolve `matched_performer_id` inside pending staged concerts
      const { data: pendingConcerts } = await client
        .from("concert_event_proposals")
        .select("id, performers_payload")
        .eq("status", "pending");

      for (const pc of pendingConcerts ?? []) {
        const arr = Array.isArray(pc.performers_payload)
          ? (pc.performers_payload as unknown as StagedPerformerPayloadItem[])
          : [];
        let changed = false;
        const updatedArr = arr.map((item) => {
          if (item.proposal_id === prop.id) {
            changed = true;
            return { ...item, matched_performer_id: savedPerf.id };
          }
          return item;
        });
        if (changed) {
          await client
            .from("concert_event_proposals")
            .update({
              performers_payload:
                updatedArr as unknown as Database["public"]["Tables"]["concert_event_proposals"]["Update"]["performers_payload"],
            })
            .eq("id", pc.id);
        }
      }

      // Optionally crawl their official website / tour calendar right away!
      let tourCrawlSummary = null;
      if (body.crawlTourAfter) {
        const tourUrl = await resolvePerformerTourUrl(savedPerf);
        if (tourUrl) {
          try {
            const r = await fetch(tourUrl, { headers: { "User-Agent": UA } });
            if (r.ok) {
              const html = await r.text();
              const { events: parsed } = extractEventsMultiTier(html, tourUrl, {
                defaultTitlePrefix: savedPerf.name,
              });
              tourCrawlSummary = await stageIncomingEvents(
                client,
                parsed.map((e) => ({
                  ...e,
                  performers: [
                    {
                      id: savedPerf.id,
                      name: savedPerf.name,
                      role: savedPerf.performer_type,
                      instrument: savedPerf.instrument_or_role,
                    },
                    ...(e.performers || []),
                  ],
                })),
                {
                  sourceKind: "artist_tour",
                  sourceLabel: `${savedPerf.name} Tour Calendar`,
                  autoPublish: false,
                }
              );
            }
          } catch {
            // Non-fatal tour crawl error
          }
        }
      }

      return NextResponse.json({
        approved: "performer",
        performer: savedPerf,
        tourCrawlSummary,
      });
    }

    // Approve Venue Proposal (`entity_type === 'venue'`)
    if (prop.latitude === null || prop.longitude === null) {
      return NextResponse.json(
        {
          error:
            "Latitude and Longitude are required before publishing a venue to the map (click Auto-fetch Metadata or enter coordinates).",
        },
        { status: 400 }
      );
    }

    const vSlug = slugify(
      `${prop.short_name || prop.name}-${prop.city || ""}`
    );
    const { data: savedVenue, error: vErr } = await client
      .from("venues")
      .upsert(
        {
          slug: vSlug,
          name: prop.name.trim(),
          short_name: (prop.short_name || prop.name).trim(),
          city: prop.city || "Unknown City",
          country: prop.country || "International",
          country_code: prop.country_code || null,
          latitude: prop.latitude,
          longitude: prop.longitude,
          capacity: prop.capacity ?? null,
          opened_year: prop.opened_year ?? null,
          architect_or_acoustics: prop.architect_or_acoustics || null,
          website_url: prop.website_url || null,
          calendar_url: prop.calendar_url || prop.website_url || null,
          photo_url: prop.photo_url || null,
          description:
            prop.short_bio ||
            `${prop.name} — classical concert venue in ${prop.city || ""}, ${prop.country || ""}.`,
          wikidata_qid: prop.wikidata_qid || null,
          tier: 2,
          updated_at: nowIso,
        },
        { onConflict: "slug" }
      )
      .select("*")
      .single();

    if (vErr || !savedVenue) {
      return NextResponse.json(
        { error: vErr?.message || "Failed to create venue." },
        { status: 400 }
      );
    }

    await client
      .from("stage_entity_proposals")
      .update({
        status: "approved",
        resolved_venue_id: savedVenue.id,
        updated_at: nowIso,
      })
      .eq("id", prop.id);

    // Link any pending staged concerts waiting on this venue proposal!
    await client
      .from("concert_event_proposals")
      .update({ matched_venue_id: savedVenue.id, updated_at: nowIso })
      .eq("proposed_venue_id", prop.id);

    return NextResponse.json({
      approved: "venue",
      venue: savedVenue,
    });
  }

  // =========================================================================
  // 2. APPROVE STAGED CONCERT -> PUBLISH TO WORLD STAGE MAP
  // =========================================================================
  if (body.action === "approve_concert" && body.concertProposalId) {
    const { data: cp } = await client
      .from("concert_event_proposals")
      .select("*")
      .eq("id", body.concertProposalId)
      .maybeSingle();

    if (!cp) {
      return NextResponse.json(
        { error: "Concert proposal not found." },
        { status: 404 }
      );
    }

    let venueId = cp.matched_venue_id;

    // If concert references a pending Venue Proposal with coordinates, auto-approve that venue!
    if (!venueId && cp.proposed_venue_id) {
      const { data: vp } = await client
        .from("stage_entity_proposals")
        .select("*")
        .eq("id", cp.proposed_venue_id)
        .maybeSingle();
      if (vp?.resolved_venue_id) {
        venueId = vp.resolved_venue_id;
      } else if (vp && vp.latitude !== null && vp.longitude !== null) {
        const vSlug = slugify(`${vp.short_name || vp.name}-${vp.city || ""}`);
        const { data: autoVenue } = await client
          .from("venues")
          .upsert(
            {
              slug: vSlug,
              name: vp.name,
              short_name: vp.short_name || vp.name,
              city: vp.city || "Unknown",
              country: vp.country || "International",
              country_code: vp.country_code,
              latitude: vp.latitude,
              longitude: vp.longitude,
              capacity: vp.capacity,
              opened_year: vp.opened_year,
              website_url: vp.website_url,
              calendar_url: vp.calendar_url,
              photo_url: vp.photo_url,
              description: vp.short_bio,
              tier: 2,
              updated_at: nowIso,
            },
            { onConflict: "slug" }
          )
          .select("*")
          .single();
        if (autoVenue) {
          venueId = autoVenue.id;
          await client
            .from("stage_entity_proposals")
            .update({
              status: "approved",
              resolved_venue_id: autoVenue.id,
              updated_at: nowIso,
            })
            .eq("id", vp.id);
        }
      }
    }

    if (!venueId) {
      return NextResponse.json(
        {
          error:
            "Select or approve a Concert Venue with map coordinates before publishing this concert.",
        },
        { status: 400 }
      );
    }

    const { data: venue } = await client
      .from("venues")
      .select("id, slug, calendar_url")
      .eq("id", venueId)
      .single();

    if (!venue) {
      return NextResponse.json({ error: "Venue not found." }, { status: 404 });
    }

    const perfs = Array.isArray(cp.performers_payload)
      ? (cp.performers_payload as unknown as StagedPerformerPayloadItem[])
      : [];
    const works = Array.isArray(cp.works_payload)
      ? (cp.works_payload as unknown as StagedWorkPayloadItem[])
      : [];

    const primaryOrchId =
      perfs.find((p) => p.role === "orchestra")?.matched_performer_id ?? null;
    const condId =
      perfs.find((p) => p.role === "conductor")?.matched_performer_id ?? null;

    const evSlug = `${cp.starts_at.slice(0, 10)}-${venue.slug}-${slugify(cp.title).slice(0, 48)}`;

    const { data: savedEv, error: evErr } = await client
      .from("concert_events")
      .upsert(
        {
          slug: evSlug,
          external_key: cp.dedup_key,
          canonical_fingerprint: cp.canonical_fingerprint,
          title: cp.title,
          subtitle: cp.subtitle,
          starts_at: cp.starts_at,
          ends_at: cp.ends_at,
          season: cp.season || "2026/27",
          venue_id: venue.id,
          primary_orchestra_id: primaryOrchId,
          conductor_id: condId,
          source_url: cp.source_url || venue.calendar_url,
          ticket_url: cp.ticket_url || cp.source_url || venue.calendar_url,
          status: "scheduled",
          updated_at: nowIso,
        },
        { onConflict: "external_key" }
      )
      .select("*")
      .single();

    if (evErr || !savedEv) {
      return NextResponse.json(
        { error: evErr?.message || "Failed to publish concert." },
        { status: 400 }
      );
    }

    for (let i = 0; i < perfs.length; i++) {
      const p = perfs[i];
      if (!p.matched_performer_id) continue;
      await client.from("concert_event_performers").upsert(
        {
          event_id: savedEv.id,
          performer_id: p.matched_performer_id,
          billing_role: p.role || "soloist",
          instrument_label: p.instrument,
          display_order: i + 1,
        },
        { onConflict: "event_id,performer_id,billing_role" }
      );
    }

    await client
      .from("concert_event_works")
      .delete()
      .eq("event_id", savedEv.id);

    for (let i = 0; i < works.length; i++) {
      const w = works[i];
      await client.from("concert_event_works").insert({
        event_id: savedEv.id,
        display_order: i + 1,
        work_id: w.matched_work_id,
        composer_id: w.matched_composer_id,
        raw_composer_name: w.composerName,
        raw_work_title: w.workTitle,
        suggestion_id: w.suggestion_id,
      });
    }

    await client
      .from("concert_event_proposals")
      .update({
        status: "approved",
        matched_venue_id: venue.id,
        resolved_event_id: savedEv.id,
        updated_at: nowIso,
      })
      .eq("id", cp.id);

    return NextResponse.json({
      approved: "concert",
      event: savedEv,
    });
  }

  // =========================================================================
  // 3. MERGE TOUR DATE / COMPLEMENTARY DIFF INTO EXISTING CONCERT EVENT
  // =========================================================================
  if (body.action === "merge_concert" && body.concertProposalId) {
    const { data: cp } = await client
      .from("concert_event_proposals")
      .select("*")
      .eq("id", body.concertProposalId)
      .maybeSingle();

    if (!cp || !cp.duplicate_of_event_id) {
      return NextResponse.json(
        { error: "Merge target concert not found." },
        { status: 404 }
      );
    }

    const targetEventId = cp.duplicate_of_event_id;
    const { data: targetEv } = await client
      .from("concert_events")
      .select("*")
      .eq("id", targetEventId)
      .maybeSingle();

    if (!targetEv) {
      return NextResponse.json(
        { error: "Existing concert no longer exists." },
        { status: 404 }
      );
    }

    // Update ticket_url if the proposal brought a better direct ticket link
    if (
      cp.ticket_url &&
      (!targetEv.ticket_url || targetEv.ticket_url === targetEv.source_url)
    ) {
      await client
        .from("concert_events")
        .update({ ticket_url: cp.ticket_url, updated_at: nowIso })
        .eq("id", targetEventId);
    }

    // Append any missing resolved performers
    const { data: existingEp } = await client
      .from("concert_event_performers")
      .select("performer_id, display_order")
      .eq("event_id", targetEventId);

    const existingPerfIds = new Set(
      (existingEp ?? []).map((x) => x.performer_id)
    );
    let nextPerfOrder = (existingEp?.length ?? 0) + 1;

    const perfs = Array.isArray(cp.performers_payload)
      ? (cp.performers_payload as unknown as StagedPerformerPayloadItem[])
      : [];
    let mergedPerformers = 0;

    for (const p of perfs) {
      if (p.matched_performer_id && !existingPerfIds.has(p.matched_performer_id)) {
        await client.from("concert_event_performers").upsert(
          {
            event_id: targetEventId,
            performer_id: p.matched_performer_id,
            billing_role: p.role || "soloist",
            instrument_label: p.instrument,
            display_order: nextPerfOrder++,
          },
          { onConflict: "event_id,performer_id,billing_role" }
        );
        existingPerfIds.add(p.matched_performer_id);
        mergedPerformers++;
      }
    }

    // Append any missing works
    const { data: existingEw } = await client
      .from("concert_event_works")
      .select("raw_work_title, display_order")
      .eq("event_id", targetEventId);

    const existingWorkTitles = new Set(
      (existingEw ?? []).map((w) => w.raw_work_title.toLowerCase().trim())
    );
    let nextWorkOrder = (existingEw?.length ?? 0) + 1;

    const works = Array.isArray(cp.works_payload)
      ? (cp.works_payload as unknown as StagedWorkPayloadItem[])
      : [];
    let mergedWorks = 0;

    for (const w of works) {
      const key = w.workTitle.toLowerCase().trim();
      if (key && !existingWorkTitles.has(key)) {
        await client.from("concert_event_works").insert({
          event_id: targetEventId,
          display_order: nextWorkOrder++,
          work_id: w.matched_work_id,
          composer_id: w.matched_composer_id,
          raw_composer_name: w.composerName,
          raw_work_title: w.workTitle,
          suggestion_id: w.suggestion_id,
        });
        existingWorkTitles.add(key);
        mergedWorks++;
      }
    }

    await client
      .from("concert_event_proposals")
      .update({
        status: "merged",
        resolved_event_id: targetEventId,
        updated_at: nowIso,
      })
      .eq("id", cp.id);

    return NextResponse.json({
      mergedIntoEventId: targetEventId,
      mergedPerformers,
      mergedWorks,
    });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
