"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Wrench, Mail, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "email" | "otp";

export default function PortalLoginPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  const [step,      setStep]      = useState<Step>("email");
  const [email,     setEmail]     = useState("");
  const [otp,       setOtp]       = useState(["","","","","",""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), slug: params.slug }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 200) {
        setError(json.error ?? "Failed to send code");
        return;
      }
      setStep("otp");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    setError(null);
    // Auto-advance
    if (value && index < 5) {
      const el = document.getElementById(`otp-${index + 1}`);
      el?.focus();
    }
    // Auto-submit when all 6 filled
    if (value && index === 5 && next.every(d => d)) {
      handleVerifyOtp(next.join(""));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleVerifyOtp = async (code?: string) => {
    const finalCode = code ?? otp.join("");
    if (finalCode.length < 6) { setError("Enter all 6 digits"); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: finalCode, slug: params.slug }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Invalid code"); return; }
      router.replace(`/portal/${params.slug}/dashboard`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Wrench className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to view your service history</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {step === "email" ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                  autoComplete="email"
                  className="h-11"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full h-11 gap-2" disabled={isLoading || !email.trim()}>
                {isLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code…</>
                  : <><Mail className="h-4 w-4" /> Send login code</>}
              </Button>
              <p className="text-xs text-center text-slate-400">
                We'll send a 6-digit code to your email. No password needed.
              </p>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Enter the 6-digit code sent to</p>
                <p className="text-sm text-primary font-semibold mt-0.5">{email}</p>
              </div>

              <div className="flex gap-2 justify-center">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className={cn(
                      "h-14 w-12 text-center text-xl font-bold rounded-xl border-2 transition-colors",
                      "focus:outline-none focus:border-primary",
                      digit ? "border-primary bg-primary/5" : "border-slate-200 bg-white",
                      error ? "border-destructive" : ""
                    )}
                  />
                ))}
              </div>

              {error && <p className="text-sm text-destructive text-center">{error}</p>}

              <Button
                onClick={() => handleVerifyOtp()}
                className="w-full h-11 gap-2"
                disabled={isLoading || otp.some(d => !d)}
              >
                {isLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
                  : <><ArrowRight className="h-4 w-4" /> Sign in</>}
              </Button>

              <button
                onClick={() => { setStep("email"); setOtp(["","","","","",""]); setError(null); }}
                className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                ← Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
