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

## Phase 5 — Platform, Interactive API Docs & SEO ✅ *(Custom Domain & Stripe Ready)*

- [x] Built interactive API Docs & live playground at `/docs/api`
- [x] Built authenticated personal companion-app endpoints (`/api/v1/me/repertoire`, `/api/v1/me/programs`) scoped via Supabase Bearer JWT + RLS
- [x] Added dynamic `/sitemap.xml` and `/robots.txt` (with `NEXT_PUBLIC_SITE_URL` support for custom domain migration)
- [ ] Attach custom domain (when chosen) & configure Stripe Checkout for Pro subscriptions
