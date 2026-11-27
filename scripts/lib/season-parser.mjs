/**
 * Season & Concert Event Parsers for Opus Archive World Stage.
 *
 * Supports:
 *   1. Schema.org `MusicEvent` / `Event` JSON-LD blocks embedded in venue,
 *      orchestra, or soloist HTML pages (`parseMusicEventsFromHtml`)
 *   2. Standard iCalendar `.ics` (`VEVENT`) feeds (`parseIcsCalendar`)
 *   3. New York Philharmonic CC0 Open Data JSON (`parseNyPhilPrograms`)
 */

import {
  extractCatalog,
  mapWorkGenre,
  normalizeText,
  slugify,
} from "./dedup.mjs";

/**
 * Converts "Last, First Middle" (used in NYPhil / archival feeds) to "First Middle Last".
 */
export function flipCommaName(raw) {
  // Prefer bracketed diacritic spelling when NYPhil provides e.g. "Tezier [Tézier], Ludovic"
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

/**
 * Splits a free-text program line like "Johannes Brahms: Violin Concerto in D major, Op. 77"
 * or "Mahler — Symphony No. 5" into { composerName, workTitle }.
 */
export function splitComposerAndWork(rawLine) {
  const line = String(rawLine || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!line) return null;

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

/**
 * Recursively collects Schema.org Event / MusicEvent objects from JSON-LD payloads.
 */
function collectJsonLdEvents(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdEvents(item, out);
    return out;
  }

  const rawType = node["@type"];
  const types = Array.isArray(rawType) ? rawType : rawType ? [rawType] : [];
  const isEvent = types.some((t) =>
    /^(MusicEvent|Event|Festival|TheaterEvent)$/i.test(String(t))
  );

  if (isEvent && node.name && node.startDate) {
    out.push(node);
  }

  if (node["@graph"]) collectJsonLdEvents(node["@graph"], out);
  if (node.subEvent) collectJsonLdEvents(node.subEvent, out);
  if (node.itemListElement) {
    for (const el of Array.isArray(node.itemListElement)
      ? node.itemListElement
      : [node.itemListElement]) {
      collectJsonLdEvents(el?.item || el, out);
    }
  }
  return out;
}

/**
 * Parses Schema.org `MusicEvent` JSON-LD blocks from an HTML string.
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

  return rawEvents.map((ev) => {
    const loc = Array.isArray(ev.location) ? ev.location[0] : ev.location;
    const addr = loc?.address || {};
    const performersRaw = Array.isArray(ev.performer)
      ? ev.performer
      : ev.performer
        ? [ev.performer]
        : [];

    const performers = performersRaw
      .map((p) => {
        if (typeof p === "string") {
          return { name: p, role: "soloist", instrument: null };
        }
        const pType = String(p?.["@type"] || "");
        const job = String(p?.jobTitle || p?.roleName || "");
        let role = "soloist";
        if (/MusicGroup|Organization/i.test(pType) || /orchestra|philharmoni|symphony|ensemble|choir/i.test(String(p?.name || ""))) {
          role = "orchestra";
        } else if (/conductor|dirigent/i.test(job)) {
          role = "conductor";
        }
        return {
          name: String(p?.name || "").trim(),
          role,
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
      title: String(ev.name || "").trim(),
      subtitle: ev.description ? String(ev.description).slice(0, 220) : null,
      startsAt: String(ev.startDate),
      endsAt: ev.endDate ? String(ev.endDate) : null,
      venueName: String(loc?.name || "").trim() || null,
      city: String(addr?.addressLocality || "").trim() || null,
      country: String(addr?.addressCountry || "").trim() || null,
      sourceUrl: String(ev.url || sourceUrl || "").trim() || null,
      ticketUrl: String(offers?.url || ev.url || sourceUrl || "").trim() || null,
      performers,
      works,
    };
  });
}

/**
 * Parses an iCalendar (.ics) string into normalized concert events.
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
    let iso = dt;
    const m = dt.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
    if (m) {
      iso = `${m[1]}-${m[2]}-${m[3]}T${m[4] || "19"}:${m[5] || "30"}:${m[6] || "00"}Z`;
    }

    const programLines = String(fields.DESCRIPTION || "")
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.includes(":") || l.includes("—") || l.includes("Op."));

    events.push({
      title: fields.SUMMARY,
      subtitle: null,
      startsAt: iso,
      endsAt: null,
      venueName: fields.LOCATION ? fields.LOCATION.split(",")[0].trim() : null,
      city: null,
      country: null,
      sourceUrl: fields.URL || defaultSourceUrl || null,
      ticketUrl: fields.URL || defaultSourceUrl || null,
      performers: [],
      works: programLines.map(splitComposerAndWork).filter(Boolean),
    });
  }

  return events;
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

    // Deduplicate identical subscription runs to the opening & weekend dates (max 2 dates per program)
    // so the calendar stays crisp and varied while preserving real dates & venues.
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
      // Convert ALL-CAPS NYPhil archival work titles to clean title case when needed
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
          .replace(/\bIn\s+([A-G](?:-Flat|-Sharp)?)\s+(Major|Minor)\b/g, (_, k, mode) => `in ${k.replace("-Flat", "-flat").replace("-Sharp", "-sharp")} ${mode.toLowerCase()}`);
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

/**
 * Builds suggested metadata payload when a concert work isn't in `public.works`.
 */
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
