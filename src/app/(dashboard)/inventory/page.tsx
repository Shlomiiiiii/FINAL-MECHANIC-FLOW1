"use client";

import { useState, useEffect, useCallback } from "react";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Package, Plus, Search, AlertTriangle, TrendingUp,
  DollarSign, RefreshCw, Edit, Trash2, ChevronRight,
  Truck, Building2, BarChart3, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Tab = "items" | "vendors" | "orders";

function StatCard({ label, value, sub, icon: Icon, color }: any) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-2", color.bg)}>
        <Icon className={cn("h-3.5 w-3.5", color.text)} />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Items tab ────────────────────────────────────────────────────────────────
function ItemsTab() {
  const { toast } = useToast();
  const [items, setItems]     = useState<any[]>([]);
  const [stats, setStats]     = useState<any>(null);
  const [search, setSearch]   = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [lowOnly, setLowOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", partNumber: "", category: "", unitCostCents: "", sellPriceCents: "", quantityOnHand: "", reorderPoint: "", location: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const qs = new URLSearchParams({ ...(search && { search }), ...(category && { category }), ...(lowOnly && { lowStock: "true" }) });
    const res = await fetch(`/api/inventory?${qs}`);
    if (res.ok) {
      const json = await res.json();
      setItems(json.data.items ?? []);
      setStats(json.data.stats);
      setCategories(json.data.categories ?? []);
    }
    setIsLoading(false);
  }, [search, category, lowOnly]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...form,
      unitCostCents:  Math.round(parseFloat(form.unitCostCents || "0") * 100),
      sellPriceCents: Math.round(parseFloat(form.sellPriceCents || "0") * 100),
      quantityOnHand: parseFloat(form.quantityOnHand || "0"),
      reorderPoint:   form.reorderPoint ? parseFloat(form.reorderPoint) : undefined,
    };
    const url    = editItem ? `/api/inventory/${editItem.id}` : "/api/inventory";
    const method = editItem ? "PATCH" : "POST";
    const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json   = await res.json();
    if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); setSaving(false); return; }
    toast({ title: editItem ? "Item updated" : "Item added" });
    setShowForm(false); setEditItem(null); setForm({ name: "", partNumber: "", category: "", unitCostCents: "", sellPriceCents: "", quantityOnHand: "", reorderPoint: "", location: "", notes: "" });
    load();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Archive this item?")) return;
    await fetch(`/api/inventory/${id}`, { method: "DELETE" });
    load();
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name, partNumber: item.partNumber ?? "", category: item.category ?? "", unitCostCents: (item.unitCostCents / 100).toFixed(2), sellPriceCents: (item.sellPriceCents / 100).toFixed(2), quantityOnHand: String(item.quantityOnHand), reorderPoint: item.reorderPoint ? String(item.reorderPoint) : "", location: item.location ?? "", notes: item.notes ?? "" });
    setShowForm(true);
  };

  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Inventory value" value={fmt(stats.totalValue)} icon={DollarSign} color={{ bg: "bg-green-50", text: "text-green-600" }} />
          <StatCard label="Low stock items" value={stats.lowStockCount} sub="At or below reorder point" icon={AlertTriangle} color={{ bg: stats.lowStockCount > 0 ? "bg-amber-50" : "bg-muted", text: stats.lowStockCount > 0 ? "text-amber-600" : "text-muted-foreground" }} />
          <StatCard label="Out of stock" value={stats.outOfStockCount} icon={Package} color={{ bg: stats.outOfStockCount > 0 ? "bg-red-50" : "bg-muted", text: stats.outOfStockCount > 0 ? "text-red-600" : "text-muted-foreground" }} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search parts…" className="pl-9" />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} className="h-11 md:h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c!}>{c}</option>)}
        </select>
        <Button variant={lowOnly ? "default" : "outline"} size="sm" onClick={() => setLowOnly(v => !v)} className="gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> Low stock
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditItem(null); setShowForm(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add part
        </Button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm">{editItem ? "Edit item" : "New inventory item"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">Name *</label><Input value={form.name} onChange={e => setF("name", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Part number</label><Input value={form.partNumber} onChange={e => setF("partNumber", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Category</label><Input value={form.category} onChange={e => setF("category", e.target.value)} placeholder="e.g. Brakes, Filters, Oil" /></div>
            <div><label className="text-xs text-muted-foreground">Location (shelf/bin)</label><Input value={form.location} onChange={e => setF("location", e.target.value)} placeholder="A-12-3" /></div>
            <div><label className="text-xs text-muted-foreground">Cost price ($)</label><Input type="number" min="0" step="0.01" value={form.unitCostCents} onChange={e => setF("unitCostCents", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Sell price ($)</label><Input type="number" min="0" step="0.01" value={form.sellPriceCents} onChange={e => setF("sellPriceCents", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Quantity on hand</label><Input type="number" min="0" value={form.quantityOnHand} onChange={e => setF("quantityOnHand", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Reorder point</label><Input type="number" min="0" value={form.reorderPoint} onChange={e => setF("reorderPoint", e.target.value)} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground">Notes</label><Input value={form.notes} onChange={e => setF("notes", e.target.value)} /></div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !form.name} size="sm">{saving ? "Saving…" : editItem ? "Save changes" : "Add item"}</Button>
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditItem(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Items table */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div className="hidden md:grid grid-cols-[2fr_1fr_80px_80px_80px_80px_60px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <span>Part</span><span>Category</span><span>Location</span><span>Cost</span><span>Price</span><span>Qty</span><span></span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No items found</p>
          </div>
        ) : items.map(item => {
          const isLow = item.reorderPoint !== null && item.quantityOnHand <= item.reorderPoint;
          const isOut = item.quantityOnHand === 0;
          return (
            <div key={item.id} className="flex md:grid md:grid-cols-[2fr_1fr_80px_80px_80px_80px_60px] gap-3 px-4 py-3.5 border-b border-border last:border-b-0 items-center hover:bg-muted/10">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.partNumber && `#${item.partNumber}`}</p>
              </div>
              <span className="hidden md:block text-xs text-muted-foreground">{item.category ?? "—"}</span>
              <span className="hidden md:block text-xs text-muted-foreground">{item.location ?? "—"}</span>
              <span className="hidden md:block text-sm tabular-nums">{fmt(item.unitCostCents)}</span>
              <span className="hidden md:block text-sm tabular-nums">{fmt(item.sellPriceCents)}</span>
              <span className={cn("text-sm font-semibold tabular-nums", isOut ? "text-destructive" : isLow ? "text-amber-600" : "text-foreground")}>
                {item.quantityOnHand}
                {isLow && !isOut && <AlertTriangle className="h-3 w-3 inline ml-1 text-amber-500" />}
              </span>
              <div className="flex gap-1 ml-auto md:ml-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}><Edit className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Vendors tab ──────────────────────────────────────────────────────────────
function VendorsTab() {
  const { toast } = useToast();
  const [vendors, setVendors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", contactName: "", email: "", phone: "", website: "", paymentTerms: "", leadTimeDays: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await fetch("/api/vendors");
    if (res.ok) { const j = await res.json(); setVendors(j.data.vendors ?? []); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, leadTimeDays: form.leadTimeDays ? parseInt(form.leadTimeDays) : undefined }) });
    const json = await res.json();
    if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); setSaving(false); return; }
    toast({ title: "Vendor added" }); setShowForm(false); setForm({ name: "", contactName: "", email: "", phone: "", website: "", paymentTerms: "", leadTimeDays: "", notes: "" }); load();
    setSaving(false);
  };

  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}><Plus className="h-3.5 w-3.5" /> Add vendor</Button>
      </div>
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm">New vendor</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">Company name *</label><Input value={form.name} onChange={e => setF("name", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Contact name</label><Input value={form.contactName} onChange={e => setF("contactName", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Email</label><Input type="email" value={form.email} onChange={e => setF("email", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Phone</label><Input value={form.phone} onChange={e => setF("phone", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Website</label><Input value={form.website} onChange={e => setF("website", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Payment terms</label><Input value={form.paymentTerms} onChange={e => setF("paymentTerms", e.target.value)} placeholder="Net30, COD…" /></div>
            <div><label className="text-xs text-muted-foreground">Lead time (days)</label><Input type="number" min="0" value={form.leadTimeDays} onChange={e => setF("leadTimeDays", e.target.value)} /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving || !form.name}>{saving ? "Saving…" : "Add vendor"}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        : vendors.length === 0 ? <div className="p-12 text-center text-sm text-muted-foreground">No vendors yet</div>
        : vendors.map(v => (
          <div key={v.id} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-b-0 hover:bg-muted/10">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{v.name}</p>
                {v.isPreferred && <Badge variant="secondary" className="text-[10px]">Preferred</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{v.contactName}{v.phone && ` · ${v.phone}`}{v.paymentTerms && ` · ${v.paymentTerms}`}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{v._count.inventoryItems} items</p>
              {v.leadTimeDays && <p>{v.leadTimeDays}d lead time</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Purchase Orders tab ──────────────────────────────────────────────────────
function PurchaseOrdersTab() {
  const { toast } = useToast();
  const [pos, setPos]         = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await fetch("/api/purchase-orders");
    if (res.ok) { const j = await res.json(); setPos(j.data.purchaseOrders ?? []); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const receive = async (id: string) => {
    if (!confirm("Mark this order as fully received? This will update stock quantities.")) return;
    const res = await fetch(`/api/purchase-orders/${id}/receive`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); return; }
    toast({ title: "Stock updated" }); load();
  };

  const STATUS_STYLE: Record<string, string> = {
    DRAFT: "bg-slate-100 text-slate-600",
    ORDERED: "bg-blue-50 text-blue-700",
    PARTIAL: "bg-amber-50 text-amber-700",
    RECEIVED: "bg-green-50 text-green-700",
    CANCELLED: "bg-red-50 text-red-700",
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link href="/inventory/purchase-orders/new">
          <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New order</Button>
        </Link>
      </div>
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        : pos.length === 0 ? (
          <div className="p-12 text-center">
            <Truck className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No purchase orders yet</p>
          </div>
        ) : pos.map(po => (
          <div key={po.id} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-b-0 hover:bg-muted/10">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold">{po.poNumber}</p>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_STYLE[po.status] ?? "bg-muted text-muted-foreground")}>{po.status}</span>
              </div>
              <p className="text-xs text-muted-foreground">{po.vendor.name} · {po.lineItems.length} items · {po.expectedAt && `Expected ${new Date(po.expectedAt).toLocaleDateString()}`}</p>
            </div>
            <p className="text-sm font-bold">{fmt(po.totalCents)}</p>
            {["ORDERED","PARTIAL"].includes(po.status) && (
              <Button size="sm" variant="outline" className="text-xs" onClick={() => receive(po.id)}>Receive</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("items");

  const TABS = [
    { id: "items",  label: "Parts & Supplies", icon: Package },
    { id: "vendors",label: "Vendors",           icon: Building2 },
    { id: "orders", label: "Purchase Orders",   icon: Truck },
  ] as const;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex h-14 items-center gap-4 border-b border-border bg-background px-4 md:px-6 flex-shrink-0 pl-14 md:pl-6">
        <h1 className="text-sm font-semibold flex-1">Inventory</h1>
      </div>
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        <div className="flex gap-0 border-b border-border overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as Tab)}
              className={cn("flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>
        {tab === "items"   && <ItemsTab />}
        {tab === "vendors" && <VendorsTab />}
        {tab === "orders"  && <PurchaseOrdersTab />}
      </main>
    </div>
  );
}
