"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/avatar";
import { patchMe, uploadAttachment, resolveMediaUrl, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";
import { PRESET_AVATARS } from "@/lib/preset-avatars";

const ABOUT_MAX = 500;

export default function ProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();

  const [displayName, setDisplayName] = React.useState(user?.display_name ?? "");
  const [about, setAbout] = React.useState(user?.about ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(user?.avatar_url ?? null);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Keep the form in sync if the store user loads/changes after mount.
  React.useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name ?? "");
    setAbout(user.about ?? "");
    setAvatarUrl(user.avatar_url ?? null);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!displayName.trim()) {
      toast.error("Display name can't be empty");
      return;
    }
    setSaving(true);
    try {
      const res = await patchMe({
        display_name: displayName.trim(),
        about: about,
        avatar_url: avatarUrl ?? undefined,
      });
      setUser(res);
      // Conversation lists, the chat header and message-bubble avatars read the
      // member avatar_url from these caches, not the auth store — refetch them
      // so the new photo shows everywhere, not just the own-profile spots.
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation"] });
      toast.success("Profile updated");
      router.push("/");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 items-center gap-3 border-b border-border px-4">
        <button
          onClick={() => router.push("/")}
          className="rounded-full p-1.5 hover:bg-bg-hover"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-foreground">Edit profile</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <form onSubmit={onSubmit} className="mx-auto flex max-w-md flex-col gap-5 p-6">
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
                className="h-24 w-24 text-3xl"
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

            <div className="mt-2 flex flex-col items-center gap-2">
              <span className="text-xs text-muted-foreground">Or pick an avatar</span>
              <div className="flex flex-wrap justify-center gap-2">
                {PRESET_AVATARS.map((preset, i) => {
                  const selected = avatarUrl === preset;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAvatarUrl(preset)}
                      aria-label={`Avatar ${i + 1}`}
                      aria-pressed={selected}
                      className={`rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${
                        selected ? "ring-2 ring-signal-blue ring-offset-2 ring-offset-background" : ""
                      }`}
                    >
                      <img
                        src={preset}
                        alt=""
                        className="h-11 w-11 rounded-full"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="about">About</Label>
            <Textarea
              id="about"
              placeholder="A few words about yourself"
              rows={3}
              maxLength={ABOUT_MAX}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
            />
            <span className="self-end text-xs text-muted-foreground">
              {about.length}/{ABOUT_MAX}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Username</Label>
            <Input value={user?.username ?? ""} disabled readOnly />
            <span className="text-xs text-muted-foreground">Username can’t be changed.</span>
          </div>

          {user?.phone ? (
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input value={user.phone} disabled readOnly />
            </div>
          ) : null}

          <Button type="submit" size="lg" disabled={saving || uploading || !displayName.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </form>
      </div>
    </div>
  );
}
