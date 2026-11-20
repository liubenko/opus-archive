export const ERA_ORDER = [
  "Medieval",
  "Renaissance",
  "Baroque",
  "Classical",
  "Early Romantic",
  "Romantic",
  "Late Romantic",
  "Impressionist",
  "20th Century",
  "Contemporary",
] as const;

export const ERA_META: Record<
  string,
  { color: string; bg: string; border: string; text: string; hex: string }
> = {
  Medieval: {
    color: "bg-stone-500",
    bg: "bg-stone-100 dark:bg-stone-900/80",
    border: "border-stone-300/80 dark:border-stone-700",
    text: "text-stone-800 dark:text-stone-300",
    hex: "#78716c",
  },
  Renaissance: {
    color: "bg-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/60",
    border: "border-emerald-200/80 dark:border-emerald-800/70",
    text: "text-emerald-900 dark:text-emerald-200",
    hex: "#059669",
  },
  Baroque: {
    color: "bg-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/60",
    border: "border-amber-200/80 dark:border-amber-800/70",
    text: "text-amber-900 dark:text-amber-200",
    hex: "#d97706",
  },
  Classical: {
    color: "bg-sky-600",
    bg: "bg-sky-50 dark:bg-sky-950/60",
    border: "border-sky-200/80 dark:border-sky-800/70",
    text: "text-sky-900 dark:text-sky-200",
    hex: "#0284c7",
  },
  "Early Romantic": {
    color: "bg-rose-600",
    bg: "bg-rose-50 dark:bg-rose-950/60",
    border: "border-rose-200/80 dark:border-rose-800/70",
    text: "text-rose-900 dark:text-rose-200",
    hex: "#e11d48",
  },
  Romantic: {
    color: "bg-red-700",
    bg: "bg-red-50 dark:bg-red-950/60",
    border: "border-red-200/80 dark:border-red-800/70",
    text: "text-red-900 dark:text-red-200",
    hex: "#dc2626",
  },
  "Late Romantic": {
    color: "bg-purple-600",
    bg: "bg-purple-50 dark:bg-purple-950/60",
    border: "border-purple-200/80 dark:border-purple-800/70",
    text: "text-purple-900 dark:text-purple-200",
    hex: "#9333ea",
  },
  Impressionist: {
    color: "bg-teal-600",
    bg: "bg-teal-50 dark:bg-teal-950/60",
    border: "border-teal-200/80 dark:border-teal-800/70",
    text: "text-teal-900 dark:text-teal-200",
    hex: "#0d9488",
  },
  "20th Century": {
    color: "bg-indigo-600",
    bg: "bg-indigo-50 dark:bg-indigo-950/60",
    border: "border-indigo-200/80 dark:border-indigo-800/70",
    text: "text-indigo-900 dark:text-indigo-200",
    hex: "#4f46e5",
  },
  Contemporary: {
    color: "bg-cyan-600",
    bg: "bg-cyan-50 dark:bg-cyan-950/60",
    border: "border-cyan-200/80 dark:border-cyan-800/70",
    text: "text-cyan-900 dark:text-cyan-200",
    hex: "#0891b2",
  },
};

export const RELATION_META: Record<
  string,
  { label: string; reverseLabel: string; hex: string; badgeClass: string }
> = {
  teacher_of: {
    label: "Teacher of",
    reverseLabel: "Studied with",
    hex: "#d97706",
    badgeClass:
      "bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800/70",
  },
  influenced: {
    label: "Influenced",
    reverseLabel: "Influenced by",
    hex: "#3b82f6",
    badgeClass:
      "bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800/70",
  },
  admired: {
    label: "Championed / Admired",
    reverseLabel: "Championed by",
    hex: "#10b981",
    badgeClass:
      "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/70",
  },
  contemporary_of: {
    label: "Contemporary of",
    reverseLabel: "Contemporary of",
    hex: "#9ca3af",
    badgeClass:
      "bg-stone-100 dark:bg-stone-800/80 text-stone-800 dark:text-stone-200 border-stone-200 dark:border-stone-700",
  },
  rival_of: {
    label: "Artistic Rival of",
    reverseLabel: "Artistic Rival of",
    hex: "#ef4444",
    badgeClass:
      "bg-red-50 dark:bg-red-950/60 text-red-900 dark:text-red-200 border-red-200 dark:border-red-800/70",
  },
  collaborated_with: {
    label: "Collaborated with",
    reverseLabel: "Collaborated with",
    hex: "#8b5cf6",
    badgeClass:
      "bg-violet-50 dark:bg-violet-950/60 text-violet-900 dark:text-violet-200 border-violet-200 dark:border-violet-800/70",
  },
};

export function getEraStyle(era: string) {
  return (
    ERA_META[era] ?? {
      color: "bg-stone-500",
      bg: "bg-stone-100 dark:bg-stone-900/80",
      border: "border-stone-200 dark:border-stone-700",
      text: "text-stone-800 dark:text-stone-300",
      hex: "#78716c",
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
