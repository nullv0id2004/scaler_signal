"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/ui/avatar";
import { useConversations, resolveMediaUrl } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";
import { conversationTitle, conversationAvatar } from "@/lib/conversation-utils";
import { forwardMessage } from "@/lib/ws";
import { cn } from "@/lib/utils";

export function ForwardDialog({
  open,
  onOpenChange,
  messageId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: number;
}) {
  const selfId = useAuthStore((s) => s.user?.id ?? -1);
  const { data: conversations } = useConversations();
  const [selected, setSelected] = React.useState<Set<number>>(new Set());

  // Reset selection each time the dialog opens.
  React.useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleForward() {
    if (selected.size === 0) return;
    forwardMessage({ message_id: messageId, conversation_ids: [...selected] });
    toast.success(`Forwarded to ${selected.size} chat${selected.size > 1 ? "s" : ""}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Forward to…</DialogTitle>
          <DialogDescription>Pick one or more conversations.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-72">
          <div className="flex flex-col gap-1 pr-2">
            {(conversations ?? []).map((conv) => {
              const title = conversationTitle(conv, selfId);
              const avatar = conversationAvatar(conv, selfId);
              const isSel = selected.has(conv.id);
              return (
                <button
                  key={conv.id}
                  onClick={() => toggle(conv.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-bg-hover",
                    isSel && "bg-bg-hover"
                  )}
                >
                  <UserAvatar
                    id={avatar.id}
                    name={title}
                    src={avatar.url ? resolveMediaUrl(avatar.url) : undefined}
                    className="h-9 w-9 text-xs"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {title}
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border",
                      isSel ? "border-signal-blue bg-signal-blue text-white" : "border-border"
                    )}
                  >
                    {isSel ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleForward} disabled={selected.size === 0}>
            Forward{selected.size ? ` (${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
