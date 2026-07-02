"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Car, FileText, CreditCard, Calendar,
  MessageSquare, Camera, Shield, Settings, LogOut,
  Wrench, Menu, X, Bell, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  slug: string;
  customerName: string;
  orgName: string;
  orgLogo?: string | null;
  allowBooking: boolean;
  allowChat: boolean;
  allowPhotos: boolean;
  children: React.ReactNode;
}

const navItems = (slug: string, flags: { allowBooking: boolean; allowChat: boolean; allowPhotos: boolean }) => [
  { href: `/portal/${slug}/dashboard`,    label: "Dashboard",    icon: LayoutDashboard },
  { href: `/portal/${slug}/vehicles`,     label: "My Vehicles",  icon: Car },
  { href: `/portal/${slug}/history`,      label: "Service History", icon: Wrench },
  { href: `/portal/${slug}/invoices`,     label: "Invoices",     icon: FileText },
  { href: `/portal/${slug}/estimates`,    label: "Estimates",    icon: CreditCard },
  ...(flags.allowBooking ? [{ href: `/portal/${slug}/appointments`, label: "Appointments", icon: Calendar }] : []),
  ...(flags.allowChat    ? [{ href: `/portal/${slug}/messages`,     label: "Messages",     icon: MessageSquare }] : []),
  ...(flags.allowPhotos  ? [{ href: `/portal/${slug}/photos`,       label: "My Photos",    icon: Camera }] : []),
  { href: `/portal/${slug}/maintenance`,  label: "Maintenance",  icon: Shield },
  { href: `/portal/${slug}/memberships`,  label: "Membership",   icon: Bell },
  { href: `/portal/${slug}/settings`,     label: "Settings",     icon: Settings },
];

export function PortalLayout({ slug, customerName, orgName, orgLogo, allowBooking, allowChat, allowPhotos, children }: Props) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const nav = navItems(slug, { allowBooking, allowChat, allowPhotos });

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/portal/auth/logout", { method: "POST" });
    router.replace(`/portal/${slug}/login`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 flex-shrink-0">
        {/* Shop header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
          {orgLogo
            ? <img src={orgLogo} alt={orgName} className="h-8 w-8 rounded-lg object-contain" />
            : <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Wrench className="h-4 w-4 text-primary" />
              </div>
          }
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate text-slate-900">{orgName}</p>
            <p className="text-xs text-slate-400 truncate">Customer Portal</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {nav.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={cn(
                  "flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}>
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
                {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
              {customerName.split(" ").map(n => n[0]).join("").slice(0,2)}
            </div>
            <p className="text-sm font-medium text-slate-700 truncate">{customerName}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-slate-500 hover:text-destructive hover:bg-destructive/5"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wrench className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-semibold text-sm text-slate-900">{orgName}</span>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="p-1.5 rounded-lg hover:bg-slate-100">
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setMenuOpen(false)}>
          <div className="absolute top-0 left-0 bottom-0 w-72 bg-white shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="pt-16 pb-4 overflow-y-auto h-full">
              {nav.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg text-sm transition-colors mb-0.5",
                      isActive ? "bg-primary/10 text-primary font-medium" : "text-slate-600 hover:bg-slate-50"
                    )}>
                    <item.icon className="h-4 w-4" />{item.label}
                  </Link>
                );
              })}
              <div className="mx-3 mt-4 pt-4 border-t border-slate-100">
                <button onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-3 py-2 text-sm text-slate-500 hover:text-destructive">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto md:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}
