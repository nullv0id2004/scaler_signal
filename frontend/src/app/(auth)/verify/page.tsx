"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyOtp, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handle = searchParams.get("handle") ?? "";
  const setSession = useAuthStore((s) => s.setSession);

  const [otp, setOtp] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!handle) router.replace("/login");
  }, [handle, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim().length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await verifyOtp(handle, otp.trim());
      setSession(res.token, res.user);
      router.push(res.is_new ? "/setup" : "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid code. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Verify {handle}</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter the 6-digit code. This demo uses a fixed OTP: <span className="font-mono text-foreground">123456</span>
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="otp">Verification code</Label>
          <Input
            id="otp"
            autoFocus
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-[0.5em]"
          />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" size="lg" disabled={loading || otp.length !== 6}>
          {loading ? "Verifying…" : "Verify"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.replace("/login")}>
          Use a different account
        </Button>
      </form>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
