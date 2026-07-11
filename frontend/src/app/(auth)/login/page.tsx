"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";

const COUNTRIES = [
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { code: "JP", name: "Japan", dial: "+81", flag: "🇯🇵" },
  { code: "BR", name: "Brazil", dial: "+55", flag: "🇧🇷" },
  { code: "MX", name: "Mexico", dial: "+52", flag: "🇲🇽" },
  { code: "ES", name: "Spain", dial: "+34", flag: "🇪🇸" },
  { code: "IT", name: "Italy", dial: "+39", flag: "🇮🇹" },
  { code: "NG", name: "Nigeria", dial: "+234", flag: "🇳🇬" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬" },
] as const;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export default function LoginPage() {
  const router = useRouter();
  const [dial, setDial] = React.useState<string>(COUNTRIES[0].dial);
  const [number, setNumber] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { token, hydrated, rehydrate, requestOtp } = useAuthStore();

  React.useEffect(() => {
    if (!hydrated) rehydrate();
  }, [hydrated, rehydrate]);

  React.useEffect(() => {
    if (hydrated && token) router.replace("/");
  }, [hydrated, token, router]);

  const nationalDigits = digitsOnly(number);
  const phone = `${dial}${nationalDigits}`;
  const valid = nationalDigits.length >= 4;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError("Enter a valid phone number.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { resend_in, dev_code } = await requestOtp(phone);
      const params = new URLSearchParams({
        phone,
        resend_in: String(resend_in),
      });
      if (dev_code) params.set("dev_code", dev_code);
      router.push(`/verify?${params.toString()}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong. Try again.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Enter your phone number</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        We&apos;ll send a verification code to log you in.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone-number">Phone number</Label>
          <div className="flex gap-2">
            <select
              aria-label="Country code"
              value={dial}
              onChange={(e) => setDial(e.target.value)}
              className="h-11 shrink-0 rounded-lg border border-border bg-bg-elevated px-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.dial}>
                  {c.flag} {c.dial}
                </option>
              ))}
            </select>
            <Input
              id="phone-number"
              autoFocus
              inputMode="numeric"
              placeholder="202 555 0111"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="flex-1"
            />
          </div>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" size="lg" disabled={loading || !valid}>
          {loading ? "Sending code…" : "Send code"}
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Seed accounts are reachable by their phone numbers (e.g. +1 202 555 0111 for
        Alice) — the code will be shown on-screen in dev.
      </p>
    </div>
  );
}
