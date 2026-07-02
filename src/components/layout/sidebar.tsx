"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Car, ClipboardList, FileText,
  Receipt, Calendar, Package, BarChart3, Settings, Wrench,
  LogOut, ChevronRight, BadgeDollarSign, UserCog, Radio, Menu, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import type { SessionUser } from "@/types";

const NAV_ITEMS = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/customers",   label: "Customers",   icon: Users },
  { href: "/vehicles",    label: "Vehicles",    icon: Car },
  { href: "/jobs",        label: "Jobs",        icon: ClipboardList },
  { href: "/estimates",   label: "Estimates",   icon: FileText },
  { href: "/invoices",    label: "Invoices",    icon: Receipt },
  { href: "/calendar",    label: "Calendar",    icon: Calendar },
  { href: "/dispatch",    label: "Dispatch",    icon: Radio },
  { href: "/inventory",   label: "Inventory",   icon: Package },
  { href: "/memberships", label: "Memberships", icon: BadgeDollarSign },
  { href: "/team",        label: "Team",        icon: UserCog },
  { href: "/reports",     label: "Reports",     icon: BarChart3 },
];

interface SidebarProps {
  user: SessionUser;
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto py-3 px-2">
      <div className="space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors touch-manipulation",
                isActive
                  ? "bg-sidebar-accent text-white"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white"
              )}
            >
              <item.icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-primary" : "text-sidebar-foreground")} />
              {item.label}
              {isActive && <ChevronRight className="ml-auto h-3 w-3 text-sidebar-foreground" />}
            </Link>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-sidebar-border">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors touch-manipulation",
            pathname.startsWith("/settings")
              ? "bg-sidebar-accent text-white"
              : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white"
          )}
        >
          <Settings className="h-4 w-4 flex-shrink-0 text-sidebar-foreground" />
          Settings
        </Link>
      </div>
    </nav>
  );
}

function UserFooter({ user }: { user: SessionUser }) {
  return (
    <div className="border-t border-sidebar-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={undefined} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs">
            {getInitials(user.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-white truncate">{user.fullName}</div>
          <div className="text-xs text-sidebar-foreground truncate capitalize">
            {user.role.toLowerCase().replace("_", " ")}
          </div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-white transition-colors touch-manipulation"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function SidebarHeader({ orgName }: { orgName: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border flex-shrink-0">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary flex-shrink-0">
        <Wrench className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white truncate">MechanicFlow</div>
        <div className="text-xs text-sidebar-foreground truncate">{orgName}</div>
      </div>
    </div>
  );
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      {/* ── Desktop sidebar — always visible ── */}
      <aside className="hidden md:flex h-screen w-60 flex-col bg-sidebar border-r border-sidebar-border flex-shrink-0">
        <SidebarHeader orgName={user.organizationName} />
        <NavLinks pathname={pathname} />
        <UserFooter user={user} />
      </aside>

      {/* ── Mobile: hamburger button in top-left ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-0 left-0 z-40 flex items-center justify-center h-14 w-14 text-foreground touch-manipulation"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* ── Mobile: backdrop ── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile: slide-in drawer ── */}
      <aside
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-72 bg-sidebar border-r border-sidebar-border transform transition-transform duration-250 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Drawer header with close button */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border flex-shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary flex-shrink-0">
            <Wrench className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate">MechanicFlow</div>
            <div className="text-xs text-sidebar-foreground truncate">{user.organizationName}</div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors touch-manipulation flex-shrink-0"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        <UserFooter user={user} />
      </aside>
    </>
  );
}
