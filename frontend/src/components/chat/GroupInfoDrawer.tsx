"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crown, LogOut, UserMinus, UserPlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MemberPicker } from "@/components/conversation/MemberPicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useAddMembers,
  useRemoveMember,
  useSetMemberRole,
  useLeaveConversation,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";
import { conversationAvatar, conversationTitle } from "@/lib/conversation-utils";
import { formatLastSeen } from "@/lib/time";
import { usePresenceStore } from "@/lib/store/presence";
import type { Conversation, User } from "@/lib/types";

export function GroupInfoDrawer({
  conversation,
  open,
  onOpenChange,
}: {
  conversation: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const selfId = useAuthStore((s) => s.user?.id ?? -1);
  const isOnline = usePresenceStore((s) => s.isOnline);
  const lastSeen = usePresenceStore((s) => s.lastSeen);

  const addMembers = useAddMembers();
  const removeMember = useRemoveMember();
  const setRole = useSetMemberRole();
  const leaveConversation = useLeaveConversation();
  const [addOpen, setAddOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<User[]>([]);

  const members = conversation.members ?? [];
  const self = members.find((m) => m.user_id === selfId);
  const isAdmin = self?.role === "admin";
  const isGroup = conversation.type === "group";
  const title = conversationTitle(conversation, selfId);
  const avatar = conversationAvatar(conversation, selfId);

  async function handleLeave() {
    try {
      await leaveConversation.mutateAsync(conversation.id);
      onOpenChange(false);
      router.replace("/");
    } catch {
      toast.error("Couldn't leave group");
    }
  }

  async function handleRemove(userId: number) {
    try {
      await removeMember.mutateAsync({ conversationId: conversation.id, userId });
    } catch {
      toast.error("Couldn't remove member");
    }
  }

  async function handlePromote(userId: number) {
    try {
      await setRole.mutateAsync({ conversationId: conversation.id, userId, role: "admin" });
    } catch {
      toast.error("Couldn't update role");
    }
  }

  async function handleAdd() {
    if (picked.length === 0) return;
    try {
      await addMembers.mutateAsync({ conversationId: conversation.id, userIds: picked.map((u) => u.id) });
      setAddOpen(false);
      setPicked([]);
    } catch {
      toast.error("Couldn't add members");
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{isGroup ? "Group info" : "Contact info"}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1">
            <div className="flex flex-col items-center gap-2 px-5 py-6">
              <UserAvatar id={avatar.id} name={title} src={avatar.url} className="h-24 w-24 text-3xl" />
              <div className="text-lg font-semibold text-foreground">{title}</div>
              {!isGroup && members[0] ? (
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const other = members.find((m) => m.user_id !== selfId);
                    if (!other) return null;
                    return isOnline(other.user_id)
                      ? "online"
                      : formatLastSeen(lastSeen(other.user_id) ?? other.user?.last_seen_at ?? null);
                  })()}
                </div>
              ) : null}
            </div>

            <Separator />

            {isGroup ? (
              <div className="px-5 py-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {members.length} members
                  </span>
                  {isAdmin ? (
                    <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}>
                      <UserPlus className="h-4 w-4" /> Add
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                      <UserAvatar
                        id={m.user_id}
                        name={m.user?.display_name ?? "?"}
                        src={m.user?.avatar_url}
                        className="h-9 w-9 text-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {m.user?.display_name}
                          {m.user_id === selfId ? " (you)" : ""}
                        </div>
                        {m.role === "admin" ? (
                          <div className="flex items-center gap-1 text-xs text-signal-blue">
                            <Crown className="h-3 w-3" /> Admin
                          </div>
                        ) : null}
                      </div>
                      {isAdmin && m.user_id !== selfId ? (
                        <div className="flex items-center gap-1">
                          {m.role !== "admin" ? (
                            <Button variant="ghost" size="icon" title="Make admin" onClick={() => handlePromote(m.user_id)}>
                              <Crown className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remove"
                            onClick={() => handleRemove(m.user_id)}
                          >
                            <UserMinus className="h-4 w-4 text-danger" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <Separator />

            <div className="px-5 py-4">
              <Button variant="ghost" className="w-full justify-start text-danger" onClick={handleLeave}>
                <LogOut className="h-4 w-4" /> {isGroup ? "Leave group" : "Delete conversation"}
              </Button>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add members</DialogTitle>
          </DialogHeader>
          <MemberPicker
            selected={picked}
            onToggle={(u) =>
              setPicked((prev) => (prev.some((p) => p.id === u.id) ? prev.filter((p) => p.id !== u.id) : [...prev, u]))
            }
            excludeIds={members.map((m) => m.user_id)}
          />
          <DialogFooter>
            <Button onClick={handleAdd} disabled={picked.length === 0 || addMembers.isPending}>
              {addMembers.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
