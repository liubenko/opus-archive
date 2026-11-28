import {
  extractCatalog,
  extractKey,
  inferEraFromBirthYear,
  mapWorkGenre,
  transliterateCyrillic,
} from "../../scripts/lib/dedup.mjs";

const UA =
  "OpusArchive/2.0 (https://github.com/liubenko/opus-archive; classical catalog enrichment)";

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

const CYRILLIC_RE = /[А-Яа-яІіЇїЄєҐґ]/;

const NATIONALITY_PATTERNS: [RegExp, string][] = [
  [/\bUkrainian\b|українськ|України|Україна/i, "Ukrainian"],
  [/\bGerman\b|\bdeutsche[rnms]?\b/i, "German"],
  [/\bAustrian\b|\bösterreichische[rnms]?\b/i, "Austrian"],
  [/\bFrench\b|\bfrançaise?s?\b/i, "French"],
  [/\bItalian\b|\bitalian[oaie]\b/i, "Italian"],
  [/\bPolish\b|\bpolsk[ia]\b|польськ/i, "Polish"],
  [/\bBritish\b|\bEnglish\b|\bScottish\b|\bWelsh\b/i, "British"],
  [/\bAmerican\b/i, "American"],
  [/\bCzech\b|чеськ/i, "Czech"],
  [/\bHungarian\b|угорськ/i, "Hungarian"],
  [/\bFinnish\b/i, "Finnish"],
  [/\bSpanish\b|\bespañol[ae]?\b/i, "Spanish"],
  [/\bArgentine\b/i, "Argentine"],
  [/\bBrazilian\b/i, "Brazilian"],
  [/\bMexican\b/i, "Mexican"],
  [/\bJapanese\b/i, "Japanese"],
  [/\bChinese\b/i, "Chinese"],
  [/\bSouth Korean\b|\bKorean\b/i, "South Korean"],
  [/\bEstonian\b|естонськ/i, "Estonian"],
  [/\bLatvian\b|латвійськ/i, "Latvian"],
  [/\bLithuanian\b|литовськ/i, "Lithuanian"],
  [/\bGeorgian\b|грузинськ/i, "Georgian"],
  [/\bArmenian\b|вірменськ/i, "Armenian"],
  [/\bTurkish\b/i, "Turkish"],
  [/\bNorwegian\b/i, "Norwegian"],
  [/\bSwedish\b/i, "Swedish"],
  [/\bDanish\b/i, "Danish"],
  [/\bDutch\b/i, "Dutch"],
  [/\bBelgian\b/i, "Belgian"],
  [/\bSwiss\b/i, "Swiss"],
  [/\bRomanian\b/i, "Romanian"],
  [/\bCanadian\b/i, "Canadian"],
  [/\bAustralian\b/i, "Australian"],
  [/\bIcelandic\b/i, "Icelandic"],
  [/\bRussian\b/i, "Russian"],
];

const WIKIDATA_CITIZENSHIP: Record<string, string> = {
  Q212: "Ukrainian",
  Q183: "German",
  Q40: "Austrian",
  Q142: "French",
  Q38: "Italian",
  Q36: "Polish",
  Q145: "British",
  Q30: "American",
  Q213: "Czech",
  Q28: "Hungarian",
  Q33: "Finnish",
  Q29: "Spanish",
  Q414: "Argentine",
  Q155: "Brazilian",
  Q96: "Mexican",
  Q17: "Japanese",
  Q148: "Chinese",
  Q884: "South Korean",
  Q191: "Estonian",
  Q211: "Latvian",
  Q37: "Lithuanian",
  Q230: "Georgian",
  Q399: "Armenian",
  Q20: "Norwegian",
  Q34: "Swedish",
  Q35: "Danish",
  Q55: "Dutch",
  Q31: "Belgian",
  Q39: "Swiss",
  Q218: "Romanian",
  Q16: "Canadian",
  Q408: "Australian",
  Q189: "Icelandic",
  Q159: "Russian",
};

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
  Q207891: "Bandura",
  Q258896: "Bayan",
  Q79838: "Accordion",
  Q51290: "Saxophone",
  Q80284: "Viola da gamba",
  Q180733: "Mandolin",
  Q11404: "Recorder",
  Q186506: "Soprano",
  Q186520: "Mezzo-Soprano",
  Q37137: "Contralto",
  Q223166: "Countertenor",
  Q27914: "Tenor",
  Q31687: "Baritone",
  Q694181: "Bass-Baritone",
  Q27911: "Bass",
  Q17172850: "Voice",
  Q27939: "Voice",
};

const WIKIDATA_OCCUPATIONS: Record<
  string,
  { type: "conductor" | "soloist"; role: string }
> = {
  Q158852: { type: "conductor", role: "Conductor" },
  Q1075651: { type: "conductor", role: "Choir Conductor" },
  Q486748: { type: "soloist", role: "Piano" },
  Q1259917: { type: "soloist", role: "Violin" },
  Q13219587: { type: "soloist", role: "Cello" },
  Q12902372: { type: "soloist", role: "Flute" },
  Q855091: { type: "soloist", role: "Guitar" },
  Q765778: { type: "soloist", role: "Organ" },
  Q2865819: { type: "soloist", role: "Opera Singer" },
  Q177220: { type: "soloist", role: "Voice" },
};

type WikiLang = "en" | "uk" | "de" | "fr" | "it" | "pl";

interface WikiSummaryWithLang {
  wikiLang: WikiLang;
  title?: string;
  type?: string;
  wikibase_item?: string;
  description?: string;
  extract?: string;
  coordinates?: { lat?: number; lon?: number };
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

type OpenSearchTuple = [string, string[], string[], string[]];
type MediaWikiSearchJson = {
  query?: { search?: { title: string }[] };
};
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
type OpenLibraryAuthorsJson = {
  docs?: {
    key?: string;
    name?: string;
    birth_date?: string;
    death_date?: string;
    top_work?: string;
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

function wikiSourceBadge(lang: WikiLang): string {
  return lang === "en" ? "Wikipedia" : `Wikipedia (${lang.toUpperCase()})`;
}

function commonsThumbFromFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const clean = filename.replace(/^File:/i, "").trim();
  if (!clean) return null;
  return `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(
    clean
  )}&width=440`;
}

/**
 * Converts Ukrainian Wikipedia `Surname Firstname Patronymic` titles
 * (e.g. "Шутко Юрій Іванович" or "Чубарева Ольга Олексіївна") into natural
 * `Firstname Surname` order ("Юрій Шутко") and optionally transliterates to Latin.
 */
function normalizeBiographicalDisplayName(
  rawTitle: string,
  wdEnglishLabel?: string | null
): string {
  if (wdEnglishLabel && !/^Q\d+$/i.test(wdEnglishLabel.trim())) {
    return wdEnglishLabel.replace(/\s*\([^)]*\)\s*$/, "").trim();
  }
  const cleaned = rawTitle.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const parts = cleaned.split(/\s+/);
  // Detect Slavic `Surname Firstname Patronymic` (3 words where 3rd ends in patronymic suffix)
  if (
    parts.length === 3 &&
    CYRILLIC_RE.test(cleaned) &&
    /(?:ович|івна|ївна|ич|овна|евна|ична)$/i.test(parts[2])
  ) {
    return transliterateCyrillic(`${parts[1]} ${parts[0]}`);
  }
  if (CYRILLIC_RE.test(cleaned)) {
    return transliterateCyrillic(cleaned);
  }
  return cleaned;
}

function extractYearsAndNationality(text: string): {
  birthYear: number | null;
  deathYear: number | null;
  nationality: string;
} {
  let birthYear: number | null = null;
  let deathYear: number | null = null;

  const spanMatch = text.match(
    /\((?:[^()]{0,45}?\b)?(1[3-9]\d{2}|20[01]\d)\s*[–—-]\s*(?:[^()]{0,40}?\b)?(1[3-9]\d{2}|20[0-2]\d)\)/
  );
  if (spanMatch) {
    birthYear = Number(spanMatch[1]);
    deathYear = Number(spanMatch[2]);
  } else {
    const bornMatch = text.match(
      /(?:\b(?:born|b\.|нар\.|народився|народилася|geb\.|geboren|né|née)\b[^()]{0,35}?\b|\(\s*[^()]{0,25}?\b)(1[4-9]\d{2}|20[01]\d)\b/i
    );
    if (bornMatch) birthYear = Number(bornMatch[1]);
  }

  let nationality = "International";
  for (const [rx, label] of NATIONALITY_PATTERNS) {
    if (rx.test(text)) {
      nationality = label;
      break;
    }
  }

  return { birthYear, deathYear, nationality };
}

/**
 * Searches MediaWiki full-text (`list=search`, order-independent so "Юрій Шутко"
 * matches "Шутко Юрій Іванович") on a given Wikipedia language edition and returns
 * REST page summaries.
 */
async function searchWikiEditionSummaries(
  lang: WikiLang,
  query: string,
  limit = 3
): Promise<WikiSummaryWithLang[]> {
  if (!query.trim()) return [];
  try {
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&srnamespace=0&srlimit=${limit}&format=json`;
    const res = await fetch(searchUrl, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const json = (await res.json()) as MediaWikiSearchJson;
    const titles = (json.query?.search ?? [])
      .map((s) => s.title)
      .filter(Boolean)
      .slice(0, limit);
    if (titles.length === 0) return [];

    const summaries = await Promise.all(
      titles.map(async (title) => {
        try {
          const sr = await fetch(
            `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
              title.replace(/ /g, "_")
            )}`,
            { headers: { "User-Agent": UA } }
          );
          if (!sr.ok) return null;
          const data = (await sr.json()) as Omit<WikiSummaryWithLang, "wikiLang">;
          if (!data || data.type === "disambiguation") return null;
          return { ...data, wikiLang: lang } as WikiSummaryWithLang;
        } catch {
          return null;
        }
      })
    );
    return summaries.filter((x): x is WikiSummaryWithLang => Boolean(x));
  } catch {
    return [];
  }
}

async function fetchWikiSummaryByTitle(
  lang: WikiLang,
  title: string
): Promise<WikiSummaryWithLang | null> {
  try {
    const sr = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        title.replace(/ /g, "_")
      )}`,
      { headers: { "User-Agent": UA } }
    );
    if (!sr.ok) return null;
    const data = (await sr.json()) as Omit<WikiSummaryWithLang, "wikiLang">;
    if (!data || data.type === "disambiguation") return null;
    return { ...data, wikiLang: lang };
  } catch {
    return null;
  }
}

/**
 * Multilingual Wikipedia full-text search across `en`, `uk`, `de`, `fr`, `it`, `pl`
 * with automatic Cyrillic <-> Latin transliteration and QID deduplication.
 */
async function searchMultilingualWikipedia(
  query: string,
  options?: { enSuffix?: string; limit?: number }
): Promise<WikiSummaryWithLang[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = options?.limit ?? 3;
  const isCyrillic = CYRILLIC_RE.test(q);
  const latinQuery = isCyrillic ? transliterateCyrillic(q) : q;

  let primaryResults: WikiSummaryWithLang[] = [];

  if (isCyrillic) {
    const [ukHits, enHits] = await Promise.all([
      searchWikiEditionSummaries("uk", q, limit),
      searchWikiEditionSummaries("en", latinQuery, 2),
    ]);
    primaryResults = [...ukHits, ...enHits];
  } else {
    const queries = options?.enSuffix
      ? [
          searchWikiEditionSummaries("en", `${q} ${options.enSuffix}`, limit),
          searchWikiEditionSummaries("en", q, 2),
        ]
      : [searchWikiEditionSummaries("en", q, limit)];
    const batches = await Promise.all(queries);
    primaryResults = batches.flat();

    // If English Wikipedia has zero title-matching hits, fan out across major European editions
    const qTokens = q
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3);
    const hasTitleMatch = primaryResults.some((item) => {
      const tLow = (item.title || "").toLowerCase();
      return qTokens.length === 0 || qTokens.some((tok) => tLow.includes(tok));
    });

    if (primaryResults.length === 0 || !hasTitleMatch) {
      const regional = await Promise.all([
        searchWikiEditionSummaries("uk", q, 2),
        searchWikiEditionSummaries("de", q, 2),
        searchWikiEditionSummaries("fr", q, 2),
        searchWikiEditionSummaries("it", q, 1),
        searchWikiEditionSummaries("pl", q, 1),
      ]);
      primaryResults = hasTitleMatch
        ? [...primaryResults, ...regional.flat()]
        : [...regional.flat(), ...primaryResults];
    }
  }

  // Filter out full-text body-mention false positives where the article title has zero overlap with query tokens
  const rawTokens = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
  const latinTokens = latinQuery
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  // Require the last token (surname / main noun) or at least one 4+ char token to appear in title
  const surnameRaw = rawTokens[rawTokens.length - 1] || "";
  const surnameLat = latinTokens[latinTokens.length - 1] || "";

  const filteredResults = primaryResults.filter((item) => {
    const titleRaw = (item.title || "").toLowerCase();
    const titleLat = transliterateCyrillic(item.title || "").toLowerCase();
    if (surnameRaw && (titleRaw.includes(surnameRaw) || titleLat.includes(surnameRaw))) {
      return true;
    }
    if (
      surnameLat &&
      surnameLat.length >= 3 &&
      (titleLat.includes(surnameLat) ||
        titleLat.includes(surnameLat.slice(0, Math.max(4, surnameLat.length - 2))))
    ) {
      return true;
    }
    return rawTokens.some(
      (tok) => tok.length >= 4 && (titleRaw.includes(tok) || titleLat.includes(tok))
    );
  });

  // Deduplicate by Wikidata QID (preferring English extract ONLY when both articles match the person/topic, keeping thumbnail)
  const byKey = new Map<string, WikiSummaryWithLang>();
  for (const item of filteredResults) {
    const key = item.wikibase_item || `${item.wikiLang}:${item.title}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
    } else if (existing.wikiLang !== "en" && item.wikiLang === "en" && item.extract) {
      byKey.set(key, {
        ...item,
        thumbnail: item.thumbnail?.source ? item.thumbnail : existing.thumbnail,
      });
    } else if (!existing.thumbnail?.source && item.thumbnail?.source) {
      byKey.set(key, { ...existing, thumbnail: item.thumbnail });
    }
  }

  return Array.from(byKey.values()).slice(0, limit + 1);
}

/**
 * Searches Wikidata entities directly (catches aliases & spelling variants across all languages).
 */
async function searchWikidataQids(query: string, limit = 3): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  const isCyr = CYRILLIC_RE.test(q);
  const langs = isCyr ? ["uk", "en"] : ["en"];
  try {
    const batches = await Promise.all(
      langs.map(async (lang) => {
        const term = lang === "en" && isCyr ? transliterateCyrillic(q) : q;
        const r = await fetch(
          `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
            term
          )}&language=${lang}&limit=${limit}&format=json`,
          { headers: { "User-Agent": UA } }
        );
        if (!r.ok) return [];
        const j = (await r.json()) as { search?: { id?: string }[] };
        return (j.search ?? []).map((x) => x.id).filter((id): id is string => Boolean(id));
      })
    );
    return Array.from(new Set(batches.flat())).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Fallback search on Wikimedia Commons (`File:` namespace 6) for a licensed portrait
 * or concert hall photograph when Wikipedia summary & Wikidata P18 lack an image.
 */
async function searchWikimediaCommonsThumb(query: string): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const r = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        q
      )}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url&iiurlwidth=440&format=json`,
      { headers: { "User-Agent": UA } }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: { thumburl?: string; url?: string }[];
          }
        >;
      };
    };
    const pages = Object.values(j.query?.pages ?? {});
    const surname = q.split(/\s+/).pop()?.toLowerCase() || "";
    const surnameLatin = transliterateCyrillic(surname).toLowerCase();

    for (const p of pages) {
      const titleLower = (p.title || "").toLowerCase();
      if (/\.(?:svg|pdf|djvu|ogg|oga|flac|wav|mp3|webm|ogv)$/i.test(titleLower)) {
        continue;
      }
      if (
        surname.length >= 3 &&
        !titleLower.includes(surname) &&
        !titleLower.includes(surnameLatin)
      ) {
        continue;
      }
      const img = p.imageinfo?.[0];
      if (img?.thumburl || img?.url) return img.thumburl || img.url || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Queries National Philharmonic of Ukraine's public WordPress artist taxonomy
 * (`philarmonia.com.ua/wp-json/wp/v2/vikonavts`) to discover official artist
 * profile & concert schedule URLs + instrument roles for Ukrainian performers.
 */
async function lookupKyivPhilharmonicRoster(query: string): Promise<{
  rawName: string;
  instrumentHint: string;
  calendarUrl: string;
} | null> {
  const parts = query.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  // Query by surname (longest or last token) for highest recall across "First Last" / "Last First"
  const surname = parts[parts.length - 1];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(
      `https://philarmonia.com.ua/wp-json/wp/v2/vikonavts?search=${encodeURIComponent(
        surname
      )}&per_page=5`,
      { headers: { "User-Agent": UA }, signal: controller.signal }
    );
    clearTimeout(timer);
    if (!r.ok) return null;
    const items = (await r.json()) as {
      id?: number;
      name?: string;
      link?: string;
    }[];
    if (!Array.isArray(items) || items.length === 0) return null;

    const firstTokenLower = parts[0].toLowerCase();
    const matched =
      items.find((it) =>
        (it.name || "").toLowerCase().includes(firstTokenLower)
      ) || items[0];

    if (!matched?.link || !matched?.name) return null;
    return {
      rawName: matched.name,
      instrumentHint: matched.name,
      calendarUrl: matched.link,
    };
  } catch {
    return null;
  }
}

async function checkImslpComposerUrl(name: string): Promise<string | null> {
  const parts = transliterateCyrillic(name).trim().split(/\s+/);
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
    const data = (await res.json()) as OpenSearchTuple;
    const url = data?.[3]?.[0];
    return url || null;
  } catch {
    return null;
  }
}

const MUSIC_BIO_REGEX =
  /composer|musician|pianist|violinist|cellist|conductor|organist|harpsichordist|flutist|flautist|oboist|clarinetist|guitarist|harpist|soprano|mezzo|tenor|baritone|bass|singer|vocalist|komponist|dirigent|compositeur|compositore|kompozytor|композитор|музикант|піаніст|скрипал|віолончеліст|диригент|органіст|флейтист|гітарист|співак|співачка|соліст|заслужений артист|народний артист/i;

export async function lookupComposerCandidates(
  query: string
): Promise<EnrichedComposerCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const latinQ = CYRILLIC_RE.test(q) ? transliterateCyrillic(q) : q;

  const [wikiSummaries, openOpusRes, openLibRes] = await Promise.all([
    searchMultilingualWikipedia(q, { enSuffix: "composer", limit: 3 }),
    fetch(
      `https://api.openopus.org/composer/list/search/${encodeURIComponent(
        latinQ
      )}.json`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) => (r.ok ? (r.json() as Promise<OpenOpusSearchJson>) : null))
      .catch(() => null),
    fetch(
      `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(
        latinQ
      )}&limit=3`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) =>
        r.ok ? (r.json() as Promise<OpenLibraryAuthorsJson>) : null
      )
      .catch(() => null),
  ]);

  const openOpusComposers = Array.isArray(openOpusRes?.composers)
    ? openOpusRes.composers
    : [];
  const openLibAuthors = Array.isArray(openLibRes?.docs) ? openLibRes.docs : [];

  // Batch-fetch birth (P569), death (P570), citizenship (P27), portrait (P18), and English label from Wikidata
  const qids = wikiSummaries
    .map((s) => s.wikibase_item)
    .filter((x): x is string => Boolean(x));

  const wikidataComposerMap = new Map<
    string,
    {
      labelEn: string | null;
      birth: number | null;
      death: number | null;
      nationality: string | null;
      commonsImg: string | null;
    }
  >();

  if (qids.length > 0) {
    try {
      const wdRes = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join(
          "|"
        )}&props=claims|labels&languages=en|uk&format=json`,
        { headers: { "User-Agent": UA } }
      );
      if (wdRes.ok) {
        const wdJson = (await wdRes.json()) as {
          entities?: Record<
            string,
            {
              labels?: { en?: { value?: string } };
              claims?: {
                P569?: {
                  mainsnak?: { datavalue?: { value?: { time?: string } } };
                }[];
                P570?: {
                  mainsnak?: { datavalue?: { value?: { time?: string } } };
                }[];
                P27?: {
                  mainsnak?: { datavalue?: { value?: { id?: string } } };
                }[];
                P18?: { mainsnak?: { datavalue?: { value?: string } } }[];
              };
            }
          >;
        };
        for (const qid of qids) {
          const ent = wdJson.entities?.[qid];
          const claims = ent?.claims;
          const bStr =
            claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time || "";
          const dStr =
            claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time || "";
          const bMatch = bStr.match(/([12]\d{3})/);
          const dMatch = dStr.match(/([12]\d{3})/);
          const natQid =
            claims?.P27?.[0]?.mainsnak?.datavalue?.value?.id || "";
          const p18 = claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;
          wikidataComposerMap.set(qid, {
            labelEn: ent?.labels?.en?.value || null,
            birth: bMatch ? Number(bMatch[1]) : null,
            death: dMatch ? Number(dMatch[1]) : null,
            nationality: WIKIDATA_CITIZENSHIP[natQid] || null,
            commonsImg: commonsThumbFromFilename(p18),
          });
        }
      }
    } catch {
      // Ignore Wikidata fallback error
    }
  }

  const candidates: EnrichedComposerCandidate[] = [];

  for (const sum of wikiSummaries) {
    if (!sum.extract) continue;
    const combined = `${sum.description || ""} ${sum.extract}`;
    if (wikiSummaries.length > 1 && !MUSIC_BIO_REGEX.test(combined)) {
      continue;
    }

    const wd = sum.wikibase_item
      ? wikidataComposerMap.get(sum.wikibase_item)
      : undefined;
    const cleanName = normalizeBiographicalDisplayName(
      String(sum.title || q),
      wd?.labelEn
    );
    const { birthYear, deathYear, nationality } =
      extractYearsAndNationality(combined);

    const lastLower = cleanName.split(" ").pop()?.toLowerCase() || "";
    const ooMatch = openOpusComposers.find((c) =>
      (c.complete_name || c.name || "").toLowerCase().includes(lastLower)
    );
    const olMatch = openLibAuthors.find((a) =>
      (a.name || "").toLowerCase().includes(lastLower)
    );
    const olBirthMatch = olMatch?.birth_date?.match(/\b(1[4-9]\d{2}|20[01]\d)\b/);
    const olDeathMatch = olMatch?.death_date?.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);

    const finalBirth =
      wd?.birth ||
      birthYear ||
      (ooMatch?.birth ? Number(ooMatch.birth.slice(0, 4)) : null) ||
      (olBirthMatch ? Number(olBirthMatch[1]) : null);
    const finalDeath =
      wd?.death ||
      deathYear ||
      (ooMatch?.death && ooMatch.death !== "null"
        ? Number(ooMatch.death.slice(0, 4))
        : null) ||
      (olDeathMatch ? Number(olDeathMatch[1]) : null);

    const [imslpUrl, commonsFallback] = await Promise.all([
      checkImslpComposerUrl(cleanName),
      !sum.thumbnail?.source && !wd?.commonsImg && !ooMatch?.portrait
        ? searchWikimediaCommonsThumb(cleanName)
        : Promise.resolve(null),
    ]);

    const sources = [wikiSourceBadge(sum.wikiLang)];
    if (wd) sources.push("Wikidata");
    if (ooMatch) sources.push("OpenOpus");
    if (olMatch) sources.push("OpenLibrary");
    if (imslpUrl) sources.push("IMSLP");
    if (commonsFallback) sources.push("Wikimedia Commons");

    candidates.push({
      id: `wiki:${sum.wikibase_item || cleanName}`,
      name: cleanName,
      full_name: ooMatch?.complete_name || cleanName,
      birth_year: finalBirth,
      death_year: finalDeath,
      nationality:
        wd?.nationality ||
        (nationality !== "International" ? nationality : "International"),
      birth_place: null,
      era: inferEraFromBirthYear(finalBirth || 1950),
      avatar_url:
        sum.thumbnail?.source ||
        wd?.commonsImg ||
        ooMatch?.portrait ||
        commonsFallback ||
        null,
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
      const fullName = c.complete_name || c.name || latinQ;
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
  const latinWork = CYRILLIC_RE.test(baseWorkQuery)
    ? transliterateCyrillic(baseWorkQuery)
    : baseWorkQuery;
  const latinComposer = CYRILLIC_RE.test(composerQuery)
    ? transliterateCyrillic(composerQuery)
    : composerQuery;
  const combinedSearch = [latinWork, latinComposer].filter(Boolean).join(" ");
  const composerLast = latinComposer.trim().split(/\s+/).pop() || "";

  type ImslpSearchJson = {
    query?: { search?: { title: string }[] };
  };

  const [mbRes, imslpRes, wikiSummaries, composerCands] = await Promise.all([
    fetch(
      `https://musicbrainz.org/ws/2/work/?query=${encodeURIComponent(
        composerLast
          ? `${latinWork} AND artist:${composerLast}`
          : latinWork
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
    searchMultilingualWikipedia(
      [workQuery, composerQuery].filter(Boolean).join(" "),
      { limit: 2 }
    ),
    includeComposerMeta && composerQuery.trim()
      ? lookupComposerCandidates(composerQuery)
      : Promise.resolve([]),
  ]);

  const primaryComposerMeta = composerCands[0] ?? null;

  let imslpTopTitle: string | null = null;
  let imslpTopUrl: string | null = null;
  let imslpParsed: ReturnType<typeof parseImslpWorkInfo> | null = null;

  const imslpHits = imslpRes?.query?.search || [];
  if (imslpHits.length > 0) {
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

  let wikiDesc: string | null = null;
  let wikiPageUrl: string | null = null;
  let wikiYear: number | null = null;
  let wikiBadge = "Wikipedia";

  const matchedWikiWork = wikiSummaries.find(
    (s) =>
      s.extract &&
      /concerto|symphony|sonata|quartet|opera|composed|premiered|music|suite|piece|opus|orchestra|концерт|симфоні|соната|квартет|опера|сюїта|твір|композитор/i.test(
        s.extract
      )
  );
  if (matchedWikiWork?.extract) {
    wikiDesc = matchedWikiWork.extract.slice(0, 650);
    wikiPageUrl = matchedWikiWork.content_urls?.desktop?.page || null;
    wikiBadge = wikiSourceBadge(matchedWikiWork.wikiLang);
    const ym = matchedWikiWork.extract.match(
      /\b(?:composed|written|completed|premiered|arranged|published|написан\S*|створен\S*|прем'єр\S*)\s+(?:in\s+|у\s+|в\s+)?(1[4-9]\d{2}|20[0-2]\d)\b/i
    );
    if (ym) wikiYear = Number(ym[1]);
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
    if (wikiDesc) sources.push(wikiBadge);

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

  const mbWorks = Array.isArray(mbRes?.works) ? mbRes.works : [];

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
    if (out.length === 0 && wikiDesc) sources.push(wikiBadge);

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
      sources: [wikiBadge],
      composer_meta: primaryComposerMeta,
    });
  }

  return out.slice(0, 4);
}

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
      const baseDomain = base.hostname.replace(/^www\./, "");
      if (!resolved.hostname.endsWith(baseDomain)) continue;

      const pathLower = resolved.pathname.toLowerCase();
      const labelLower = label.toLowerCase();

      let score = 0;
      if (
        /\/(concerts?|calendar|schedule|tour|events?|dates|live|whats-on|performances|agenda|season|konzerte|afisha|all-events)\/?$/i.test(
          pathLower
        )
      ) {
        score += 10;
      } else if (
        /(concerts?|calendar|schedule|tour|events|whats-on|performances|agenda|season|konzerte|afisha)/i.test(
          pathLower
        )
      ) {
        score += 5;
      }
      if (
        /\b(concerts?|calendar|schedule|tour|events?|dates|live|what'?s on|performances|season|agenda|афіша|концерти|події)\b/i.test(
          labelLower
        )
      ) {
        score += 6;
      }
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
  wdInstrumentQids: string[],
  wdOccupationQids: string[] = []
): {
  performer_type: "orchestra" | "ensemble" | "conductor" | "soloist";
  instrument_or_role: string;
} {
  const combined = `${name} ${text}`;
  if (
    /orchestra|philharmoni|symphony|sinfonie|staatskapelle|orchester|orchestre|симфонічний оркестр|філармонічний оркестр|камерний оркестр/i.test(
      name
    )
  ) {
    return {
      performer_type: "orchestra",
      instrument_or_role: "Symphony Orchestra",
    };
  }
  if (
    /quartet|trio|quintet|ensemble|consort|camerata|choir|chorus|квартет|тріо|квінтет|ансамбль|хор|капела|камерата/i.test(
      name
    )
  ) {
    return {
      performer_type: "ensemble",
      instrument_or_role: /quartet|квартет/i.test(name)
        ? "String Quartet"
        : /choir|chorus|хор|капела/i.test(name)
          ? "Choir"
          : "Chamber Ensemble",
    };
  }
  if (
    /(?:\bconductor\b|\bdirigent\b|chef d'orchestre|\bdyrygent\b|диригент)/i.test(
      text.slice(0, 180)
    ) &&
    !/pianist|violinist|cellist|піаніст|скрипал|віолончел|флейт/i.test(
      text.slice(0, 120)
    )
  ) {
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

  for (const qid of wdOccupationQids) {
    if (WIKIDATA_OCCUPATIONS[qid]) {
      return {
        performer_type: WIKIDATA_OCCUPATIONS[qid].type,
        instrument_or_role: WIKIDATA_OCCUPATIONS[qid].role,
      };
    }
  }

  const roleMap: [RegExp, string][] = [
    [/\bpianist\b|\bpianista\b|піаніст|фортепіан/i, "Piano"],
    [/\bviolinist\b|\bgeiger\b|\bvioloniste\b|\bskrzypek\b|скрипал|скрипк/i, "Violin"],
    [/\bcellist\b|\bvioloncellist\b|віолончел/i, "Cello"],
    [/\bviolist\b|альтист|\bальт\b/i, "Viola"],
    [/\bflutist|\bflautist|\bflötist|\bflûtiste|флейт/i, "Flute"],
    [/\boboist\b|гобоїст|гобой/i, "Oboe"],
    [/\bclarinett?ist\b|кларнет/i, "Clarinet"],
    [/\bbassoonist\b|фагот/i, "Bassoon"],
    [/\bmezzo-soprano\b|мецо-сопрано/i, "Mezzo-Soprano"],
    [/\bsoprano\b|сопрано/i, "Soprano"],
    [/\bcontralto\b|контральто/i, "Contralto"],
    [/\bcountertenor\b|контртенор/i, "Countertenor"],
    [/\btenor\b|тенор/i, "Tenor"],
    [/\bbass-baritone\b|бас-баритон/i, "Bass-Baritone"],
    [/\bbaritone\b|баритон/i, "Baritone"],
    [/\bbass\b|\bбас\b/i, "Bass"],
    [/\borganist\b|органіст|\bорган\b/i, "Organ"],
    [/\bharpsichordist\b|клавесин/i, "Harpsichord"],
    [/\bharpist\b|арфіст|\bарфа\b/i, "Harp"],
    [/\bguitarist\b|гітарист|гітар/i, "Guitar"],
    [/бандурист|бандур/i, "Bandura"],
    [/баяніст|\bбаян\b/i, "Bayan"],
    [/акордеон|\baccordionist\b/i, "Accordion"],
    [/\bsaxophonist\b|саксофон/i, "Saxophone"],
    [/\btrumpeter\b|трубач|\bтруба\b/i, "Trumpet"],
    [/\bpercussionist\b|ударн/i, "Percussion"],
    [/хормейстер/i, "Choir Conductor"],
    [/\bconductor\b|\bdirigent\b|диригент/i, "Conductor"],
    [/співак|співачка|\bsinger\b|вокал/i, "Voice"],
  ];

  for (const [rx, label] of roleMap) {
    if (rx.test(combined)) {
      return {
        performer_type: label.includes("Conductor") ? "conductor" : "soloist",
        instrument_or_role: label,
      };
    }
  }

  return { performer_type: "soloist", instrument_or_role: "Soloist" };
}

const PERFORMER_RELEVANCE_REGEX =
  /orchestra|philharmoni|symphony|conductor|pianist|violinist|cellist|singer|soprano|mezzo|tenor|baritone|bass|musician|quartet|ensemble|choir|violist|flutist|flautist|oboist|clarinetist|organist|guitarist|harpist|dirigent|geiger|komponist|оркестр|філармоні|симфоні|диригент|піаніст|скрипал|віолончел|співак|співачка|сопрано|мецо|тенор|баритон|музикант|квартет|ансамбль|хор|капела|флейт|гобо|кларнет|орган|гітар|арф|бандур|баян|соліст|артист/i;

/**
 * Looks up Performers (Soloists, Conductors, Orchestras, Ensembles) across:
 * 1. Multilingual Full-Text Wikipedia (`en`, `uk`, `de`, `fr`, `it`, `pl`)
 * 2. Wikidata cross-language aliases + claims (`P856` website, `P1303` instrument, `P412` voice, `P106` occupation, `P27` nationality, `P18` portrait, `P973` bio URL)
 * 3. MusicBrainz Artist + URL relations (with Cyrillic-to-Latin fallback)
 * 4. Institutional Artist Roster APIs (`philarmonia.com.ua/wp-json/wp/v2/vikonavts`)
 * 5. Wikimedia Commons portrait search + Homepage Tour/Calendar URL auto-discovery
 */
export async function lookupPerformerCandidates(
  query: string
): Promise<EnrichedPerformerCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const isCyrillic = CYRILLIC_RE.test(q);
  const latinQ = isCyrillic ? transliterateCyrillic(q) : q;

  type MbArtistUrlSearch = {
    artists?: {
      id: string;
      name: string;
      type?: string;
      country?: string;
      area?: { name?: string; type?: string };
      disambiguation?: string;
    }[];
  };

  const [initialSummaries, wdSearchQids, mbRes, kyivRoster] = await Promise.all([
    searchMultilingualWikipedia(q, { limit: 3 }),
    searchWikidataQids(q, 3),
    fetch(
      `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(
        q
      )}&fmt=json&limit=3`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) => (r.ok ? (r.json() as Promise<MbArtistUrlSearch>) : null))
      .catch(() => null),
    isCyrillic ? lookupKyivPhilharmonicRoster(q) : Promise.resolve(null),
  ]);

  // If Cyrillic MusicBrainz query returned 0 artists, retry once with clean Latin transliteration
  let mbArtists = mbRes?.artists ?? [];
  if (mbArtists.length === 0 && isCyrillic && latinQ !== q) {
    const mbLatin = await fetch(
      `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(
        latinQ
      )}&fmt=json&limit=3`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) => (r.ok ? (r.json() as Promise<MbArtistUrlSearch>) : null))
      .catch(() => null);
    mbArtists = mbLatin?.artists ?? [];
  }

  const summaries = [...initialSummaries];
  const allQids = Array.from(
    new Set([
      ...summaries.map((s) => s.wikibase_item).filter((x): x is string => Boolean(x)),
      ...wdSearchQids,
    ])
  ).slice(0, 5);

  interface WdPerformerMeta {
    labelEn: string | null;
    labelUk: string | null;
    descEn: string | null;
    descUk: string | null;
    website: string | null;
    describedAtUrl: string | null;
    instrumentQids: string[];
    occupationQids: string[];
    nationality: string | null;
    commonsImg: string | null;
    sitelinks: Partial<Record<`${WikiLang}wiki`, { title?: string }>>;
  }

  const wdMeta = new Map<string, WdPerformerMeta>();

  if (allQids.length > 0) {
    try {
      const wdRes = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${allQids.join(
          "|"
        )}&props=claims|labels|descriptions|sitelinks&languages=en|uk|de|fr&format=json`,
        { headers: { "User-Agent": UA } }
      );
      if (wdRes.ok) {
        const wdJson = (await wdRes.json()) as {
          entities?: Record<
            string,
            {
              labels?: Record<string, { value?: string }>;
              descriptions?: Record<string, { value?: string }>;
              sitelinks?: Partial<Record<`${WikiLang}wiki`, { title?: string }>>;
              claims?: {
                P856?: { mainsnak?: { datavalue?: { value?: string } } }[];
                P973?: { mainsnak?: { datavalue?: { value?: string } } }[];
                P18?: { mainsnak?: { datavalue?: { value?: string } } }[];
                P27?: {
                  mainsnak?: { datavalue?: { value?: { id?: string } } };
                }[];
                P1303?: {
                  mainsnak?: { datavalue?: { value?: { id?: string } } };
                }[];
                P412?: {
                  mainsnak?: { datavalue?: { value?: { id?: string } } };
                }[];
                P106?: {
                  mainsnak?: { datavalue?: { value?: { id?: string } } };
                }[];
              };
            }
          >;
        };
        for (const qid of allQids) {
          const ent = wdJson.entities?.[qid];
          const claims = ent?.claims;
          const site = claims?.P856?.[0]?.mainsnak?.datavalue?.value || null;
          const descUrl = claims?.P973?.[0]?.mainsnak?.datavalue?.value || null;
          const p18 = claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;
          const natQid =
            claims?.P27?.[0]?.mainsnak?.datavalue?.value?.id || "";

          const instIds = [
            ...(claims?.P412 || []),
            ...(claims?.P1303 || []),
          ]
            .map((c) => c.mainsnak?.datavalue?.value?.id)
            .filter((id): id is string => Boolean(id));

          const occIds = (claims?.P106 || [])
            .map((c) => c.mainsnak?.datavalue?.value?.id)
            .filter((id): id is string => Boolean(id));

          wdMeta.set(qid, {
            labelEn: ent?.labels?.en?.value || null,
            labelUk: ent?.labels?.uk?.value || null,
            descEn: ent?.descriptions?.en?.value || null,
            descUk: ent?.descriptions?.uk?.value || null,
            website: site,
            describedAtUrl: descUrl,
            instrumentQids: instIds,
            occupationQids: occIds,
            nationality: WIKIDATA_CITIZENSHIP[natQid] || null,
            commonsImg: commonsThumbFromFilename(p18),
            sitelinks: ent?.sitelinks || {},
          });
        }
      }
    } catch {
      // Ignore Wikidata error
    }
  }

  // Hydrate any Wikidata alias hit whose Wikipedia sitelink wasn't in `summaries` yet
  const existingSummaryQids = new Set(
    summaries.map((s) => s.wikibase_item).filter(Boolean)
  );
  for (const qid of wdSearchQids) {
    if (existingSummaryQids.has(qid)) continue;
    const meta = wdMeta.get(qid);
    if (!meta) continue;
    const langOrder: WikiLang[] = ["en", "uk", "de", "fr", "it", "pl"];
    for (const lang of langOrder) {
      const slTitle = meta.sitelinks[`${lang}wiki`]?.title;
      if (slTitle) {
        const fetched = await fetchWikiSummaryByTitle(lang, slTitle);
        if (fetched) {
          summaries.push(fetched);
          existingSummaryQids.add(qid);
        }
        break;
      }
    }
  }

  // Optional MusicBrainz official homepage fallback for top artist match
  let mbOfficialSite: string | null = null;
  let mbCity: string | null = null;
  const topMb = mbArtists[0];
  if (topMb?.id) {
    const rawArea = topMb.area?.name || null;
    const areaType = topMb.area?.type || "";
    if (
      rawArea &&
      areaType !== "Country" &&
      !/^(?:Soviet Union|Ukraine|Russia|Germany|Austria|France|Italy|Poland|United Kingdom|United States|Canada|Japan|China|Spain|Netherlands|Switzerland|Belgium)$/i.test(
        rawArea
      )
    ) {
      mbCity = rawArea;
    }
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
    const wd = sum.wikibase_item ? wdMeta.get(sum.wikibase_item) : undefined;
    const wikiOnlyText = `${sum.description || ""} ${wd?.descEn || ""} ${wd?.descUk || ""} ${sum.extract}`;

    const hasMusicalWdClaim =
      (wd?.instrumentQids.length ?? 0) > 0 ||
      (wd?.occupationQids.some((id) => Boolean(WIKIDATA_OCCUPATIONS[id])) ?? false);

    if (!hasMusicalWdClaim && !PERFORMER_RELEVANCE_REGEX.test(wikiOnlyText)) {
      continue;
    }

    const combined = `${wikiOnlyText} ${kyivRoster?.instrumentHint || ""}`;

    const displayName = normalizeBiographicalDisplayName(
      String(sum.title || q),
      wd?.labelEn
    );
    const { nationality: parsedNat } = extractYearsAndNationality(combined);
    const finalNationality =
      wd?.nationality ||
      (parsedNat !== "International"
        ? parsedNat
        : kyivRoster
          ? "Ukrainian"
          : null);

    const { performer_type, instrument_or_role } =
      inferPerformerRoleAndInstrument(
        displayName,
        combined,
        wd?.instrumentQids || [],
        wd?.occupationQids || []
      );

    const websiteUrl =
      wd?.website ||
      (i === 0 ? mbOfficialSite : null) ||
      wd?.describedAtUrl ||
      (i === 0 ? kyivRoster?.calendarUrl || null : null);

    const crawledCalendar =
      i === 0 && (wd?.website || mbOfficialSite)
        ? await discoverCalendarUrl(wd?.website || mbOfficialSite)
        : null;

    const calendarUrl =
      crawledCalendar ||
      (i === 0 && kyivRoster?.calendarUrl ? kyivRoster.calendarUrl : null) ||
      websiteUrl;

    let avatarUrl = sum.thumbnail?.source || wd?.commonsImg || null;
    let usedCommonsSearch = false;
    if (!avatarUrl && i === 0) {
      avatarUrl =
        (await searchWikimediaCommonsThumb(q)) ||
        (latinQ !== q ? await searchWikimediaCommonsThumb(displayName) : null);
      if (avatarUrl) usedCommonsSearch = true;
    }

    const inferredCity =
      (i === 0 && mbCity) ||
      (i === 0 && kyivRoster ? "Kyiv" : null) ||
      (/Національної філармонії України|Київ|Kyiv/i.test(combined) ? "Kyiv" : null);

    const sources = [wikiSourceBadge(sum.wikiLang)];
    if (wd) sources.push("Wikidata");
    if (i === 0 && topMb) sources.push("MusicBrainz");
    if (i === 0 && kyivRoster) sources.push("Kyiv Philharmonic Roster");
    if (usedCommonsSearch) sources.push("Wikimedia Commons");
    if (crawledCalendar) sources.push("Tour Page");

    out.push({
      id: `perf:${sum.wikibase_item || displayName}`,
      name: displayName,
      performer_type,
      instrument_or_role,
      nationality: finalNationality,
      home_city: inferredCity,
      website_url: websiteUrl,
      calendar_url: calendarUrl,
      avatar_url: avatarUrl,
      short_bio: sum.extract.slice(0, 500),
      wikidata_qid: sum.wikibase_item || null,
      source_url:
        sum.content_urls?.desktop?.page || websiteUrl || null,
      sources,
    });
  }

  // Wikidata-only fallback when an artist has a Wikidata item (e.g. QID) without a full Wikipedia prose article yet
  if (out.length === 0 && wdSearchQids.length > 0) {
    const qid = wdSearchQids[0];
    const wd = wdMeta.get(qid);
    if (
      wd &&
      (wd.instrumentQids.length > 0 ||
        wd.occupationQids.some((id) => Boolean(WIKIDATA_OCCUPATIONS[id])) ||
        PERFORMER_RELEVANCE_REGEX.test(`${wd.descEn || ""} ${wd.descUk || ""}`))
    ) {
      const displayName = normalizeBiographicalDisplayName(q, wd.labelEn);
      const descText = `${wd.descEn || wd.descUk || ""} ${kyivRoster?.instrumentHint || ""}`.trim();
      const { performer_type, instrument_or_role } =
        inferPerformerRoleAndInstrument(
          displayName,
          descText,
          wd.instrumentQids,
          wd.occupationQids
        );
      const websiteUrl =
        wd.website || mbOfficialSite || kyivRoster?.calendarUrl || null;
      const calendarUrl =
        (wd.website ? await discoverCalendarUrl(wd.website) : null) ||
        kyivRoster?.calendarUrl ||
        websiteUrl;
      const commonsFallback =
        wd.commonsImg || (await searchWikimediaCommonsThumb(q));

      const sources = ["Wikidata"];
      if (kyivRoster) sources.push("Kyiv Philharmonic Roster");
      if (commonsFallback) sources.push("Wikimedia Commons");

      out.push({
        id: `wd-perf:${qid}`,
        name: displayName,
        performer_type,
        instrument_or_role,
        nationality: wd.nationality || (kyivRoster ? "Ukrainian" : null),
        home_city: mbCity || (kyivRoster ? "Kyiv" : null),
        website_url: websiteUrl,
        calendar_url: calendarUrl,
        avatar_url: commonsFallback,
        short_bio: `${displayName} — ${wd.descEn || wd.descUk || `${instrument_or_role} soloist`}.`,
        wikidata_qid: qid,
        source_url: `https://www.wikidata.org/wiki/${qid}`,
        sources,
      });
    }
  }

  // MusicBrainz fallback if no Wikipedia/Wikidata match exists
  if (out.length === 0 && topMb) {
    const combinedMb = `${topMb.disambiguation || ""} ${kyivRoster?.instrumentHint || ""}`;
    const { performer_type, instrument_or_role } =
      inferPerformerRoleAndInstrument(topMb.name, combinedMb, []);
    const calendarUrl =
      (mbOfficialSite ? await discoverCalendarUrl(mbOfficialSite) : null) ||
      kyivRoster?.calendarUrl ||
      mbOfficialSite;
    const commonsFallback = await searchWikimediaCommonsThumb(q);

    const sources = ["MusicBrainz"];
    if (kyivRoster) sources.push("Kyiv Philharmonic Roster");
    if (commonsFallback) sources.push("Wikimedia Commons");

    out.push({
      id: `mb-perf:${topMb.id}`,
      name: CYRILLIC_RE.test(topMb.name)
        ? transliterateCyrillic(topMb.name)
        : topMb.name,
      performer_type:
        topMb.type === "Group" || topMb.type === "Orchestra"
          ? performer_type === "soloist"
            ? "ensemble"
            : performer_type
          : performer_type,
      instrument_or_role,
      nationality: kyivRoster ? "Ukrainian" : null,
      home_city: mbCity || (kyivRoster ? "Kyiv" : null),
      website_url: mbOfficialSite || kyivRoster?.calendarUrl || null,
      calendar_url: calendarUrl,
      avatar_url: commonsFallback,
      short_bio: `${CYRILLIC_RE.test(topMb.name) ? transliterateCyrillic(topMb.name) : topMb.name}${topMb.disambiguation ? ` — ${topMb.disambiguation}` : " — classical performing artist"}.`,
      wikidata_qid: null,
      source_url:
        mbOfficialSite || `https://musicbrainz.org/artist/${topMb.id}`,
      sources,
    });
  }

  // Institutional Roster fallback (e.g. rising soloist at National Philharmonic of Ukraine not yet on Wikipedia/MusicBrainz)
  if (out.length === 0 && kyivRoster) {
    const { performer_type, instrument_or_role } =
      inferPerformerRoleAndInstrument(q, kyivRoster.instrumentHint, []);
    const cleanLatin = normalizeBiographicalDisplayName(q);
    const commonsFallback = await searchWikimediaCommonsThumb(q);
    const sources = ["Kyiv Philharmonic Roster"];
    if (commonsFallback) sources.push("Wikimedia Commons");

    out.push({
      id: `roster:kyiv:${cleanLatin}`,
      name: cleanLatin,
      performer_type,
      instrument_or_role,
      nationality: "Ukrainian",
      home_city: "Kyiv",
      website_url: kyivRoster.calendarUrl,
      calendar_url: kyivRoster.calendarUrl,
      avatar_url: commonsFallback,
      short_bio: `${cleanLatin} (${q}) — ${instrument_or_role.toLowerCase()} soloist featured at the National Philharmonic of Ukraine in Kyiv.`,
      wikidata_qid: null,
      source_url: kyivRoster.calendarUrl,
      sources,
    });
  }

  return out.slice(0, 4);
}

/**
 * Looks up Concert Halls, Opera Houses & Venues outside our Top 100 via
 * Multilingual Wikipedia REST + Wikidata (coords P625, capacity P1083, opened P1619, website P856, photo P18) +
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

  const [summaries, osmRes] = await Promise.all([
    searchMultilingualWikipedia(q, { limit: 2 }),
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
  const qids = Array.from(
    new Set(
      [
        ...summaries.map((s) => s.wikibase_item),
        osmTop?.extratags?.wikidata,
      ].filter((x): x is string => Boolean(x))
    )
  );

  const wdVenueMeta = new Map<
    string,
    {
      labelEn: string | null;
      lat: number | null;
      lng: number | null;
      capacity: number | null;
      openedYear: number | null;
      website: string | null;
      commonsImg: string | null;
    }
  >();

  if (qids.length > 0) {
    try {
      const wdRes = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join(
          "|"
        )}&props=claims|labels&languages=en&format=json`,
        { headers: { "User-Agent": UA } }
      );
      if (wdRes.ok) {
        const wdJson = (await wdRes.json()) as {
          entities?: Record<
            string,
            {
              labels?: { en?: { value?: string } };
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
                P18?: { mainsnak?: { datavalue?: { value?: string } } }[];
              };
            }
          >;
        };
        for (const qid of qids) {
          const ent = wdJson.entities?.[qid];
          const c = ent?.claims;
          const coord = c?.P625?.[0]?.mainsnak?.datavalue?.value;
          const capStr = c?.P1083?.[0]?.mainsnak?.datavalue?.value?.amount;
          const openStr =
            c?.P1619?.[0]?.mainsnak?.datavalue?.value?.time ||
            c?.P571?.[0]?.mainsnak?.datavalue?.value?.time ||
            "";
          const ym = openStr.match(/([12]\d{3})/);
          const p18 = c?.P18?.[0]?.mainsnak?.datavalue?.value || null;
          wdVenueMeta.set(qid, {
            labelEn: ent?.labels?.en?.value || null,
            lat: coord?.latitude ?? null,
            lng: coord?.longitude ?? null,
            capacity: capStr ? Math.abs(parseInt(capStr, 10)) || null : null,
            openedYear: ym ? Number(ym[1]) : null,
            website: c?.P856?.[0]?.mainsnak?.datavalue?.value || null,
            commonsImg: commonsThumbFromFilename(p18),
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
    const wd = sum.wikibase_item
      ? wdVenueMeta.get(sum.wikibase_item)
      : undefined;
    const cleanName = normalizeBiographicalDisplayName(
      String(sum.title || query),
      wd?.labelEn
    );

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

    const sources = [wikiSourceBadge(sum.wikiLang)];
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
      photo_url: sum.thumbnail?.source || wd?.commonsImg || null,
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
    const rawOsmName =
      osmTop.name || osmTop.display_name.split(",")[0].trim() || query.trim();
    const cleanName = normalizeBiographicalDisplayName(rawOsmName, wd?.labelEn);

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
      photo_url: wd?.commonsImg || null,
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
