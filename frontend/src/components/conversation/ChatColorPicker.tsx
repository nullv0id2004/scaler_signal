"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Signal-style bubble color palette. */
export const CHAT_COLORS = [
  "#2c6bed", // blue (default)
  "#e5484d", // red
  "#f2a93b", // amber
  "#2ecc71", // green
  "#0891b2", // teal
  "#7c5cff", // violet
  "#e0529c", // pink
  "#64748b", // slate
];

export function ChatColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (color: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CHAT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          disabled={disabled}
          onClick={() => onChange(color)}
          className="flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-bg-elevated transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-50"
          style={{ backgroundColor: color, boxShadow: value === color ? `0 0 0 2px ${color}` : undefined }}
        >
          {value === color ? <Check className="h-4 w-4 text-white" /> : null}
        </button>
      ))}
      <button
        type="button"
        title="Reset to default"
        disabled={disabled}
        onClick={() => onChange(null)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg-elevated text-muted-foreground transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-50",
          !value && "ring-2 ring-signal-blue"
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
