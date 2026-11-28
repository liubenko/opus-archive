import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Performer, Venue } from "@/types/database";
import {
  buildComposerMatcher,
  buildWorkMatcher,
  extractCatalog,
  normalizeText,
  slugify,
} from "../../scripts/lib/dedup.mjs";
import {
  buildSuggestionMetadata,
  compareConcertAgainstExisting,
  computeCanonicalFingerprint,
  matchCatalogVenue,
} from "../../scripts/lib/season-parser.mjs";
import {
  discoverCalendarUrl,
  lookupPerformerCandidates,
  lookupVenueCandidates,
  lookupWorkCandidates,
} from "@/lib/catalog-lookup";

export interface IncomingPerformerRef {
  id?: number;
  name: string;
  role: string;
  instrument?: string | null;
}

export interface IncomingWorkRef {
  composerName: string;
  workTitle: string;
}

export interface IncomingStageEvent {
  externalKey?: string;
  title: string;
  subtitle?: string | null;
  startsAt: string;
  endsAt?: string | null;
  season?: string;
  venueId?: number;
  venueName?: string | null;
  city?: string | null;
  country?: string | null;
  sourceUrl?: string | null;
  ticketUrl?: string | null;
  performers?: IncomingPerformerRef[];
  works?: IncomingWorkRef[];
}

export interface StagedPerformerPayloadItem {
  name: string;
  role: string;
  instrument: string | null;
  matched_performer_id: number | null;
  proposal_id: number | null;
}

export interface StagedWorkPayloadItem {
  composerName: string;
  workTitle: string;
  matched_composer_id: number | null;
  matched_work_id: number | null;
  suggestion_id: number | null;
}

export interface StageIngestionResult {
  stagedNewConcerts: number;
  stagedMergeCandidates: number;
  skippedDuplicates: number;
  publishedEvents: number;
  proposedPerformers: number;
  proposedVenues: number;
  proposedWorks: number;
}

export async function stageIncomingEvents(
  client: SupabaseClient<Database>,
  incoming: IncomingStageEvent[],
  options: {
    sourceKind: "venue_sync" | "artist_tour" | "url_import" | "manual";
    sourceLabel: string;
    autoPublish?: boolean;
  }
): Promise<StageIngestionResult> {
  const result: StageIngestionResult = {
    stagedNewConcerts: 0,
    stagedMergeCandidates: 0,
    skippedDuplicates: 0,
    publishedEvents: 0,
    proposedPerformers: 0,
    proposedVenues: 0,
    proposedWorks: 0,
  };

  if (incoming.length === 0) return result;

  // 1. Load catalog context in parallel
  const [venuesRes, perfRes, compRes, evRes, epRes, ewRes, entPropRes] =
    await Promise.all([
      client.from("venues").select("*"),
      client.from("performers").select("*"),
      client
        .from("composers")
        .select("id, name, full_name, sort_name, slug, birth_year, death_year"),
      client.from("concert_events").select("*"),
      client
        .from("concert_event_performers")
        .select("event_id, performer_id, performers:performer_id(name)")
        .limit(5000),
      client
        .from("concert_event_works")
        .select("event_id, raw_work_title")
        .limit(5000),
      client.from("stage_entity_proposals").select("*"),
    ]);

  const venues: Venue[] = venuesRes.data ?? [];
  const performers: Performer[] = perfRes.data ?? [];
  const composers = compRes.data ?? [];
  const entityProposals = entPropRes.data ?? [];

  // Paginate works for matching
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
    const list = worksByComp.get(w.composer_id) ?? [];
    list.push(w);
    worksByComp.set(w.composer_id, list);
  }
  const workMatchers = new Map<
    number,
    ReturnType<typeof buildWorkMatcher>
  >();
  for (const [cid, list] of worksByComp.entries()) {
    workMatchers.set(cid, buildWorkMatcher(list));
  }

  // Hydrate existing events with performerNames & workTitles for cross-source deduplication
  const perfById = new Map(performers.map((p) => [p.id, p]));
  const perfByNorm = new Map(
    performers.map((p) => [normalizeText(p.name), p])
  );
  const perfNamesByEvent = new Map<number, string[]>();
  for (const row of epRes.data ?? []) {
    const p = perfById.get(row.performer_id);
    if (!p) continue;
    const arr = perfNamesByEvent.get(row.event_id) ?? [];
    arr.push(p.name);
    perfNamesByEvent.set(row.event_id, arr);
  }
  const workTitlesByEvent = new Map<number, string[]>();
  for (const row of ewRes.data ?? []) {
    const arr = workTitlesByEvent.get(row.event_id) ?? [];
    arr.push(row.raw_work_title);
    workTitlesByEvent.set(row.event_id, arr);
  }

  const hydratedExistingEvents = (evRes.data ?? []).map((e) => ({
    ...e,
    performerNames: perfNamesByEvent.get(e.id) ?? [],
    workTitles: workTitlesByEvent.get(e.id) ?? [],
  }));

  const entityPropByDedup = new Map(
    entityProposals.map((ep) => [ep.dedup_key, ep])
  );

  let openDataLookupsUsed = 0;
  const MAX_OPEN_DATA_LOOKUPS = 14;
  const nowIso = new Date().toISOString();

  for (const ev of incoming) {
    if (!ev.startsAt || !ev.title) continue;

    // 1. Resolve Venue (or propose unknown Venue in `stage_entity_proposals`)
    let matchedVenue: Venue | null = ev.venueId
      ? venues.find((v) => v.id === ev.venueId) ?? null
      : null;
    if (!matchedVenue && (ev.venueName || ev.city)) {
      matchedVenue =
        (matchCatalogVenue(
          venues,
          ev.venueName || "",
          ev.city || ""
        ) as Venue | null) ?? null;
    }

    let proposedVenueId: number | null = null;
    if (!matchedVenue && ev.venueName) {
      const vDedup = `venue::${normalizeText(ev.venueName)}::${normalizeText(
        ev.city || ""
      )}`;
      const exVenueProp = entityPropByDedup.get(vDedup);

      if (exVenueProp) {
        if (exVenueProp.resolved_venue_id) {
          matchedVenue =
            venues.find((v) => v.id === exVenueProp.resolved_venue_id) ?? null;
        } else {
          proposedVenueId = exVenueProp.id;
          await client
            .from("stage_entity_proposals")
            .update({
              occurrence_count: (exVenueProp.occurrence_count || 1) + 1,
              updated_at: nowIso,
            })
            .eq("id", exVenueProp.id);
        }
      } else {
        let enrichedVenue = null;
        if (openDataLookupsUsed < MAX_OPEN_DATA_LOOKUPS) {
          openDataLookupsUsed++;
          const cands = await lookupVenueCandidates(
            ev.venueName,
            ev.city || undefined
          ).catch(() => []);
          enrichedVenue = cands[0] ?? null;
        }

        const { data: createdVp } = await client
          .from("stage_entity_proposals")
          .insert({
            entity_type: "venue",
            dedup_key: vDedup,
            status: "pending",
            source_type:
              options.sourceKind === "artist_tour" ? "tour_sync" : "season_sync",
            source_context: `${options.sourceLabel} (${ev.startsAt.slice(0, 10)})`,
            source_url: ev.sourceUrl || null,
            occurrence_count: 1,
            name: enrichedVenue?.name || ev.venueName,
            short_name:
              enrichedVenue?.short_name || ev.venueName.slice(0, 32),
            city: enrichedVenue?.city || ev.city || "Unknown City",
            country: enrichedVenue?.country || ev.country || "International",
            country_code: enrichedVenue?.country_code || null,
            latitude: enrichedVenue?.latitude ?? null,
            longitude: enrichedVenue?.longitude ?? null,
            capacity: enrichedVenue?.capacity ?? null,
            opened_year: enrichedVenue?.opened_year ?? null,
            architect_or_acoustics:
              enrichedVenue?.architect_or_acoustics ?? null,
            website_url: enrichedVenue?.website_url ?? null,
            calendar_url: enrichedVenue?.calendar_url ?? null,
            photo_url: enrichedVenue?.photo_url ?? null,
            short_bio: enrichedVenue?.short_bio ?? null,
            wikidata_qid: enrichedVenue?.wikidata_qid ?? null,
          })
          .select("*")
          .single();

        if (createdVp) {
          entityPropByDedup.set(vDedup, createdVp);
          proposedVenueId = createdVp.id;
          result.proposedVenues++;
        }
      }
    }

    // Skip completely unanchored events with neither a matched venue nor a raw venue name
    if (!matchedVenue && !proposedVenueId && !ev.venueName && !ev.city) {
      continue;
    }

    // 2. Check cross-source duplicate status BEFORE creating performer/work noise on 100% exact duplicates
    const comparison = compareConcertAgainstExisting(
      ev,
      matchedVenue?.id ?? null,
      hydratedExistingEvents
    );
    if (comparison.status === "exact_duplicate") {
      result.skippedDuplicates++;
      continue;
    }

    // 3. Resolve Performers (proposing any unknown Soloist, Conductor, Orchestra, or Ensemble in `/admin`)
    const stagedPerformers: StagedPerformerPayloadItem[] = [];
    for (const pRef of ev.performers ?? []) {
      const cleanName = pRef.name?.trim();
      if (!cleanName && !pRef.id) continue;

      let matchedPerf: Performer | null = pRef.id
        ? perfById.get(pRef.id) ?? null
        : perfByNorm.get(normalizeText(cleanName)) ?? null;

      let perfProposalId: number | null = null;
      if (!matchedPerf && cleanName) {
        const pDedup = `performer::${normalizeText(cleanName)}`;
        const exPerfProp = entityPropByDedup.get(pDedup);

        if (exPerfProp) {
          if (exPerfProp.resolved_performer_id) {
            matchedPerf =
              perfById.get(exPerfProp.resolved_performer_id) ?? null;
          } else {
            perfProposalId = exPerfProp.id;
            await client
              .from("stage_entity_proposals")
              .update({
                occurrence_count: (exPerfProp.occurrence_count || 1) + 1,
                updated_at: nowIso,
              })
              .eq("id", exPerfProp.id);
          }
        } else {
          let enrichedPerf = null;
          if (openDataLookupsUsed < MAX_OPEN_DATA_LOOKUPS) {
            openDataLookupsUsed++;
            const cands = await lookupPerformerCandidates(cleanName).catch(
              () => []
            );
            enrichedPerf = cands[0] ?? null;
          }

          const { data: createdPp } = await client
            .from("stage_entity_proposals")
            .insert({
              entity_type: "performer",
              dedup_key: pDedup,
              status: "pending",
              source_type:
                options.sourceKind === "artist_tour"
                  ? "tour_sync"
                  : "season_sync",
              source_context: `Appears on ${options.sourceLabel} (${ev.startsAt.slice(0, 10)})`,
              source_url: enrichedPerf?.source_url || ev.sourceUrl || null,
              occurrence_count: 1,
              name: enrichedPerf?.name || cleanName,
              performer_type:
                enrichedPerf?.performer_type || pRef.role || "soloist",
              instrument_or_role:
                pRef.instrument ||
                enrichedPerf?.instrument_or_role ||
                (pRef.role === "conductor" ? "Conductor" : "Soloist"),
              nationality: enrichedPerf?.nationality ?? null,
              city: enrichedPerf?.home_city ?? null,
              website_url: enrichedPerf?.website_url ?? null,
              calendar_url: enrichedPerf?.calendar_url ?? null,
              photo_url: enrichedPerf?.avatar_url ?? null,
              short_bio: enrichedPerf?.short_bio ?? null,
              wikidata_qid: enrichedPerf?.wikidata_qid ?? null,
            })
            .select("*")
            .single();

          if (createdPp) {
            entityPropByDedup.set(pDedup, createdPp);
            perfProposalId = createdPp.id;
            result.proposedPerformers++;
          }
        }
      }

      stagedPerformers.push({
        name: matchedPerf?.name || cleanName,
        role: pRef.role || matchedPerf?.performer_type || "soloist",
        instrument:
          pRef.instrument || matchedPerf?.instrument_or_role || null,
        matched_performer_id: matchedPerf?.id ?? null,
        proposal_id: perfProposalId,
      });
    }

    // 4. Resolve Works (proposing unknown Works in `catalog_suggestions` with IMSLP/Wiki enrichment)
    const stagedWorks: StagedWorkPayloadItem[] = [];
    for (const wItem of ev.works ?? []) {
      if (!wItem.workTitle?.trim()) continue;
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

      let workSugId: number | null = null;
      if (!matchedWork) {
        const meta = buildSuggestionMetadata(
          wItem.composerName,
          wItem.workTitle
        );
        const hallLabel =
          matchedVenue?.short_name ||
          matchedVenue?.name ||
          ev.venueName ||
          options.sourceLabel;
        const ctx = `Performed at ${hallLabel} (${ev.startsAt.slice(0, 10)})`;

        const { data: exSug } = await client
          .from("catalog_suggestions")
          .select("*")
          .eq("dedup_key", meta.dedupKey)
          .maybeSingle();

        if (exSug) {
          workSugId = exSug.id;
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
          let enrichedPatch: Partial<
            Database["public"]["Tables"]["catalog_suggestions"]["Insert"]
          > = {};
          if (openDataLookupsUsed < MAX_OPEN_DATA_LOOKUPS) {
            openDataLookupsUsed++;
            try {
              const cands = await lookupWorkCandidates(
                wItem.workTitle,
                matchedComp?.name || wItem.composerName,
                { includeComposerMeta: !matchedComp }
              );
              const top = cands[0];
              if (top) {
                enrichedPatch = {
                  suggested_genre: top.genre || meta.genre,
                  suggested_catalog_display:
                    meta.catalogDisplay || top.catalog_display || null,
                  suggested_year: top.year_composed ?? null,
                  suggested_key_signature: top.key_signature ?? null,
                  suggested_duration_minutes: top.duration_minutes ?? null,
                  suggested_instrumentation: top.instrumentation ?? null,
                  suggested_description: top.description ?? null,
                  suggested_imslp_url: top.imslp_url ?? null,
                  ...(top.composer_meta && !matchedComp
                    ? {
                        composer_birth_year: top.composer_meta.birth_year,
                        composer_death_year: top.composer_meta.death_year,
                        composer_nationality: top.composer_meta.nationality,
                        composer_era: top.composer_meta.era,
                        composer_avatar_url: top.composer_meta.avatar_url,
                        composer_short_bio: top.composer_meta.short_bio,
                        composer_imslp_url: top.composer_meta.imslp_url,
                      }
                    : {}),
                };
              }
            } catch {
              // Ignore lookup failure
            }
          }

          const { data: newSug } = await client
            .from("catalog_suggestions")
            .insert({
              dedup_key: meta.dedupKey,
              status: "pending",
              suggestion_type: "work",
              source_type: "season_sync",
              suggested_work_title: wItem.workTitle,
              suggested_composer_name:
                matchedComp?.name || wItem.composerName,
              matched_composer_id: matchedComp?.id ?? null,
              suggested_genre: meta.genre,
              suggested_catalog_display: meta.catalogDisplay,
              source_context: ctx,
              source_url: ev.sourceUrl || null,
              occurrence_count: 1,
              ...enrichedPatch,
            })
            .select("*")
            .single();

          if (newSug) {
            workSugId = newSug.id;
            result.proposedWorks++;
          }
        }
      }

      stagedWorks.push({
        composerName: matchedComp?.name || wItem.composerName,
        workTitle: wItem.workTitle,
        matched_composer_id: matchedComp?.id ?? null,
        matched_work_id: matchedWork?.id ?? null,
        suggestion_id: matchedWork ? null : workSugId,
      });
    }

    const fingerprint = computeCanonicalFingerprint({
      venueId: matchedVenue?.id ?? null,
      rawVenueName: ev.venueName || null,
      rawCity: ev.city || null,
      startsAt: ev.startsAt,
    });

    // 5A. Direct Manual Publish (only when admin submits the manual concert form with a selected hall)
    if (options.autoPublish && matchedVenue) {
      const extKey =
        ev.externalKey ||
        `manual:${matchedVenue.slug}:${ev.startsAt.slice(0, 10)}:${slugify(ev.title).slice(0, 40)}`;
      const evSlug = `${ev.startsAt.slice(0, 10)}-${matchedVenue.slug}-${slugify(ev.title).slice(0, 48)}`;
      const primaryOrchId =
        stagedPerformers.find((p) => p.role === "orchestra")
          ?.matched_performer_id ?? null;
      const condId =
        stagedPerformers.find((p) => p.role === "conductor")
          ?.matched_performer_id ?? null;

      const { data: savedEv } = await client
        .from("concert_events")
        .upsert(
          {
            slug: evSlug,
            external_key: extKey,
            canonical_fingerprint: fingerprint,
            title: ev.title,
            subtitle: ev.subtitle || null,
            starts_at: ev.startsAt,
            ends_at: ev.endsAt || null,
            season: ev.season || "2026/27",
            venue_id: matchedVenue.id,
            primary_orchestra_id: primaryOrchId,
            conductor_id: condId,
            source_url: ev.sourceUrl || matchedVenue.calendar_url,
            ticket_url:
              ev.ticketUrl || ev.sourceUrl || matchedVenue.calendar_url,
            status: "scheduled",
            updated_at: nowIso,
          },
          { onConflict: "external_key" }
        )
        .select("*")
        .single();

      if (savedEv) {
        result.publishedEvents++;
        for (let i = 0; i < stagedPerformers.length; i++) {
          const sp = stagedPerformers[i];
          if (!sp.matched_performer_id) continue;
          await client.from("concert_event_performers").upsert(
            {
              event_id: savedEv.id,
              performer_id: sp.matched_performer_id,
              billing_role: sp.role,
              instrument_label: sp.instrument,
              display_order: i + 1,
            },
            { onConflict: "event_id,performer_id,billing_role" }
          );
        }
        await client
          .from("concert_event_works")
          .delete()
          .eq("event_id", savedEv.id);
        for (let i = 0; i < stagedWorks.length; i++) {
          const sw = stagedWorks[i];
          await client.from("concert_event_works").insert({
            event_id: savedEv.id,
            display_order: i + 1,
            work_id: sw.matched_work_id,
            composer_id: sw.matched_composer_id,
            raw_composer_name: sw.composerName,
            raw_work_title: sw.workTitle,
            suggestion_id: sw.suggestion_id,
          });
        }
      }
      continue;
    }

    // 5B. Stage in `concert_event_proposals` for `/admin` review & duplicate merge comparison!
    const propDedupKey =
      ev.externalKey ||
      `${options.sourceKind}:${slugify(options.sourceLabel).slice(0, 24)}:${ev.startsAt.slice(0, 10)}:${slugify(ev.venueName || matchedVenue?.slug || ev.title).slice(0, 32)}`;

    const { error: propErr } = await client
      .from("concert_event_proposals")
      .upsert(
        {
          dedup_key: propDedupKey,
          canonical_fingerprint: fingerprint,
          status: "pending",
          source_kind: options.sourceKind,
          source_label: options.sourceLabel,
          source_url: ev.sourceUrl || null,
          ticket_url: ev.ticketUrl || ev.sourceUrl || null,
          title: ev.title,
          subtitle: ev.subtitle || null,
          starts_at: ev.startsAt,
          ends_at: ev.endsAt || null,
          season: ev.season || "2026/27",
          matched_venue_id: matchedVenue?.id ?? null,
          proposed_venue_id: matchedVenue ? null : proposedVenueId,
          raw_venue_name:
            ev.venueName || matchedVenue?.short_name || matchedVenue?.name || null,
          raw_city: ev.city || matchedVenue?.city || null,
          raw_country: ev.country || matchedVenue?.country || null,
          performers_payload:
            stagedPerformers as unknown as Database["public"]["Tables"]["concert_event_proposals"]["Insert"]["performers_payload"],
          works_payload:
            stagedWorks as unknown as Database["public"]["Tables"]["concert_event_proposals"]["Insert"]["works_payload"],
          duplicate_of_event_id: comparison.existingEvent?.id ?? null,
          match_confidence: comparison.confidence,
          match_summary: comparison.summary,
          updated_at: nowIso,
        },
        { onConflict: "dedup_key" }
      );

    if (!propErr) {
      if (comparison.status === "merge_candidate") {
        result.stagedMergeCandidates++;
      } else {
        result.stagedNewConcerts++;
      }
    }
  }

  return result;
}

/**
 * Resolves a performer's tour/schedule URL (auto-discovering it from their official homepage if needed).
 */
export async function resolvePerformerTourUrl(performer: {
  calendar_url?: string | null;
  website_url?: string | null;
}): Promise<string | null> {
  if (performer.calendar_url && performer.calendar_url !== performer.website_url) {
    return performer.calendar_url;
  }
  if (performer.website_url) {
    const discovered = await discoverCalendarUrl(performer.website_url);
    if (discovered) return discovered;
  }
  return performer.calendar_url || performer.website_url || null;
}
