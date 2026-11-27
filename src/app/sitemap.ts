import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://opus-archive.mykolaliubenko.workers.dev";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [composersRes, worksRes, venuesRes, performersRes] = await Promise.all([
    supabase.from("composers").select("slug, updated_at").limit(500),
    supabase
      .from("works")
      .select("slug, created_at")
      .not("slug", "is", null)
      .order("is_popular", { ascending: false })
      .order("imslp_url", { ascending: false, nullsFirst: false })
      .limit(2000),
    supabase.from("venues").select("slug, updated_at"),
    supabase.from("performers").select("slug, updated_at").eq("is_featured", true),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/works`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/stage`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/explore`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/docs/api`, changeFrequency: "monthly", priority: 0.7 },
  ];

  const composerRoutes: MetadataRoute.Sitemap = (composersRes.data ?? []).map(
    (c) => ({
      url: `${SITE_URL}/composers/${c.slug}`,
      lastModified: c.updated_at ? new Date(c.updated_at) : undefined,
      changeFrequency: "weekly",
      priority: 0.8,
    })
  );

  const workRoutes: MetadataRoute.Sitemap = (worksRes.data ?? [])
    .filter((w): w is { slug: string; created_at: string } => Boolean(w.slug))
    .map((w) => ({
      url: `${SITE_URL}/works/${w.slug}`,
      lastModified: w.created_at ? new Date(w.created_at) : undefined,
      changeFrequency: "monthly",
      priority: 0.7,
    }));

  const venueRoutes: MetadataRoute.Sitemap = (venuesRes.data ?? []).map((v) => ({
    url: `${SITE_URL}/stage/venues/${v.slug}`,
    lastModified: v.updated_at ? new Date(v.updated_at) : undefined,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const performerRoutes: MetadataRoute.Sitemap = (performersRes.data ?? []).map(
    (p) => ({
      url: `${SITE_URL}/stage/artists/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
      changeFrequency: "weekly",
      priority: 0.8,
    })
  );

  return [
    ...staticRoutes,
    ...venueRoutes,
    ...performerRoutes,
    ...composerRoutes,
    ...workRoutes,
  ];
}
