"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crown, FileText, Image as ImageIcon, LogOut, UserMinus, UserPlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MemberPicker } from "@/components/conversation/MemberPicker";
import { ChatColorPicker } from "@/components/conversation/ChatColorPicker";
import { ContactEditor } from "@/components/conversation/ContactEditor";
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
  useConversationMedia,
  usePatchDisappearing,
  usePatchChatColor,
  resolveMediaUrl,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";
import { conversationAvatar, conversationTitle } from "@/lib/conversation-utils";
import { formatLastSeen, DISAPPEARING_OPTIONS } from "@/lib/time";
import { usePresenceStore } from "@/lib/store/presence";
import type { Conversation, User } from "@/lib/types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

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
  const patchDisappearing = usePatchDisappearing();
  const patchChatColor = usePatchChatColor();
  const [addOpen, setAddOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<User[]>([]);

  const members = conversation.members ?? [];
  const self = members.find((m) => m.user_id === selfId);
  const other = members.find((m) => m.user_id !== selfId);
  const isAdmin = self?.role === "admin";
  const isGroup = conversation.type === "group";
  const title = conversationTitle(conversation, selfId);
  const avatar = conversationAvatar(conversation, selfId);

  const { data: media } = useConversationMedia(open ? conversation.id : null);

  function handleDisappearingChange(value: string) {
    const seconds = Number(value);
    patchDisappearing.mutate({ id: conversation.id, seconds: seconds === 0 ? null : seconds });
  }

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
              {!isGroup && other ? (
                <div className="text-xs text-muted-foreground">
                  {isOnline(other.user_id)
                    ? "online"
                    : formatLastSeen(lastSeen(other.user_id) ?? other.user?.last_seen_at ?? null)}
                </div>
              ) : null}
            </div>

            <Separator />

            {!isGroup && other ? <ContactEditor userId={other.user_id} /> : null}

            {!isGroup ? <Separator /> : null}

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
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Media &amp; files
              </div>
              <Tabs defaultValue="media">
                <TabsList>
                  <TabsTrigger value="media">Media</TabsTrigger>
                  <TabsTrigger value="files">Files</TabsTrigger>
                </TabsList>
                <TabsContent value="media">
                  {media && media.images.length > 0 ? (
                    <div className="grid grid-cols-3 gap-1.5">
                      {media.images.map((m) =>
                        m.attachment ? (
                          <a
                            key={m.id}
                            href={resolveMediaUrl(m.attachment.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="block aspect-square overflow-hidden rounded-md bg-bg-panel"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={resolveMediaUrl(m.attachment.url)}
                              alt={m.attachment.filename}
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ) : null
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-6 text-xs text-muted-foreground">
                      <ImageIcon className="h-6 w-6" />
                      No media yet
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="files">
                  {media && media.files.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {media.files.map((m) =>
                        m.attachment ? (
                          <a
                            key={m.id}
                            href={resolveMediaUrl(m.attachment.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2.5 rounded-lg px-1 py-2 hover:bg-bg-hover"
                          >
                            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-foreground">{m.attachment.filename}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatBytes(m.attachment.size_bytes)}
                              </div>
                            </div>
                          </a>
                        ) : null
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-6 text-xs text-muted-foreground">
                      <FileText className="h-6 w-6" />
                      No files yet
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <Separator />

            <div className="px-5 py-4">
              <Label htmlFor="disappearing-select" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Disappearing messages
              </Label>
              <select
                id="disappearing-select"
                value={String(conversation.disappearing_seconds ?? 0)}
                onChange={(e) => handleDisappearingChange(e.target.value)}
                className="w-full rounded-md border border-border bg-bg-panel px-2.5 py-2 text-sm text-foreground"
              >
                {DISAPPEARING_OPTIONS.map((opt) => (
                  <option key={opt.label} value={String(opt.seconds ?? 0)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <Separator />

            <div className="px-5 py-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Chat color
              </div>
              <ChatColorPicker
                value={self?.chat_color ?? null}
                onChange={(color) => patchChatColor.mutate({ id: conversation.id, color })}
              />
            </div>

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
