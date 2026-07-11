"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useContact, useUpdateContact } from "@/lib/api";

/**
 * Editable "Nickname" + "Note" section for a single contact (viewer-scoped).
 * GET/PUT `/contacts/{user_id}`. Used both for a direct conversation's other
 * member and from the per-member profile dialog in a group.
 */
export function ContactEditor({ userId }: { userId: number }) {
  const { data, isLoading } = useContact(userId);
  const updateContact = useUpdateContact();

  const [nickname, setNickname] = React.useState("");
  const [note, setNote] = React.useState("");
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (data && !dirty) {
      setNickname(data.nickname ?? "");
      setNote(data.note ?? "");
    }
  }, [data, dirty]);

  async function handleSave() {
    try {
      await updateContact.mutateAsync({
        userId,
        patch: { nickname: nickname.trim() || null, note: note.trim() || null },
      });
      setDirty(false);
      toast.success("Contact updated");
    } catch {
      toast.error("Couldn't save contact");
    }
  }

  function handleCancel() {
    setNickname(data?.nickname ?? "");
    setNote(data?.note ?? "");
    setDirty(false);
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`nickname-${userId}`}>Nickname</Label>
        <Input
          id={`nickname-${userId}`}
          value={nickname}
          disabled={isLoading}
          onChange={(e) => {
            setNickname(e.target.value);
            setDirty(true);
          }}
          placeholder="Add a nickname"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`note-${userId}`}>Note</Label>
        <Textarea
          id={`note-${userId}`}
          value={note}
          disabled={isLoading}
          onChange={(e) => {
            setNote(e.target.value);
            setDirty(true);
          }}
          placeholder="Add a note"
          rows={2}
        />
      </div>
      {dirty ? (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateContact.isPending}>
            {updateContact.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
