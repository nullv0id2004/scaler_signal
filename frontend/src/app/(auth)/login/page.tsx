"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestOtp, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";

export default function LoginPage() {
  const router = useRouter();
  const [handle, setHandle] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { token, hydrated, rehydrate } = useAuthStore();

  React.useEffect(() => {
    if (!hydrated) rehydrate();
  }, [hydrated, rehydrate]);

  React.useEffect(() => {
    if (hydrated && token) router.replace("/");
  }, [hydrated, token, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await requestOtp({ handle: handle.trim() });
      router.push(`/verify?handle=${encodeURIComponent(handle.trim())}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Enter your username or phone</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        We&apos;ll send a verification code to log you in.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="handle">Username or phone</Label>
          <Input
            id="handle"
            autoFocus
            placeholder="alice or +1-202-555-0111"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" size="lg" disabled={loading || !handle.trim()}>
          {loading ? "Sending code…" : "Continue"}
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Try seed users: alice, bob, carol, david, emma, frank, grace
      </p>
    </div>
  );
}
