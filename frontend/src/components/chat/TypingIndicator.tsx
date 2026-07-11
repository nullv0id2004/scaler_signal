"use client";

import { usePresenceStore } from "@/lib/store/presence";

export function TypingIndicator({
  conversationId,
  typingUserNames,
}: {
  conversationId: number;
  typingUserNames: (userId: number) => string | null;
}) {
  const typingMap = usePresenceStore((s) => s.typing[conversationId] ?? {});
  const typingIds = Object.keys(typingMap).map(Number);

  if (typingIds.length === 0) return null;

  const names = typingIds.map((id) => typingUserNames(id)).filter(Boolean) as string[];
  const label =
    names.length === 0
      ? "typing…"
      : names.length === 1
        ? `${names[0]} is typing…`
        : `${names.join(", ")} are typing…`;

  return (
    <div className="flex items-center gap-2 px-4 pb-1 text-xs text-muted-foreground">
      <span className="flex gap-0.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
      </span>
      {label}
    </div>
  );
}
