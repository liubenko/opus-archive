# Opus Archive — Classical Music Database

A searchable classical music web application backed by **Supabase (PostgreSQL)** and built with **Next.js (App Router), TypeScript, and Tailwind CSS**.

## Connected Supabase Project
- **Project:** `composers` (`iyfzoobqtegrrvexcqkk`)
- **Database Schema:**
  - `public.composers` — Composers with biographies, eras, nationalities, birth/death years, portraits, and full-text + trigram search vectors.
  - `public.works` — Works with opus & thematic catalog numbers (`Op.`, `BWV`, `K.`, `Hob.`, `RV`, `D.`, `S.`, `WWV`, `L.`, `WoO`), nicknames, keys, instrumentation, movement counts, and durations.
  - `public.composer_relations` — Directed and undirected relationships (`teacher_of`, `influenced`, `admired`, `contemporary_of`, `rival_of`, `collaborated_with`) powering the Influence Graph Map.
  - `public.search_catalog(...)` — `SECURITY INVOKER` Postgres RPC combining `tsvector` full-text ranking with `pg_trgm` fuzzy matching (handles opus lookups like `BWV 1007` and spelling variants like `Chaikovsky`).

## Getting Started

1. Ensure `.env.local` has your `composers` project credentials (already configured):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://iyfzoobqtegrrvexcqkk.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   ```
2. Install dependencies and start the development server:
   ```bash
   npm install
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000).

## Pages
- `/` — **Composers Directory** with instant fuzzy + opus search bar, era pills, nationality filter, and sorting.
- `/composers/[slug]` — **Composer Profile** with portrait, bio, filterable works & opus catalog, and clickable musical lineage connections.
- `/works` — **Master Works & Opus Index** searchable and filterable across all catalog systems, eras, and genres.
- `/explore` — **Influence Graph Map & Analytics Dashboard** featuring an interactive composer lineage map, lifespan overlap timeline (1678–1971), and genre/era breakdowns.

## Expanding Beyond the Top 20
Add new rows to `public.composers`, `public.works`, and `public.composer_relations` via the Supabase Table Editor or SQL migrations—search vectors (`search_vector`) and formatted catalog labels (`catalog_display`) are generated automatically by PostgreSQL.
