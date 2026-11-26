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

## Phase 6 — Full 314-Composer Enrichment & Catalog Polish (Next Up)

**Goal:** Eliminate missing portraits, finish IMSLP linking across all 314 composers, and bulk-harvest structured work metadata.

- [ ] **Backfill Missing Composer Portraits & Bios (94 composers)**
  - Fetch Wikimedia portraits (`avatar_url`), `birth_place`, and enriched summaries via Wikipedia REST + Wikidata (`P18` / `P19`) for the 94 composers currently missing avatars
- [ ] **Complete IMSLP Link Sync (remaining 174 composers)**
  - Run full IMSLP category + work matching across all remaining unsynced composers
- [ ] **High-Throughput IMSLP `{{Work Info}}` Harvest (50 pages/request)**
  - Upgrade `sync-imslp.mjs` to MediaWiki's 50-title batch size and harvest `year_composed`, `duration_minutes`, `key_signature`, `instrumentation`, and `movements_count` across all ~3,000+ linked works
- [ ] **Work Title & Duplicate Cleanup**
  - Normalize messy imported work titles and merge any remaining sparse duplicates

---

## Phase 7 — Global `⌘K` Search, Homepage Polish & Discovery Features

**Goal:** Make browsing, discovering repertoire, and exploring music history effortless and delightful.

- [ ] **Global `⌘K` / `Ctrl+K` Command Palette**
  - Instant keyboard-driven modal accessible from every page (jump to composers, works, opus numbers, My Studio, or filters)
- [ ] **Homepage Polish & "Featured Work / Historical Spotlight"**
  - Add *Featured Masterwork of the Day* + *Composer Anniversaries* section on `/`
  - Upgrade Composer Directory with sort controls (*Chronological*, *Alphabetical*, *Most Works*) and cleaner cards
- [ ] **Smart Repertoire Finder**
  - Guided musician prompt bar on `/works` (e.g., *"10–20 min" + "Romantic" + "Cello"* → instant playable concert suggestions)
- [ ] **"Who Was Alive Then?" Contemporaries Bar**
  - Visual lifespan overlap chart on each `/composers/[slug]` page showing which other composers overlapped their lifetime
- [ ] **Community Favorite Editions & Reference Recordings**
  - Let signed-in musicians upvote/bookmark the best IMSLP edition or reference recording on `/works/[slug]`

---

## Phase 8 — Practice Session Timer, Weekly Stats & Studio UX Polish

**Goal:** Turn `/studio` into a daily practice companion.

- [ ] **Practice Session Stopwatch & Log (`public.practice_sessions`)**
  - Live start/pause/save practice timer attachable to any repertoire work (plus quick manual minute entry & session focus notes)
  - Strict `user_id = (select auth.uid())` RLS
- [ ] **Weekly Practice Analytics & Streak**
  - 7-day practice minutes bar chart, active day streak, and top-practiced pieces breakdown inside `/studio`
- [ ] **My Studio UX Polish**
  - Faster inline editing, mobile-optimized cards, and quick status transitions

---

## Phase 9 — Shareable Recital Program Links

**Goal:** Let musicians share clean concert programs with collaborators and venues in one click.

- [ ] **Public Share Token on `public.recital_programs`**
  - Add optional `is_public boolean` and unique `share_slug text` to `recital_programs` with public read-only RLS when `is_public = true`
- [ ] **Public Concert Program View (`/programs/[share_slug]`)**
  - Clean, distraction-free recital program page showing venue, date, Half I / Intermission / Half II, composer dates, timings, program notes, IMSLP links, and a **Print / Save PDF** button for pianists, teachers, and concert organizers

