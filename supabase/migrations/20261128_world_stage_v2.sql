-- World Stage 2.0: Top 100 Venues, Performer & Venue Proposals, and Staged Concert / Tour Date Deduplication

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS wikidata_qid TEXT,
  ADD COLUMN IF NOT EXISTS feed_type TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS tier INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE public.performers
  ADD COLUMN IF NOT EXISTS wikidata_qid TEXT,
  ADD COLUMN IF NOT EXISTS feed_type TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE public.concert_events
  ADD COLUMN IF NOT EXISTS canonical_fingerprint TEXT;

UPDATE public.concert_events
SET canonical_fingerprint = 'venue:' || venue_id::text || '::' || to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
WHERE canonical_fingerprint IS NULL;

CREATE INDEX IF NOT EXISTS idx_concert_events_canonical_fingerprint
  ON public.concert_events (canonical_fingerprint);

CREATE TABLE IF NOT EXISTS public.stage_entity_proposals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('performer', 'venue')),
  dedup_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'linked', 'dismissed')),
  source_type TEXT NOT NULL DEFAULT 'season_sync'
    CHECK (source_type IN ('season_sync', 'tour_sync', 'user_search', 'admin_crawl')),
  source_context TEXT,
  source_url TEXT,
  occurrence_count INT NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  short_name TEXT,
  performer_type TEXT
    CHECK (performer_type IS NULL OR performer_type IN ('orchestra', 'ensemble', 'conductor', 'soloist')),
  instrument_or_role TEXT,
  nationality TEXT,
  city TEXT,
  country TEXT,
  country_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  capacity INT,
  opened_year INT,
  architect_or_acoustics TEXT,
  website_url TEXT,
  calendar_url TEXT,
  photo_url TEXT,
  short_bio TEXT,
  wikidata_qid TEXT,
  resolved_performer_id BIGINT REFERENCES public.performers(id) ON DELETE SET NULL,
  resolved_venue_id BIGINT REFERENCES public.venues(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stage_entity_proposals_status_type
  ON public.stage_entity_proposals (status, entity_type, occurrence_count DESC);

CREATE INDEX IF NOT EXISTS idx_stage_entity_proposals_resolved_performer
  ON public.stage_entity_proposals (resolved_performer_id);

CREATE INDEX IF NOT EXISTS idx_stage_entity_proposals_resolved_venue
  ON public.stage_entity_proposals (resolved_venue_id);

ALTER TABLE public.stage_entity_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage stage_entity_proposals"
  ON public.stage_entity_proposals
  FOR ALL
  TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE TABLE IF NOT EXISTS public.concert_event_proposals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedup_key TEXT NOT NULL UNIQUE,
  canonical_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'merged', 'dismissed')),
  source_kind TEXT NOT NULL DEFAULT 'venue_sync'
    CHECK (source_kind IN ('venue_sync', 'artist_tour', 'url_import', 'manual')),
  source_label TEXT,
  source_url TEXT,
  ticket_url TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  season TEXT NOT NULL DEFAULT '2026/27',
  matched_venue_id BIGINT REFERENCES public.venues(id) ON DELETE SET NULL,
  proposed_venue_id BIGINT REFERENCES public.stage_entity_proposals(id) ON DELETE SET NULL,
  raw_venue_name TEXT,
  raw_city TEXT,
  raw_country TEXT,
  performers_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  works_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  duplicate_of_event_id BIGINT REFERENCES public.concert_events(id) ON DELETE SET NULL,
  match_confidence INT NOT NULL DEFAULT 0,
  match_summary TEXT,
  resolved_event_id BIGINT REFERENCES public.concert_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concert_event_proposals_status_starts
  ON public.concert_event_proposals (status, starts_at);

CREATE INDEX IF NOT EXISTS idx_concert_event_proposals_fingerprint
  ON public.concert_event_proposals (canonical_fingerprint);

CREATE INDEX IF NOT EXISTS idx_concert_event_proposals_matched_venue
  ON public.concert_event_proposals (matched_venue_id);

CREATE INDEX IF NOT EXISTS idx_concert_event_proposals_proposed_venue
  ON public.concert_event_proposals (proposed_venue_id);

CREATE INDEX IF NOT EXISTS idx_concert_event_proposals_duplicate_of
  ON public.concert_event_proposals (duplicate_of_event_id);

CREATE INDEX IF NOT EXISTS idx_concert_event_proposals_resolved_event
  ON public.concert_event_proposals (resolved_event_id);

ALTER TABLE public.concert_event_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage concert_event_proposals"
  ON public.concert_event_proposals
  FOR ALL
  TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
