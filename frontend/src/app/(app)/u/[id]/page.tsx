"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useUser, resolveMediaUrl } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";
import { formatLastSeen } from "@/lib/time";

export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);
  const selfId = useAuthStore((s) => s.user?.id ?? -1);
  const isSelf = userId === selfId;

  const { data: user, isLoading, isError } = useUser(Number.isFinite(userId) ? userId : null);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 items-center gap-3 border-b border-border px-4">
        <button
          onClick={() => router.back()}
          className="rounded-full p-1.5 hover:bg-bg-hover"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-foreground">Profile</h1>
        {isSelf ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => router.push("/profile")}
          >
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : isError || !user ? (
          <p className="p-6 text-sm text-muted-foreground">User not found.</p>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6">
            <UserAvatar
              id={user.id}
              name={user.display_name || "?"}
              src={user.avatar_url ? resolveMediaUrl(user.avatar_url) : undefined}
              className="h-28 w-28 text-4xl"
            />
            <div className="text-center">
              <div className="text-xl font-semibold text-foreground">{user.display_name}</div>
              <div className="text-sm text-muted-foreground">@{user.username}</div>
            </div>

            <div className="w-full divide-y divide-border rounded-xl border border-border">
              {user.about ? (
                <div className="px-4 py-3">
                  <div className="text-xs uppercase text-muted-foreground">About</div>
                  <div className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{user.about}</div>
                </div>
              ) : null}
              <div className="px-4 py-3">
                <div className="text-xs uppercase text-muted-foreground">Last seen</div>
                <div className="mt-0.5 text-sm text-foreground">
                  {formatLastSeen(user.last_seen_at)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
