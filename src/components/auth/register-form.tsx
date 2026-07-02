"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

const PASSWORD_RULES = [
  { label: "At least 10 characters", test: (p: string) => p.length >= 10 },
  { label: "One uppercase letter",   test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter",   test: (p: string) => /[a-z]/.test(p) },
  { label: "One number",             test: (p: string) => /[0-9]/.test(p) },
];

export function RegisterForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [formData, setFormData] = useState({
    organizationName: "",
    slug: "",
    ownerFullName: "",
    ownerEmail: "",
    ownerPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      // Auto-generate slug from organization name until the user edits it directly
      if (name === "organizationName" && !slugEdited) {
        next.slug = slugify(value);
      }
      return next;
    });
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugEdited(true);
    setFormData((prev) => ({ ...prev, slug: slugify(e.target.value) }));
    if (errors.slug) setErrors((prev) => ({ ...prev, slug: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.error?.details) {
          setErrors(
            Object.fromEntries(
              Object.entries(json.error.details).map(([k, v]) => [
                k,
                (v as string[])[0],
              ])
            )
          );
        } else {
          toast({
            title: "Couldn't create your account",
            description: json.error?.message ?? "Please try again.",
            variant: "destructive",
          });
        }
        return;
      }

      // Registration logs the owner straight in
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast({
        title: "Something went wrong",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const passwordValue = formData.ownerPassword;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="organizationName">Shop / business name</Label>
        <Input
          id="organizationName"
          name="organizationName"
          type="text"
          autoComplete="organization"
          placeholder="Santos Mobile Mechanics"
          value={formData.organizationName}
          onChange={handleChange}
          disabled={isLoading}
          className={errors.organizationName ? "border-destructive" : ""}
        />
        {errors.organizationName && (
          <p className="text-xs text-destructive">{errors.organizationName}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Workspace URL</Label>
        <div className="flex items-center">
          <span className="inline-flex items-center h-10 px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground whitespace-nowrap">
            /
          </span>
          <Input
            id="slug"
            name="slug"
            type="text"
            autoComplete="off"
            placeholder="santos-mobile"
            value={formData.slug}
            onChange={handleSlugChange}
            disabled={isLoading}
            className={cn("rounded-l-none", errors.slug ? "border-destructive" : "")}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          This is how you and your team will sign in.
        </p>
        {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ownerFullName">Your name</Label>
        <Input
          id="ownerFullName"
          name="ownerFullName"
          type="text"
          autoComplete="name"
          placeholder="Ray Santos"
          value={formData.ownerFullName}
          onChange={handleChange}
          disabled={isLoading}
          className={errors.ownerFullName ? "border-destructive" : ""}
        />
        {errors.ownerFullName && (
          <p className="text-xs text-destructive">{errors.ownerFullName}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ownerEmail">Email address</Label>
        <Input
          id="ownerEmail"
          name="ownerEmail"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={formData.ownerEmail}
          onChange={handleChange}
          disabled={isLoading}
          className={errors.ownerEmail ? "border-destructive" : ""}
        />
        {errors.ownerEmail && (
          <p className="text-xs text-destructive">{errors.ownerEmail}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ownerPassword">Password</Label>
        <div className="relative">
          <Input
            id="ownerPassword"
            name="ownerPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••••"
            value={formData.ownerPassword}
            onChange={handleChange}
            disabled={isLoading}
            className={errors.ownerPassword ? "border-destructive pr-10" : "pr-10"}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.ownerPassword && (
          <p className="text-xs text-destructive">{errors.ownerPassword}</p>
        )}
        {passwordValue.length > 0 && (
          <ul className="grid grid-cols-2 gap-1 pt-1">
            {PASSWORD_RULES.map((rule) => {
              const ok = rule.test(passwordValue);
              return (
                <li
                  key={rule.label}
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    ok ? "text-green-600" : "text-muted-foreground"
                  )}
                >
                  <Check
                    className={cn(
                      "h-3 w-3 flex-shrink-0",
                      ok ? "opacity-100" : "opacity-30"
                    )}
                  />
                  {rule.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating your account…
          </>
        ) : (
          "Create account"
        )}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        By creating an account you agree to our Terms of Service and Privacy Policy.
      </p>
    </form>
  );
}
