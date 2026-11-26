# Opus Archive — Product Specification (`PRODUCT.md`)

> **A musician-first classical music catalog, repertoire research platform, and public data API.**
>
> Live: [opus-archive.mykolaliubenko.workers.dev](https://opus-archive.mykolaliubenko.workers.dev) *(custom domain planned)*  
> Repository: [github.com/liubenko/opus-archive](https://github.com/liubenko/opus-archive)

---

## 1. Vision & Positioning

Classical musicians, conservatory students, and chamber ensembles constantly juggle fragmented tools: IMSLP for scores, Wikipedia for dates and program notes, Spotify/YouTube for reference recordings, and spreadsheets for repertoire tracking and concert timing.

**Opus Archive** unifies these workflows into two complementary pillars:
1. **Flagship Web App** — A fast, editorial-grade classical catalog and musician workspace for discovering repertoire, inspecting movements and instrumentation, opening verified IMSLP scores, listening to reference recordings, and building recital programs.
2. **Public Classical Data API (`/api/v1`)** — A clean, structured, CORS-enabled JSON API that powers companion apps (including personal Second Brain / mobile practice apps) and third-party music tools.

---

## 2. Target Audience

- **Primary:** Performing classical musicians, conservatory students, chamber ensembles, and teachers researching repertoire, scores, instrumentation, and concert programming.
- **Secondary:** Developers and musicians building companion apps (practice trackers, Notion/Obsidian syncs, mobile repertoire tools) on top of `/api/v1`.
- **Instrument Scope:** All classical repertoire (Medieval through Contemporary), enhanced with **deep instrument & scoring filters** (e.g., Solo Cello, Cello & Piano, Violin, Piano, String Quartet, Chamber, Concerto, Orchestral) so performers can quickly narrow 23,500+ works to playable repertoire.

---

## 3. Business Model (Freemium)

### Free Tier — *Open Public Archive & Starter Musician Workspace*
- Full catalog access (composers, works, catalog systems, eras, nationalities, instrumentation)
- Instant full-text & fuzzy search (`search_catalog` RPC) and server-paginated `/works` index
- Dedicated Composer & SEO-friendly Work pages (`/works/[slug]`) with movement breakdowns and program notes
- Verified **IMSLP Score** links & composer catalogs
- Reference recording links (YouTube, Spotify, Apple Music Classical)
- Interactive Composer Influence Graph & Lifespan Timeline (`/explore`)
- Public read-only REST API (`/api/v1/*`) with edge caching
- **Starter Musician Quota:** Track up to **20 repertoire pieces** and build **1 active recital program** free so students and performers can adopt Opus Archive immediately

### Pro Tier — *Unlimited Musician Workspace*
- **Unlimited Personal Repertoire & Practice Tracker** — track unlimited works by status (*Learning*, *Performed*, *Ready*, *Wish List*), difficulty rating, last practiced date, and private performance notes
- **Unlimited Recital & Concert Program Builder** — drag-and-drop works into halves with intermissions, auto-calculated total duration, automated program notes, and branded PDF export
- **Private Annotations & Score Bookmarks** — personal fingerings/bowings notes, preferred IMSLP edition links, and custom tags
- **Sync & Export** — CSV/Excel/JSON export and personal API tokens for companion apps

---

## 4. Current State (Shipped Foundation)

| Layer | Current Implementation |
| --- | --- |
| **Frontend** | Next.js App Router, React 19, TypeScript, Tailwind CSS v4, Dark Concert Hall (default) + Light Editorial theme |
| **Hosting** | Cloudflare Workers via `vinext` (`force-dynamic`, zero-KV edge deployment) |
| **Database** | Supabase PostgreSQL (`composers` project) with `pg_trgm` fuzzy search, full-text `tsvector` indexes, and canonical deduplication triggers |
| **Catalog Scale** | 314 composers · 23,539+ works · 56 lineage connections · 1,435+ verified IMSLP links (growing daily) |
| **Public API** | `/api/v1`, `/api/v1/composers`, `/api/v1/composers/:slug`, `/api/v1/works`, `/api/v1/search`, `/api/v1/graph` |
| **Data Pipeline** | Daily GitHub Actions sync (`03:00 UTC` + manual dispatch): OpenOpus + Wikipedia + MusicBrainz + Wikidata + IMSLP MediaWiki API |
| **Admin Console** | `/admin` gated by Supabase Auth + `app_metadata.role = 'admin'` RLS policies; full CRUD for Composers, Works, Lineage Connections, and live `site_settings` |

---

## 5. Core Architecture Principles

1. **Zero Duplicate Records:** All ingestion pipelines share canonical normalization (`scripts/lib/dedup.mjs`), unique external IDs (`openopus_id`, `musicbrainz_id`), and database-enforced `canonical_key` constraints.
2. **Musician-Grade Metadata:** Every work targets complete structured fields: `catalog_display`, `year_composed`, `key_signature`, `instrumentation`, `movements_count` (and structured movements), `duration_minutes`, `description`, `imslp_url`, and streaming links.
3. **Database-Enforced Security:** Public read-only access for catalog data; strict RLS using server-managed `app_metadata.role` for admin writes and `auth.uid()` scoping for future user-owned repertoire/program tables.
4. **API-First Consistency:** Every new catalog entity (movements, recordings, tags, instrumentation facets) is exposed cleanly in `/api/v1` alongside the web UI.

---

## 6. Success Metrics

- **Catalog Quality:** % of works with complete core metadata (`year_composed`, `key_signature`, `instrumentation`, `duration_minutes`, `imslp_url`).
- **Research Speed:** Time from landing on Opus Archive to finding a work's instrumentation, duration, and IMSLP score (< 15 seconds).
- **Musician Retention (Post-Pro):** Active musicians maintaining personal repertoire lists and building concert programs.
- **API Adoption:** External companion apps and scripts querying `/api/v1` reliably.
