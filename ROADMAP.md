# Opus Archive — Product Roadmap (`ROADMAP.md`)

> Living roadmap aligned with [PRODUCT.md](./PRODUCT.md).

---

## Completed Foundation (v0.1 – v0.4)

- [x] Core catalog database (Supabase PostgreSQL, FTS + `pg_trgm` fuzzy search, canonical deduplication)
- [x] Composer directory, composer profiles (`/composers/[slug]`), works index (`/works`), and Influence Graph & Analytics (`/explore`)
- [x] Dark Concert Hall theme (default) + Light Editorial toggle
- [x] Automated daily cloud sync (OpenOpus + MusicBrainz + Wikipedia/Wikidata metadata enrichment)
- [x] Imported custom Cello repertoire dataset (485 repertoire entries merged cleanly)
- [x] Public REST API v1 (`/api/v1/*`) with CORS and edge caching
- [x] Secure Admin Panel (`/admin`) with Supabase Auth, `app_metadata.role = 'admin'` RLS, full CRUD, and live `site_settings`
- [x] IMSLP MediaWiki API integration (`imslp_url` on composers & works, UI buttons, API fields, Admin editor, daily sync)
- [x] Server-backed `/works` search, instrument chips, IMSLP filter, and pagination across all 20,599+ works

---

## Phase 0.5 — Data Hygiene & IMSLP Metadata Harvest ✅

- [x] Created `public.work_movements` with RLS and folded 2,832 movement rows cleanly under parent works (`scripts/hygiene-catalog.mjs`)
- [x] Prevented `sync-musicbrainz.mjs` from importing individual movements as standalone works
- [x] Added IMSLP `{{Work Info}}` wikitext harvester in `sync-imslp.mjs` (batch-fetching 20 pages per API request for year, key, instrumentation, duration, and movement count)
- [x] Expanded `CATALOG_REGEX` (`G.`, `MWV`, `TH`, `CT`, `FS`, `JB`, `WAB`, `TrV`, `FP`, `JW`, `MS`, `EG`)
- [ ] Optional polish: split `AdminPanel.tsx` into modular sub-components

---

## Phase 1 — Dedicated Work Pages & Movements ✅

- [x] Added unique SEO `slug` column + automatic Postgres trigger (`works_set_slug`) across all 20,599 works
- [x] Built `/works/[slug]` with dynamic SEO metadata, composer mini-card, IMSLP CTA, at-a-glance metadata grid, instrumentation, program notes, numbered `work_movements`, and related repertoire
- [x] Exposed `/api/v1/works/[slug]` with nested `movements` and `related_works`
- [x] Linked work titles across composer pages, `/works`, and live search to `/works/[slug]`

---

## Phase 2 — Reference Recordings & IMSLP Score Editions ✅

- [x] Added `youtube_url`, `spotify_url`, `apple_music_url`, and `recording_notes` to `public.works`, API, and Admin Panel
- [x] Built `WorkListeningPanel` with lazy-loaded YouTube embed for curated recordings + one-click YouTube/Spotify/Apple Music links for all works
- [x] Built `/api/v1/imslp/editions` (brace-balanced wikitext parser, 24h edge-cached) and `WorkImslpEditions` panel on `/works/[slug]`

---

## Phase 3 — Expanded Discovery, Graph & Analytics ✅

- [x] Upgraded `InfluenceGraph` on `/explore` with Composer Lineage Focus search, Era filter, and Nationality filter
- [x] Expanded `composer_relations` from 56 → 160 verified historical lineages via Wikidata SPARQL (`scripts/sync-relations.mjs`)
- [x] Added Duration presets, Key Signature selector, and Composition Period filters to `/works`

---

## Phase 4 — Musician Accounts & My Studio Workspace ✅

- [x] Created `public.user_repertoire`, `public.recital_programs`, and `public.recital_program_items` with strict `user_id = (select auth.uid())` RLS
- [x] Built `/studio` (**My Studio**) with Sign In / Sign Up / Email Login Link and Free Starter quota (20 works & 1 program) vs Unlimited Pro/Admin
- [x] Built Repertoire & Practice Tracker (statuses, 1–5 difficulty, Practiced Today, private notes, CSV export)
- [x] Built Recital Program Builder (Half I / Intermission / Half II, reordering, live auto-summed timing, Print / Export PDF)
- [x] Added one-click **Track Repertoire** & **Add to Program** actions on every `/works/[slug]` page

---

## Phase 5 — Platform, Interactive API Docs & SEO ✅ *(Custom Domain & Stripe Deferred)*

- [x] Built interactive API Docs & live playground at `/docs/api`
- [x] Built authenticated personal companion-app endpoints (`/api/v1/me/repertoire`, `/api/v1/me/programs`) scoped via Supabase Bearer JWT + RLS
- [x] Added dynamic `/sitemap.xml` and `/robots.txt` (with `NEXT_PUBLIC_SITE_URL` support for custom domain migration)
- [ ] *(Later)* Attach custom domain & configure Stripe Checkout for Pro subscriptions

---

# v2 — Refinement, Discovery & Practice Expansion

## Phase 6 — Full 314-Composer Enrichment & Catalog Polish ✅

- [x] Backfilled Wikimedia portraits (`avatar_url` now 284 / 314 = 90.4%), `birth_place`, and editorial Wikipedia bios (`scripts/enrich-composers.mjs`)
- [x] Completed IMSLP category + score-link sync across all 314 composers (5,735+ works linked)
- [x] Upgraded `sync-imslp.mjs` to 50-page MediaWiki bulk batches, lifting composition years (+130%) and durations
- [x] Folded remaining 789 opera scene/act sub-works into `public.work_movements` (now 3,621 structured movements) and normalized title whitespace

---

## Phase 7 — Global `⌘K` Search, Homepage Polish & Discovery Features ✅

- [x] Global `⌘K` / `Ctrl+K` Command Palette (`CommandPalette.tsx`) accessible from every page
- [x] Homepage *Masterwork of the Day* + *Milestone Anniversaries* spotlight + Composer Directory *Most Works* sort & search
- [x] Smart Repertoire Finder + *Surprise Me* picker on `/works`
- [x] *"Who Was Alive Then?"* Contemporaries lifespan overlap bar on every `/composers/[slug]` page
- [x] Community Favorite Edition & Recording likes (`public.work_edition_votes`) on `/works/[slug]`

---

## Phase 8 — Practice Session Timer, Weekly Stats & Studio UX Polish ✅

- [x] Built live Practice Stopwatch & Session Logger (`public.practice_sessions` with `user_id = (select auth.uid())` RLS) inside `/studio`
- [x] Built 7-day Practice Activity bar chart, active day streak, and session history log

---

## Phase 9 — Shareable Recital Program Links ✅

- [x] Added `is_public`, `share_slug`, and `performer_name` to `public.recital_programs` with public read-only RLS when `is_public = true`
- [x] Built `/programs/[slug]` public concert sheet view with Print / Save PDF button and IMSLP score links for collaborators
- [x] Rebuilt `/explore` with Interactive Composer Avatar Knowledge Graph (`KnowledgeGraphAtlas`), 3-stage Era → School → Genre `AlluvialFlowChart`, and Year-Crosshair Lifespan Timeline

---

# v3 — World Stage: Venues, Orchestras, Soloist Seasons & Live Triage

## Phase 10 — Interactive World Venues Map, Orchestras & Soloist Calendars (`/stage`) ✅

- [x] Created World Stage schema (`public.venues`, `public.performers`, `public.concert_events`, `public.concert_event_performers`, `public.concert_event_works`, `public.catalog_suggestions`) with strict RLS and indexed foreign keys
- [x] Seeded 12 iconic world concert halls (Carnegie Hall, Philharmonie Berlin, David Geffen Hall, Musikverein, Concertgebouw, Wigmore Hall, Barbican Hall, Elbphilharmonie, Philharmonie de Paris, Walt Disney Concert Hall, Suntory Hall, Teatro alla Scala), 5 flagship orchestras (Berliner Philharmoniker, NY Philharmonic, Wiener Philharmoniker, LSO, Royal Concertgebouw Orchestra), and 14+ leading soloists & conductors (strong Cello, Piano, and Violin focus)
- [x] Built interactive **MapLibre GL JS** Dark Matter vector atlas at `/stage` with venue pins, tour-route polylines, city/region zoom, and 4-way cross-filtering by Venue, Orchestra, Soloist, and Month
- [x] Built dedicated Venue season pages (`/stage/venues/[slug]`) and Orchestra / Soloist tour calendar pages (`/stage/artists/[slug]`) with clickable `/works/[slug]` program items and subtle *"Cataloging Pending"* badges for unmatched repertoire
- [x] Surfaced *"Live on the World Stage"* on `/works/[slug]` and exposed `/api/v1/stage` REST endpoints

---

## Phase 11 — Weekly Season Ingestion Pipeline & `/admin` Suggestions Inbox ✅

- [x] Built `scripts/sync-seasons.mjs` + `scripts/lib/season-parser.mjs` combining `Schema.org MusicEvent` JSON-LD / `.ics` extraction, NY Philharmonic CC0 Open Data JSON feed, and canonical work/composer matching
- [x] Scheduled automated weekly season refresh via `.github/workflows/sync-seasons.yml` (`workflow_dispatch` + Mondays `04:30 UTC`)
- [x] Built `/admin` **Stage & Inbox** tab (`AdminWorldStageTab.tsx`): review unmatched works spotted on orchestra/soloist programs with 1-click **Approve & Add to Library** (auto-links all concerts performing that work), **Link to Existing Work**, or **Dismiss**
- [x] Added on-demand **Season URL / JSON-LD / iCal / NYPhil Live Importer** and manual concert builder inside `/admin` (`/api/admin/import-season`)



