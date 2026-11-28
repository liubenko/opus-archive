import { apiJson, apiOptions } from "@/lib/api";
import {
  lookupComposerCandidates,
  lookupPerformerCandidates,
  lookupVenueCandidates,
  lookupWorkCandidates,
  type EnrichedComposerCandidate,
  type EnrichedPerformerCandidate,
  type EnrichedVenueCandidate,
  type EnrichedWorkCandidate,
} from "@/lib/catalog-lookup";

export type {
  EnrichedComposerCandidate,
  EnrichedPerformerCandidate,
  EnrichedVenueCandidate,
  EnrichedWorkCandidate,
};

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawType = searchParams.get("type") || "work";
  const q = (searchParams.get("q") || "").trim();
  const composer = (searchParams.get("composer") || "").trim();
  const city = (searchParams.get("city") || "").trim();

  if (q.length < 2 && composer.length < 2) {
    return apiJson({ type: rawType, candidates: [] });
  }

  if (rawType === "composer") {
    const candidates = await lookupComposerCandidates(q || composer);
    return apiJson({ type: "composer", candidates });
  }

  if (rawType === "performer") {
    const candidates = await lookupPerformerCandidates(q);
    return apiJson({ type: "performer", candidates });
  }

  if (rawType === "venue") {
    const candidates = await lookupVenueCandidates(q, city || undefined);
    return apiJson({ type: "venue", candidates });
  }

  const candidates = await lookupWorkCandidates(q, composer);
  return apiJson({ type: "work", candidates });
}
