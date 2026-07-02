"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, Plus, Phone, Mail, Car, MoreHorizontal,
  ArrowUpDown, Filter, Building2, AlertCircle,
} from "lucide-react";
import { getInitials, formatCents, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  isCommercial: boolean;
  email: string | null;
  phonePrimary: string | null;
  tags: string[];
  source: string | null;
  lifetimeRevenueCents: number;
  totalJobCount: number;
  lastServiceAt: Date | null;
  createdAt: Date;
  doNotContact: boolean;
  outstandingBalanceCents: number;
  vehicles: { id: string; year: number | null; make: string | null; model: string | null }[];
  _count: { jobs: number; invoices: number };
}

interface Props {
  initialCustomers: Customer[];
  initialTotal: number;
}

const SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  referral: "Referral",
  repeat: "Repeat",
  "walk-in": "Walk-in",
  website: "Website",
  other: "Other",
};

const TAG_COLORS: Record<string, string> = {
  vip: "bg-yellow-100 text-yellow-800 border-yellow-200",
  fleet: "bg-blue-100 text-blue-800 border-blue-200",
  commercial: "bg-purple-100 text-purple-800 border-purple-200",
  repeat: "bg-green-100 text-green-800 border-green-200",
  "do-not-service": "bg-red-100 text-red-800 border-red-200",
};

function TagBadge({ tag }: { tag: string }) {
  const cls = TAG_COLORS[tag.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border", cls)}>
      {tag}
    </span>
  );
}

export function CustomerListClient({ initialCustomers, initialTotal }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [customers, setCustomers] = useState(initialCustomers);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterTag, setFilterTag] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initialCustomers.length < initialTotal);

  const fetchCustomers = useCallback(
    async (params: {
      search?: string;
      sortBy?: string;
      sortDir?: string;
      tag?: string;
      cursor?: string;
      append?: boolean;
    }) => {
      setIsSearching(true);
      try {
        const qs = new URLSearchParams({
          search: params.search ?? search,
          sortBy: params.sortBy ?? sortBy,
          sortDir: params.sortDir ?? sortDir,
          ...(params.tag ?? filterTag ? { tag: params.tag ?? filterTag } : {}),
          ...(params.cursor ? { cursor: params.cursor } : {}),
          limit: "25",
        });

        const res = await fetch(`/api/customers?${qs}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();

        if (params.append) {
          setCustomers((prev) => [...prev, ...json.data.customers]);
        } else {
          setCustomers(json.data.customers);
        }
        setTotal(json.data.pagination.total);
        setCursor(json.data.pagination.cursor);
        setHasMore(json.data.pagination.hasMore);
      } catch {
        toast({ title: "Failed to load customers", variant: "destructive" });
      } finally {
        setIsSearching(false);
      }
    },
    [search, sortBy, sortDir, filterTag, toast]
  );

  const handleSearch = useCallback(
    async (value: string) => {
      setSearch(value);
      await fetchCustomers({ search: value, cursor: undefined });
    },
    [fetchCustomers]
  );

  const handleSort = (field: string) => {
    const newDir = sortBy === field && sortDir === "desc" ? "asc" : "desc";
    setSortBy(field);
    setSortDir(newDir);
    startTransition(() => {
      fetchCustomers({ sortBy: field, sortDir: newDir });
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Archive ${name}? They will be hidden but their data preserved.`)) return;
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      setTotal((t) => t - 1);
      toast({ title: `${name} archived`, variant: "success" as any });
    } catch {
      toast({ title: "Failed to archive customer", variant: "destructive" });
    }
  };

  const SortButton = ({ field, label }: { field: string; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={cn("h-3 w-3", sortBy === field && "text-primary")} />
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search name, phone, email, company…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              {filterTag ? `Tag: ${filterTag}` : "Filter"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => { setFilterTag(""); fetchCustomers({ tag: "" }); }}>
              All customers
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {["vip", "fleet", "commercial", "repeat"].map((t) => (
              <DropdownMenuItem key={t} onClick={() => { setFilterTag(t); fetchCustomers({ tag: t }); }}>
                <TagBadge tag={t} />
                <span className="ml-2 capitalize">{t}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="text-sm text-muted-foreground ml-auto">
          {isSearching ? "Searching…" : `${total.toLocaleString()} customer${total !== 1 ? "s" : ""}`}
        </div>

        <Button size="sm" className="gap-1.5" asChild>
          <Link href="/customers/new">
            <Plus className="h-3.5 w-3.5" />
            Add customer
          </Link>
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {/* Header */}
        <div className="grid grid-cols-[minmax(200px,1fr)_140px_160px_110px_110px_100px_40px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border">
          <SortButton field="lastName" label="Customer" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vehicles</span>
          <SortButton field="lifetimeRevenueCents" label="Lifetime $" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Balance</span>
          <SortButton field="lastServiceAt" label="Last visit" />
          <span />
        </div>

        {/* Rows */}
        {isSearching && customers.length === 0 ? (
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="grid grid-cols-[minmax(200px,1fr)_140px_160px_110px_110px_100px_40px] gap-3 px-4 py-4 items-center">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              {search ? `No results for "${search}"` : "No customers yet"}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {search ? "Try a different search term." : "Add your first customer to get started."}
            </p>
            {!search && (
              <Button size="sm" asChild>
                <Link href="/customers/new">Add customer</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {customers.map((customer) => {
              const name = `${customer.firstName} ${customer.lastName}`;
              const primaryVehicle = customer.vehicles[0];
              const vehicleLabel = primaryVehicle
                ? `${primaryVehicle.year ?? ""} ${primaryVehicle.make ?? ""} ${primaryVehicle.model ?? ""}`.trim()
                : null;
              const hasOutstanding = customer.outstandingBalanceCents > 0;

              return (
                <div
                  key={customer.id}
                  className="grid grid-cols-[minmax(200px,1fr)_140px_160px_110px_110px_100px_40px] gap-3 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors group"
                >
                  {/* Customer */}
                  <Link href={`/customers/${customer.id}`} className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-sm font-medium text-foreground truncate">{name}</span>
                        {customer.isCommercial && (
                          <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        )}
                        {customer.doNotContact && (
                          <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {customer.companyName && (
                          <span className="text-xs text-muted-foreground truncate">{customer.companyName}</span>
                        )}
                        {customer.tags.slice(0, 2).map((tag) => (
                          <TagBadge key={tag} tag={tag} />
                        ))}
                        {customer.tags.length > 2 && (
                          <span className="text-[10px] text-muted-foreground">+{customer.tags.length - 2}</span>
                        )}
                      </div>
                    </div>
                  </Link>

                  {/* Contact */}
                  <div className="space-y-0.5 min-w-0">
                    {customer.phonePrimary && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{customer.phonePrimary}</span>
                      </div>
                    )}
                    {customer.email && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Vehicle */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {vehicleLabel ? (
                      <>
                        <Car className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-muted-foreground truncate">{vehicleLabel}</span>
                        {customer.vehicles.length > 1 && (
                          <span className="text-xs text-muted-foreground">+{customer.vehicles.length - 1}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">No vehicles</span>
                    )}
                  </div>

                  {/* Lifetime */}
                  <span className="text-sm font-medium text-foreground tabular-nums">
                    {formatCents(customer.lifetimeRevenueCents)}
                  </span>

                  {/* Balance */}
                  <span className={cn("text-sm font-medium tabular-nums", hasOutstanding ? "text-destructive" : "text-muted-foreground")}>
                    {hasOutstanding ? formatCents(customer.outstandingBalanceCents) : "—"}
                  </span>

                  {/* Last visit */}
                  <span className="text-xs text-muted-foreground">
                    {customer.lastServiceAt
                      ? formatDate(customer.lastServiceAt, { month: "short", day: "numeric" })
                      : "Never"}
                  </span>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem asChild>
                        <Link href={`/customers/${customer.id}`}>View profile</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/customers/${customer.id}/edit`}>Edit</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/jobs/new?customerId=${customer.id}`}>New job</Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(customer.id, name)}
                      >
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isSearching}
            onClick={() => fetchCustomers({ cursor: cursor ?? undefined, append: true })}
          >
            {isSearching ? "Loading…" : `Load more (${total - customers.length} remaining)`}
          </Button>
        </div>
      )}
    </div>
  );
}
