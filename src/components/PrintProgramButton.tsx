"use client";

import { Printer } from "lucide-react";

export function PrintProgramButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
    >
      <Printer className="w-3.5 h-3.5" />
      Print / Save PDF
    </button>
  );
}
