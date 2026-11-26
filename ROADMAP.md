# Opus Archive — Product Roadmap (`ROADMAP.md`)

> Living roadmap aligned with [PRODUCT.md](./PRODUCT.md). Organized into concrete, shippable phases starting with **Dedicated Work Pages**.

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
- [x] Server-backed `/works` search, instrument chips, IMSLP filter, and pagination across all 23,539+ works

---

## Phase 0.5 — Data Hygiene & IMSLP Metadata Harvest (Immediate Priority)

**Goal:** Clean and enrich the catalog *before* launching dedicated work pages so every work page feels complete and trustworthy.

- [ ] **Fold Movement Rows into `public.work_movements`**
  - Prevent `sync-musicbrainz.mjs` from importing individual movements (`: I. Allegro`, `: No. 6`) as top-level works
  - Migrate the ~4,000 existing movement rows out of `public.works` into `public.work_movements` attached to their parent work
- [ ] **IMSLP `{{Work Info}}` Metadata Harvester**
  - Extend `sync-imslp.mjs` to parse IMSLP wikitext fields (`Year/Date of Composition`, `Instrumentation`, `Key`, `Movements/Sections`, `Average Duration`) in bulk — lifting metadata completeness far faster than 60 works/day
  - Finish IMSLP sync across all 314 composers
- [ ] **Expand Catalog Number Parser (`scripts/lib/dedup.mjs`)**
  - Add missing catalog systems (`G.` Boccherini, `MWV` Mendelssohn, `TH` Tchaikovsky, `CT` Chopin, `FS` Nielsen, `JB` Dvořák) and backfill `catalog_display`
- [ ] **Modularize Admin Panel**
  - Split `AdminPanel.tsx` into focused sub-components (`AdminAuthGate`, `ComposersManager`, `WorksManager`, `RelationsManager`, `SiteSettingsForm`)

---

## Phase 1 — Dedicated Work Pages & Movements

**Goal:** Turn every work from a table row into a rich, SEO-friendly reference page for performers.

- [ ] **SEO Work Slugs & Dedicated Route (`/works/[slug]`)**
  - Add unique `slug` column to `public.works` (e.g. `bach-cello-suite-no-1-bwv-1007`) for readable, shareable URLs
  - Hero with catalog number, title, nickname, composer link, era, year, key, genre, and Essential badge
  - Full instrumentation / scoring breakdown, estimated duration, structured movements list, and program notes
  - Direct **IMSLP Score ↗** callout + related works by the same composer or same instrumentation
  - SEO metadata & OpenGraph tags for sharing individual works
  - Expose `/api/v1/works/[slug]` with nested `movements`

---

## Phase 2 — Reference Recordings & In-App Score Viewing

**Goal:** Let musicians *hear* and *read* the score without leaving Opus Archive.

- [ ] **Streaming & Reference Recording Links**
  - Curated or auto-linked YouTube, Spotify, and Apple Music Classical links on `/works/[id]`
  - Optional embedded YouTube player for quick listening during repertoire research
  - Admin Panel support for pinning a "Reference Recording" per work
- [ ] **In-App IMSLP Score Preview / Sheet Music Viewer**
  - Parse available public-domain PDF editions via IMSLP's API for a work page
  - Show edition metadata (publisher, editor, year, page count) and quick-open / inline PDF viewer where permitted by IMSLP terms

---

## Phase 3 — Expanded Discovery, Graph & Analytics

**Goal:** Make `/explore` a deeper musical-history and repertoire discovery tool.

- [ ] **Enhanced Influence Graph (`/explore`)**
  - Filter graph by Era, Nationality, and Relationship Type (Teacher/Student, Influenced, Contemporaries)
  - Search & focus/zoom onto a specific composer's lineage cluster
  - Expand `composer_relations` dataset via Wikidata (`P1066` student of / `P737` influenced by)
- [ ] **Repertoire Discovery Filters**
  - "Find a piece by duration" slider (e.g., 8–15 min recital opener, 25–35 min major sonata/concerto)
  - Filter by Key Signature, Composition Decade, and Has IMSLP Score

---

## Phase 4 — Musician Accounts & Pro Workspace (Freemium Launch)

**Goal:** Launch personal musician tools backed by Supabase Auth + `auth.uid()` RLS.

- [ ] **User Accounts & Profiles**
  - Musician sign-up (Email / Magic Link / Google OAuth), primary instrument profile
  - Strict row-level isolation (`user_id = auth.uid()`)
- [ ] **Personal Repertoire & Practice Tracker (Pro)**
  - Add any catalog work to personal library with status (`Wish List`, `Learning`, `Ready`, `Performed`)
  - Difficulty rating (1–5), target tempo, last practiced date, and private performance/fingering notes
  - Import/export compatibility with spreadsheets (CSV / Excel)
- [ ] **Recital & Concert Program Builder (Pro)**
  - Create named programs (e.g., *Spring Recital 2027*), drag-and-drop works into Half I / Intermission / Half II
  - Live auto-summed timing (per half + total duration)
  - One-click **Program PDF Export** with composer dates, opus numbers, movements, and program notes

---

## Phase 5 — Platform, Custom Domain & API v2

**Goal:** Polish for scale, custom branding, and companion-app ecosystem.

- [ ] **Custom Domain & Brand Polish** (e.g. `opusarchive.org` / `.com`, custom OG social cards, sitemap.xml)
- [ ] **Billing & Subscription Management** (Stripe Checkout + Customer Portal for Pro tier)
- [ ] **Public API v2 & Companion App Tokens**
  - Dedicated `/api/v1/works/[id]` endpoint with movements & recordings
  - Authenticated personal endpoints (`/api/v1/me/repertoire`, `/api/v1/me/programs`) via user API keys for mobile apps, Notion, or Obsidian plugins
  - OpenAPI / Swagger interactive docs page (`/docs/api`)
