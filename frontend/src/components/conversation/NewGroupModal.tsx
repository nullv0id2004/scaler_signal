"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MemberPicker } from "@/components/conversation/MemberPicker";
import { useCreateConversation } from "@/lib/api";
import type { User } from "@/lib/types";

export function NewGroupModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const createConversation = useCreateConversation();
  const [name, setName] = React.useState("");
  const [selected, setSelected] = React.useState<User[]>([]);

  function toggle(user: User) {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user]
    );
  }

  // Reset the form during render when the dialog closes (avoids a
  // setState-in-effect cascade for state that only needs to reset on close).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setName("");
      setSelected([]);
    }
  }

  async function create() {
    if (!name.trim() || selected.length === 0) return;
    try {
      const conv = await createConversation.mutateAsync({
        type: "group",
        name: name.trim(),
        member_ids: selected.map((u) => u.id),
      });
      onOpenChange(false);
      router.push(`/c/${conv.id}`);
    } catch {
      toast.error("Couldn't create group");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>Name your group and add members.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="groupName">Group name</Label>
          <Input id="groupName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend Trip" />
        </div>
        <MemberPicker selected={selected} onToggle={toggle} />
        <DialogFooter>
          <Button
            onClick={create}
            disabled={!name.trim() || selected.length === 0 || createConversation.isPending}
          >
            {createConversation.isPending ? "Creating…" : `Create${selected.length ? ` (${selected.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
