"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";

const CODE_LENGTH = 6;

function OtpBoxes({
  digits,
  onChangeDigits,
  disabled,
}: {
  digits: string[];
  onChangeDigits: (digits: string[]) => void;
  disabled?: boolean;
}) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  function update(index: number, digit: string) {
    const next = [...digits];
    next[index] = digit;
    onChangeDigits(next);
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      update(index, "");
      return;
    }
    update(index, cleaned[cleaned.length - 1]);
    if (index < CODE_LENGTH - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) {
        update(index, "");
      } else if (index > 0) {
        update(index - 1, "");
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(CODE_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    onChangeDigits(next);
    refs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  return (
    <div className="flex justify-between gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="h-14 w-11 rounded-lg border border-border bg-bg-elevated text-center text-xl font-semibold text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      ))}
    </div>
  );
}

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") ?? "";
  const initialResendIn = Number(searchParams.get("resend_in") ?? "30") || 30;
  const devCode = searchParams.get("dev_code");

  const requestOtp = useAuthStore((s) => s.requestOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);

  const [digits, setDigits] = React.useState<string[]>(() => {
    if (devCode && devCode.length === CODE_LENGTH && /^\d+$/.test(devCode)) {
      return devCode.split("");
    }
    return Array(CODE_LENGTH).fill("");
  });
  const [loading, setLoading] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(initialResendIn);

  React.useEffect(() => {
    if (!phone) router.replace("/login");
  }, [phone, router]);

  React.useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const code = digits.join("");
  const complete = digits.every(Boolean);

  const submit = React.useCallback(
    async (fullCode: string) => {
      setLoading(true);
      setError(null);
      try {
        const { is_new } = await verifyOtp(phone, fullCode);
        router.push(is_new ? "/setup" : "/");
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Invalid code. Try again.";
        setError(message);
        toast.error(message);
        setDigits(Array(CODE_LENGTH).fill(""));
      } finally {
        setLoading(false);
      }
    },
    [phone, router, verifyOtp]
  );

  function handleDigitsChange(next: string[]) {
    setDigits(next);
    if (!loading && next.every(Boolean)) {
      void submit(next.join(""));
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      const { resend_in } = await requestOtp(phone);
      setSecondsLeft(resend_in);
      toast.success("New code sent");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Couldn't resend the code.";
      toast.error(message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Verify your number</h2>
      <p className="mb-1 text-sm text-muted-foreground">
        Enter the 6-digit code sent to <span className="text-foreground">{phone}</span>
      </p>
      {devCode ? (
        <p className="mb-4 text-xs text-muted-foreground">
          Dev code: <span className="font-mono text-foreground">{devCode}</span>
        </p>
      ) : (
        <div className="mb-4" />
      )}
      <div className="flex flex-col gap-4">
        <OtpBoxes digits={digits} onChangeDigits={handleDigitsChange} disabled={loading} />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="button" size="lg" disabled={loading || !complete} onClick={() => void submit(code)}>
          {loading ? "Verifying…" : "Verify"}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-muted-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
            onClick={handleResend}
            disabled={secondsLeft > 0 || resending || loading}
          >
            {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : resending ? "Resending…" : "Resend code"}
          </button>
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/login")}>
            Change number
          </Button>
        </div>
      </div>
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
