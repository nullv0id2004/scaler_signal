"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/avatar";
import { completeProfile, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";

export default function SetupPage() {
  const router = useRouter();
  const { user, token, setUser } = useAuthStore();
  const [displayName, setDisplayName] = React.useState(user?.display_name ?? "");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await completeProfile(displayName.trim());
      setUser(res.user);
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your profile.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Profile setup</h2>
      <p className="mb-6 text-sm text-muted-foreground">Choose the name your contacts will see.</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex justify-center">
          <UserAvatar
            id={user?.id ?? 0}
            name={displayName || "?"}
            className="h-20 w-20 text-2xl"
          />
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
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" size="lg" disabled={loading || !displayName.trim()}>
          {loading ? "Saving…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}
