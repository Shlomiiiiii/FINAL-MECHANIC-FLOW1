"use client";

import { Bell, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SessionUser } from "@/types";

interface TopbarProps {
  user: SessionUser;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Topbar({ user, title, subtitle, actions }: TopbarProps) {
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-background flex-shrink-0 pl-14 md:pl-6 pr-4 md:pr-6 pr-[max(1rem,env(safe-area-inset-right))]">
      {/* Title area */}
      <div className="flex-1 min-w-0">
        {title ? (
          <div>
            <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
        ) : (
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {greeting()}, {user.fullName.split(" ")[0]}
            </h1>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative hidden md:block">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search... (⌘K)"
          className="pl-8 h-8 w-56 text-xs bg-muted border-0 focus-visible:ring-1"
        />
      </div>

      {/* Actions */}
      {actions && <div className="flex items-center gap-2">{actions}</div>}

      {/* Notifications */}
      <Button variant="ghost" size="icon-sm" className="relative">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive border border-background" />
      </Button>
    </header>
  );
}
