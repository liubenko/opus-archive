import { apiJson, apiOptions } from "@/lib/api";
import {
  lookupComposerCandidates,
  lookupWorkCandidates,
  type EnrichedComposerCandidate,
  type EnrichedWorkCandidate,
} from "@/lib/catalog-lookup";

export type { EnrichedComposerCandidate, EnrichedWorkCandidate };

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "composer" ? "composer" : "work";
  const q = (searchParams.get("q") || "").trim();
  const composer = (searchParams.get("composer") || "").trim();

  if (q.length < 2 && composer.length < 2) {
    return apiJson({ type, candidates: [] });
  }

  if (type === "composer") {
    const candidates = await lookupComposerCandidates(q || composer);
    return apiJson({ type, candidates });
  }

  const candidates = await lookupWorkCandidates(q, composer);
  return apiJson({ type, candidates });
}
