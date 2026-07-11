"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/avatar";
import { completeProfile, uploadAttachment, resolveMediaUrl, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";

export default function SetupPage() {
  const router = useRouter();
  const { user, token, setUser } = useAuthStore();
  const [displayName, setDisplayName] = React.useState(user?.display_name ?? "");
  const [username, setUsername] = React.useState(user?.username ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(user?.avatar_url ?? null);
  const [uploading, setUploading] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  async function handleAvatarFile(file: File) {
    setUploading(true);
    try {
      const uploaded = await uploadAttachment(file);
      setAvatarUrl(uploaded.url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await completeProfile({
        display_name: displayName.trim(),
        username: username.trim() || undefined,
        avatar_url: avatarUrl,
      });
      setUser(res.user);
      router.push("/");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Couldn't save your profile.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Profile setup</h2>
      <p className="mb-6 text-sm text-muted-foreground">Choose the name and photo your contacts will see.</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <UserAvatar
              id={user?.id ?? 0}
              name={displayName || "?"}
              src={avatarUrl ? resolveMediaUrl(avatarUrl) : undefined}
              className="h-20 w-20 text-2xl"
            />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAvatarFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-xs text-signal-blue hover:underline disabled:opacity-50"
          >
            {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Add photo"}
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            autoFocus
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">Username (optional)</Label>
          <Input
            id="username"
            placeholder="yourname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" size="lg" disabled={loading || uploading || !displayName.trim()}>
          {loading ? "Saving…" : "Finish"}
        </Button>
      </form>
    </div>
  );
}
