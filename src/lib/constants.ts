export const ERA_ORDER = [
  "Baroque",
  "Classical",
  "Early Romantic",
  "Romantic",
  "Late Romantic",
  "Impressionist",
  "20th Century",
] as const;

export const ERA_META: Record<
  string,
  { color: string; bg: string; border: string; text: string; hex: string }
> = {
  Baroque: {
    color: "bg-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200/80",
    text: "text-amber-900",
    hex: "#b45309",
  },
  Classical: {
    color: "bg-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-200/80",
    text: "text-sky-900",
    hex: "#0369a1",
  },
  "Early Romantic": {
    color: "bg-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-200/80",
    text: "text-rose-900",
    hex: "#be123c",
  },
  Romantic: {
    color: "bg-red-800",
    bg: "bg-red-50",
    border: "border-red-200/80",
    text: "text-red-900",
    hex: "#991b1b",
  },
  "Late Romantic": {
    color: "bg-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200/80",
    text: "text-purple-900",
    hex: "#6d28d9",
  },
  Impressionist: {
    color: "bg-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200/80",
    text: "text-teal-900",
    hex: "#0f766e",
  },
  "20th Century": {
    color: "bg-slate-700",
    bg: "bg-slate-100",
    border: "border-slate-300/80",
    text: "text-slate-900",
    hex: "#334155",
  },
};

export const RELATION_META: Record<
  string,
  { label: string; reverseLabel: string; hex: string; badgeClass: string }
> = {
  teacher_of: {
    label: "Teacher of",
    reverseLabel: "Studied with",
    hex: "#b45309",
    badgeClass: "bg-amber-50 text-amber-900 border-amber-200",
  },
  influenced: {
    label: "Influenced",
    reverseLabel: "Influenced by",
    hex: "#1d4ed8",
    badgeClass: "bg-blue-50 text-blue-900 border-blue-200",
  },
  admired: {
    label: "Championed / Admired",
    reverseLabel: "Championed by",
    hex: "#047857",
    badgeClass: "bg-emerald-50 text-emerald-900 border-emerald-200",
  },
  contemporary_of: {
    label: "Contemporary of",
    reverseLabel: "Contemporary of",
    hex: "#6b7280",
    badgeClass: "bg-stone-100 text-stone-800 border-stone-200",
  },
  rival_of: {
    label: "Artistic Rival of",
    reverseLabel: "Artistic Rival of",
    hex: "#b91c1c",
    badgeClass: "bg-red-50 text-red-900 border-red-200",
  },
  collaborated_with: {
    label: "Collaborated with",
    reverseLabel: "Collaborated with",
    hex: "#7c3aed",
    badgeClass: "bg-violet-50 text-violet-900 border-violet-200",
  },
};

export function getEraStyle(era: string) {
  return (
    ERA_META[era] ?? {
      color: "bg-stone-600",
      bg: "bg-stone-100",
      border: "border-stone-200",
      text: "text-stone-800",
      hex: "#57534e",
    }
  );
}

export function formatLifespan(birthYear: number, deathYear: number | null) {
  return deathYear ? `${birthYear}–${deathYear}` : `b. ${birthYear}`;
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
