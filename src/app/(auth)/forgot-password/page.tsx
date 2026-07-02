"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [formData, setFormData] = useState({ organizationSlug: "", email: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!res.ok && json.error?.details) {
        setErrors(
          Object.fromEntries(
            Object.entries(json.error.details).map(([k, v]) => [k, (v as string[])[0]])
          )
        );
        return;
      }
      setSent(true);
    } catch {
      setErrors({ email: "Something went wrong. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <span className="font-semibold text-base">MechanicFlow</span>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-50 mb-4">
              <MailCheck className="h-6 w-6 text-green-600" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">Check your email</h1>
            <p className="text-muted-foreground text-sm mb-6">
              If an account exists for that email, we've sent a link to reset your password. The link expires in 30 minutes.
            </p>
            <a href="/login" className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </a>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-foreground">Forgot password?</h1>
              <p className="text-muted-foreground text-sm mt-1.5">
                Enter your workspace and email, and we'll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="organizationSlug">Workspace</Label>
                <Input
                  id="organizationSlug"
                  name="organizationSlug"
                  type="text"
                  placeholder="your-shop-name"
                  value={formData.organizationSlug}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={errors.organizationSlug ? "border-destructive" : ""}
                />
                {errors.organizationSlug && <p className="text-xs text-destructive">{errors.organizationSlug}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm">
              <a href="/login" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
