import { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[45%] bg-sidebar flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">
            MechanicFlow
          </span>
        </div>

        <div>
          <blockquote className="text-sidebar-foreground text-xl leading-relaxed mb-8 font-light">
            "We went from sticky notes and spreadsheets to having everything in
            one place. Invoicing alone saves us 3 hours a week."
          </blockquote>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center text-white font-medium text-sm">
              RS
            </div>
            <div>
              <div className="text-white font-medium text-sm">Ray Santos</div>
              <div className="text-sidebar-foreground text-sm">
                Owner, Santos Mobile Mechanics
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-white text-2xl font-semibold">2,400+</div>
            <div className="text-sidebar-foreground text-sm mt-0.5">
              Businesses
            </div>
          </div>
          <div>
            <div className="text-white text-2xl font-semibold">$48M+</div>
            <div className="text-sidebar-foreground text-sm mt-0.5">
              Invoiced
            </div>
          </div>
          <div>
            <div className="text-white text-2xl font-semibold">4.9★</div>
            <div className="text-sidebar-foreground text-sm mt-0.5">
              Rating
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <span className="font-semibold text-base">MechanicFlow</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground">
              Sign in to your account
            </h1>
            <p className="text-muted-foreground text-sm mt-1.5">
              Enter your workspace and credentials below
            </p>
          </div>

          <Suspense fallback={<div className="h-[300px]" />}>
            <LoginForm />
          </Suspense>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a
              href="/register"
              className="text-primary font-medium hover:underline"
            >
              Start free trial
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
