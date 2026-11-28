import {
  extractCatalog,
  extractKey,
  inferEraFromBirthYear,
  mapWorkGenre,
} from "../../scripts/lib/dedup.mjs";

const UA =
  "OpusArchive/1.0 (https://github.com/liubenko/opus-archive; classical catalog enrichment)";

export interface EnrichedComposerCandidate {
  id: string;
  name: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  nationality: string;
  birth_place: string | null;
  era: string;
  avatar_url: string | null;
  short_bio: string;
  imslp_url: string | null;
  source_url: string | null;
  sources: string[];
}

export interface EnrichedWorkCandidate {
  id: string;
  title: string;
  composer_name: string;
  genre: string;
  catalog_display: string | null;
  key_signature: string | null;
  year_composed: number | null;
  duration_minutes: number | null;
  instrumentation: string | null;
  description: string | null;
  imslp_url: string | null;
  source_url: string | null;
  sources: string[];
  composer_meta: EnrichedComposerCandidate | null;
}

export interface EnrichedPerformerCandidate {
  id: string;
  name: string;
  performer_type: "orchestra" | "ensemble" | "conductor" | "soloist";
  instrument_or_role: string;
  nationality: string | null;
  home_city: string | null;
  website_url: string | null;
  calendar_url: string | null;
  avatar_url: string | null;
  short_bio: string;
  wikidata_qid: string | null;
  source_url: string | null;
  sources: string[];
}

export interface EnrichedVenueCandidate {
  id: string;
  name: string;
  short_name: string;
  city: string;
  country: string;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  opened_year: number | null;
  architect_or_acoustics: string | null;
  website_url: string | null;
  calendar_url: string | null;
  photo_url: string | null;
  short_bio: string;
  wikidata_qid: string | null;
  source_url: string | null;
  sources: string[];
}

const NATIONALITY_PATTERNS = [
  "Ukrainian",
  "German",
  "Austrian",
  "French",
  "Italian",
  "Russian",
  "American",
  "British",
  "English",
  "Polish",
  "Czech",
  "Hungarian",
  "Finnish",
  "Spanish",
  "Argentine",
  "Brazilian",
  "Mexican",
  "Japanese",
  "Chinese",
  "South Korean",
  "Korean",
  "Estonian",
  "Latvian",
  "Lithuanian",
  "Georgian",
  "Armenian",
  "Turkish",
  "Norwegian",
  "Swedish",
  "Danish",
  "Dutch",
  "Belgian",
  "Swiss",
  "Romanian",
  "Canadian",
  "Australian",
  "Icelandic",
];

function extractYearsAndNationality(text: string): {
  birthYear: number | null;
  deathYear: number | null;
  nationality: string;
} {
  let birthYear: number | null = null;
  let deathYear: number | null = null;

  const spanMatch = text.match(
    /\((?:[^()]{0,40}?\b)?(1[3-9]\d{2}|20[01]\d)\s*[–—-]\s*(?:[^()]{0,35}?\b)?(1[3-9]\d{2}|20[0-2]\d)\)/
  );
  if (spanMatch) {
    birthYear = Number(spanMatch[1]);
    deathYear = Number(spanMatch[2]);
  } else {
    const bornMatch = text.match(
      /\b(?:born|b\.)[^()]{0,25}?\b(1[4-9]\d{2}|20[01]\d)\b/i
    );
    if (bornMatch) birthYear = Number(bornMatch[1]);
  }

  let nationality = "International";
  for (const nat of NATIONALITY_PATTERNS) {
    if (new RegExp(`\\b${nat}\\b`, "i").test(text)) {
      nationality = nat === "English" ? "British" : nat;
      break;
    }
  }

  return { birthYear, deathYear, nationality };
}

async function checkImslpComposerUrl(name: string): Promise<string | null> {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  const catQuery = `Category:${last}, ${first}`;
  try {
    const res = await fetch(
      `https://imslp.org/api.php?action=opensearch&search=${encodeURIComponent(
        catQuery
      )}&namespace=14&limit=3&format=json`,
      { headers: { "User-Agent": UA } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as [string, string[], string[], string[]];
    const url = data?.[3]?.[0];
    return url || null;
  } catch {
    return null;
  }
}

type OpenSearchTuple = [string, string[], string[], string[]];
type OpenOpusSearchJson = {
  composers?: {
    id?: string;
    name?: string;
    complete_name?: string;
    birth?: string;
    death?: string;
    epoch?: string;
    portrait?: string;
  }[];
};
type MusicBrainzWorkSearchJson = {
  works?: {
    id: string;
    title: string;
    type?: string;
    relations?: {
      type?: string;
      artist?: { name?: string };
    }[];
  }[];
};

export async function lookupComposerCandidates(
  query: string
): Promise<EnrichedComposerCandidate[]> {
  if (!query.trim()) return [];

  const [wikiSearchRes, openOpusRes] = await Promise.allSettled([
    fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        `${query} composer`
      )}&limit=4&namespace=0&format=json`,
      { headers: { "User-Agent": UA } }
    ).then((r) => (r.ok ? (r.json() as Promise<OpenSearchTuple>) : null)),
    fetch(
      `https://api.openopus.org/composer/list/search/${encodeURIComponent(
        query
      )}.json`,
      { headers: { "User-Agent": UA } }
    ).then((r) => (r.ok ? (r.json() as Promise<OpenOpusSearchJson>) : null)),
  ]);

  const titles = new Set<string>();
  if (
    wikiSearchRes.status === "fulfilled" &&
    Array.isArray(wikiSearchRes.value?.[1])
  ) {
    for (const t of wikiSearchRes.value[1]) {
      titles.add(t);
    }
  }

  const directWiki = await fetch(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      query
    )}&limit=2&namespace=0&format=json`,
    { headers: { "User-Agent": UA } }
  )
    .then((r) => (r.ok ? (r.json() as Promise<OpenSearchTuple>) : null))
    .catch(() => null);
  if (Array.isArray(directWiki?.[1])) {
    for (const t of directWiki[1]) titles.add(t);
  }

  const openOpusComposers: {
    name?: string;
    complete_name?: string;
    birth?: string;
    death?: string;
    epoch?: string;
    portrait?: string;
  }[] =
    openOpusRes.status === "fulfilled" &&
    Array.isArray(openOpusRes.value?.composers)
      ? openOpusRes.value.composers
      : [];

  const titleList = Array.from(titles).slice(0, 3);
  const wikiSummaries = await Promise.all(
    titleList.map(async (t) => {
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            t.replace(/ /g, "_")
          )}`,
          { headers: { "User-Agent": UA } }
        );
        if (!res.ok) return null;
        return (await res.json()) as {
          title?: string;
          wikibase_item?: string;
          description?: string;
          extract?: string;
          thumbnail?: { source?: string };
          content_urls?: { desktop?: { page?: string } };
        };
      } catch {
        return null;
      }
    })
  );

  // Batch-fetch exact birth (P569) and death (P570) years from Wikidata QIDs
  const qids = wikiSummaries
    .map((s) => s?.wikibase_item)
    .filter((q): q is string => Boolean(q));
  const wikidataYears = new Map<
    string,
    { birth: number | null; death: number | null }
  >();
  if (qids.length > 0) {
    try {
      const wdRes = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join(
          "|"
        )}&props=claims&format=json`,
        { headers: { "User-Agent": UA } }
      );
      if (wdRes.ok) {
        const wdJson = (await wdRes.json()) as {
          entities?: Record<
            string,
            {
              claims?: {
                P569?: {
                  mainsnak?: { datavalue?: { value?: { time?: string } } };
                }[];
                P570?: {
                  mainsnak?: { datavalue?: { value?: { time?: string } } };
                }[];
              };
            }
          >;
        };
        for (const qid of qids) {
          const claims = wdJson.entities?.[qid]?.claims;
          const bStr =
            claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time || "";
          const dStr =
            claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time || "";
          const bMatch = bStr.match(/([12]\d{3})/);
          const dMatch = dStr.match(/([12]\d{3})/);
          wikidataYears.set(qid, {
            birth: bMatch ? Number(bMatch[1]) : null,
            death: dMatch ? Number(dMatch[1]) : null,
          });
        }
      }
    } catch {
      // Ignore Wikidata fallback error
    }
  }

  const candidates: EnrichedComposerCandidate[] = [];

  for (const sum of wikiSummaries) {
    if (!sum || !sum.extract) continue;
    const combined = `${sum.description || ""} ${sum.extract}`;
    if (
      titleList.length > 1 &&
      !/composer|musician|pianist|violinist|cellist|conductor|organist/i.test(
        combined
      )
    ) {
      continue;
    }

    const cleanName = String(sum.title || query)
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
    const { birthYear, deathYear, nationality } =
      extractYearsAndNationality(combined);
    const wd = sum.wikibase_item
      ? wikidataYears.get(sum.wikibase_item)
      : undefined;

    const ooMatch = openOpusComposers.find((c) =>
      (c.complete_name || c.name || "")
        .toLowerCase()
        .includes(cleanName.split(" ").pop()?.toLowerCase() || "")
    );

    const finalBirth =
      wd?.birth ||
      birthYear ||
      (ooMatch?.birth ? Number(ooMatch.birth.slice(0, 4)) : null);
    const finalDeath =
      wd?.death ||
      deathYear ||
      (ooMatch?.death && ooMatch.death !== "null"
        ? Number(ooMatch.death.slice(0, 4))
        : null);

    const imslpUrl = await checkImslpComposerUrl(cleanName);
    const sources = ["Wikipedia"];
    if (ooMatch) sources.push("OpenOpus");
    if (imslpUrl) sources.push("IMSLP");

    candidates.push({
      id: `wiki:${cleanName}`,
      name: cleanName,
      full_name: ooMatch?.complete_name || cleanName,
      birth_year: finalBirth,
      death_year: finalDeath,
      nationality,
      birth_place: null,
      era: inferEraFromBirthYear(finalBirth || 1950),
      avatar_url: sum.thumbnail?.source || ooMatch?.portrait || null,
      short_bio: sum.extract.slice(0, 550),
      imslp_url: imslpUrl,
      source_url: sum.content_urls?.desktop?.page || imslpUrl || null,
      sources,
    });
  }

  if (candidates.length === 0 && openOpusComposers.length > 0) {
    for (const c of openOpusComposers.slice(0, 3)) {
      const bYear = c.birth ? Number(c.birth.slice(0, 4)) : null;
      const dYear =
        c.death && c.death !== "null" ? Number(c.death.slice(0, 4)) : null;
      const fullName = c.complete_name || c.name || query;
      const imslpUrl = await checkImslpComposerUrl(fullName);
      candidates.push({
        id: `oo:${fullName}`,
        name: fullName,
        full_name: fullName,
        birth_year: bYear,
        death_year: dYear,
        nationality: "International",
        birth_place: null,
        era: inferEraFromBirthYear(bYear || 1900),
        avatar_url: c.portrait || null,
        short_bio: `${fullName} — classical composer indexed via OpenOpus.`,
        imslp_url: imslpUrl,
        source_url: imslpUrl,
        sources: imslpUrl ? ["OpenOpus", "IMSLP"] : ["OpenOpus"],
      });
    }
  }

  return candidates.slice(0, 4);
}

export function parseImslpWorkInfo(wikitext: string) {
  const getField = (pattern: string) => {
    const m = wikitext.match(
      new RegExp(`^\\|[ \\t]*(?:${pattern})[ \\t]*=[ \\t]*([^\\r\\n]*)`, "im")
    );
    if (!m) return null;
    const cleaned = m[1]
      .replace(
        /\{\{Key\|([a-g])([b#s]?)\}\}/g,
        (_, n, acc) =>
          `${n.toUpperCase()}${acc === "b" ? "-flat" : acc === "#" || acc === "s" ? "-sharp" : ""} minor`
      )
      .replace(
        /\{\{Key\|([A-G])([b#s]?)\}\}/g,
        (_, n, acc) =>
          `${n}${acc === "b" ? "-flat" : acc === "#" || acc === "s" ? "-sharp" : ""} major`
      )
      .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
      .replace(/\{\{[^}]*\}\}/g, "")
      .replace(/\{\{.*/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!cleaned || cleaned.startsWith("|") || cleaned.includes("=")) {
      return null;
    }
    return cleaned;
  };

  const yearRaw = getField("Year/Date of Composition|Composition Year");
  const yearMatch = yearRaw?.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
  const keyRaw = getField("Key");
  const instRaw = getField("Instrumentation");
  const durRaw = getField("Average Duration");
  const durMatch = durRaw?.match(/(\d+)\s*(?:min|m\b)/i);

  return {
    year_composed: yearMatch ? Number(yearMatch[1]) : null,
    key_signature: keyRaw ? keyRaw.slice(0, 60) : null,
    instrumentation: instRaw ? instRaw.slice(0, 180) : null,
    duration_minutes: durMatch ? Number(durMatch[1]) : null,
  };
}

function stripCatalogSuffix(title: string): string {
  return title
    .replace(
      /,?\s*\b(?:Op\.?|BWV|KV|K\.?|Hob\.?|D\.?|S\.?|Sz\.?|TrV|WoO|RV|HWV|TWV|L\.?|M\.?|H\.?|B\.?)\s*[\dA-Za-z./-]+$/i,
      ""
    )
    .trim();
}

export async function lookupWorkCandidates(
  workQuery: string,
  composerQuery: string,
  options?: { includeComposerMeta?: boolean }
): Promise<EnrichedWorkCandidate[]> {
  const includeComposerMeta = options?.includeComposerMeta ?? true;
  const baseWorkQuery = stripCatalogSuffix(workQuery) || workQuery;
  const combinedSearch = [baseWorkQuery, composerQuery]
    .filter(Boolean)
    .join(" ");
  const composerLast = composerQuery.trim().split(/\s+/).pop() || "";

  type ImslpSearchJson = {
    query?: { search?: { title: string }[] };
  };

  const [mbRes, imslpRes, wikiRes, composerCands] = await Promise.all([
    fetch(
      `https://musicbrainz.org/ws/2/work/?query=${encodeURIComponent(
        composerLast
          ? `${baseWorkQuery} AND artist:${composerLast}`
          : baseWorkQuery
      )}&fmt=json&limit=4`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) =>
        r.ok ? (r.json() as Promise<MusicBrainzWorkSearchJson>) : null
      )
      .catch(() => null),
    fetch(
      `https://imslp.org/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        combinedSearch
      )}&srnamespace=0&srlimit=4&format=json`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) => (r.ok ? (r.json() as Promise<ImslpSearchJson>) : null))
      .catch(() => null),
    fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        combinedSearch
      )}&namespace=0&limit=3&format=json`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) => (r.ok ? (r.json() as Promise<OpenSearchTuple>) : null))
      .catch(() => null),
    includeComposerMeta && composerQuery.trim()
      ? lookupComposerCandidates(composerQuery)
      : Promise.resolve([]),
  ]);

  const primaryComposerMeta = composerCands[0] ?? null;

  // Inspect top IMSLP page wikitext if found
  let imslpTopTitle: string | null = null;
  let imslpTopUrl: string | null = null;
  let imslpParsed: ReturnType<typeof parseImslpWorkInfo> | null = null;

  const imslpHits = imslpRes?.query?.search || [];
  if (imslpHits.length > 0) {
    // Prefer a hit whose title includes the composer's last name if available
    const preferredHit =
      (composerLast &&
        imslpHits.find((h) =>
          h.title.toLowerCase().includes(composerLast.toLowerCase())
        )) ||
      imslpHits[0];

    imslpTopTitle = preferredHit.title;
    imslpTopUrl = `https://imslp.org/wiki/${encodeURIComponent(
      imslpTopTitle.replace(/ /g, "_")
    )}`;
    if (imslpTopTitle) {
      try {
        const wtRes = await fetch(
          `https://imslp.org/api.php?action=parse&page=${encodeURIComponent(
            imslpTopTitle
          )}&prop=wikitext&format=json`,
          { headers: { "User-Agent": UA } }
        );
        if (wtRes.ok) {
          const wtJson = (await wtRes.json()) as {
            parse?: { wikitext?: { "*"?: string } };
          };
          const wt = wtJson.parse?.wikitext?.["*"] || "";
          if (wt) imslpParsed = parseImslpWorkInfo(wt);
        }
      } catch {
        // Ignore wikitext parse error
      }
    }
  }

  // Optional Wikipedia summary for program description (try combined first, then work title alone)
  let wikiTitleCandidate: string | null =
    Array.isArray(wikiRes?.[1]) && wikiRes[1][0] ? String(wikiRes[1][0]) : null;
  if (!wikiTitleCandidate && baseWorkQuery.length >= 4) {
    try {
      const fallbackWiki = await fetch(
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
          baseWorkQuery
        )}&namespace=0&limit=2&format=json`,
        { headers: { "User-Agent": UA } }
      ).then((r) => (r.ok ? (r.json() as Promise<OpenSearchTuple>) : null));
      if (Array.isArray(fallbackWiki?.[1]) && fallbackWiki[1][0]) {
        wikiTitleCandidate = String(fallbackWiki[1][0]);
      }
    } catch {
      // Ignore fallback error
    }
  }

  let wikiDesc: string | null = null;
  let wikiPageUrl: string | null = null;
  let wikiYear: number | null = null;
  if (wikiTitleCandidate) {
    try {
      const sumRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          wikiTitleCandidate.replace(/ /g, "_")
        )}`,
        { headers: { "User-Agent": UA } }
      );
      if (sumRes.ok) {
        const sum = (await sumRes.json()) as {
          extract?: string;
          content_urls?: { desktop?: { page?: string } };
        };
        if (
          sum.extract &&
          /concerto|symphony|sonata|quartet|opera|composed|premiered|music|suite|piece|opus|orchestra/i.test(
            sum.extract
          )
        ) {
          wikiDesc = sum.extract.slice(0, 650);
          wikiPageUrl = sum.content_urls?.desktop?.page || null;
          const ym = sum.extract.match(
            /\b(?:composed|written|completed|premiered|arranged|published)\s+(?:in\s+)?(1[4-9]\d{2}|20[0-2]\d)\b/i
          );
          if (ym) wikiYear = Number(ym[1]);
        }
      }
    } catch {
      // Ignore wiki summary error
    }
  }

  const out: EnrichedWorkCandidate[] = [];

  if (imslpTopTitle && imslpTopUrl) {
    const m = imslpTopTitle.match(/^(.+?)\s*\(([^,()]+),\s*([^()]+)\)$/);
    const cleanWorkTitle = m ? m[1].trim() : imslpTopTitle;
    const inferredComp = m
      ? `${m[3].trim()} ${m[2].trim()}`
      : primaryComposerMeta?.name || composerQuery;
    const cat = extractCatalog(cleanWorkTitle);
    const catDisplay =
      cat.catalog_system && cat.catalog_number
        ? `${cat.catalog_system} ${cat.catalog_number}`
        : null;

    const sources = ["IMSLP"];
    if (wikiDesc) sources.push("Wikipedia");

    out.push({
      id: `imslp:${imslpTopTitle}`,
      title: cleanWorkTitle,
      composer_name: inferredComp || composerQuery,
      genre: mapWorkGenre("", cleanWorkTitle),
      catalog_display: catDisplay,
      key_signature:
        imslpParsed?.key_signature || extractKey(cleanWorkTitle) || null,
      year_composed: imslpParsed?.year_composed || wikiYear || null,
      duration_minutes: imslpParsed?.duration_minutes || null,
      instrumentation: imslpParsed?.instrumentation || null,
      description: wikiDesc,
      imslp_url: imslpTopUrl,
      source_url: imslpTopUrl,
      sources,
      composer_meta: primaryComposerMeta,
    });
  }

  const mbWorks: {
    id: string;
    title: string;
    type?: string;
    relations?: {
      type?: string;
      artist?: { name?: string };
    }[];
  }[] = Array.isArray(mbRes?.works) ? mbRes.works : [];

  for (const w of mbWorks) {
    if (!w.title || /:\s*([IVX]+\.|No\.\s*\d+)/i.test(w.title)) continue;
    const compRel = w.relations?.find((r) => r.type === "composer");
    const cName =
      compRel?.artist?.name || primaryComposerMeta?.name || composerQuery;
    const cat = extractCatalog(w.title);
    const catDisplay =
      cat.catalog_system && cat.catalog_number
        ? `${cat.catalog_system} ${cat.catalog_number}`
        : null;

    if (
      out.some(
        (existing) => existing.title.toLowerCase() === w.title.toLowerCase()
      )
    ) {
      out[0].sources = Array.from(new Set([...out[0].sources, "MusicBrainz"]));
      continue;
    }

    const sources = ["MusicBrainz"];
    if (out.length === 0 && wikiDesc) sources.push("Wikipedia");

    out.push({
      id: `mb:${w.id}`,
      title: w.title,
      composer_name: cName || "Unknown Composer",
      genre: mapWorkGenre(w.type || "", w.title),
      catalog_display: catDisplay,
      key_signature: extractKey(w.title) || null,
      year_composed: out.length === 0 ? wikiYear : null,
      duration_minutes: null,
      instrumentation: null,
      description: out.length === 0 ? wikiDesc : null,
      imslp_url: out.length === 0 ? imslpTopUrl : null,
      source_url: wikiPageUrl || `https://musicbrainz.org/work/${w.id}`,
      sources,
      composer_meta: primaryComposerMeta,
    });
  }

  if (out.length === 0 && wikiDesc) {
    const cat = extractCatalog(workQuery);
    out.push({
      id: `wiki:${workQuery}`,
      title: workQuery,
      composer_name: primaryComposerMeta?.name || composerQuery,
      genre: mapWorkGenre("", workQuery),
      catalog_display:
        cat.catalog_system && cat.catalog_number
          ? `${cat.catalog_system} ${cat.catalog_number}`
          : null,
      key_signature: extractKey(workQuery) || null,
      year_composed: wikiYear,
      duration_minutes: null,
      instrumentation: null,
      description: wikiDesc,
      imslp_url: null,
      source_url: wikiPageUrl,
      sources: ["Wikipedia"],
      composer_meta: primaryComposerMeta,
    });
  }

  return out.slice(0, 4);
}

const WIKIDATA_INSTRUMENTS: Record<string, string> = {
  Q5994: "Piano",
  Q8355: "Violin",
  Q8371: "Cello",
  Q8350: "Viola",
  Q8358: "Double Bass",
  Q11405: "Flute",
  Q8341: "Oboe",
  Q8343: "Clarinet",
  Q8348: "Bassoon",
  Q163829: "Horn",
  Q8338: "Trumpet",
  Q8353: "Trombone",
  Q47369: "Harp",
  Q1444: "Organ",
  Q131168: "Harpsichord",
  Q6607: "Guitar",
  Q17172850: "Voice",
};

/**
 * Crawls an artist or venue homepage briefly to auto-discover their official
 * concert calendar / tour dates / schedule URL.
 */
export async function discoverCalendarUrl(
  websiteUrl: string | null | undefined
): Promise<string | null> {
  if (!websiteUrl) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const res = await fetch(websiteUrl, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 180000);
    const base = new URL(websiteUrl);

    const anchorRegex =
      /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,90}?)<\/a>/gi;
    let bestUrl: string | null = null;
    let bestScore = 0;

    for (const m of html.matchAll(anchorRegex)) {
      const rawHref = m[1].trim();
      const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (
        !rawHref ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:") ||
        rawHref.startsWith("javascript:")
      ) {
        continue;
      }

      let resolved: URL;
      try {
        resolved = new URL(rawHref, base);
      } catch {
        continue;
      }
      // Keep on same root domain or official calendar subdomain
      const baseDomain = base.hostname.replace(/^www\./, "");
      if (!resolved.hostname.endsWith(baseDomain)) continue;

      const pathLower = resolved.pathname.toLowerCase();
      const labelLower = label.toLowerCase();

      let score = 0;
      if (
        /\/(concerts?|calendar|schedule|tour|events?|dates|live|whats-on|performances|agenda|season|konzerte)\/?$/i.test(
          pathLower
        )
      ) {
        score += 10;
      } else if (
        /(concerts?|calendar|schedule|tour|events|whats-on|performances|agenda|season|konzerte)/i.test(
          pathLower
        )
      ) {
        score += 5;
      }
      if (
        /\b(concerts?|calendar|schedule|tour|events?|dates|live|what'?s on|performances|season|agenda)\b/i.test(
          labelLower
        )
      ) {
        score += 6;
      }
      // Avoid single-event detail slugs when looking for the master schedule page
      if (pathLower.split("/").filter(Boolean).length > 3) {
        score -= 4;
      }

      if (score > bestScore) {
        bestScore = score;
        bestUrl = resolved.toString();
      }
    }

    return bestScore >= 5 ? bestUrl : null;
  } catch {
    return null;
  }
}

function inferPerformerRoleAndInstrument(
  name: string,
  text: string,
  wdInstrumentQids: string[]
): {
  performer_type: "orchestra" | "ensemble" | "conductor" | "soloist";
  instrument_or_role: string;
} {
  const combined = `${name} ${text}`;
  if (/orchestra|philharmoni|symphony|sinfonie|staatskapelle|orchester|orchestre/i.test(name)) {
    return {
      performer_type: "orchestra",
      instrument_or_role: "Symphony Orchestra",
    };
  }
  if (/quartet|trio|quintet|ensemble|consort|camerata|choir|chorus/i.test(name)) {
    return {
      performer_type: "ensemble",
      instrument_or_role: /quartet/i.test(name)
        ? "String Quartet"
        : /choir|chorus/i.test(name)
          ? "Choir"
          : "Chamber Ensemble",
    };
  }
  if (/\bconductor\b/i.test(text) && !/\bpianist|violinist|cellist\b/i.test(text.slice(0, 120))) {
    return { performer_type: "conductor", instrument_or_role: "Conductor" };
  }

  for (const qid of wdInstrumentQids) {
    if (WIKIDATA_INSTRUMENTS[qid]) {
      return {
        performer_type: "soloist",
        instrument_or_role: WIKIDATA_INSTRUMENTS[qid],
      };
    }
  }

  const roleMap: [RegExp, string][] = [
    [/\bpianist\b/i, "Piano"],
    [/\bviolinist\b/i, "Violin"],
    [/\bcellist\b/i, "Cello"],
    [/\bviolist\b/i, "Viola"],
    [/\bflutist|\bflautist\b/i, "Flute"],
    [/\boboist\b/i, "Oboe"],
    [/\bclarinett?ist\b/i, "Clarinet"],
    [/\bsoprano\b/i, "Soprano"],
    [/\bmezzo-soprano\b/i, "Mezzo-Soprano"],
    [/\bcountertenor\b/i, "Countertenor"],
    [/\btenor\b/i, "Tenor"],
    [/\bbaritone\b/i, "Baritone"],
    [/\bbass-baritone|\bbass\b/i, "Bass"],
    [/\borganist\b/i, "Organ"],
    [/\bharpsichordist\b/i, "Harpsichord"],
    [/\bharpist\b/i, "Harp"],
    [/\bguitarist\b/i, "Guitar"],
    [/\btrumpeter\b/i, "Trumpet"],
    [/\bpercussionist\b/i, "Percussion"],
    [/\bconductor\b/i, "Conductor"],
  ];

  for (const [rx, label] of roleMap) {
    if (rx.test(combined)) {
      return {
        performer_type: label === "Conductor" ? "conductor" : "soloist",
        instrument_or_role: label,
      };
    }
  }

  return { performer_type: "soloist", instrument_or_role: "Soloist" };
}

/**
 * Looks up Performers (Soloists, Conductors, Orchestras, Ensembles) across
 * Wikipedia REST + Wikidata (official website P856, instrument P1303) +
 * MusicBrainz URL relations + homepage Tour/Calendar URL auto-discovery.
 */
export async function lookupPerformerCandidates(
  query: string
): Promise<EnrichedPerformerCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  type MbArtistUrlSearch = {
    artists?: {
      id: string;
      name: string;
      type?: string;
      country?: string;
      area?: { name?: string };
      disambiguation?: string;
    }[];
  };

  const [wikiRes, mbRes] = await Promise.all([
    fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        q
      )}&limit=4&namespace=0&format=json`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) => (r.ok ? (r.json() as Promise<OpenSearchTuple>) : null))
      .catch(() => null),
    fetch(
      `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(
        q
      )}&fmt=json&limit=3`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) => (r.ok ? (r.json() as Promise<MbArtistUrlSearch>) : null))
      .catch(() => null),
  ]);

  const titles = Array.isArray(wikiRes?.[1]) ? wikiRes[1].slice(0, 3) : [];
  const summaries = await Promise.all(
    titles.map(async (t) => {
      try {
        const r = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            t.replace(/ /g, "_")
          )}`,
          { headers: { "User-Agent": UA } }
        );
        if (!r.ok) return null;
        return (await r.json()) as {
          title?: string;
          type?: string;
          wikibase_item?: string;
          description?: string;
          extract?: string;
          thumbnail?: { source?: string };
          content_urls?: { desktop?: { page?: string } };
        };
      } catch {
        return null;
      }
    })
  );

  // Fetch Wikidata official website (P856) + instruments (P1303)
  const qids = summaries
    .map((s) => s?.wikibase_item)
    .filter((x): x is string => Boolean(x));

  const wdMeta = new Map<
    string,
    { website: string | null; instrumentQids: string[] }
  >();

  if (qids.length > 0) {
    try {
      const wdRes = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join(
          "|"
        )}&props=claims&format=json`,
        { headers: { "User-Agent": UA } }
      );
      if (wdRes.ok) {
        const wdJson = (await wdRes.json()) as {
          entities?: Record<
            string,
            {
              claims?: {
                P856?: { mainsnak?: { datavalue?: { value?: string } } }[];
                P1303?: {
                  mainsnak?: { datavalue?: { value?: { id?: string } } };
                }[];
              };
            }
          >;
        };
        for (const qid of qids) {
          const claims = wdJson.entities?.[qid]?.claims;
          const site = claims?.P856?.[0]?.mainsnak?.datavalue?.value || null;
          const instIds = (claims?.P1303 || [])
            .map((c) => c.mainsnak?.datavalue?.value?.id)
            .filter((id): id is string => Boolean(id));
          wdMeta.set(qid, { website: site, instrumentQids: instIds });
        }
      }
    } catch {
      // Ignore Wikidata error
    }
  }

  // Optional MusicBrainz official homepage fallback for top artist match
  let mbOfficialSite: string | null = null;
  let mbCity: string | null = null;
  const topMb = mbRes?.artists?.[0];
  if (topMb?.id) {
    mbCity = topMb.area?.name || null;
    try {
      const mbDetail = await fetch(
        `https://musicbrainz.org/ws/2/artist/${topMb.id}?inc=url-rels&fmt=json`,
        { headers: { "User-Agent": UA } }
      ).then((r) =>
        r.ok
          ? (r.json() as Promise<{
              relations?: { type?: string; url?: { resource?: string } }[];
            }>)
          : null
      );
      const hp = mbDetail?.relations?.find(
        (rel) => rel.type === "official homepage"
      );
      mbOfficialSite = hp?.url?.resource || null;
    } catch {
      // Ignore MB detail error
    }
  }

  const out: EnrichedPerformerCandidate[] = [];

  for (let i = 0; i < summaries.length; i++) {
    const sum = summaries[i];
    if (!sum || !sum.extract || sum.type === "disambiguation") continue;
    const combined = `${sum.description || ""} ${sum.extract}`;
    if (
      summaries.length > 1 &&
      !/orchestra|philharmoni|symphony|conductor|pianist|violinist|cellist|singer|soprano|tenor|baritone|musician|quartet|ensemble|choir|violist|flutist|oboist|clarinetist|organist|guitarist|harpist/i.test(
        combined
      )
    ) {
      continue;
    }

    const cleanName = String(sum.title || q)
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
    const { nationality } = extractYearsAndNationality(combined);
    const wd = sum.wikibase_item ? wdMeta.get(sum.wikibase_item) : undefined;
    const { performer_type, instrument_or_role } =
      inferPerformerRoleAndInstrument(
        cleanName,
        combined,
        wd?.instrumentQids || []
      );

    const websiteUrl =
      wd?.website || (i === 0 ? mbOfficialSite : null) || null;
    const calendarUrl =
      i === 0 && websiteUrl ? await discoverCalendarUrl(websiteUrl) : null;

    const sources = ["Wikipedia"];
    if (wd) sources.push("Wikidata");
    if (i === 0 && topMb) sources.push("MusicBrainz");
    if (calendarUrl) sources.push("Tour Page");

    out.push({
      id: `perf:${sum.wikibase_item || cleanName}`,
      name: cleanName,
      performer_type,
      instrument_or_role,
      nationality: nationality !== "International" ? nationality : null,
      home_city: i === 0 ? mbCity : null,
      website_url: websiteUrl,
      calendar_url: calendarUrl || websiteUrl,
      avatar_url: sum.thumbnail?.source || null,
      short_bio: sum.extract.slice(0, 480),
      wikidata_qid: sum.wikibase_item || null,
      source_url:
        sum.content_urls?.desktop?.page || websiteUrl || null,
      sources,
    });
  }

  // MusicBrainz-only fallback if no Wikipedia article exists yet (e.g. rising soloist)
  if (out.length === 0 && topMb) {
    const { performer_type, instrument_or_role } =
      inferPerformerRoleAndInstrument(
        topMb.name,
        topMb.disambiguation || "",
        []
      );
    const calendarUrl = mbOfficialSite
      ? await discoverCalendarUrl(mbOfficialSite)
      : null;
    out.push({
      id: `mb-perf:${topMb.id}`,
      name: topMb.name,
      performer_type:
        topMb.type === "Group" || topMb.type === "Orchestra"
          ? performer_type === "soloist"
            ? "ensemble"
            : performer_type
          : performer_type,
      instrument_or_role,
      nationality: null,
      home_city: mbCity,
      website_url: mbOfficialSite,
      calendar_url: calendarUrl || mbOfficialSite,
      avatar_url: null,
      short_bio: `${topMb.name}${topMb.disambiguation ? ` — ${topMb.disambiguation}` : " — classical performing artist"}.`,
      wikidata_qid: null,
      source_url:
        mbOfficialSite || `https://musicbrainz.org/artist/${topMb.id}`,
      sources: calendarUrl ? ["MusicBrainz", "Tour Page"] : ["MusicBrainz"],
    });
  }

  return out.slice(0, 4);
}

/**
 * Looks up Concert Halls, Opera Houses & Venues outside our Top 100 via
 * Wikipedia REST + Wikidata (coords P625, capacity P1083, opened P1619, website P856) +
 * OpenStreetMap Nominatim geocoding fallback + calendar URL discovery.
 */
export async function lookupVenueCandidates(
  query: string,
  cityHint?: string
): Promise<EnrichedVenueCandidate[]> {
  const q = [query.trim(), cityHint?.trim()].filter(Boolean).join(" ");
  if (!q) return [];

  type NominatimHit = {
    place_id: number;
    name?: string;
    display_name: string;
    lat: string;
    lon: string;
    extratags?: {
      wikidata?: string;
      website?: string;
      capacity?: string;
      architect?: string;
    };
    address?: {
      city?: string;
      town?: string;
      municipality?: string;
      state?: string;
      country?: string;
      country_code?: string;
    };
  };

  const [wikiRes, osmRes] = await Promise.all([
    fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        q
      )}&limit=3&namespace=0&format=json`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) => (r.ok ? (r.json() as Promise<OpenSearchTuple>) : null))
      .catch(() => null),
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        q
      )}&format=jsonv2&addressdetails=1&extratags=1&limit=3`,
      { headers: { "User-Agent": UA, "Accept-Language": "en" } }
    )
      .then((r) => (r.ok ? (r.json() as Promise<NominatimHit[]>) : null))
      .catch(() => null),
  ]);

  const osmTop = osmRes?.[0] || null;
  const titles = Array.isArray(wikiRes?.[1]) ? wikiRes[1].slice(0, 2) : [];

  const summaries = await Promise.all(
    titles.map(async (t) => {
      try {
        const r = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            t.replace(/ /g, "_")
          )}`,
          { headers: { "User-Agent": UA } }
        );
        if (!r.ok) return null;
        return (await r.json()) as {
          title?: string;
          type?: string;
          wikibase_item?: string;
          extract?: string;
          coordinates?: { lat?: number; lon?: number };
          thumbnail?: { source?: string };
          content_urls?: { desktop?: { page?: string } };
        };
      } catch {
        return null;
      }
    })
  );

  const qids = Array.from(
    new Set(
      [
        ...summaries.map((s) => s?.wikibase_item),
        osmTop?.extratags?.wikidata,
      ].filter((x): x is string => Boolean(x))
    )
  );

  const wdVenueMeta = new Map<
    string,
    {
      lat: number | null;
      lng: number | null;
      capacity: number | null;
      openedYear: number | null;
      website: string | null;
    }
  >();

  if (qids.length > 0) {
    try {
      const wdRes = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join(
          "|"
        )}&props=claims&format=json`,
        { headers: { "User-Agent": UA } }
      );
      if (wdRes.ok) {
        const wdJson = (await wdRes.json()) as {
          entities?: Record<
            string,
            {
              claims?: {
                P625?: {
                  mainsnak?: {
                    datavalue?: {
                      value?: { latitude?: number; longitude?: number };
                    };
                  };
                }[];
                P1083?: {
                  mainsnak?: { datavalue?: { value?: { amount?: string } } };
                }[];
                P1619?: {
                  mainsnak?: { datavalue?: { value?: { time?: string } } };
                }[];
                P571?: {
                  mainsnak?: { datavalue?: { value?: { time?: string } } };
                }[];
                P856?: { mainsnak?: { datavalue?: { value?: string } } }[];
              };
            }
          >;
        };
        for (const qid of qids) {
          const c = wdJson.entities?.[qid]?.claims;
          const coord = c?.P625?.[0]?.mainsnak?.datavalue?.value;
          const capStr = c?.P1083?.[0]?.mainsnak?.datavalue?.value?.amount;
          const openStr =
            c?.P1619?.[0]?.mainsnak?.datavalue?.value?.time ||
            c?.P571?.[0]?.mainsnak?.datavalue?.value?.time ||
            "";
          const ym = openStr.match(/([12]\d{3})/);
          wdVenueMeta.set(qid, {
            lat: coord?.latitude ?? null,
            lng: coord?.longitude ?? null,
            capacity: capStr ? Math.abs( parseInt(capStr, 10) ) || null : null,
            openedYear: ym ? Number(ym[1]) : null,
            website: c?.P856?.[0]?.mainsnak?.datavalue?.value || null,
          });
        }
      }
    } catch {
      // Ignore Wikidata error
    }
  }

  const out: EnrichedVenueCandidate[] = [];
  const osmCity =
    osmTop?.address?.city ||
    osmTop?.address?.town ||
    osmTop?.address?.municipality ||
    cityHint ||
    "";
  const osmCountry = osmTop?.address?.country || "";
  const osmCode = osmTop?.address?.country_code
    ? osmTop.address.country_code.toUpperCase()
    : null;

  for (let i = 0; i < summaries.length; i++) {
    const sum = summaries[i];
    if (!sum || !sum.extract || sum.type === "disambiguation") continue;
    const cleanName = String(sum.title || query)
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
    const wd = sum.wikibase_item
      ? wdVenueMeta.get(sum.wikibase_item)
      : undefined;

    const lat =
      sum.coordinates?.lat ??
      wd?.lat ??
      (i === 0 && osmTop ? Number(osmTop.lat) : null);
    const lng =
      sum.coordinates?.lon ??
      wd?.lng ??
      (i === 0 && osmTop ? Number(osmTop.lon) : null);
    const website =
      wd?.website || (i === 0 ? osmTop?.extratags?.website || null : null);
    const calendarUrl =
      i === 0 && website ? await discoverCalendarUrl(website) : null;

    const sources = ["Wikipedia"];
    if (wd) sources.push("Wikidata");
    if (osmTop && i === 0) sources.push("OpenStreetMap");
    if (calendarUrl) sources.push("Calendar Page");

    out.push({
      id: `venue:${sum.wikibase_item || cleanName}`,
      name: cleanName,
      short_name: cleanName.slice(0, 32),
      city: osmCity || cityHint || "Unknown City",
      country: osmCountry || "International",
      country_code: osmCode,
      latitude: lat,
      longitude: lng,
      capacity:
        wd?.capacity ||
        (osmTop?.extratags?.capacity
          ? parseInt(osmTop.extratags.capacity, 10) || null
          : null),
      opened_year: wd?.openedYear || null,
      architect_or_acoustics: osmTop?.extratags?.architect || null,
      website_url: website,
      calendar_url: calendarUrl || website,
      photo_url: sum.thumbnail?.source || null,
      short_bio: sum.extract.slice(0, 420),
      wikidata_qid: sum.wikibase_item || null,
      source_url: sum.content_urls?.desktop?.page || website || null,
      sources,
    });
  }

  if (out.length === 0 && osmTop) {
    const wd = osmTop.extratags?.wikidata
      ? wdVenueMeta.get(osmTop.extratags.wikidata)
      : undefined;
    const website = wd?.website || osmTop.extratags?.website || null;
    const calendarUrl = website ? await discoverCalendarUrl(website) : null;
    const cleanName =
      osmTop.name || osmTop.display_name.split(",")[0].trim() || query.trim();

    out.push({
      id: `osm:${osmTop.place_id}`,
      name: cleanName,
      short_name: cleanName.slice(0, 32),
      city: osmCity || cityHint || "Unknown City",
      country: osmCountry || "International",
      country_code: osmCode,
      latitude: Number(osmTop.lat),
      longitude: Number(osmTop.lon),
      capacity: wd?.capacity || null,
      opened_year: wd?.openedYear || null,
      architect_or_acoustics: osmTop.extratags?.architect || null,
      website_url: website,
      calendar_url: calendarUrl || website,
      photo_url: null,
      short_bio: `${cleanName} — concert venue in ${osmCity || "city"}, ${osmCountry || ""}.`,
      wikidata_qid: osmTop.extratags?.wikidata || null,
      source_url: website,
      sources: calendarUrl
        ? ["OpenStreetMap", "Calendar Page"]
        : ["OpenStreetMap"],
    });
  }

  return out.slice(0, 4);
}
