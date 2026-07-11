"use client";

import * as React from "react";
import { SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendReactionAdd, sendReactionRemove } from "@/lib/ws";
import { useAuthStore } from "@/lib/store/auth";
import type { Reaction } from "@/lib/types";

export const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function ReactionPicker({
  open,
  onOpenChange,
  onPick,
  align = "left",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (emoji: string) => void;
  align?: "left" | "right";
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute -top-11 z-20 flex items-center gap-0.5 rounded-full border border-border bg-bg-elevated px-1.5 py-1 shadow-xl",
        align === "left" ? "left-0" : "right-0"
      )}
    >
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => {
            onPick(emoji);
            onOpenChange(false);
          }}
          className="rounded-full p-1 text-lg transition-transform hover:scale-125"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function ReactionTrigger({
  onPress,
  className,
}: {
  onPress: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onPress}
      title="React"
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full bg-bg-elevated text-muted-foreground shadow hover:text-foreground",
        className
      )}
    >
      <SmilePlus className="h-4 w-4" />
    </button>
  );
}

export function ReactionPills({
  reactions,
  messageId,
  align = "start",
}: {
  reactions: Reaction[];
  messageId: number;
  align?: "start" | "end";
}) {
  const selfId = useAuthStore((s) => s.user?.id ?? -1);
  if (!reactions || reactions.length === 0) return null;

  const grouped = new Map<string, Reaction[]>();
  for (const r of reactions) {
    const list = grouped.get(r.emoji) ?? [];
    list.push(r);
    grouped.set(r.emoji, list);
  }

  function toggle(emoji: string, mine: boolean) {
    if (mine) sendReactionRemove({ message_id: messageId, emoji });
    else sendReactionAdd({ message_id: messageId, emoji });
  }

  return (
    <div className={cn("mt-1 flex flex-wrap gap-1", align === "end" ? "justify-end" : "justify-start")}>
      {Array.from(grouped.entries()).map(([emoji, list]) => {
        const mine = list.some((r) => r.user_id === selfId);
        return (
          <button
            key={emoji}
            onClick={() => toggle(emoji, mine)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors",
              mine
                ? "border-signal-blue bg-signal-blue/15 text-signal-blue"
                : "border-border bg-bg-elevated text-muted-foreground hover:bg-bg-hover"
            )}
          >
            <span>{emoji}</span>
            <span>{list.length}</span>
          </button>
        );
      })}
    </div>
  );
}
