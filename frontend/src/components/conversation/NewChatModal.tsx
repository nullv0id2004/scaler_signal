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
} from "@/components/ui/dialog";
import { MemberPicker } from "@/components/conversation/MemberPicker";
import { useCreateConversation } from "@/lib/api";
import type { User } from "@/lib/types";

export function NewChatModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const createConversation = useCreateConversation();

  async function pick(user: User) {
    try {
      const conv = await createConversation.mutateAsync({ type: "direct", member_ids: [user.id] });
      onOpenChange(false);
      router.push(`/c/${conv.id}`);
    } catch {
      toast.error("Couldn't start conversation");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>Search for a contact to start a direct message.</DialogDescription>
        </DialogHeader>
        <MemberPicker selected={[]} onToggle={pick} multi={false} />
      </DialogContent>
    </Dialog>
  );
}
