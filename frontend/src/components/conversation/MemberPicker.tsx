"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/ui/avatar";
import { useSearchUsers } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

export function MemberPicker({
  selected,
  onToggle,
  multi = true,
  excludeIds = [],
}: {
  selected: User[];
  onToggle: (user: User) => void;
  multi?: boolean;
  excludeIds?: number[];
}) {
  const [query, setQuery] = React.useState("");
  const selfId = useAuthStore((s) => s.user?.id ?? -1);
  const { data: results, isFetching } = useSearchUsers(query);

  const excluded = new Set([selfId, ...excludeIds]);
  const list = (results ?? []).filter((u) => !excluded.has(u.id));
  const selectedIds = new Set(selected.map((u) => u.id));

  return (
    <div className="flex flex-col gap-3">
      <Input
        autoFocus
        placeholder="Search by username or name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {multi && selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <button
              key={u.id}
              onClick={() => onToggle(u)}
              className="flex items-center gap-1.5 rounded-full bg-bg-active px-2.5 py-1 text-xs text-foreground hover:bg-bg-hover"
            >
              {u.display_name} ✕
            </button>
          ))}
        </div>
      ) : null}
      <ScrollArea className="h-64 rounded-lg border border-border">
        <div className="flex flex-col gap-0.5 p-1.5">
          {query.trim().length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              Type to search contacts
            </div>
          ) : isFetching ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">Searching…</div>
          ) : list.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">No users found</div>
          ) : (
            list.map((u) => {
              const isSelected = selectedIds.has(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => onToggle(u)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-bg-hover",
                    isSelected && "bg-bg-active"
                  )}
                >
                  <UserAvatar id={u.id} name={u.display_name} src={u.avatar_url} className="h-9 w-9 text-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{u.display_name}</div>
                    <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
                  </div>
                  {isSelected ? <Check className="h-4 w-4 text-signal-blue" /> : null}
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
