import type { Metadata } from "next";
import { MusicianStudio } from "@/components/studio/MusicianStudio";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Studio — Repertoire & Recital Builder | Opus Archive",
  description:
    "Track your classical repertoire, log practice sessions, and build timed recital programs with PDF export.",
};

export default function StudioPage() {
  return <MusicianStudio />;
}
