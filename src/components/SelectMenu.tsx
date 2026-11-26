"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectMenuProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  icon?: React.ReactNode;
  ariaLabel?: string;
  align?: "left" | "right";
  variant?: "default" | "inline";
}

export function SelectMenu({
  value,
  onChange,
  options,
  icon,
  ariaLabel,
  align = "left",
  variant = "default",
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected =
    options.find((opt) => opt.value === value) ?? options[0] ?? { value, label: value };

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const buttonClasses =
    variant === "inline"
      ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#141210] border border-stone-300 dark:border-stone-700 text-xs font-semibold text-stone-900 dark:text-[#f3efe6] hover:border-[#9a7432] dark:hover:border-[#d4af6a] transition-colors cursor-pointer"
      : "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#9a7432]/70 dark:hover:border-[#d4af6a]/70 transition-colors cursor-pointer";

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={buttonClasses}
      >
        {icon && <span className="text-stone-400 dark:text-stone-500 shrink-0">{icon}</span>}
        <span className="truncate max-w-[180px]">{selected.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-stone-400 dark:text-stone-500 transition-transform shrink-0 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1.5 min-w-[200px] max-w-[260px] max-h-72 overflow-y-auto rounded-xl bg-white dark:bg-[#1e1b17] border border-stone-200 dark:border-stone-700 shadow-xl p-1.5 space-y-0.5 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  active
                    ? "bg-[#f5eee1] dark:bg-[#2b251c] text-[#8a6526] dark:text-[#e3c27d] font-semibold"
                    : "text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#27231d]"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {active && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
