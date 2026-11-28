/**
 * Multi-Tier Season, Venue & Artist Tour Parser + Cross-Source Deduplicator
 * for Opus Archive World Stage 2.0.
 *
 * Extraction Tiers:
 *   Tier 1A: Schema.org `MusicEvent` / `Event` JSON-LD (`parseMusicEventsFromHtml`)
 *   Tier 1B: Standard iCalendar `.ics` (`VEVENT`) feeds (`parseIcsCalendar`)
 *   Tier 1C: Embedded Next.js / CMS / Seated / Bandsintown JSON state (`parseEmbeddedJsonEventsFromHtml`)
 *   Tier 2:  Heuristic HTML `<article>` / `<li>` / `<tr>` / `<time>` schedule blocks (`parseHtmlScheduleBlocks`)
 *   Tier 3:  Playwright headless DOM rendering (invoked in `scripts/sync-seasons.mjs` when Tiers 1–2 return 0)
 *   + Open Feeds: NY Philharmonic CC0 Open Data JSON (`parseNyPhilPrograms`)
 */

import {
  extractCatalog,
  mapWorkGenre,
  normalizeText,
  slugify,
} from "./dedup.mjs";

export function flipCommaName(raw) {
  const bracketReplaced = String(raw || "").replace(
    /\S+\s*\[([^\]]+)\]/g,
    "$1"
  );
  const cleaned = bracketReplaced.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (!cleaned.includes(",")) return cleaned;
  const [last, ...rest] = cleaned.split(",");
  const first = rest.join(",").trim();
  return first ? `${first} ${last.trim()}` : last.trim();
}

export function splitComposerAndWork(rawLine) {
  const line = String(rawLine || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!line || line.length < 4) return null;

  const sepMatch = line.match(/^([^:—–-]{3,48})\s*(?::|—|–|\s-\s)\s*(.+)$/);
  if (sepMatch) {
    return {
      composerName: sepMatch[1].trim(),
      workTitle: sepMatch[2].trim(),
    };
  }
  return {
    composerName: "Unknown Composer",
    workTitle: line,
  };
}

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS_MAP = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
  // German / French / Spanish common abbreviations on European hall calendars
  mär: "03",
  mai: "05",
  okt: "10",
  dez: "12",
  janv: "01",
  févr: "02",
  avr: "04",
  juil: "07",
  août: "08",
  déc: "12",
};

/**
 * Parses diverse human or ISO date strings into a clean ISO timestamp.
 */
export function parseFlexibleDateToIso(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // 1. ISO date or timestamp: 2026-11-28 or 2026-11-28T19:30:00Z
  const isoMatch = s.match(
    /\b(202[5-9]|203\d)-(0[1-9]|1[0-2])-([0-2]\d|3[01])(?:[T\s](\d{1,2}):(\d{2}))?/
  );
  if (isoMatch) {
    const hh = isoMatch[4] ? String(isoMatch[4]).padStart(2, "0") : "19";
    const mm = isoMatch[5] || "30";
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T${hh}:${mm}:00Z`;
  }

  // 2. European numeric: 28.11.2026 or 28/11/2026
  const euroMatch = s.match(
    /\b([0-2]?\d|3[01])[./](0?[1-9]|1[0-2])[./](202[5-9]|203\d)\b/
  );
  if (euroMatch) {
    const dd = String(euroMatch[1]).padStart(2, "0");
    const mo = String(euroMatch[2]).padStart(2, "0");
    return `${euroMatch[3]}-${mo}-${dd}T19:30:00Z`;
  }

  // 3. Month Day, Year: "Nov 28, 2026" or "November 28 2026"
  const mdy = s.match(
    /\b([A-Za-zäéû]{3,9})\.?\s+([0-2]?\d|3[01])(?:st|nd|rd|th)?,?\s+(202[5-9]|203\d)\b/i
  );
  if (mdy) {
    const mo = MONTHS_MAP[mdy[1].toLowerCase()];
    if (mo) {
      const dd = String(mdy[2]).padStart(2, "0");
      return `${mdy[3]}-${mo}-${dd}T19:30:00Z`;
    }
  }

  // 4. Day Month Year: "28 Nov 2026" or "28. November 2026"
  const dmy = s.match(
    /\b([0-2]?\d|3[01])\.?\s+([A-Za-zäéû]{3,9})\.?,?\s+(202[5-9]|203\d)\b/i
  );
  if (dmy) {
    const mo = MONTHS_MAP[dmy[2].toLowerCase()];
    if (mo) {
      const dd = String(dmy[1]).padStart(2, "0");
      return `${dmy[3]}-${mo}-${dd}T19:30:00Z`;
    }
  }

  return null;
}

function collectJsonLdEvents(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdEvents(item, out);
    return out;
  }

  const rawType = node["@type"];
  const types = Array.isArray(rawType) ? rawType : rawType ? [rawType] : [];
  const isEvent = types.some((t) =>
    /^(MusicEvent|Event|Festival|TheaterEvent|PerformingArtsEvent)$/i.test(
      String(t)
    )
  );

  if (isEvent && node.name && node.startDate) {
    out.push(node);
  }

  if (node["@graph"]) collectJsonLdEvents(node["@graph"], out);
  if (node.subEvent) collectJsonLdEvents(node.subEvent, out);
  if (node.events) collectJsonLdEvents(node.events, out);
  if (node.itemListElement) {
    for (const el of Array.isArray(node.itemListElement)
      ? node.itemListElement
      : [node.itemListElement]) {
      collectJsonLdEvents(el?.item || el, out);
    }
  }
  return out;
}

export function inferRoleFromNameOrJob(name, job = "", schemaType = "") {
  if (
    /MusicGroup|Organization/i.test(schemaType) ||
    /orchestra|philharmoni|symphony|sinfonie|staatskapelle|orchester|orchestre/i.test(
      name
    )
  ) {
    return "orchestra";
  }
  if (/quartet|trio|quintet|ensemble|consort|camerata|choir|chorus/i.test(name)) {
    return "ensemble";
  }
  if (/conductor|dirigent|chef d'orchestre|maestro/i.test(`${name} ${job}`)) {
    return "conductor";
  }
  return "soloist";
}

/**
 * Tier 1A: Parses Schema.org `MusicEvent` JSON-LD blocks from an HTML string.
 */
export function parseMusicEventsFromHtml(html, sourceUrl = "") {
  const scripts = [
    ...String(html || "").matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  const rawEvents = [];
  for (const match of scripts) {
    const body = match[1]?.trim();
    if (!body) continue;
    try {
      const parsed = JSON.parse(body);
      collectJsonLdEvents(parsed, rawEvents);
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  return rawEvents
    .map((ev) => {
      const iso = parseFlexibleDateToIso(ev.startDate) || String(ev.startDate);
      const loc = Array.isArray(ev.location) ? ev.location[0] : ev.location;
      const addr =
        typeof loc?.address === "string"
          ? { addressLocality: loc.address }
          : loc?.address || {};
      const performersRaw = Array.isArray(ev.performer)
        ? ev.performer
        : ev.performer
          ? [ev.performer]
          : [];

      const performers = performersRaw
        .map((p) => {
          if (typeof p === "string") {
            return {
              name: p.trim(),
              role: inferRoleFromNameOrJob(p),
              instrument: null,
            };
          }
          const pName = String(p?.name || "").trim();
          const pType = String(p?.["@type"] || "");
          const job = String(p?.jobTitle || p?.roleName || "").trim();
          return {
            name: pName,
            role: inferRoleFromNameOrJob(pName, job, pType),
            instrument: job || null,
          };
        })
        .filter((p) => p.name);

      const worksRaw = [
        ...(Array.isArray(ev.workPerformed)
          ? ev.workPerformed
          : ev.workPerformed
            ? [ev.workPerformed]
            : []),
        ...(Array.isArray(ev.about) ? ev.about : ev.about ? [ev.about] : []),
      ];

      const works = worksRaw
        .map((w) => {
          if (typeof w === "string") return splitComposerAndWork(w);
          const wName = String(w?.name || w?.headline || "").trim();
          if (!wName) return null;
          const compObj = w?.composer || w?.author || w?.creator;
          const compName =
            typeof compObj === "string"
              ? compObj.trim()
              : String(compObj?.name || "").trim();
          if (compName) {
            return { composerName: compName, workTitle: wName };
          }
          return splitComposerAndWork(wName);
        })
        .filter(Boolean);

      const offers = Array.isArray(ev.offers) ? ev.offers[0] : ev.offers;

      return {
        title: stripTags(ev.name),
        subtitle: ev.description ? stripTags(ev.description).slice(0, 220) : null,
        startsAt: iso,
        endsAt: ev.endDate ? parseFlexibleDateToIso(ev.endDate) : null,
        venueName:
          typeof loc === "string"
            ? loc.trim()
            : String(loc?.name || "").trim() || null,
        city: String(addr?.addressLocality || "").trim() || null,
        country:
          typeof addr?.addressCountry === "object"
            ? String(addr.addressCountry?.name || "").trim() || null
            : String(addr?.addressCountry || "").trim() || null,
        sourceUrl: String(ev.url || sourceUrl || "").trim() || null,
        ticketUrl: String(offers?.url || ev.url || sourceUrl || "").trim() || null,
        performers,
        works,
      };
    })
    .filter((e) => e.title && e.startsAt);
}

/**
 * Tier 1B: Parses an iCalendar (.ics) string into normalized concert events.
 */
export function parseIcsCalendar(icsText, defaultSourceUrl = "") {
  const unfolded = String(icsText || "").replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  const events = [];

  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0] || "";
    const fields = {};
    for (const line of body.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).split(";")[0].toUpperCase().trim();
      const val = line
        .slice(idx + 1)
        .replace(/\\n/g, "\n")
        .replace(/\\,/g, ",")
        .trim();
      if (key && !fields[key]) fields[key] = val;
    }

    if (!fields.SUMMARY || !fields.DTSTART) continue;
    const dt = fields.DTSTART;
    let iso = parseFlexibleDateToIso(dt);
    if (!iso) {
      const m = dt.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
      if (m) {
        iso = `${m[1]}-${m[2]}-${m[3]}T${m[4] || "19"}:${m[5] || "30"}:${m[6] || "00"}Z`;
      }
    }
    if (!iso) continue;

    const locParts = fields.LOCATION
      ? fields.LOCATION.split(",").map((x) => x.trim()).filter(Boolean)
      : [];

    const programLines = String(fields.DESCRIPTION || "")
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.includes(":") || l.includes("—") || l.includes("Op."));

    events.push({
      title: fields.SUMMARY,
      subtitle: null,
      startsAt: iso,
      endsAt: null,
      venueName: locParts[0] || null,
      city: locParts[1] || null,
      country: locParts[2] || null,
      sourceUrl: fields.URL || defaultSourceUrl || null,
      ticketUrl: fields.URL || defaultSourceUrl || null,
      performers: [],
      works: programLines.map(splitComposerAndWork).filter(Boolean),
    });
  }

  return events;
}

/**
 * Tier 1C: Extracts concert/tour objects embedded in Next.js `__NEXT_DATA__`,
 * Nuxt, Seated, Bandsintown, or CMS inline JSON `<script>` blocks.
 */
export function parseEmbeddedJsonEventsFromHtml(html, sourceUrl = "") {
  const jsonBlocks = [];
  for (const m of String(html || "").matchAll(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    jsonBlocks.push(m[1]);
  }
  for (const m of String(html || "").matchAll(
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    jsonBlocks.push(m[1]);
  }

  const candidates = [];
  function walk(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 12) return;
    if (Array.isArray(node)) {
      for (const el of node) walk(el, depth + 1);
      return;
    }

    const rawDate =
      node.starts_at ||
      node.startDate ||
      node.start_date ||
      node.datetime ||
      node.eventDate ||
      node.performanceDate ||
      node.date;
    const rawTitle =
      node.title || node.name || node.headline || node.eventName || node.programTitle;
    const rawVenue =
      (typeof node.venue === "string" ? node.venue : node.venue?.name) ||
      (typeof node.location === "string" ? node.location : node.location?.name) ||
      node.venueName ||
      node.hall;

    if (rawDate && (rawTitle || rawVenue)) {
      const iso = parseFlexibleDateToIso(rawDate);
      if (iso) {
        const city =
          node.city ||
          node.venue?.city ||
          node.location?.city ||
          node.addressLocality ||
          null;
        const country =
          node.country ||
          node.venue?.country ||
          node.location?.country ||
          null;
        const ticket =
          node.ticketUrl ||
          node.ticket_url ||
          node.ticketsUrl ||
          node.url ||
          sourceUrl ||
          null;

        let resolvedTicket = ticket;
        if (ticket && sourceUrl) {
          try {
            resolvedTicket = new URL(String(ticket), sourceUrl).toString();
          } catch {
            resolvedTicket = String(ticket);
          }
        }

        candidates.push({
          title: stripTags(rawTitle || `${rawVenue}${city ? ` (${city})` : ""}`),
          subtitle: node.subtitle ? stripTags(node.subtitle).slice(0, 180) : null,
          startsAt: iso,
          endsAt: null,
          venueName: rawVenue ? stripTags(rawVenue) : null,
          city: city ? stripTags(city) : null,
          country: country ? stripTags(country) : null,
          sourceUrl: sourceUrl || resolvedTicket,
          ticketUrl: resolvedTicket,
          performers: [],
          works: [],
        });
      }
    }

    for (const val of Object.values(node)) {
      if (val && typeof val === "object") walk(val, depth + 1);
    }
  }

  for (const raw of jsonBlocks) {
    try {
      walk(JSON.parse(raw), 0);
    } catch {
      // Ignore non-JSON script blocks
    }
  }

  // Deduplicate by startsAt + title
  const seen = new Set();
  return candidates.filter((c) => {
    const k = `${c.startsAt.slice(0, 10)}::${normalizeText(c.title)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Tier 2: Heuristic HTML Schedule & Artist Tour Page Parser.
 * Scans `<article>`, `<li>`, `<tr>`, and event `<div>` containers containing dates,
 * hall/city names, repertoire lines, and ticket links.
 */
export function parseHtmlScheduleBlocks(html, sourceUrl = "", defaultTitlePrefix = "") {
  const cleaned = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");

  const blockRegex =
    /<(?:article|tr|li)\b[^>]*>([\s\S]{40,2800}?)<\/(?:article|tr|li)>|<div\b[^>]*class=["'][^"']*(?:event|concert|tour|schedule|performance|calendar-item|date-row)[^"']*["'][^>]*>([\s\S]{40,2800}?)<\/div>/gi;

  const events = [];
  const seenKeys = new Set();

  for (const m of cleaned.matchAll(blockRegex)) {
    const inner = m[1] || m[2] || "";
    if (!inner) continue;

    // 1. Look for explicit <time datetime="..."> first, otherwise flexible date in text
    const timeAttr = inner.match(/<time[^>]*datetime=["']([^"']+)["']/i)?.[1];
    const plain = stripTags(inner);
    const iso = parseFlexibleDateToIso(timeAttr || plain);
    if (!iso) continue;

    // Keep upcoming / current-season dates (2025+)
    if (iso < "2025-01-01") continue;

    // 2. Extract headings or bold segments for Title & Venue
    const headings = [
      ...inner.matchAll(/<(?:h[1-5]|strong|b)\b[^>]*>([\s\S]{2,140}?)<\/(?:h[1-5]|strong|b)>/gi),
    ]
      .map((h) => stripTags(h[1]))
      .filter((t) => t.length >= 3 && !/^(buy\s*tickets?|tickets?|more\s*info|details|read\s*more)$/i.test(t));

    // 3. Extract ticket / event link
    let linkUrl = sourceUrl || null;
    for (const a of inner.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,60}?)<\/a>/gi)) {
      const href = a[1].trim();
      const label = stripTags(a[2]);
      if (!href || href.startsWith("mailto:") || href.startsWith("javascript:")) continue;
      try {
        const resolved = sourceUrl ? new URL(href, sourceUrl).toString() : href;
        if (/ticket|book|buy|event|concert|detail/i.test(`${href} ${label}`)) {
          linkUrl = resolved;
          break;
        }
        if (linkUrl === sourceUrl) linkUrl = resolved;
      } catch {
        // Ignore invalid URL
      }
    }

    // 4. Identify venue / city hints if present
    let venueName = null;
    let city = null;
    const hallPattern =
      /\b([A-ZÀ-Ž][\wÀ-ž'.&\s-]{2,42}\b(?:Hall|Philharmoni[ce]|Konzerthaus|Musikverein|Concertgebouw|Opera| Auditorium|Theatre|Theater|Saal|Center|Centre|Festspielhaus|Palau|Teatro|Philharmonie))\b/;
    const hallMatch = plain.match(hallPattern);
    if (hallMatch) {
      venueName = hallMatch[1].trim();
    }

    const cityAfterComma = venueName
      ? plain
          .slice(plain.indexOf(venueName) + venueName.length)
          .match(/^\s*[–—,-]\s*([A-ZÀ-Ž][A-Za-zÀ-ž.\s-]{2,26})/)
      : null;
    if (cityAfterComma) {
      city = cityAfterComma[1].trim();
    }

    const title =
      headings.find((h) => !parseFlexibleDateToIso(h)) ||
      (defaultTitlePrefix && venueName
        ? `${defaultTitlePrefix} at ${venueName}`
        : venueName || plain.slice(0, 85));

    if (!title || title.length < 4) continue;

    // 5. Look for `Composer: Work` lines inside the block
    const lines = inner
      .split(/<(?:br|\/p|\/li|\/div)>/i)
      .map(stripTags)
      .filter((l) => l.length > 6 && l.length < 130);
    const works = [];
    for (const l of lines) {
      if (
        /symphony|concerto|sonata|quartet|suite|overture|op\.\s*\d+|bwv\s*\d+|k\.\s*\d+/i.test(
          l
        ) &&
        l !== title
      ) {
        const parsedWork = splitComposerAndWork(l);
        if (parsedWork) works.push(parsedWork);
      }
    }

    const dedup = `${iso.slice(0, 10)}::${normalizeText(venueName || title).slice(0, 32)}`;
    if (seenKeys.has(dedup)) continue;
    seenKeys.add(dedup);

    events.push({
      title: title.slice(0, 160),
      subtitle: null,
      startsAt: iso,
      endsAt: null,
      venueName,
      city,
      country: null,
      sourceUrl: sourceUrl || linkUrl,
      ticketUrl: linkUrl,
      performers: [],
      works: works.slice(0, 6),
    });

    if (events.length >= 40) break;
  }

  return events;
}

/**
 * Unified Multi-Tier Extractor (Tiers 1A, 1B, 1C, and Tier 2 HTML Heuristics).
 */
export function extractEventsMultiTier(
  rawText,
  sourceUrl = "",
  options = {}
) {
  const text = String(rawText || "");
  if (!text.trim()) return { events: [], tierUsed: "none" };

  if (sourceUrl.endsWith(".ics") || text.includes("BEGIN:VCALENDAR")) {
    const icsEvents = parseIcsCalendar(text, sourceUrl);
    if (icsEvents.length > 0) return { events: icsEvents, tierUsed: "ics" };
  }

  const jsonLdEvents = parseMusicEventsFromHtml(text, sourceUrl);
  if (jsonLdEvents.length > 0) {
    return { events: jsonLdEvents, tierUsed: "json_ld" };
  }

  const embeddedEvents = parseEmbeddedJsonEventsFromHtml(text, sourceUrl);
  if (embeddedEvents.length > 0) {
    return { events: embeddedEvents, tierUsed: "embedded_json" };
  }

  const htmlEvents = parseHtmlScheduleBlocks(
    text,
    sourceUrl,
    options.defaultTitlePrefix || ""
  );
  if (htmlEvents.length > 0) {
    return { events: htmlEvents, tierUsed: "html_heuristic" };
  }

  return { events: [], tierUsed: "none" };
}

/**
 * Parses NY Philharmonic Open Data (`2024-25_TO_NOW.json`) programs from `minDateIso` onward.
 */
export function parseNyPhilPrograms(programsPayload, minDateIso = "2026-09-01") {
  const programs = programsPayload?.programs || [];
  const results = [];

  for (const prog of programs) {
    const concerts = (prog.concerts || []).filter(
      (c) => String(c.Date || "") >= minDateIso
    );
    if (concerts.length === 0) continue;

    const selectedConcerts = concerts.slice(0, 2);

    const rawWorks = (prog.works || []).filter(
      (w) =>
        w.workTitle &&
        w.composerName &&
        !/intermission/i.test(String(w.composerName)) &&
        !/intermission/i.test(String(w.workTitle))
    );
    if (rawWorks.length === 0) continue;

    let conductorName = null;
    const soloistMap = new Map();
    const works = [];

    for (const w of rawWorks) {
      if (w.conductorName && !conductorName) {
        conductorName = flipCommaName(w.conductorName);
      }
      for (const s of w.soloists || []) {
        const sName = flipCommaName(s.soloistName);
        if (
          sName &&
          !/chorus|choir|ensemble|philharmonic/i.test(sName) &&
          !soloistMap.has(sName)
        ) {
          soloistMap.set(sName, s.soloistInstrument || "Soloist");
        }
      }

      const compName = flipCommaName(w.composerName);
      let wTitle = String(w.workTitle || "")
        .replace(/\s+/g, " ")
        .trim();
      if (wTitle === wTitle.toUpperCase() && wTitle.length > 4) {
        wTitle = wTitle
          .toLowerCase()
          .replace(/\b([a-z])/g, (ch) => ch.toUpperCase())
          .replace(/\bOp\.\s*/gi, "Op. ")
          .replace(/\bNo\.\s*/gi, "No. ")
          .replace(/\bBwv\b/gi, "BWV")
          .replace(/\bKv?\.\s*/gi, "K. ")
          .replace(
            /\bIn\s+([A-G](?:-Flat|-Sharp)?)\s+(Major|Minor)\b/g,
            (_, k, mode) =>
              `in ${k.replace("-Flat", "-flat").replace("-Sharp", "-sharp")} ${mode.toLowerCase()}`
          );
      }

      const prevWork = works[works.length - 1];
      if (
        !prevWork ||
        prevWork.composerName !== compName ||
        prevWork.workTitle !== wTitle
      ) {
        works.push({
          composerName: compName,
          workTitle: wTitle,
        });
      }
    }

    const leadComposer = works[0]?.composerName?.split(" ").pop() || "Season";
    const leadWork = works[0]?.workTitle || "Subscription Program";
    const progTitle = conductorName
      ? `${conductorName} Conducts ${leadComposer}`
      : `NY Philharmonic: ${leadWork}`;

    for (const c of selectedConcerts) {
      const datePart = String(c.Date).slice(0, 10);
      let hour = 19;
      let minute = 30;
      const tm = String(c.Time || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (tm) {
        hour = Number(tm[1]);
        minute = Number(tm[2]);
        if (tm[3].toUpperCase() === "PM" && hour < 12) hour += 12;
        if (tm[3].toUpperCase() === "AM" && hour === 12) hour = 0;
      }
      const startsAt = `${datePart}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-05:00`;

      const performers = [
        {
          name: "New York Philharmonic",
          role: "orchestra",
          instrument: "Symphony Orchestra",
        },
      ];
      if (conductorName) {
        performers.push({
          name: conductorName,
          role: "conductor",
          instrument: "Conductor",
        });
      }
      for (const [sName, sInst] of soloistMap.entries()) {
        performers.push({
          name: sName,
          role: "soloist",
          instrument: sInst,
        });
      }

      results.push({
        externalKey: `nyphil:${prog.programID}:${datePart}:${slugify(c.Venue || "geffen")}`,
        title: progTitle,
        subtitle: c.eventType || "2026/27 Season",
        startsAt,
        season: "2026/27",
        venueName: c.Venue || "David Geffen Hall",
        city: c.Location || "New York",
        country: "United States",
        sourceUrl: "https://www.nyphil.org/calendar",
        ticketUrl: "https://www.nyphil.org/calendar",
        performers,
        works,
      });
    }
  }

  return results;
}

export function buildSuggestionMetadata(composerName, workTitle) {
  const cat = extractCatalog(workTitle);
  const catalogDisplay =
    cat.catalog_system && cat.catalog_number
      ? `${cat.catalog_system} ${cat.catalog_number}`
      : null;
  const genre = mapWorkGenre("", workTitle);
  const dedupKey = `${normalizeText(composerName)}::${normalizeText(workTitle)}`;
  return {
    dedupKey,
    catalogDisplay,
    genre,
  };
}

/**
 * Computes a canonical cross-source fingerprint for an event so that
 * e.g. Carnegie Hall's calendar and Yuja Wang's tour page map to the same slot.
 */
export function computeCanonicalFingerprint({
  venueId,
  rawVenueName,
  rawCity,
  startsAt,
}) {
  const day = String(startsAt || "").slice(0, 10);
  if (venueId) {
    return `venue:${venueId}::${day}`;
  }
  const vKey = slugify(rawVenueName || "unknown-hall").slice(0, 32);
  const cKey = slugify(rawCity || "city").slice(0, 20);
  return `raw:${cKey}:${vKey}::${day}`;
}

/**
 * Matches a raw venue name / city from a tour calendar against our 100+ cataloged `venues`.
 */
export function matchCatalogVenue(venues, rawVenueName, rawCity) {
  if (!rawVenueName && !rawCity) return null;
  const nv = normalizeText(rawVenueName || "");
  const nc = normalizeText(rawCity || "");

  if (nv) {
    // 1. Exact short_name or name match
    for (const v of venues) {
      if (
        normalizeText(v.name) === nv ||
        (v.short_name && normalizeText(v.short_name) === nv)
      ) {
        return v;
      }
    }
    // 2. Substring match (preferring same city if city is provided)
    const candidates = venues.filter((v) => {
      const vFull = normalizeText(v.name);
      const vShort = normalizeText(v.short_name || v.name);
      return (
        (vShort.length >= 5 && (nv.includes(vShort) || vFull.includes(nv))) ||
        (nv.length >= 6 && vShort.includes(nv))
      );
    });
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1 && nc) {
      const cityHit = candidates.find(
        (v) =>
          normalizeText(v.city).includes(nc) || nc.includes(normalizeText(v.city))
      );
      if (cityHit) return cityHit;
      return candidates[0];
    }
  }

  return null;
}

/**
 * Compares an incoming crawled concert / tour date against existing live `concert_events`
 * (hydrated with performers & works) to prevent duplicates and surface smart Merge Diffs.
 *
 * Returns:
 *   - `{ status: 'exact_duplicate', existingEvent, confidence: 100, summary }`
 *   - `{ status: 'merge_candidate', existingEvent, confidence: 85, summary }`
 *   - `{ status: 'new_event', existingEvent: null, confidence: 0, summary: null }`
 */
export function compareConcertAgainstExisting(
  incoming,
  matchedVenueId,
  existingEvents
) {
  const inDay = String(incoming.startsAt || "").slice(0, 10);
  if (!inDay) {
    return {
      status: "new_event",
      existingEvent: null,
      confidence: 0,
      summary: null,
    };
  }

  const inDayMs = Date.parse(`${inDay}T12:00:00Z`);

  for (const ex of existingEvents) {
    // Check same external_key first
    if (incoming.externalKey && ex.external_key === incoming.externalKey) {
      return {
        status: "exact_duplicate",
        existingEvent: ex,
        confidence: 100,
        summary: `Exact external_key match with "${ex.title}"`,
      };
    }

    // Must be at the same venue
    if (!matchedVenueId || ex.venue_id !== matchedVenueId) continue;

    const exDay = String(ex.starts_at || "").slice(0, 10);
    const exDayMs = Date.parse(`${exDay}T12:00:00Z`);
    const dayDiff = Math.abs(inDayMs - exDayMs) / 86400000;

    // Allow 0 days (same date) or <=1 day if timezone UTC offset crossed midnight
    if (dayDiff > 1.05) continue;
    if (dayDiff > 0.1) {
      // Only treat +/- 1 day as same concert if at least one performer or title overlaps
      const exNames = (ex.performerNames || []).map(normalizeText);
      const inNames = (incoming.performers || []).map((p) =>
        normalizeText(p.name)
      );
      const overlap = inNames.some((n) => n && exNames.includes(n));
      if (!overlap) continue;
    }

    // Same hall + same date! Inspect what new info incoming brings:
    const exPerfSet = new Set((ex.performerNames || []).map(normalizeText));
    const exWorkSet = new Set((ex.workTitles || []).map(normalizeText));

    const newPerfs = (incoming.performers || []).filter(
      (p) => p.name && !exPerfSet.has(normalizeText(p.name))
    );
    const newWorks = (incoming.works || []).filter(
      (w) => w.workTitle && !exWorkSet.has(normalizeText(w.workTitle))
    );
    const addsTicket =
      incoming.ticketUrl &&
      (!ex.ticket_url || ex.ticket_url === ex.source_url) &&
      incoming.ticketUrl !== ex.ticket_url;

    if (newPerfs.length === 0 && newWorks.length === 0 && !addsTicket) {
      return {
        status: "exact_duplicate",
        existingEvent: ex,
        confidence: 100,
        summary: `Already published on World Stage ("${ex.title}" on ${exDay})`,
      };
    }

    const diffParts = [];
    if (newPerfs.length > 0) {
      diffParts.push(
        `+${newPerfs.length} artist${newPerfs.length > 1 ? "s" : ""} (${newPerfs
          .map((p) => p.name)
          .slice(0, 2)
          .join(", ")})`
      );
    }
    if (newWorks.length > 0) {
      diffParts.push(
        `+${newWorks.length} work${newWorks.length > 1 ? "s" : ""} (${newWorks
          .map((w) => w.workTitle)
          .slice(0, 2)
          .join(", ")})`
      );
    }
    if (addsTicket) {
      diffParts.push("+direct ticket URL");
    }

    return {
      status: "merge_candidate",
      existingEvent: ex,
      confidence: 88,
      summary: `Matches "${ex.title}" (${exDay}) · ${diffParts.join(" · ")}`,
    };
  }

  return {
    status: "new_event",
    existingEvent: null,
    confidence: 0,
    summary: null,
  };
}
