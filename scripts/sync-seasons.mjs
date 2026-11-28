#!/usr/bin/env node
/**
 * World Stage 2.0 Season & Artist Tour Crawler (`scripts/sync-seasons.mjs`)
 *
 * - Syncs all Top 100 Global Concert Halls & Opera Houses (`scripts/data/top-100-venues.mjs`)
 * - Crawls rotating batches of venue calendars (`--crawl-batch=20`) AND featured artist tour pages!
 * - Supports Tier 1 (JSON-LD, .ics, Embedded JSON), Tier 2 (HTML schedule heuristics),
 *   and Tier 3 (`--playwright` / `ENABLE_PLAYWRIGHT=1` headless Chromium rendering for JS SPAs)
 * - Stages all newly discovered concerts, tour dates, merge candidates, uncataloged Performers,
 *   uncataloged Venues, and uncataloged Works into `/admin` for review (zero unreviewed duplicates!).
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { TOP_100_VENUES } from "./data/top-100-venues.mjs";
import {
  buildComposerMatcher,
  buildWorkMatcher,
  extractCatalog,
  normalizeText,
  slugify,
} from "./lib/dedup.mjs";
import {
  buildSuggestionMetadata,
  compareConcertAgainstExisting,
  computeCanonicalFingerprint,
  extractEventsMultiTier,
  fetchKyivPhilharmonicEvents,
  matchCatalogVenue,
  parseNyPhilPrograms,
} from "./lib/season-parser.mjs";
import {
  BROWSER_USER_AGENT,
  createPoliteSession,
  inferAcceptLanguageForHost,
  getHostname,
  normalizeUrlForDelta,
  randomBetween,
  sleepMs,
} from "./lib/polite-fetcher.mjs";

function loadDotEnvIfNeeded() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) return;
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadDotEnvIfNeeded();

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const USE_PLAYWRIGHT =
  process.argv.includes("--playwright") ||
  process.env.ENABLE_PLAYWRIGHT === "1";

const batchArg = process.argv.find((a) => a.startsWith("--crawl-batch="));
const CRAWL_BATCH = batchArg
  ? Math.max(1, parseInt(batchArg.slice("--crawl-batch=".length), 10) || 20)
  : 15;

const customUrlArg = process.argv.find((a) => a.startsWith("--url="));
const CUSTOM_URL = customUrlArg ? customUrlArg.slice("--url=".length) : null;

const NO_JITTER =
  process.argv.includes("--no-jitter") || Boolean(CUSTOM_URL);
const SHOULD_JITTER =
  !NO_JITTER &&
  (process.argv.includes("--jitter") ||
    process.env.GITHUB_EVENT_NAME === "schedule");
const MAX_JITTER_MINUTES = Math.min(
  45,
  Math.max(1, parseInt(process.env.MAX_JITTER_MINUTES || "35", 10) || 35)
);

const politeSession = createPoliteSession({
  minDelayMs: 3200,
  maxDelayMs: 9500,
  timeoutMs: 10000,
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY || "",
});

const WIKI_UA =
  "OpusArchive/2.0 (https://github.com/liubenko/opus-archive; classical catalog enrichment)";

let playwrightBrowser = null;

async function getPlaywrightHtml(url) {
  if (!USE_PLAYWRIGHT) return null;
  if (politeSession.isHostBlocked(url)) {
    console.warn(`   [circuit-breaker] Skipping Playwright for blocked host ${getHostname(url)}`);
    return null;
  }
  try {
    if (!playwrightBrowser) {
      const pw = await import("playwright");
      playwrightBrowser = await pw.chromium.launch({ headless: true });
    }
    const host = getHostname(url);
    const context = await playwrightBrowser.newContext({
      userAgent: BROWSER_USER_AGENT,
      locale: inferAcceptLanguageForHost(host).split(",")[0] || "en-US",
      extraHTTPHeaders: {
        "Accept-Language": inferAcceptLanguageForHost(host),
      },
    });
    const page = await context.newPage();
    const resp = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    const status = resp?.status() || 0;
    if (status === 403 || status === 429 || status === 503) {
      politeSession.tripBreaker(
        host,
        status,
        resp?.headers()?.["retry-after"] || null,
        `Playwright HTTP ${status}`
      );
      await context.close();
      return null;
    }
    // Randomized human settle wait (2.2s - 4.8s) instead of a fixed interval
    await page.waitForTimeout(randomBetween(2200, 4800));
    const content = await page.content();
    await context.close();
    return content;
  } catch (err) {
    console.warn(`   [Playwright fallback skipped for ${url}]: ${err.message}`);
    return null;
  }
}

async function fetchAndExtractMultiTier(url, options = {}) {
  const fetchRes = await politeSession.fetchText(url, {
    allowFirecrawlFallback: true,
    referer: options.referer,
  });

  if (fetchRes.ok && fetchRes.text) {
    const tier12 = extractEventsMultiTier(fetchRes.text, url, options);
    if (tier12.events.length > 0) {
      return {
        events: tier12.events,
        tierUsed:
          fetchRes.via === "firecrawl"
            ? `firecrawl+${tier12.tierUsed}`
            : tier12.tierUsed,
        blocked: false,
      };
    }
  }

  // Circuit breaker: NEVER hammer a 403 / 429 / 503 / WAF-blocked host with Playwright!
  if (fetchRes.blocked) {
    return {
      events: [],
      tierUsed: "blocked",
      blocked: true,
      blockReason: fetchRes.reason,
    };
  }

  // Tier 3: Headless Chromium rendering ONLY when HTTP fetch returned a JS-rendered shell
  const renderedHtml = await getPlaywrightHtml(url);
  if (renderedHtml) {
    const tier3 = extractEventsMultiTier(renderedHtml, url, options);
    if (tier3.events.length > 0) {
      return {
        events: tier3.events,
        tierUsed: `playwright+${tier3.tierUsed}`,
        blocked: false,
      };
    }
  }

  return { events: [], tierUsed: "none", blocked: politeSession.isHostBlocked(url) };
}

async function fetchAllRows(table, columns) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function fetchWikiSummary(query) {
  try {
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        query
      )}&limit=1&namespace=0&format=json`,
      { headers: { "User-Agent": WIKI_UA } }
    );
    if (!searchRes.ok) return null;
    const tuple = await searchRes.json();
    const title = tuple?.[1]?.[0];
    if (!title) return null;
    const sumRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        title.replace(/ /g, "_")
      )}`,
      { headers: { "User-Agent": WIKI_UA } }
    );
    if (!sumRes.ok) return null;
    return await sumRes.json();
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== Opus Archive World Stage 2.0 Polite Crawler ===");

  // Habit 1: Randomize scheduled start time (1–35 min jitter) so cron never hits on exact :00 timestamps
  if (SHOULD_JITTER) {
    const jitterMs = randomBetween(60_000, MAX_JITTER_MINUTES * 60_000);
    console.log(
      `Applying randomized startup jitter: waiting ${(jitterMs / 60_000).toFixed(1)} min before first request...`
    );
    await sleepMs(jitterMs);
  }

  const nowIso = new Date().toISOString();

  // 1. Ensure all Top 100 Venues exist in `public.venues`
  console.log(`1. Verifying Top ${TOP_100_VENUES.length} global venues...`);
  const { data: existingVenues } = await supabase.from("venues").select("*");
  const existingSlugs = new Set((existingVenues || []).map((v) => v.slug));
  const missingSeedVenues = TOP_100_VENUES.filter(
    (v) => !existingSlugs.has(v.slug)
  );
  if (missingSeedVenues.length > 0) {
    await supabase.from("venues").upsert(
      missingSeedVenues.map((v) => ({
        slug: v.slug,
        name: v.name,
        short_name: v.short_name,
        city: v.city,
        country: v.country,
        country_code: v.country_code,
        latitude: v.latitude,
        longitude: v.longitude,
        capacity: v.capacity ?? null,
        opened_year: v.opened_year ?? null,
        architect_or_acoustics: v.architect_or_acoustics ?? null,
        website_url: v.website_url ?? null,
        calendar_url: v.calendar_url ?? null,
        feed_type: v.feed_type || "auto",
        tier: 1,
        description: `${v.name} — landmark classical concert venue in ${v.city}, ${v.country}.`,
        updated_at: nowIso,
      })),
      { onConflict: "slug" }
    );
  }

  // 2. Load catalog, live events & existing staged proposals for delta scraping + deduplication
  const [venues, performers, composers, works, liveEvents, stagedProposals, epRows, ewRows] =
    await Promise.all([
      fetchAllRows("venues", "*"),
      fetchAllRows("performers", "*"),
      fetchAllRows(
        "composers",
        "id, name, full_name, sort_name, slug, birth_year, death_year"
      ),
      fetchAllRows(
        "works",
        "id, composer_id, title, slug, catalog_system, catalog_number"
      ),
      fetchAllRows("concert_events", "*"),
      fetchAllRows("concert_event_proposals", "id, dedup_key, source_url, ticket_url, status"),
      fetchAllRows("concert_event_performers", "event_id, performer_id"),
      fetchAllRows("concert_event_works", "event_id, raw_work_title"),
    ]);

  // Habit 2 (Delta Scraping): Build set of already-saved event URLs so we never re-process known concerts
  const knownEventUrls = new Set();
  for (const ev of liveEvents) {
    if (ev.source_url) knownEventUrls.add(normalizeUrlForDelta(ev.source_url));
    if (ev.ticket_url) knownEventUrls.add(normalizeUrlForDelta(ev.ticket_url));
  }
  for (const prop of stagedProposals) {
    if (prop.source_url) knownEventUrls.add(normalizeUrlForDelta(prop.source_url));
    if (prop.ticket_url) knownEventUrls.add(normalizeUrlForDelta(prop.ticket_url));
  }
  console.log(`   Delta cache loaded: ${knownEventUrls.size} known concert URLs.`);

  const perfById = new Map(performers.map((p) => [p.id, p]));
  const perfByNorm = new Map(performers.map((p) => [normalizeText(p.name), p]));
  const perfNamesByEv = new Map();
  for (const r of epRows) {
    const p = perfById.get(r.performer_id);
    if (!p) continue;
    const arr = perfNamesByEv.get(r.event_id) || [];
    arr.push(p.name);
    perfNamesByEv.set(r.event_id, arr);
  }
  const workTitlesByEv = new Map();
  for (const r of ewRows) {
    const arr = workTitlesByEv.get(r.event_id) || [];
    arr.push(r.raw_work_title);
    workTitlesByEv.set(r.event_id, arr);
  }
  const hydratedLiveEvents = liveEvents.map((e) => ({
    ...e,
    performerNames: perfNamesByEv.get(e.id) || [],
    workTitles: workTitlesByEv.get(e.id) || [],
  }));

  const composerMatcher = buildComposerMatcher(composers);
  const worksByComp = new Map();
  for (const w of works) {
    const arr = worksByComp.get(w.composer_id) || [];
    arr.push(w);
    worksByComp.set(w.composer_id, arr);
  }
  const workMatchers = new Map();
  for (const [cid, list] of worksByComp.entries()) {
    workMatchers.set(cid, buildWorkMatcher(list));
  }

  // 3. Gather Crawl Batches: Custom URL OR (Due Venues + Featured Performer Tour Pages + NYPhil JSON)
  const crawlJobs = [];

  if (CUSTOM_URL) {
    crawlJobs.push({
      kind: "url_import",
      label: CUSTOM_URL,
      url: CUSTOM_URL,
    });
  } else {
    crawlJobs.push({
      kind: "nyphil_json",
      label: "NY Philharmonic Open Data",
      url: "https://raw.githubusercontent.com/nyphilarchive/PerformanceHistory/main/Programs/json/2024-25_TO_NOW.json",
    });

    const halfBatch = Math.max(4, Math.ceil(CRAWL_BATCH * 0.6));
    const dueVenues = [...venues]
      .filter((v) => v.calendar_url && v.feed_type !== "nyphil_json")
      .sort((a, b) =>
        String(a.last_synced_at || "").localeCompare(
          String(b.last_synced_at || "")
        )
      )
      .slice(0, halfBatch);

    for (const v of dueVenues) {
      crawlJobs.push({
        kind: "venue_sync",
        label: `${v.short_name || v.name} (${v.city})`,
        url: v.calendar_url,
        venue: v,
      });
    }

    const dueArtists = [...performers]
      .filter((p) => p.is_featured && (p.calendar_url || p.website_url))
      .sort((a, b) =>
        String(a.last_synced_at || "").localeCompare(
          String(b.last_synced_at || "")
        )
      )
      .slice(0, Math.max(4, CRAWL_BATCH - halfBatch));

    for (const p of dueArtists) {
      crawlJobs.push({
        kind: "artist_tour",
        label: `${p.name} Tour Calendar`,
        url: p.calendar_url || p.website_url,
        performer: p,
      });
    }
  }

  let stagedNew = 0;
  let stagedMerges = 0;
  let skippedDups = 0;
  let deltaSkipped = 0;
  let proposedEntities = 0;
  let proposedWorks = 0;

  for (const job of crawlJobs) {
    if (politeSession.isHostBlocked(job.url)) {
      console.warn(`-> Skipping [${job.kind}] ${job.label} (circuit breaker open for host)`);
      continue;
    }

    console.log(`-> Crawling [${job.kind}] ${job.label}...`);
    let events = [];
    let tierUsed = "none";
    let wasBlocked = false;

    if (job.kind === "nyphil_json") {
      try {
        const r = await fetch(job.url);
        if (r.ok) {
          const j = await r.json();
          events = parseNyPhilPrograms(j, "2026-10-15").slice(-16);
          tierUsed = "nyphil_json";
        }
      } catch (e) {
        console.warn("   NYPhil fetch failed:", e.message);
      }
    } else if (job.venue?.feed_type === "kyiv_phil_wp" || /philarmonia\.com\.ua/i.test(job.url)) {
      try {
        events = await fetchKyivPhilharmonicEvents(12);
        tierUsed = "kyiv_phil_wp";
      } catch (e) {
        console.warn("   Kyiv Philharmonic WP API fetch failed:", e.message);
      }
    } else {
      const res = await fetchAndExtractMultiTier(job.url, {
        defaultTitlePrefix: job.performer?.name || "",
      });
      events = res.events.slice(0, 18);
      tierUsed = res.tierUsed;
      wasBlocked = Boolean(res.blocked);
    }

    if (job.venue) {
      await supabase
        .from("venues")
        .update({
          last_synced_at: nowIso,
          feed_type:
            tierUsed !== "none" && tierUsed !== "blocked"
              ? tierUsed
              : job.venue.feed_type,
        })
        .eq("id", job.venue.id);
    }
    if (job.performer) {
      await supabase
        .from("performers")
        .update({
          last_synced_at: nowIso,
          feed_type:
            tierUsed !== "none" && tierUsed !== "blocked"
              ? tierUsed
              : job.performer.feed_type,
        })
        .eq("id", job.performer.id);
    }

    if (wasBlocked) {
      console.warn(`   Host blocked (${job.label}) — circuit breaker tripped; skipping remaining work for this host.`);
      continue;
    }

    console.log(`   Extracted ${events.length} events (tier: ${tierUsed})`);

    for (const ev of events) {
      // Habit 2 (Delta Scraping): Skip events whose specific concert detail URL is already in DB or staging
      const evSourceNorm =
        ev.sourceUrl && normalizeUrlForDelta(ev.sourceUrl) !== normalizeUrlForDelta(job.url)
          ? normalizeUrlForDelta(ev.sourceUrl)
          : "";
      const evTicketNorm =
        ev.ticketUrl && normalizeUrlForDelta(ev.ticketUrl) !== normalizeUrlForDelta(job.url)
          ? normalizeUrlForDelta(ev.ticketUrl)
          : "";
      if (
        (evSourceNorm && knownEventUrls.has(evSourceNorm)) ||
        (evTicketNorm && knownEventUrls.has(evTicketNorm))
      ) {
        deltaSkipped++;
        continue;
      }
      if (job.venue && !ev.venueId) {
        ev.venueId = job.venue.id;
        ev.venueName = job.venue.short_name || job.venue.name;
        ev.city = job.venue.city;
        ev.country = job.venue.country;
      }
      if (job.performer) {
        ev.performers = [
          {
            id: job.performer.id,
            name: job.performer.name,
            role: job.performer.performer_type,
            instrument: job.performer.instrument_or_role,
          },
          ...(ev.performers || []),
        ];
      }

      const matchedVenue = ev.venueId
        ? venues.find((v) => v.id === ev.venueId)
        : matchCatalogVenue(venues, ev.venueName, ev.city);

      let proposedVenueId = null;
      if (!matchedVenue && ev.venueName) {
        const vDedup = `venue::${normalizeText(ev.venueName)}::${normalizeText(ev.city || "")}`;
        const { data: exVp } = await supabase
          .from("stage_entity_proposals")
          .select("*")
          .eq("dedup_key", vDedup)
          .maybeSingle();
        if (exVp) {
          proposedVenueId = exVp.id;
        } else {
          const wiki = await fetchWikiSummary(`${ev.venueName} ${ev.city || ""}`);
          const { data: createdVp } = await supabase
            .from("stage_entity_proposals")
            .insert({
              entity_type: "venue",
              dedup_key: vDedup,
              status: "pending",
              source_type: job.kind === "artist_tour" ? "tour_sync" : "season_sync",
              source_context: `${job.label} (${String(ev.startsAt).slice(0, 10)})`,
              source_url: ev.sourceUrl || job.url,
              name: ev.venueName,
              short_name: ev.venueName.slice(0, 32),
              city: ev.city || "Unknown City",
              country: ev.country || "International",
              latitude: wiki?.coordinates?.lat ?? null,
              longitude: wiki?.coordinates?.lon ?? null,
              photo_url: wiki?.thumbnail?.source ?? null,
              short_bio: wiki?.extract ? wiki.extract.slice(0, 400) : null,
              wikidata_qid: wiki?.wikibase_item ?? null,
            })
            .select("*")
            .single();
          if (createdVp) {
            proposedVenueId = createdVp.id;
            proposedEntities++;
          }
        }
      }

      if (!matchedVenue && !proposedVenueId) continue;

      const cmp = compareConcertAgainstExisting(
        ev,
        matchedVenue?.id ?? null,
        hydratedLiveEvents
      );
      if (cmp.status === "exact_duplicate") {
        skippedDups++;
        continue;
      }

      // Resolve / propose Performers
      const perfsPayload = [];
      for (const pRef of ev.performers || []) {
        const mp = pRef.id
          ? perfById.get(pRef.id)
          : perfByNorm.get(normalizeText(pRef.name || ""));
        let pPropId = null;
        if (!mp && pRef.name) {
          const pDedup = `performer::${normalizeText(pRef.name)}`;
          const { data: exPp } = await supabase
            .from("stage_entity_proposals")
            .select("*")
            .eq("dedup_key", pDedup)
            .maybeSingle();
          if (exPp) {
            pPropId = exPp.id;
          } else {
            const wiki = await fetchWikiSummary(pRef.name);
            const { data: createdPp } = await supabase
              .from("stage_entity_proposals")
              .insert({
                entity_type: "performer",
                dedup_key: pDedup,
                status: "pending",
                source_type:
                  job.kind === "artist_tour" ? "tour_sync" : "season_sync",
                source_context: `Appears on ${job.label} (${String(ev.startsAt).slice(0, 10)})`,
                source_url: wiki?.content_urls?.desktop?.page || job.url,
                name: pRef.name,
                performer_type: pRef.role || "soloist",
                instrument_or_role: pRef.instrument || "Soloist",
                photo_url: wiki?.thumbnail?.source ?? null,
                short_bio: wiki?.extract ? wiki.extract.slice(0, 420) : null,
                wikidata_qid: wiki?.wikibase_item ?? null,
              })
              .select("*")
              .single();
            if (createdPp) {
              pPropId = createdPp.id;
              proposedEntities++;
            }
          }
        }
        perfsPayload.push({
          name: mp?.name || pRef.name,
          role: pRef.role || mp?.performer_type || "soloist",
          instrument: pRef.instrument || mp?.instrument_or_role || null,
          matched_performer_id: mp?.id ?? null,
          proposal_id: pPropId,
        });
      }

      // Resolve / propose Works
      const worksPayload = [];
      for (const wItem of ev.works || []) {
        const mc = composerMatcher.findMatch({
          name: wItem.composerName,
          full_name: wItem.composerName,
          slug: slugify(wItem.composerName),
        });
        let mw = null;
        if (mc) {
          const wm = workMatchers.get(mc.id);
          const cat = extractCatalog(wItem.workTitle);
          if (wm) {
            mw = wm.findMatch({
              title: wItem.workTitle,
              catalog_system: cat.catalog_system,
              catalog_number: cat.catalog_number,
            });
          }
        }
        let sugId = null;
        if (!mw) {
          const meta = buildSuggestionMetadata(
            wItem.composerName,
            wItem.workTitle
          );
          const { data: exSug } = await supabase
            .from("catalog_suggestions")
            .select("id, resolved_work_id")
            .eq("dedup_key", meta.dedupKey)
            .maybeSingle();
          if (exSug) {
            sugId = exSug.id;
            if (exSug.resolved_work_id) mw = { id: exSug.resolved_work_id };
          } else {
            const { data: newSug } = await supabase
              .from("catalog_suggestions")
              .insert({
                dedup_key: meta.dedupKey,
                status: "pending",
                suggestion_type: "work",
                source_type: "season_sync",
                suggested_work_title: wItem.workTitle,
                suggested_composer_name: mc?.name || wItem.composerName,
                matched_composer_id: mc?.id ?? null,
                suggested_genre: meta.genre,
                suggested_catalog_display: meta.catalogDisplay,
                source_context: `${job.label} (${String(ev.startsAt).slice(0, 10)})`,
                source_url: ev.sourceUrl || job.url,
                occurrence_count: 1,
              })
              .select("id")
              .single();
            if (newSug) {
              sugId = newSug.id;
              proposedWorks++;
            }
          }
        }
        worksPayload.push({
          composerName: mc?.name || wItem.composerName,
          workTitle: wItem.workTitle,
          matched_composer_id: mc?.id ?? null,
          matched_work_id: mw?.id ?? null,
          suggestion_id: mw ? null : sugId,
        });
      }

      const fp = computeCanonicalFingerprint({
        venueId: matchedVenue?.id ?? null,
        rawVenueName: ev.venueName,
        rawCity: ev.city,
        startsAt: ev.startsAt,
      });

      const propDedup =
        ev.externalKey ||
        `${job.kind}:${slugify(job.label).slice(0, 22)}:${String(ev.startsAt).slice(0, 10)}:${slugify(ev.venueName || matchedVenue?.slug || ev.title).slice(0, 30)}`;

      const { error: upErr } = await supabase
        .from("concert_event_proposals")
        .upsert(
          {
            dedup_key: propDedup,
            canonical_fingerprint: fp,
            status: "pending",
            source_kind:
              job.kind === "nyphil_json" ? "venue_sync" : job.kind,
            source_label: job.label,
            source_url: ev.sourceUrl || job.url,
            ticket_url: ev.ticketUrl || ev.sourceUrl || job.url,
            title: ev.title,
            subtitle: ev.subtitle || null,
            starts_at: ev.startsAt,
            ends_at: ev.endsAt || null,
            season: ev.season || "2026/27",
            matched_venue_id: matchedVenue?.id ?? null,
            proposed_venue_id: matchedVenue ? null : proposedVenueId,
            raw_venue_name:
              ev.venueName || matchedVenue?.short_name || matchedVenue?.name,
            raw_city: ev.city || matchedVenue?.city,
            raw_country: ev.country || matchedVenue?.country,
            performers_payload: perfsPayload,
            works_payload: worksPayload,
            duplicate_of_event_id: cmp.existingEvent?.id ?? null,
            match_confidence: cmp.confidence,
            match_summary: cmp.summary,
            updated_at: nowIso,
          },
          { onConflict: "dedup_key" }
        );

      if (!upErr) {
        if (cmp.status === "merge_candidate") stagedMerges++;
        else stagedNew++;
      }
    }
  }

  if (playwrightBrowser) {
    await playwrightBrowser.close();
  }

  const blockedList = politeSession.getBlockedSummary();
  console.log(
    `Done! Staged ${stagedNew} new concerts · ${stagedMerges} cross-source merge diffs · ${deltaSkipped} delta-skipped (already known URLs) · ${skippedDups} exact duplicates skipped · ${proposedEntities} new performer/venue proposals · ${proposedWorks} new work proposals · ${blockedList.length} hosts paused by circuit breaker.`
  );
  if (blockedList.length > 0) {
    console.log("Circuit-breaker paused hosts:", JSON.stringify(blockedList));
  }
}

main().catch((err) => {
  console.error("Fatal sync-seasons error:", err);
  process.exit(1);
});
