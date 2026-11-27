import { supabase } from "@/lib/supabase";
import type { Performer, Venue } from "@/types/database";
import type {
  HydratedConcertEvent,
  HydratedEventPerformer,
  HydratedEventWork,
} from "@/components/stage/ConcertEventCard";

export async function fetchWorldStageData(): Promise<{
  venues: Venue[];
  performers: Performer[];
  events: HydratedConcertEvent[];
}> {
  const [venuesRes, performersRes, eventsRes, epRes, ewRes] = await Promise.all(
    [
      supabase.from("venues").select("*").order("name", { ascending: true }),
      supabase
        .from("performers")
        .select("*")
        .order("is_featured", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("concert_events")
        .select("*")
        .order("starts_at", { ascending: true }),
      supabase
        .from("concert_event_performers")
        .select("*")
        .order("display_order", { ascending: true }),
      supabase
        .from("concert_event_works")
        .select("*, works(slug, catalog_display, imslp_url), composers(slug)")
        .order("display_order", { ascending: true }),
    ]
  );

  const venues = (venuesRes.data ?? []) as Venue[];
  const performers = (performersRes.data ?? []) as Performer[];
  const venueById = new Map(venues.map((v) => [v.id, v]));
  const perfById = new Map(performers.map((p) => [p.id, p]));

  const epByEvent = new Map<number, NonNullable<typeof epRes.data>>();
  for (const row of epRes.data ?? []) {
    const list = epByEvent.get(row.event_id) ?? [];
    list.push(row);
    epByEvent.set(row.event_id, list);
  }

  const ewByEvent = new Map<number, NonNullable<typeof ewRes.data>>();
  for (const row of ewRes.data ?? []) {
    const list = ewByEvent.get(row.event_id) ?? [];
    list.push(row);
    ewByEvent.set(row.event_id, list);
  }

  const events: HydratedConcertEvent[] = [];
  for (const ev of eventsRes.data ?? []) {
    const venue = venueById.get(ev.venue_id);
    if (!venue) continue;

    const hydratedPerformers: HydratedEventPerformer[] = [];
    for (const ep of epByEvent.get(ev.id) ?? []) {
      const p = perfById.get(ep.performer_id);
      if (!p) continue;
      hydratedPerformers.push({
        performer_id: p.id,
        slug: p.slug,
        name: p.name,
        performer_type: p.performer_type,
        billing_role: ep.billing_role,
        instrument_label: ep.instrument_label ?? p.instrument_or_role,
        avatar_url: p.avatar_url,
      });
    }

    const hydratedWorks: HydratedEventWork[] = (ewByEvent.get(ev.id) ?? []).map(
      (w) => {
        const wJoin = w.works as {
          slug: string | null;
          catalog_display: string | null;
          imslp_url: string | null;
        } | null;
        const cJoin = w.composers as { slug: string | null } | null;
        return {
          id: w.id,
          display_order: w.display_order,
          work_id: w.work_id,
          work_slug: wJoin?.slug ?? null,
          work_catalog: wJoin?.catalog_display ?? null,
          work_imslp_url: wJoin?.imslp_url ?? null,
          composer_id: w.composer_id,
          composer_slug: cJoin?.slug ?? null,
          raw_composer_name: w.raw_composer_name,
          raw_work_title: w.raw_work_title,
        };
      }
    );

    events.push({
      id: ev.id,
      slug: ev.slug,
      title: ev.title,
      subtitle: ev.subtitle,
      starts_at: ev.starts_at,
      season: ev.season,
      venue_id: venue.id,
      venue_slug: venue.slug,
      venue_name: venue.name,
      venue_short_name: venue.short_name,
      venue_city: venue.city,
      venue_country: venue.country,
      latitude: venue.latitude,
      longitude: venue.longitude,
      source_url: ev.source_url,
      ticket_url: ev.ticket_url,
      performers: hydratedPerformers,
      works: hydratedWorks,
    });
  }

  return { venues, performers, events };
}
