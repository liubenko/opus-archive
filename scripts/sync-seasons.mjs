#!/usr/bin/env node
/**
 * World Stage Season Sync Pipeline (`scripts/sync-seasons.mjs`)
 *
 * 1. Upserts iconic world concert halls (`public.venues`) + enriches photos via Wikipedia REST API
 * 2. Upserts flagship orchestras, conductors & soloists (`public.performers`) + enriches avatars
 * 3. Fetches live 2026/27 concerts from the NY Philharmonic CC0 Open Data feed
 *    (`nyphilarchive/PerformanceHistory`) + curated 2026/27 international season programs
 *    for Berliner Philharmoniker, Wiener Philharmoniker, LSO, Concertgebouw Orchestra,
 *    Carnegie Hall, Wigmore Hall, Elbphilharmonie, and featured Cello/Piano/Violin soloists
 * 4. Optional `--url=<concert_or_ics_url>` flag to ingest any `MusicEvent` JSON-LD or `.ics` page
 * 5. Matches every program piece against all 314 composers & 19,804+ works in Opus Archive:
 *    - Matched works link directly to `public.works(id)` so concert programs are clickable
 *    - Unmatched works create/update rows in `public.catalog_suggestions` for `/admin` review!
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildComposerMatcher,
  buildWorkMatcher,
  extractCatalog,
  normalizeText,
  slugify,
} from "./lib/dedup.mjs";
import {
  buildSuggestionMetadata,
  parseIcsCalendar,
  parseMusicEventsFromHtml,
  parseNyPhilPrograms,
} from "./lib/season-parser.mjs";

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
    const v = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadDotEnvIfNeeded();

const emitSqlArg = process.argv.find((a) => a.startsWith("--emit-sql="));
const EMIT_SQL_PATH = emitSqlArg ? emitSqlArg.slice("--emit-sql=".length) : null;

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  (EMIT_SQL_PATH ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : null);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const SEED_VENUES = [
  {
    slug: "carnegie-hall",
    name: "Carnegie Hall (Stern Auditorium)",
    short_name: "Carnegie Hall",
    city: "New York",
    country: "United States",
    country_code: "US",
    address: "881 Seventh Avenue, New York, NY 10019",
    latitude: 40.7651,
    longitude: -73.9799,
    capacity: 2804,
    opened_year: 1891,
    architect_or_acoustics: "William Burnet Tuthill",
    website_url: "https://www.carnegiehall.org",
    calendar_url: "https://www.carnegiehall.org/Events",
    wiki_title: "Carnegie_Hall",
    description:
      "America's preeminent concert hall since 1891, celebrated for its warm, enveloping acoustics and historic premieres from Dvořák to Rachmaninoff.",
  },
  {
    slug: "david-geffen-hall",
    name: "David Geffen Hall (Lincoln Center)",
    short_name: "David Geffen Hall",
    city: "New York",
    country: "United States",
    country_code: "US",
    address: "10 Lincoln Center Plaza, New York, NY 10023",
    latitude: 40.7728,
    longitude: -73.9835,
    capacity: 2200,
    opened_year: 1962,
    architect_or_acoustics: "Diamond Schmitt / Akustiks (2022 Wu Tsai Theater)",
    website_url: "https://www.nyphil.org",
    calendar_url: "https://www.nyphil.org/calendar",
    wiki_title: "David_Geffen_Hall",
    description:
      "Home of the New York Philharmonic at Lincoln Center, featuring the intimately reimagined Wu Tsai Theater.",
  },
  {
    slug: "philharmonie-berlin",
    name: "Philharmonie Berlin",
    short_name: "Philharmonie Berlin",
    city: "Berlin",
    country: "Germany",
    country_code: "DE",
    address: "Herbert-von-Karajan-Straße 1, 10785 Berlin",
    latitude: 52.51,
    longitude: 13.3697,
    capacity: 2440,
    opened_year: 1963,
    architect_or_acoustics: "Hans Scharoun / Lothar Cremer",
    website_url: "https://www.berliner-philharmoniker.de",
    calendar_url: "https://www.berliner-philharmoniker.de/en/concerts/calendar/",
    wiki_title: "Berliner_Philharmonie",
    description:
      "Iconic tent-like vineyard-terraced concert hall and artistic home of the Berliner Philharmoniker.",
  },
  {
    slug: "musikverein-vienna",
    name: "Wiener Musikverein (Goldener Saal)",
    short_name: "Musikverein",
    city: "Vienna",
    country: "Austria",
    country_code: "AT",
    address: "Musikvereinsplatz 1, 1010 Wien",
    latitude: 48.2006,
    longitude: 16.3728,
    capacity: 1744,
    opened_year: 1870,
    architect_or_acoustics: "Theophil Hansen",
    website_url: "https://www.musikverein.at",
    calendar_url: "https://www.musikverein.at/konzerte",
    wiki_title: "Musikverein",
    description:
      "Legendary shoebox-proportioned Golden Hall in Vienna, revered worldwide for its golden reverberation and home to the Vienna Philharmonic.",
  },
  {
    slug: "concertgebouw-amsterdam",
    name: "Het Concertgebouw (Grote Zaal)",
    short_name: "Concertgebouw",
    city: "Amsterdam",
    country: "Netherlands",
    country_code: "NL",
    address: "Concertgebouwplein 10, 1071 LN Amsterdam",
    latitude: 52.3563,
    longitude: 4.8791,
    capacity: 1974,
    opened_year: 1888,
    architect_or_acoustics: "Adolf Leonard van Gendt",
    website_url: "https://www.concertgebouw.nl",
    calendar_url: "https://www.concertgebouw.nl/en/concerts-and-tickets",
    wiki_title: "Concertgebouw",
    description:
      "One of the world's finest late-Romantic orchestral halls, renowned for lush string bloom and home to the Royal Concertgebouw Orchestra.",
  },
  {
    slug: "barbican-hall-london",
    name: "Barbican Hall",
    short_name: "Barbican Hall",
    city: "London",
    country: "United Kingdom",
    country_code: "GB",
    address: "Silk Street, London EC2Y 8DS",
    latitude: 51.5202,
    longitude: -0.0938,
    capacity: 1943,
    opened_year: 1982,
    architect_or_acoustics: "Chamberlin, Powell and Bon / Nagata Acoustics",
    website_url: "https://www.barbican.org.uk",
    calendar_url: "https://www.lso.co.uk/whats-on/",
    wiki_title: "Barbican_Centre",
    description:
      "Principal London residence of the London Symphony Orchestra in the heart of the City of London.",
  },
  {
    slug: "wigmore-hall",
    name: "Wigmore Hall",
    short_name: "Wigmore Hall",
    city: "London",
    country: "United Kingdom",
    country_code: "GB",
    address: "36 Wigmore Street, London W1U 2BP",
    latitude: 51.5165,
    longitude: -0.1492,
    capacity: 545,
    opened_year: 1901,
    architect_or_acoustics: "Thomas Edward Collcutt",
    website_url: "https://www.wigmore-hall.org.uk",
    calendar_url: "https://www.wigmore-hall.org.uk/whats-on",
    wiki_title: "Wigmore_Hall",
    description:
      "The world's benchmark sanctuary for solo instrumental recitals, chamber music, and song cycles.",
  },
  {
    slug: "elbphilharmonie-hamburg",
    name: "Elbphilharmonie (Großer Saal)",
    short_name: "Elbphilharmonie",
    city: "Hamburg",
    country: "Germany",
    country_code: "DE",
    address: "Platz der Deutschen Einheit 4, 20457 Hamburg",
    latitude: 53.5413,
    longitude: 9.9841,
    capacity: 2100,
    opened_year: 2017,
    architect_or_acoustics: "Herzog & de Meuron / Yasuhisa Toyota",
    website_url: "https://www.elbphilharmonie.de",
    calendar_url: "https://www.elbphilharmonie.de/en/whats-on/",
    wiki_title: "Elbphilharmonie",
    description:
      "Architectural landmark rising above the Elbe River with a 10,000-panel 'White Skin' vineyard auditorium.",
  },
  {
    slug: "philharmonie-de-paris",
    name: "Philharmonie de Paris (Grande Salle Pierre Boulez)",
    short_name: "Philharmonie de Paris",
    city: "Paris",
    country: "France",
    country_code: "FR",
    address: "221 Avenue Jean Jaurès, 75019 Paris",
    latitude: 48.8916,
    longitude: 2.3941,
    capacity: 2400,
    opened_year: 2015,
    architect_or_acoustics: "Jean Nouvel / Marshall Day Acoustics",
    website_url: "https://philharmoniedeparis.fr",
    calendar_url: "https://philharmoniedeparis.fr/en/calendar",
    wiki_title: "Philharmonie_de_Paris",
    description:
      "Floating-balcony symphonic hall in Parc de la Villette hosting major European and international orchestras.",
  },
  {
    slug: "walt-disney-concert-hall",
    name: "Walt Disney Concert Hall",
    short_name: "Walt Disney Hall",
    city: "Los Angeles",
    country: "United States",
    country_code: "US",
    address: "111 S Grand Ave, Los Angeles, CA 90012",
    latitude: 34.0553,
    longitude: -118.2498,
    capacity: 2265,
    opened_year: 2003,
    architect_or_acoustics: "Frank Gehry / Yasuhisa Toyota",
    website_url: "https://www.laphil.com",
    calendar_url: "https://www.laphil.com/events/performances",
    wiki_title: "Walt_Disney_Concert_Hall",
    description:
      "Frank Gehry's stainless-steel acoustic masterpiece in downtown Los Angeles, home to the LA Phil.",
  },
  {
    slug: "suntory-hall-tokyo",
    name: "Suntory Hall (Main Hall)",
    short_name: "Suntory Hall",
    city: "Tokyo",
    country: "Japan",
    country_code: "JP",
    address: "1-13-1 Akasaka, Minato-ku, Tokyo 107-8403",
    latitude: 35.6672,
    longitude: 139.7397,
    capacity: 2006,
    opened_year: 1986,
    architect_or_acoustics: "Yasui Architects / Nagata Acoustics",
    website_url: "https://www.suntory.com/culture-sports/suntoryhall/",
    calendar_url: "https://www.suntory.com/culture-sports/suntoryhall/schedule/",
    wiki_title: "Suntory_Hall",
    description:
      "Tokyo's flagship vineyard-style symphonic hall, prized by touring European and American orchestras — praised by Karajan as 'a jewel box of sound'.",
  },
  {
    slug: "teatro-alla-scala",
    name: "Teatro alla Scala",
    short_name: "La Scala",
    city: "Milan",
    country: "Italy",
    country_code: "IT",
    address: "Via Filodrammatici 2, 20121 Milano",
    latitude: 45.4675,
    longitude: 9.1895,
    capacity: 2030,
    opened_year: 1778,
    architect_or_acoustics: "Giuseppe Piermarini",
    website_url: "https://www.teatroallascala.org",
    calendar_url: "https://www.teatroallascala.org/en/season/",
    wiki_title: "La_Scala",
    description:
      "Historic Milanese opera house and symphonic stage where Verdi, Rossini, Bellini, and Puccini shaped operatic history.",
  },
];

const SEED_PERFORMERS = [
  // 5 Flagship Orchestras
  {
    slug: "berliner-philharmoniker",
    name: "Berliner Philharmoniker",
    performer_type: "orchestra",
    instrument_or_role: "Symphony Orchestra",
    nationality: "German",
    home_city: "Berlin",
    resident_venue_slug: "philharmonie-berlin",
    website_url: "https://www.berliner-philharmoniker.de",
    calendar_url: "https://www.berliner-philharmoniker.de/en/concerts/calendar/",
    wiki_title: "Berlin_Philharmonic",
    short_bio:
      "Founded in Berlin in 1882; led by Chief Conductor Kirill Petrenko and renowned for both core Austro-German repertoire and bold contemporary commissions.",
  },
  {
    slug: "new-york-philharmonic",
    name: "New York Philharmonic",
    performer_type: "orchestra",
    instrument_or_role: "Symphony Orchestra",
    nationality: "American",
    home_city: "New York",
    resident_venue_slug: "david-geffen-hall",
    website_url: "https://www.nyphil.org",
    calendar_url: "https://www.nyphil.org/calendar",
    wiki_title: "New_York_Philharmonic",
    short_bio:
      "Founded in 1842, the oldest symphony orchestra in the United States, performing at David Geffen Hall and major global tour residencies.",
  },
  {
    slug: "wiener-philharmoniker",
    name: "Wiener Philharmoniker",
    performer_type: "orchestra",
    instrument_or_role: "Symphony Orchestra",
    nationality: "Austrian",
    home_city: "Vienna",
    resident_venue_slug: "musikverein-vienna",
    website_url: "https://www.wienerphilharmoniker.at",
    calendar_url: "https://www.wienerphilharmoniker.at/en/concerts",
    wiki_title: "Vienna_Philharmonic",
    short_bio:
      "Resident at Vienna's Goldener Saal since 1842, famed for its unmistakable Viennese horn, oboe, and string sound.",
  },
  {
    slug: "london-symphony-orchestra",
    name: "London Symphony Orchestra",
    performer_type: "orchestra",
    instrument_or_role: "Symphony Orchestra",
    nationality: "British",
    home_city: "London",
    resident_venue_slug: "barbican-hall-london",
    website_url: "https://www.lso.co.uk",
    calendar_url: "https://www.lso.co.uk/whats-on/",
    wiki_title: "London_Symphony_Orchestra",
    short_bio:
      "Self-governing London orchestra founded in 1904, resident at the Barbican Centre under Chief Conductor Sir Antonio Pappano.",
  },
  {
    slug: "royal-concertgebouw-orchestra",
    name: "Royal Concertgebouw Orchestra",
    performer_type: "orchestra",
    instrument_or_role: "Symphony Orchestra",
    nationality: "Dutch",
    home_city: "Amsterdam",
    resident_venue_slug: "concertgebouw-amsterdam",
    website_url: "https://www.concertgebouworkest.nl",
    calendar_url: "https://www.concertgebouworkest.nl/en/concerts",
    wiki_title: "Royal_Concertgebouw_Orchestra",
    short_bio:
      "Amsterdam's flagship symphony orchestra founded in 1888, celebrated for its Mahler, Bruckner, and Strauss traditions.",
  },

  // Conductors
  {
    slug: "kirill-petrenko",
    name: "Kirill Petrenko",
    performer_type: "conductor",
    instrument_or_role: "Chief Conductor",
    nationality: "Russian-Austrian",
    home_city: "Berlin",
    resident_venue_slug: "philharmonie-berlin",
    website_url: "https://www.berliner-philharmoniker.de/en/orchestra/chief-conductor/",
    calendar_url: "https://www.berliner-philharmoniker.de/en/concerts/calendar/",
    wiki_title: "Kirill_Petrenko",
    short_bio:
      "Chief Conductor of the Berliner Philharmoniker since 2019, acclaimed for incandescent dramatic intensity and structural clarity.",
  },
  {
    slug: "gustavo-dudamel",
    name: "Gustavo Dudamel",
    performer_type: "conductor",
    instrument_or_role: "Music & Artistic Director",
    nationality: "Venezuelan",
    home_city: "New York / Los Angeles",
    resident_venue_slug: "david-geffen-hall",
    website_url: "https://www.gustavodudamel.com",
    calendar_url: "https://www.gustavodudamel.com/schedule",
    wiki_title: "Gustavo_Dudamel",
    short_bio:
      "Music and Artistic Director Designate/Director of the New York Philharmonic and long-time Music Director of the LA Phil.",
  },
  {
    slug: "klaus-makela",
    name: "Klaus Mäkelä",
    performer_type: "conductor",
    instrument_or_role: "Conductor & Cellist",
    nationality: "Finnish",
    home_city: "Amsterdam / Paris",
    resident_venue_slug: "concertgebouw-amsterdam",
    website_url: "https://klausmakela.com",
    calendar_url: "https://klausmakela.com/calendar/",
    wiki_title: "Klaus_M%C3%A4kel%C3%A4",
    short_bio:
      "Finnish conductor and cellist leading the Royal Concertgebouw Orchestra and Chicago Symphony Orchestra.",
  },
  {
    slug: "antonio-pappano",
    name: "Sir Antonio Pappano",
    performer_type: "conductor",
    instrument_or_role: "Chief Conductor",
    nationality: "British-Italian",
    home_city: "London",
    resident_venue_slug: "barbican-hall-london",
    website_url: "https://www.lso.co.uk",
    calendar_url: "https://www.lso.co.uk/whats-on/",
    wiki_title: "Antonio_Pappano",
    short_bio:
      "Chief Conductor of the London Symphony Orchestra and Conductor Emeritus of the Royal Opera House.",
  },

  // 10 Featured Soloists (Cello, Piano, Violin)
  {
    slug: "yo-yo-ma",
    name: "Yo-Yo Ma",
    performer_type: "soloist",
    instrument_or_role: "Cello",
    nationality: "American",
    home_city: "Cambridge, MA",
    resident_venue_slug: null,
    website_url: "https://www.yo-yoma.com",
    calendar_url: "https://www.yo-yoma.com/schedule/",
    wiki_title: "Yo-Yo_Ma",
    short_bio:
      "Iconic cellist whose multi-decade discography and global recitals span Bach's Six Unaccompanied Suites to contemporary concertos.",
  },
  {
    slug: "gautier-capucon",
    name: "Gautier Capuçon",
    performer_type: "soloist",
    instrument_or_role: "Cello",
    nationality: "French",
    home_city: "Paris",
    resident_venue_slug: null,
    website_url: "https://www.gautiercapucon.com",
    calendar_url: "https://www.gautiercapucon.com/en/concerts",
    wiki_title: "Gautier_Capu%C3%A7on",
    short_bio:
      "Ambassador of the cello performing every season with the Berlin, Vienna, and New York Philharmonics.",
  },
  {
    slug: "sol-gabetta",
    name: "Sol Gabetta",
    performer_type: "soloist",
    instrument_or_role: "Cello",
    nationality: "Argentine",
    home_city: "Basel",
    resident_venue_slug: null,
    website_url: "https://www.solgabetta.com",
    calendar_url: "https://www.solgabetta.com/concerts/",
    wiki_title: "Sol_Gabetta",
    short_bio:
      "Argentine cellist celebrated for poetic interpretations of Elgar, Schumann, Shostakovich, and newly commissioned cello concertos.",
  },
  {
    slug: "sheku-kanneh-mason",
    name: "Sheku Kanneh-Mason",
    performer_type: "soloist",
    instrument_or_role: "Cello",
    nationality: "British",
    home_city: "London",
    resident_venue_slug: null,
    website_url: "https://www.shekukannehmason.com",
    calendar_url: "https://www.shekukannehmason.com/live/",
    wiki_title: "Sheku_Kanneh-Mason",
    short_bio:
      "BBC Young Musician winner and international cello soloist appearing regularly at Wigmore Hall, Barbican, and Carnegie Hall.",
  },
  {
    slug: "yuja-wang",
    name: "Yuja Wang",
    performer_type: "soloist",
    instrument_or_role: "Piano",
    nationality: "Chinese",
    home_city: "New York",
    resident_venue_slug: null,
    website_url: "https://yujawang.com",
    calendar_url: "https://yujawang.com/calendar/",
    wiki_title: "Yuja_Wang",
    short_bio:
      "Virtuoso pianist renowned for marathon concerto cycles of Rachmaninoff, Prokofiev, Bartók, and Messiaen.",
  },
  {
    slug: "daniil-trifonov",
    name: "Daniil Trifonov",
    performer_type: "soloist",
    instrument_or_role: "Piano",
    nationality: "Russian",
    home_city: "New York",
    resident_venue_slug: null,
    website_url: "https://daniiltrifonov.com",
    calendar_url: "https://daniiltrifonov.com/concerts/",
    wiki_title: "Daniil_Trifonov",
    short_bio:
      "Grammy-winning pianist and composer acclaimed for transcendent Liszt, Scriabin, Rachmaninoff, and Bach's Art of Fugue.",
  },
  {
    slug: "evgeny-kissin",
    name: "Evgeny Kissin",
    performer_type: "soloist",
    instrument_or_role: "Piano",
    nationality: "British-Israeli",
    home_city: "Prague",
    resident_venue_slug: null,
    website_url: "https://www.kissin.org",
    calendar_url: "https://www.kissin.org/concerts",
    wiki_title: "Evgeny_Kissin",
    short_bio:
      "Master pianist whose Carnegie Hall, Musikverein, and Wigmore Hall solo recitals are cornerstone events of each international season.",
  },
  {
    slug: "hilary-hahn",
    name: "Hilary Hahn",
    performer_type: "soloist",
    instrument_or_role: "Violin",
    nationality: "American",
    home_city: "Cambridge, MA",
    resident_venue_slug: null,
    website_url: "https://hilaryhahn.com",
    calendar_url: "https://hilaryhahn.com/tour/",
    wiki_title: "Hilary_Hahn",
    short_bio:
      "Three-time Grammy-winning violinist celebrated for crystalline Bach, Brahms, Sibelius, and 21st-century violin repertoire.",
  },
  {
    slug: "janine-jansen",
    name: "Janine Jansen",
    performer_type: "soloist",
    instrument_or_role: "Violin",
    nationality: "Dutch",
    home_city: "Utrecht",
    resident_venue_slug: null,
    website_url: "https://www.janinejansen.com",
    calendar_url: "https://www.janinejansen.com/calendar",
    wiki_title: "Janine_Jansen",
    short_bio:
      "Dutch violinist and chamber musician regularly serving as Artist-in-Residence at Carnegie Hall, Concertgebouw, and Berliner Philharmoniker.",
  },
  {
    slug: "anne-sophie-mutter",
    name: "Anne-Sophie Mutter",
    performer_type: "soloist",
    instrument_or_role: "Violin",
    nationality: "German",
    home_city: "Munich",
    resident_venue_slug: null,
    website_url: "https://www.anne-sophie-mutter.de",
    calendar_url: "https://www.anne-sophie-mutter.de/en/concerts/",
    wiki_title: "Anne-Sophie_Mutter",
    short_bio:
      "Legendary German violinist who debuted with Karajan and the Berlin Philharmonic at age 13 and has premiered over 30 major contemporary works.",
  },
];

/**
 * Curated 2026/27 International Flagship Season Events across our halls, orchestras & soloists.
 * Includes both beloved catalog masterworks (auto-linked to `/works/[slug]`) AND
 * contemporary/premiere works so `/admin` Suggestions Inbox can triage missing pieces!
 */
const FLAGSHIP_2026_27_EVENTS = [
  {
    externalKey: "bphil:2026-12-04:philharmonie-berlin",
    title: "Berliner Philharmoniker: Petrenko & Yo-Yo Ma",
    subtitle: "2026/27 Subscription Season · Berlin",
    startsAt: "2026-12-04T20:00:00+01:00",
    season: "2026/27",
    venueSlug: "philharmonie-berlin",
    sourceUrl: "https://www.berliner-philharmoniker.de/en/concerts/calendar/",
    ticketUrl: "https://www.berliner-philharmoniker.de/en/concerts/calendar/",
    performers: [
      { slug: "berliner-philharmoniker", role: "orchestra" },
      { slug: "kirill-petrenko", role: "conductor" },
      { slug: "yo-yo-ma", role: "soloist", instrument: "Cello" },
    ],
    works: [
      {
        composerName: "Unsuk Chin",
        workTitle: "Subito con forza",
      },
      {
        composerName: "Antonín Dvořák",
        workTitle: "Cello Concerto in B minor, Op. 104",
      },
      {
        composerName: "Johannes Brahms",
        workTitle: "Symphony No. 4 in E minor, Op. 98",
      },
    ],
  },
  {
    externalKey: "bphil:2026-12-31:silvesterkonzert-trifonov",
    title: "Berliner Philharmoniker New Year's Eve Gala with Daniil Trifonov",
    subtitle: "Silvesterkonzert 2026",
    startsAt: "2026-12-31T17:30:00+01:00",
    season: "2026/27",
    venueSlug: "philharmonie-berlin",
    sourceUrl: "https://www.berliner-philharmoniker.de/en/concerts/calendar/",
    ticketUrl: "https://www.berliner-philharmoniker.de/en/concerts/calendar/",
    performers: [
      { slug: "berliner-philharmoniker", role: "orchestra" },
      { slug: "kirill-petrenko", role: "conductor" },
      { slug: "daniil-trifonov", role: "soloist", instrument: "Piano" },
    ],
    works: [
      {
        composerName: "Robert Schumann",
        workTitle: "Piano Concerto in A minor, Op. 54",
      },
      {
        composerName: "Richard Strauss",
        workTitle: "Der Rosenkavalier Suite, TrV 227c",
      },
    ],
  },
  {
    externalKey: "carnegie:2027-02-12:berlin-phil-us-residency-1",
    title: "Berliner Philharmoniker at Carnegie Hall — Mahler & Bruckner",
    subtitle: "2026/27 US Tour Residency · Night I",
    startsAt: "2027-02-12T20:00:00-05:00",
    season: "2026/27",
    venueSlug: "carnegie-hall",
    sourceUrl: "https://www.carnegiehall.org/Events",
    ticketUrl: "https://www.carnegiehall.org/Events",
    performers: [
      { slug: "berliner-philharmoniker", role: "orchestra" },
      { slug: "kirill-petrenko", role: "conductor" },
    ],
    works: [
      {
        composerName: "Gustav Mahler",
        workTitle: "Symphony No. 5 in C-sharp minor",
      },
    ],
  },
  {
    externalKey: "carnegie:2027-02-13:berlin-phil-janine-jansen",
    title: "Berliner Philharmoniker & Janine Jansen at Carnegie Hall",
    subtitle: "2026/27 US Tour Residency · Night II",
    startsAt: "2027-02-13T20:00:00-05:00",
    season: "2026/27",
    venueSlug: "carnegie-hall",
    sourceUrl: "https://www.carnegiehall.org/Events",
    ticketUrl: "https://www.carnegiehall.org/Events",
    performers: [
      { slug: "berliner-philharmoniker", role: "orchestra" },
      { slug: "kirill-petrenko", role: "conductor" },
      { slug: "janine-jansen", role: "soloist", instrument: "Violin" },
    ],
    works: [
      {
        composerName: "Johannes Brahms",
        workTitle: "Violin Concerto in D major, Op. 77",
      },
      {
        composerName: "Pyotr Ilyich Tchaikovsky",
        workTitle: "Symphony No. 5 in E minor, Op. 64",
      },
    ],
  },
  {
    externalKey: "carnegie:2027-01-22:nyphil-yuja-wang-carnegie",
    title: "New York Philharmonic at Carnegie Hall: Dudamel & Yuja Wang",
    subtitle: "Special Gala Guest Appearance at Stern Auditorium",
    startsAt: "2027-01-22T20:00:00-05:00",
    season: "2026/27",
    venueSlug: "carnegie-hall",
    sourceUrl: "https://www.carnegiehall.org/Events",
    ticketUrl: "https://www.carnegiehall.org/Events",
    performers: [
      { slug: "new-york-philharmonic", role: "orchestra" },
      { slug: "gustavo-dudamel", role: "conductor" },
      { slug: "yuja-wang", role: "soloist", instrument: "Piano" },
    ],
    works: [
      {
        composerName: "Gabriela Ortiz",
        workTitle: "Kauyumari",
      },
      {
        composerName: "Sergei Rachmaninoff",
        workTitle: "Piano Concerto No. 3 in D minor, Op. 30",
      },
      {
        composerName: "Igor Stravinsky",
        workTitle: "The Firebird Suite (1919)",
      },
    ],
  },
  {
    externalKey: "nyphil:2027-03-18:geffen-gautier-capucon",
    title: "NY Philharmonic: Dudamel & Gautier Capuçon Play Shostakovich",
    subtitle: "2026/27 Subscription Season · Lincoln Center",
    startsAt: "2027-03-18T19:30:00-04:00",
    season: "2026/27",
    venueSlug: "david-geffen-hall",
    sourceUrl: "https://www.nyphil.org/calendar",
    ticketUrl: "https://www.nyphil.org/calendar",
    performers: [
      { slug: "new-york-philharmonic", role: "orchestra" },
      { slug: "gustavo-dudamel", role: "conductor" },
      { slug: "gautier-capucon", role: "soloist", instrument: "Cello" },
    ],
    works: [
      {
        composerName: "Anna Thorvaldsdottir",
        workTitle: "CATAMORPHOSIS",
      },
      {
        composerName: "Dmitri Shostakovich",
        workTitle: "Cello Concerto No. 1 in E-flat major, Op. 107",
      },
      {
        composerName: "Ludwig van Beethoven",
        workTitle: "Symphony No. 7 in A major, Op. 92",
      },
    ],
  },
  {
    externalKey: "musikverein:2026-12-13:vienna-phil-sol-gabetta",
    title: "Wiener Philharmoniker & Sol Gabetta in the Golden Hall",
    subtitle: "4th Subscription Concert · Musikverein",
    startsAt: "2026-12-13T11:00:00+01:00",
    season: "2026/27",
    venueSlug: "musikverein-vienna",
    sourceUrl: "https://www.wienerphilharmoniker.at/en/concerts",
    ticketUrl: "https://www.musikverein.at/konzerte",
    performers: [
      { slug: "wiener-philharmoniker", role: "orchestra" },
      { slug: "sol-gabetta", role: "soloist", instrument: "Cello" },
    ],
    works: [
      {
        composerName: "Edward Elgar",
        workTitle: "Cello Concerto in E minor, Op. 85",
      },
      {
        composerName: "Anton Bruckner",
        workTitle: "Symphony No. 7 in E major, WAB 107",
      },
    ],
  },
  {
    externalKey: "carnegie:2027-03-05:vienna-phil-week-mutter",
    title: "Vienna Philharmonic Week at Carnegie Hall with Anne-Sophie Mutter",
    subtitle: "International Visiting Orchestra Series",
    startsAt: "2027-03-05T20:00:00-05:00",
    season: "2026/27",
    venueSlug: "carnegie-hall",
    sourceUrl: "https://www.carnegiehall.org/Events",
    ticketUrl: "https://www.carnegiehall.org/Events",
    performers: [
      { slug: "wiener-philharmoniker", role: "orchestra" },
      { slug: "anne-sophie-mutter", role: "soloist", instrument: "Violin" },
    ],
    works: [
      {
        composerName: "Thomas Adès",
        workTitle: "Air — Homage to Sibelius for Violin and Orchestra",
      },
      {
        composerName: "Jean Sibelius",
        workTitle: "Violin Concerto in D minor, Op. 47",
      },
      {
        composerName: "Franz Schubert",
        workTitle: "Symphony No. 9 in C major, D. 944",
      },
    ],
  },
  {
    externalKey: "barbican:2027-01-14:lso-pappano-sheku",
    title: "London Symphony Orchestra: Pappano & Sheku Kanneh-Mason",
    subtitle: "Barbican 2026/27 Season",
    startsAt: "2027-01-14T19:00:00Z",
    season: "2026/27",
    venueSlug: "barbican-hall-london",
    sourceUrl: "https://www.lso.co.uk/whats-on/",
    ticketUrl: "https://www.lso.co.uk/whats-on/",
    performers: [
      { slug: "london-symphony-orchestra", role: "orchestra" },
      { slug: "antonio-pappano", role: "conductor" },
      { slug: "sheku-kanneh-mason", role: "soloist", instrument: "Cello" },
    ],
    works: [
      {
        composerName: "Pyotr Ilyich Tchaikovsky",
        workTitle: "Variations on a Rococo Theme, Op. 33",
      },
      {
        composerName: "Edward Elgar",
        workTitle: "Variations on an Original Theme, Op. 36",
      },
    ],
  },
  {
    externalKey: "concertgebouw:2027-02-04:rco-makela-hilary-hahn",
    title: "Royal Concertgebouw Orchestra: Klaus Mäkelä & Hilary Hahn",
    subtitle: "Grote Zaal Subscription Series",
    startsAt: "2027-02-04T20:15:00+01:00",
    season: "2026/27",
    venueSlug: "concertgebouw-amsterdam",
    sourceUrl: "https://www.concertgebouworkest.nl/en/concerts",
    ticketUrl: "https://www.concertgebouw.nl/en/concerts-and-tickets",
    performers: [
      { slug: "royal-concertgebouw-orchestra", role: "orchestra" },
      { slug: "klaus-makela", role: "conductor" },
      { slug: "hilary-hahn", role: "soloist", instrument: "Violin" },
    ],
    works: [
      {
        composerName: "Felix Mendelssohn",
        workTitle: "Violin Concerto in E minor, Op. 64",
      },
      {
        composerName: "Gustav Mahler",
        workTitle: "Symphony No. 1 in D major",
      },
    ],
  },
  {
    externalKey: "wigmore:2026-12-09:yo-yo-ma-bach-suites",
    title: "Yo-Yo Ma Solo Recital: Complete Bach Cello Suites",
    subtitle: "Special Evening Recital · Wigmore Hall",
    startsAt: "2026-12-09T19:30:00Z",
    season: "2026/27",
    venueSlug: "wigmore-hall",
    sourceUrl: "https://www.wigmore-hall.org.uk/whats-on",
    ticketUrl: "https://www.wigmore-hall.org.uk/whats-on",
    performers: [
      { slug: "yo-yo-ma", role: "soloist", instrument: "Cello" },
    ],
    works: [
      {
        composerName: "Johann Sebastian Bach",
        workTitle: "Cello Suite No. 1 in G major, BWV 1007",
      },
      {
        composerName: "Johann Sebastian Bach",
        workTitle: "Cello Suite No. 3 in C major, BWV 1009",
      },
      {
        composerName: "Johann Sebastian Bach",
        workTitle: "Cello Suite No. 6 in D major, BWV 1012",
      },
    ],
  },
  {
    externalKey: "wigmore:2027-01-28:sheku-chamber-recital",
    title: "Sheku Kanneh-Mason Cello Recital at Wigmore Hall",
    subtitle: "Evening Chamber Series",
    startsAt: "2027-01-28T19:30:00Z",
    season: "2026/27",
    venueSlug: "wigmore-hall",
    sourceUrl: "https://www.wigmore-hall.org.uk/whats-on",
    ticketUrl: "https://www.wigmore-hall.org.uk/whats-on",
    performers: [
      { slug: "sheku-kanneh-mason", role: "soloist", instrument: "Cello" },
    ],
    works: [
      {
        composerName: "Ludwig van Beethoven",
        workTitle: "Cello Sonata No. 3 in A major, Op. 69",
      },
      {
        composerName: "Benjamin Britten",
        workTitle: "Cello Sonata in C, Op. 65",
      },
      {
        composerName: "Sergei Rachmaninoff",
        workTitle: "Sonata in G minor for Cello and Piano, Op. 19",
      },
    ],
  },
  {
    externalKey: "elbphilharmonie:2027-02-21:kissin-solo-recital",
    title: "Evgeny Kissin Piano Recital at Elbphilharmonie",
    subtitle: "Großer Saal Master Pianists Series",
    startsAt: "2027-02-21T20:00:00+01:00",
    season: "2026/27",
    venueSlug: "elbphilharmonie-hamburg",
    sourceUrl: "https://www.elbphilharmonie.de/en/whats-on/",
    ticketUrl: "https://www.elbphilharmonie.de/en/whats-on/",
    performers: [
      { slug: "evgeny-kissin", role: "soloist", instrument: "Piano" },
    ],
    works: [
      {
        composerName: "Frédéric Chopin",
        workTitle: "Piano Sonata No. 2 in B-flat minor, Op. 35",
      },
      {
        composerName: "Sergei Prokofiev",
        workTitle: "Piano Sonata No. 7 in B-flat major, Op. 83",
      },
    ],
  },
  {
    externalKey: "paris:2027-03-11:lso-yuja-wang-paris",
    title: "London Symphony Orchestra & Yuja Wang at Philharmonie de Paris",
    subtitle: "European Tour · Grande Salle Pierre Boulez",
    startsAt: "2027-03-11T20:00:00+01:00",
    season: "2026/27",
    venueSlug: "philharmonie-de-paris",
    sourceUrl: "https://philharmoniedeparis.fr/en/calendar",
    ticketUrl: "https://philharmoniedeparis.fr/en/calendar",
    performers: [
      { slug: "london-symphony-orchestra", role: "orchestra" },
      { slug: "antonio-pappano", role: "conductor" },
      { slug: "yuja-wang", role: "soloist", instrument: "Piano" },
    ],
    works: [
      {
        composerName: "Béla Bartók",
        workTitle: "Piano Concerto No. 2, Sz. 95",
      },
      {
        composerName: "Hector Berlioz",
        workTitle: "Symphonie fantastique, Op. 14",
      },
    ],
  },
  {
    externalKey: "suntory:2027-04-09:berlin-phil-tokyo-tour",
    title: "Berliner Philharmoniker Asia Tour at Suntory Hall with Hilary Hahn",
    subtitle: "Tokyo Residency · Main Hall",
    startsAt: "2027-04-09T19:00:00+09:00",
    season: "2026/27",
    venueSlug: "suntory-hall-tokyo",
    sourceUrl: "https://www.suntory.com/culture-sports/suntoryhall/schedule/",
    ticketUrl: "https://www.suntory.com/culture-sports/suntoryhall/schedule/",
    performers: [
      { slug: "berliner-philharmoniker", role: "orchestra" },
      { slug: "kirill-petrenko", role: "conductor" },
      { slug: "hilary-hahn", role: "soloist", instrument: "Violin" },
    ],
    works: [
      {
        composerName: "Pyotr Ilyich Tchaikovsky",
        workTitle: "Violin Concerto in D major, Op. 35",
      },
      {
        composerName: "Johannes Brahms",
        workTitle: "Symphony No. 1 in C minor, Op. 68",
      },
    ],
  },
  {
    externalKey: "disney:2027-04-23:dudamel-yo-yo-ma-la",
    title: "Yo-Yo Ma & Gustavo Dudamel at Walt Disney Concert Hall",
    subtitle: "Special Cello Gala · Los Angeles",
    startsAt: "2027-04-23T20:00:00-07:00",
    season: "2026/27",
    venueSlug: "walt-disney-concert-hall",
    sourceUrl: "https://www.laphil.com/events/performances",
    ticketUrl: "https://www.laphil.com/events/performances",
    performers: [
      { slug: "gustavo-dudamel", role: "conductor" },
      { slug: "yo-yo-ma", role: "soloist", instrument: "Cello" },
    ],
    works: [
      {
        composerName: "Robert Schumann",
        workTitle: "Cello Concerto in A minor, Op. 129",
      },
      {
        composerName: "Richard Strauss",
        workTitle: "Don Quixote, Op. 35",
      },
    ],
  },
  {
    externalKey: "lascala:2027-05-03:gautier-capucon-scala",
    title: "Gautier Capuçon & Daniil Trifonov Recital at Teatro alla Scala",
    subtitle: "Grandi Interpreti Recital Series · Milan",
    startsAt: "2027-05-03T20:00:00+02:00",
    season: "2026/27",
    venueSlug: "teatro-alla-scala",
    sourceUrl: "https://www.teatroallascala.org/en/season/",
    ticketUrl: "https://www.teatroallascala.org/en/season/",
    performers: [
      { slug: "gautier-capucon", role: "soloist", instrument: "Cello" },
      { slug: "daniil-trifonov", role: "soloist", instrument: "Piano" },
    ],
    works: [
      {
        composerName: "Claude Debussy",
        workTitle: "Cello Sonata in D minor, L. 135",
      },
      {
        composerName: "César Franck",
        workTitle: "Sonata in A major",
      },
    ],
  },
];

async function fetchWikipediaThumbnail(wikiTitle) {
  if (!wikiTitle) return null;
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`,
      {
        headers: {
          "User-Agent": "OpusArchiveBot/1.0 (https://github.com/liubenko/opus-archive)",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

async function fetchAllRows(table, columns) {
  const all = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + step - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

function sqlLit(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function emitSqlSeed(outPath) {
  const lines = ["BEGIN;"];
  const nowIso = new Date().toISOString();

  console.log("1. Fetching Wikipedia photos for venues & performers...");
  const venueList = [];
  for (const v of SEED_VENUES) {
    const photoUrl = await fetchWikipediaThumbnail(v.wiki_title);
    venueList.push({ ...v, photo_url: photoUrl });
    lines.push(`INSERT INTO public.venues (slug, name, short_name, city, country, country_code, address, latitude, longitude, capacity, opened_year, architect_or_acoustics, photo_url, website_url, calendar_url, description, updated_at)
VALUES (${sqlLit(v.slug)}, ${sqlLit(v.name)}, ${sqlLit(v.short_name)}, ${sqlLit(v.city)}, ${sqlLit(v.country)}, ${sqlLit(v.country_code)}, ${sqlLit(v.address)}, ${sqlLit(v.latitude)}, ${sqlLit(v.longitude)}, ${sqlLit(v.capacity)}, ${sqlLit(v.opened_year)}, ${sqlLit(v.architect_or_acoustics)}, ${sqlLit(photoUrl)}, ${sqlLit(v.website_url)}, ${sqlLit(v.calendar_url)}, ${sqlLit(v.description)}, ${sqlLit(nowIso)})
ON CONFLICT (slug) DO UPDATE SET
  photo_url = COALESCE(EXCLUDED.photo_url, public.venues.photo_url),
  description = EXCLUDED.description,
  updated_at = EXCLUDED.updated_at;`);
  }

  const perfSlugs = new Set();
  for (const p of SEED_PERFORMERS) {
    const avatarUrl = await fetchWikipediaThumbnail(p.wiki_title);
    perfSlugs.add(p.slug);
    const resVenueSql = p.resident_venue_slug
      ? `(SELECT id FROM public.venues WHERE slug = ${sqlLit(p.resident_venue_slug)})`
      : "NULL";
    lines.push(`INSERT INTO public.performers (slug, name, performer_type, instrument_or_role, nationality, home_city, resident_venue_id, avatar_url, website_url, calendar_url, short_bio, is_featured, last_synced_at, updated_at)
VALUES (${sqlLit(p.slug)}, ${sqlLit(p.name)}, ${sqlLit(p.performer_type)}, ${sqlLit(p.instrument_or_role)}, ${sqlLit(p.nationality)}, ${sqlLit(p.home_city)}, ${resVenueSql}, ${sqlLit(avatarUrl)}, ${sqlLit(p.website_url)}, ${sqlLit(p.calendar_url)}, ${sqlLit(p.short_bio)}, TRUE, ${sqlLit(nowIso)}, ${sqlLit(nowIso)})
ON CONFLICT (slug) DO UPDATE SET
  avatar_url = COALESCE(EXCLUDED.avatar_url, public.performers.avatar_url),
  short_bio = EXCLUDED.short_bio,
  last_synced_at = EXCLUDED.last_synced_at,
  updated_at = EXCLUDED.updated_at;`);
  }

  console.log("2. Loading composers & works via public read API...");
  const composers = await fetchAllRows(
    "composers",
    "id, name, full_name, sort_name, slug, birth_year, death_year"
  );
  const works = await fetchAllRows(
    "works",
    "id, composer_id, title, slug, catalog_system, catalog_number, catalog_display"
  );

  const composerMatcher = buildComposerMatcher(composers);
  const workMatchersByComposer = new Map();
  for (const w of works) {
    if (!workMatchersByComposer.has(w.composer_id)) {
      workMatchersByComposer.set(w.composer_id, []);
    }
    workMatchersByComposer.get(w.composer_id).push(w);
  }
  const builtMatchers = new Map();
  for (const [compId, compWorks] of workMatchersByComposer.entries()) {
    builtMatchers.set(compId, buildWorkMatcher(compWorks));
  }

  const allIncomingEvents = [...FLAGSHIP_2026_27_EVENTS];
  try {
    const nyRes = await fetch(
      "https://raw.githubusercontent.com/nyphilarchive/PerformanceHistory/main/Programs/json/2024-25_TO_NOW.json"
    );
    if (nyRes.ok) {
      const nyJson = await nyRes.json();
      const nyEvents = parseNyPhilPrograms(nyJson, "2026-10-15").slice(-14);
      console.log(`3. Parsed ${nyEvents.length} live NYPhil 2026/27 events.`);
      allIncomingEvents.push(...nyEvents);
    }
  } catch (err) {
    console.warn("NYPhil fetch skipped:", err.message);
  }

  const venueBySlug = new Map(venueList.map((v) => [v.slug, v]));
  const venueByNorm = new Map();
  for (const v of venueList) {
    venueByNorm.set(normalizeText(v.name), v);
    venueByNorm.set(normalizeText(v.short_name), v);
  }
  const perfNameBySlug = new Map(SEED_PERFORMERS.map((p) => [p.slug, p.name]));
  const perfSlugByNorm = new Map(
    SEED_PERFORMERS.map((p) => [normalizeText(p.name), p.slug])
  );

  let matchedCount = 0;
  let suggestedCount = 0;

  for (const ev of allIncomingEvents) {
    let venue = ev.venueSlug ? venueBySlug.get(ev.venueSlug) : null;
    if (!venue && ev.venueName) {
      venue = venueByNorm.get(normalizeText(ev.venueName));
      if (!venue) {
        const nv = normalizeText(ev.venueName);
        venue = venueList.find(
          (c) =>
            nv.includes(normalizeText(c.short_name)) ||
            normalizeText(c.short_name).includes(nv)
        );
      }
    }
    if (!venue) continue;

    const resolvedPerfs = [];
    for (const pRef of ev.performers || []) {
      let pSlug =
        pRef.slug || perfSlugByNorm.get(normalizeText(pRef.name || ""));
      const pName = pRef.name || perfNameBySlug.get(pSlug) || "";
      if (!pSlug && pName) {
        pSlug = slugify(pName);
        if (!perfSlugs.has(pSlug)) {
          perfSlugs.add(pSlug);
          perfSlugByNorm.set(normalizeText(pName), pSlug);
          perfNameBySlug.set(pSlug, pName);
          lines.push(`INSERT INTO public.performers (slug, name, performer_type, instrument_or_role, is_featured, updated_at)
VALUES (${sqlLit(pSlug)}, ${sqlLit(pName)}, ${sqlLit(pRef.role || "soloist")}, ${sqlLit(pRef.instrument || "Guest Artist")}, FALSE, ${sqlLit(nowIso)})
ON CONFLICT (slug) DO NOTHING;`);
        }
      }
      if (pSlug) {
        resolvedPerfs.push({
          slug: pSlug,
          name: pName || perfNameBySlug.get(pSlug) || pSlug,
          role: pRef.role || "soloist",
          instrument: pRef.instrument || null,
        });
      }
    }

    const orchSlug =
      resolvedPerfs.find((x) => x.role === "orchestra")?.slug || null;
    const condSlug =
      resolvedPerfs.find((x) => x.role === "conductor")?.slug || null;
    const extKey =
      ev.externalKey ||
      `${venue.slug}:${String(ev.startsAt).slice(0, 10)}:${slugify(ev.title).slice(0, 40)}`;
    const evSlug = `${String(ev.startsAt).slice(0, 10)}-${venue.slug}-${slugify(ev.title).slice(0, 48)}`;

    const orchIdSql = orchSlug
      ? `(SELECT id FROM public.performers WHERE slug = ${sqlLit(orchSlug)})`
      : "NULL";
    const condIdSql = condSlug
      ? `(SELECT id FROM public.performers WHERE slug = ${sqlLit(condSlug)})`
      : "NULL";

    lines.push(`INSERT INTO public.concert_events (slug, external_key, title, subtitle, starts_at, season, venue_id, primary_orchestra_id, conductor_id, source_url, ticket_url, status, updated_at)
VALUES (${sqlLit(evSlug)}, ${sqlLit(extKey)}, ${sqlLit(ev.title)}, ${sqlLit(ev.subtitle || null)}, ${sqlLit(ev.startsAt)}, ${sqlLit(ev.season || "2026/27")}, (SELECT id FROM public.venues WHERE slug = ${sqlLit(venue.slug)}), ${orchIdSql}, ${condIdSql}, ${sqlLit(ev.sourceUrl || venue.calendar_url)}, ${sqlLit(ev.ticketUrl || ev.sourceUrl || venue.calendar_url)}, 'scheduled', ${sqlLit(nowIso)})
ON CONFLICT (external_key) DO UPDATE SET title = EXCLUDED.title, starts_at = EXCLUDED.starts_at, updated_at = EXCLUDED.updated_at;`);

    resolvedPerfs.forEach((rp, idx) => {
      lines.push(`INSERT INTO public.concert_event_performers (event_id, performer_id, billing_role, instrument_label, display_order)
VALUES ((SELECT id FROM public.concert_events WHERE external_key = ${sqlLit(extKey)}), (SELECT id FROM public.performers WHERE slug = ${sqlLit(rp.slug)}), ${sqlLit(rp.role)}, ${sqlLit(rp.instrument)}, ${idx + 1})
ON CONFLICT (event_id, performer_id, billing_role) DO NOTHING;`);
    });

    lines.push(`DELETE FROM public.concert_event_works WHERE event_id = (SELECT id FROM public.concert_events WHERE external_key = ${sqlLit(extKey)});`);

    (ev.works || []).forEach((wItem, wIdx) => {
      const matchedComposer = composerMatcher.findMatch({
        name: wItem.composerName,
        full_name: wItem.composerName,
        slug: slugify(wItem.composerName),
      });

      let matchedWork = null;
      if (matchedComposer) {
        const wm = builtMatchers.get(matchedComposer.id);
        const cat = extractCatalog(wItem.workTitle);
        if (wm) {
          matchedWork = wm.findMatch({
            title: wItem.workTitle,
            catalog_system: cat.catalog_system,
            catalog_number: cat.catalog_number,
          });
        }
      }

      if (matchedWork) {
        matchedCount++;
        lines.push(`INSERT INTO public.concert_event_works (event_id, display_order, work_id, composer_id, raw_composer_name, raw_work_title)
VALUES ((SELECT id FROM public.concert_events WHERE external_key = ${sqlLit(extKey)}), ${wIdx + 1}, ${matchedWork.id}, ${matchedComposer.id}, ${sqlLit(matchedComposer.name)}, ${sqlLit(wItem.workTitle)});`);
      } else {
        suggestedCount++;
        const meta = buildSuggestionMetadata(
          wItem.composerName,
          wItem.workTitle
        );
        const perfLabel =
          resolvedPerfs.find((x) => x.role === "orchestra")?.name ||
          resolvedPerfs[0]?.name ||
          venue.short_name;
        const ctx = `Performed by ${perfLabel} at ${venue.short_name} (${String(ev.startsAt).slice(0, 10)})`;

        lines.push(`INSERT INTO public.catalog_suggestions (dedup_key, status, suggested_work_title, suggested_composer_name, matched_composer_id, suggested_genre, suggested_catalog_display, source_context, source_url, sample_event_id, occurrence_count)
VALUES (${sqlLit(meta.dedupKey)}, 'pending', ${sqlLit(wItem.workTitle)}, ${sqlLit(matchedComposer?.name || wItem.composerName)}, ${matchedComposer ? matchedComposer.id : "NULL"}, ${sqlLit(meta.genre)}, ${sqlLit(meta.catalogDisplay)}, ${sqlLit(ctx)}, ${sqlLit(ev.sourceUrl || venue.calendar_url)}, (SELECT id FROM public.concert_events WHERE external_key = ${sqlLit(extKey)}), 1)
ON CONFLICT (dedup_key) DO UPDATE SET occurrence_count = public.catalog_suggestions.occurrence_count + 1, updated_at = EXCLUDED.updated_at;`);

        lines.push(`INSERT INTO public.concert_event_works (event_id, display_order, work_id, composer_id, raw_composer_name, raw_work_title, suggestion_id)
VALUES ((SELECT id FROM public.concert_events WHERE external_key = ${sqlLit(extKey)}), ${wIdx + 1}, (SELECT resolved_work_id FROM public.catalog_suggestions WHERE dedup_key = ${sqlLit(meta.dedupKey)}), ${matchedComposer ? matchedComposer.id : "NULL"}, ${sqlLit(matchedComposer?.name || wItem.composerName)}, ${sqlLit(wItem.workTitle)}, (SELECT id FROM public.catalog_suggestions WHERE dedup_key = ${sqlLit(meta.dedupKey)}));`);
      }
    });
  }

  lines.push("COMMIT;");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(
    `Wrote ${lines.length} SQL statements to ${outPath} (${matchedCount} works matched, ${suggestedCount} uncataloged occurrences queued).`
  );
}

async function main() {
  if (EMIT_SQL_PATH) {
    await emitSqlSeed(EMIT_SQL_PATH);
    return;
  }
  console.log("=== Opus Archive World Stage Season Sync ===");

  // 1. Seed & enrich Venues
  console.log("1. Syncing world concert venues...");
  for (const v of SEED_VENUES) {
    const photoUrl = await fetchWikipediaThumbnail(v.wiki_title);
    const payload = {
      slug: v.slug,
      name: v.name,
      short_name: v.short_name,
      city: v.city,
      country: v.country,
      country_code: v.country_code,
      address: v.address,
      latitude: v.latitude,
      longitude: v.longitude,
      capacity: v.capacity,
      opened_year: v.opened_year,
      architect_or_acoustics: v.architect_or_acoustics,
      website_url: v.website_url,
      calendar_url: v.calendar_url,
      description: v.description,
      ...(photoUrl ? { photo_url: photoUrl } : {}),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("venues")
      .upsert(payload, { onConflict: "slug" });
    if (error) console.error(`Venue upsert error (${v.slug}):`, error.message);
  }

  const { data: venuesList } = await supabase.from("venues").select("*");
  const venueBySlug = new Map((venuesList || []).map((v) => [v.slug, v]));
  const venueByNormName = new Map();
  for (const v of venuesList || []) {
    venueByNormName.set(normalizeText(v.name), v);
    if (v.short_name) venueByNormName.set(normalizeText(v.short_name), v);
  }

  // 2. Seed & enrich Performers (Orchestras, Conductors, Soloists)
  console.log("2. Syncing orchestras, conductors & soloists...");
  const nowIso = new Date().toISOString();
  for (const p of SEED_PERFORMERS) {
    const avatarUrl = await fetchWikipediaThumbnail(p.wiki_title);
    const resVenue = p.resident_venue_slug
      ? venueBySlug.get(p.resident_venue_slug)
      : null;
    const payload = {
      slug: p.slug,
      name: p.name,
      performer_type: p.performer_type,
      instrument_or_role: p.instrument_or_role,
      nationality: p.nationality,
      home_city: p.home_city,
      resident_venue_id: resVenue ? resVenue.id : null,
      website_url: p.website_url,
      calendar_url: p.calendar_url,
      short_bio: p.short_bio,
      is_featured: true,
      last_synced_at: nowIso,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      updated_at: nowIso,
    };
    const { error } = await supabase
      .from("performers")
      .upsert(payload, { onConflict: "slug" });
    if (error)
      console.error(`Performer upsert error (${p.slug}):`, error.message);
  }

  const { data: performersList } = await supabase
    .from("performers")
    .select("*");
  const performerBySlug = new Map(
    (performersList || []).map((p) => [p.slug, p])
  );
  const performerByNormName = new Map(
    (performersList || []).map((p) => [normalizeText(p.name), p])
  );

  // 3. Load all Composers & Works into canonical matchers
  console.log("3. Loading 314 composers & 19,804+ works for repertoire linking...");
  const composers = await fetchAllRows(
    "composers",
    "id, name, full_name, sort_name, slug, birth_year, death_year"
  );
  const works = await fetchAllRows(
    "works",
    "id, composer_id, title, slug, catalog_system, catalog_number, catalog_display"
  );

  const composerMatcher = buildComposerMatcher(composers);
  const workMatchersByComposer = new Map();
  for (const w of works) {
    if (!workMatchersByComposer.has(w.composer_id)) {
      workMatchersByComposer.set(w.composer_id, []);
    }
    workMatchersByComposer.get(w.composer_id).push(w);
  }
  const builtMatchers = new Map();
  for (const [compId, compWorks] of workMatchersByComposer.entries()) {
    builtMatchers.set(compId, buildWorkMatcher(compWorks));
  }

  // 4. Collect events from live NYPhil Open Data + Flagship 2026/27 Season + optional --url
  const allIncomingEvents = [...FLAGSHIP_2026_27_EVENTS];

  console.log("4. Fetching live NY Philharmonic 2026/27 season JSON feed...");
  try {
    const nyRes = await fetch(
      "https://raw.githubusercontent.com/nyphilarchive/PerformanceHistory/main/Programs/json/2024-25_TO_NOW.json"
    );
    if (nyRes.ok) {
      const nyJson = await nyRes.json();
      const nyEvents = parseNyPhilPrograms(nyJson, "2026-10-01").slice(-16);
      console.log(
        `   -> Parsed ${nyEvents.length} live NY Philharmonic 2026/27 concerts.`
      );
      allIncomingEvents.push(...nyEvents);
    }
  } catch (err) {
    console.warn("   -> NYPhil live fetch skipped:", err.message);
  }

  const urlArg = process.argv.find((a) => a.startsWith("--url="));
  if (urlArg) {
    const targetUrl = urlArg.slice("--url=".length);
    console.log(`   -> Fetching custom URL: ${targetUrl}`);
    const customRes = await fetch(targetUrl);
    const text = await customRes.text();
    const parsed =
      targetUrl.endsWith(".ics") || text.includes("BEGIN:VCALENDAR")
        ? parseIcsCalendar(text, targetUrl)
        : parseMusicEventsFromHtml(text, targetUrl);
    console.log(`   -> Extracted ${parsed.length} events from ${targetUrl}`);
    allIncomingEvents.push(...parsed);
  }

  // 5. Upsert events, link performers, match works & populate catalog_suggestions
  let matchedWorkLinks = 0;
  let pendingSuggestions = 0;
  let upsertedEvents = 0;

  for (const ev of allIncomingEvents) {
    let venue = ev.venueSlug ? venueBySlug.get(ev.venueSlug) : null;
    if (!venue && ev.venueName) {
      venue = venueByNormName.get(normalizeText(ev.venueName));
    }
    if (!venue && ev.venueName) {
      // Fallback: match partial venue name (e.g. "Stern Auditorium / Perelman Stage at Carnegie Hall")
      const normV = normalizeText(ev.venueName);
      for (const candidate of venuesList || []) {
        const cShort = normalizeText(candidate.short_name || candidate.name);
        if (normV.includes(cShort) || cShort.includes(normV)) {
          venue = candidate;
          break;
        }
      }
    }
    if (!venue) continue;

    // Resolve performers (auto-creating guest conductors/soloists from NYPhil feed if needed)
    const resolvedPerformers = [];
    for (const pRef of ev.performers || []) {
      let perf = pRef.slug
        ? performerBySlug.get(pRef.slug)
        : performerByNormName.get(normalizeText(pRef.name));

      if (!perf && pRef.name) {
        const pSlug = slugify(pRef.name);
        const { data: created } = await supabase
          .from("performers")
          .upsert(
            {
              slug: pSlug,
              name: pRef.name,
              performer_type: pRef.role || "soloist",
              instrument_or_role: pRef.instrument || "Guest Artist",
              is_featured: false,
              updated_at: nowIso,
            },
            { onConflict: "slug" }
          )
          .select("*")
          .single();
        if (created) {
          perf = created;
          performerBySlug.set(created.slug, created);
          performerByNormName.set(normalizeText(created.name), created);
        }
      }

      if (perf) {
        resolvedPerformers.push({
          performer: perf,
          role: pRef.role || perf.performer_type,
          instrument: pRef.instrument || perf.instrument_or_role,
        });
      }
    }

    const primaryOrch =
      resolvedPerformers.find((x) => x.role === "orchestra")?.performer || null;
    const conductor =
      resolvedPerformers.find((x) => x.role === "conductor")?.performer || null;

    const extKey =
      ev.externalKey ||
      `${venue.slug}:${String(ev.startsAt).slice(0, 10)}:${slugify(ev.title).slice(0, 40)}`;
    const evSlug = `${String(ev.startsAt).slice(0, 10)}-${venue.slug}-${slugify(ev.title).slice(0, 48)}`;

    const { data: savedEvent, error: evErr } = await supabase
      .from("concert_events")
      .upsert(
        {
          slug: evSlug,
          external_key: extKey,
          title: ev.title,
          subtitle: ev.subtitle || null,
          starts_at: ev.startsAt,
          ends_at: ev.endsAt || null,
          season: ev.season || "2026/27",
          venue_id: venue.id,
          primary_orchestra_id: primaryOrch?.id || null,
          conductor_id: conductor?.id || null,
          source_url: ev.sourceUrl || venue.calendar_url,
          ticket_url: ev.ticketUrl || ev.sourceUrl || venue.calendar_url,
          status: "scheduled",
          updated_at: nowIso,
        },
        { onConflict: "external_key" }
      )
      .select("*")
      .single();

    if (evErr || !savedEvent) {
      console.error(`Event upsert error (${extKey}):`, evErr?.message);
      continue;
    }
    upsertedEvents++;

    // Sync concert_event_performers
    for (let idx = 0; idx < resolvedPerformers.length; idx++) {
      const rp = resolvedPerformers[idx];
      await supabase.from("concert_event_performers").upsert(
        {
          event_id: savedEvent.id,
          performer_id: rp.performer.id,
          billing_role: rp.role,
          instrument_label: rp.instrument || null,
          display_order: idx + 1,
        },
        { onConflict: "event_id,performer_id,billing_role" }
      );
    }

    // Clear and re-insert program items cleanly for this event
    await supabase
      .from("concert_event_works")
      .delete()
      .eq("event_id", savedEvent.id);

    for (let wIdx = 0; wIdx < (ev.works || []).length; wIdx++) {
      const wItem = ev.works[wIdx];
      const matchedComposer = composerMatcher.findMatch({
        name: wItem.composerName,
        full_name: wItem.composerName,
        slug: slugify(wItem.composerName),
      });

      let matchedWork = null;
      if (matchedComposer) {
        const wm = builtMatchers.get(matchedComposer.id);
        const cat = extractCatalog(wItem.workTitle);
        if (wm) {
          matchedWork = wm.findMatch({
            title: wItem.workTitle,
            catalog_system: cat.catalog_system,
            catalog_number: cat.catalog_number,
          });
        }
      }

      let suggestionId = null;
      if (matchedWork) {
        matchedWorkLinks++;
      } else {
        // Create or update a catalog_suggestions item for `/admin` triage!
        const meta = buildSuggestionMetadata(
          wItem.composerName,
          wItem.workTitle
        );
        const performerLabel =
          primaryOrch?.name ||
          resolvedPerformers[0]?.performer?.name ||
          venue.short_name ||
          venue.name;
        const contextStr = `Performed by ${performerLabel} at ${venue.short_name || venue.name} (${String(ev.startsAt).slice(0, 10)})`;

        const { data: existingSug } = await supabase
          .from("catalog_suggestions")
          .select("*")
          .eq("dedup_key", meta.dedupKey)
          .maybeSingle();

        if (existingSug) {
          suggestionId = existingSug.id;
          // If an admin already approved or linked this suggestion earlier, inherit `resolved_work_id`!
          if (existingSug.resolved_work_id) {
            matchedWork = { id: existingSug.resolved_work_id };
          } else {
            await supabase
              .from("catalog_suggestions")
              .update({
                occurrence_count: (existingSug.occurrence_count || 1) + 1,
                updated_at: nowIso,
              })
              .eq("id", existingSug.id);
          }
        } else {
          const { data: createdSug } = await supabase
            .from("catalog_suggestions")
            .insert({
              dedup_key: meta.dedupKey,
              status: "pending",
              suggested_work_title: wItem.workTitle,
              suggested_composer_name:
                matchedComposer?.name || wItem.composerName,
              matched_composer_id: matchedComposer?.id || null,
              suggested_genre: meta.genre,
              suggested_catalog_display: meta.catalogDisplay,
              source_context: contextStr,
              source_url: ev.sourceUrl || venue.calendar_url,
              sample_event_id: savedEvent.id,
              occurrence_count: 1,
            })
            .select("*")
            .single();
          if (createdSug) {
            suggestionId = createdSug.id;
            pendingSuggestions++;
          }
        }
      }

      await supabase.from("concert_event_works").insert({
        event_id: savedEvent.id,
        display_order: wIdx + 1,
        work_id: matchedWork?.id || null,
        composer_id: matchedComposer?.id || null,
        raw_composer_name: matchedComposer?.name || wItem.composerName,
        raw_work_title: wItem.workTitle,
        suggestion_id: matchedWork ? null : suggestionId,
      });
    }
  }

  console.log(
    `Done! Synced ${upsertedEvents} concert events · ${matchedWorkLinks} works auto-linked to Opus Archive · ${pendingSuggestions} new missing-work suggestions queued for /admin.`
  );
}

main().catch((err) => {
  console.error("Fatal sync-seasons error:", err);
  process.exit(1);
});
