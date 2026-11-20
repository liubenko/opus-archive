"use client";

import { useState } from "react";
import { getEraStyle, getInitials } from "@/lib/constants";

interface ComposerAvatarProps {
  name: string;
  avatarUrl: string | null;
  era: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "w-10 h-10 text-xs",
  md: "w-14 h-14 text-sm",
  lg: "w-20 h-20 text-lg",
  xl: "w-28 h-28 sm:w-36 sm:h-36 text-2xl",
};

export function ComposerAvatar({
  name,
  avatarUrl,
  era,
  size = "md",
  className = "",
}: ComposerAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const eraStyle = getEraStyle(era);

  if (!avatarUrl || hasError) {
    return (
      <div
        className={`${SIZE_CLASSES[size]} rounded-full flex items-center justify-center font-serif font-semibold shrink-0 border ${eraStyle.bg} ${eraStyle.border} ${eraStyle.text} ${className}`}
        aria-label={name}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full overflow-hidden shrink-0 border border-stone-200 dark:border-stone-700/80 bg-stone-100 dark:bg-stone-900 shadow-xs ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl}
        alt={name}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover object-top"
      />
    </div>
  );
}
