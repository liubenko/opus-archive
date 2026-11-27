import { supabase } from "@/lib/supabase";
import { apiJson, apiOptions } from "@/lib/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const venueSlug = searchParams.get("venue");
  const performerSlug = searchParams.get("performer");
  const instrument = searchParams.get("instrument");

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

  const venues = venuesRes.data ?? [];
  const performers = performersRes.data ?? [];
  const venueById = new Map(venues.map((v) => [v.id, v]));
  const perfById = new Map(performers.map((p) => [p.id, p]));

  const epByEvent = new Map<number, typeof epRes.data>();
  for (const row of epRes.data ?? []) {
    const arr = epByEvent.get(row.event_id) ?? [];
    arr.push(row);
    epByEvent.set(row.event_id, arr);
  }

  const ewByEvent = new Map<number, typeof ewRes.data>();
  for (const row of ewRes.data ?? []) {
    const arr = ewByEvent.get(row.event_id) ?? [];
    arr.push(row);
    ewByEvent.set(row.event_id, arr);
  }

  const hydratedEvents = (eventsRes.data ?? [])
    .map((ev) => {
      const venue = venueById.get(ev.venue_id);
      if (!venue) return null;
      const evPerfs = (epByEvent.get(ev.id) ?? [])
        .map((ep) => {
          const p = perfById.get(ep.performer_id);
          if (!p) return null;
          return {
            slug: p.slug,
            name: p.name,
            type: p.performer_type,
            role: ep.billing_role,
            instrument: ep.instrument_label,
          };
        })
        .filter(Boolean);

      const evWorks = (ewByEvent.get(ev.id) ?? []).map((w) => {
        const workJoin = w.works as
          | { slug: string | null; catalog_display: string | null; imslp_url: string | null }
          | null;
        const compJoin = w.composers as { slug: string | null } | null;
        return {
          order: w.display_order,
          composer: w.raw_composer_name,
          composer_slug: compJoin?.slug ?? null,
          title: w.raw_work_title,
          work_id: w.work_id,
          work_slug: workJoin?.slug ?? null,
          catalog_display: workJoin?.catalog_display ?? null,
          imslp_url: workJoin?.imslp_url ?? null,
          in_library: Boolean(w.work_id),
        };
      });

      return {
        id: ev.id,
        slug: ev.slug,
        title: ev.title,
        subtitle: ev.subtitle,
        starts_at: ev.starts_at,
        season: ev.season,
        venue: {
          slug: venue.slug,
          name: venue.name,
          city: venue.city,
          country: venue.country,
          latitude: venue.latitude,
          longitude: venue.longitude,
        },
        ticket_url: ev.ticket_url,
        performers: evPerfs,
        program: evWorks,
      };
    })
    .filter((ev): ev is NonNullable<typeof ev> => Boolean(ev))
    .filter((ev) => {
      if (venueSlug && ev.venue.slug !== venueSlug) return false;
      if (
        performerSlug &&
        !ev.performers.some((p) => p?.slug === performerSlug)
      ) {
        return false;
      }
      if (
        instrument &&
        !ev.performers.some((p) =>
          (p?.instrument || "").toLowerCase().includes(instrument.toLowerCase())
        )
      ) {
        return false;
      }
      return true;
    });

  return apiJson({
    count: hydratedEvents.length,
    venues_count: venues.length,
    performers_count: performers.length,
    venues,
    performers: performers.filter((p) => p.is_featured),
    events: hydratedEvents,
  });
}
