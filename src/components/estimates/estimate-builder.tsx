"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Loader2, GripVertical, Search,
  Wrench, Package, Tag, Percent, ChevronDown, ChevronUp,
  FileText, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BUILTIN_TEMPLATES, type BuiltInTemplate } from "@/lib/estimate-templates";

interface LineItem {
  _id: string;
  itemType: "LABOR" | "PART" | "FEE" | "DISCOUNT";
  description: string;
  quantity: number;
  unitCostCents: number;
  unitPriceCents: number;
  taxable: boolean;
  category?: string;
  warranty?: string;
  laborHours?: number;
  inventoryItemId?: string;
}

interface InventoryResult {
  id: string;
  name: string;
  partNumber?: string | null;
  sellPriceCents: number;
  unitCostCents: number;
  quantityOnHand: number;
  category?: string | null;
}

interface Props {
  mode: "create" | "edit";
  estimateId?: string;
  customerId: string;
  vehicleId?: string;
  jobId?: string;
  organization: {
    taxRatePct: number;
    laborRateCents: number;
    taxLabel: string;
    invoiceTerms?: string | null;
  };
  defaultValues?: {
    title?: string;
    notes?: string;
    warrantyText?: string;
    expiresAt?: string;
    depositCents?: number;
    lineItems?: LineItem[];
  };
}

let idCounter = 0;
const uid = () => `li_${++idCounter}_${Math.random().toString(36).slice(2, 6)}`;

const ITEM_TYPE_CONFIG = {
  LABOR: { label: "Labor", icon: Wrench, color: "text-blue-600", bg: "bg-blue-50" },
  PART: { label: "Part", icon: Package, color: "text-green-600", bg: "bg-green-50" },
  FEE: { label: "Fee", icon: Tag, color: "text-purple-600", bg: "bg-purple-50" },
  DISCOUNT: { label: "Discount", icon: Percent, color: "text-red-600", bg: "bg-red-50" },
};

const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  oil_change: "Oil Change", brakes: "Brakes", tires: "Tires",
  transmission: "Transmission", ac: "A/C", cooling: "Cooling",
  engine: "Engine", suspension: "Suspension", diagnostics: "Diagnostics",
  inspection: "Inspection", custom: "Custom",
};

function formatCentsInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
function parseCentsInput(val: string): number {
  return Math.round(parseFloat(val.replace(/[^0-9.]/g, "") || "0") * 100);
}
function fmtDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function EstimateBuilder({
  mode, estimateId, customerId, vehicleId, jobId, organization, defaultValues,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState(defaultValues?.title ?? "");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [warrantyText, setWarrantyText] = useState(defaultValues?.warrantyText ?? "");
  const [expiresAt, setExpiresAt] = useState(defaultValues?.expiresAt ?? "");
  const [depositCents, setDepositCents] = useState(defaultValues?.depositCents ?? 0);
  const [depositInput, setDepositInput] = useState(defaultValues?.depositCents ? formatCentsInput(defaultValues.depositCents) : "");

  const [lineItems, setLineItems] = useState<LineItem[]>(
    (defaultValues?.lineItems ?? []).map((li) => ({ ...li, _id: uid() }))
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryResults, setInventoryResults] = useState<InventoryResult[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const taxRate = organization.taxRatePct;

  // Totals
  const subtotal = lineItems.reduce((s, li) => s + Math.round(li.unitPriceCents * li.quantity), 0);
  const taxableSubtotal = lineItems
    .filter((li) => li.taxable && li.itemType !== "DISCOUNT")
    .reduce((s, li) => s + Math.round(li.unitPriceCents * li.quantity), 0);
  const tax = Math.round(taxableSubtotal * taxRate);
  const total = subtotal + tax - depositCents;

  const addItem = (type: LineItem["itemType"]) => {
    const defaults: Partial<LineItem> = {};
    if (type === "LABOR") {
      defaults.unitPriceCents = organization.laborRateCents;
      defaults.laborHours = 1;
      defaults.category = "Labor";
    } else if (type === "DISCOUNT") {
      defaults.unitPriceCents = -1000;
      defaults.taxable = false;
    }
    setLineItems((prev) => [
      ...prev,
      {
        _id: uid(),
        itemType: type,
        description: "",
        quantity: 1,
        unitCostCents: 0,
        unitPriceCents: 0,
        taxable: type !== "DISCOUNT",
        ...defaults,
      },
    ]);
  };

  const updateItem = (id: string, field: keyof LineItem, value: unknown) => {
    setLineItems((prev) => prev.map((li) => li._id === id ? { ...li, [field]: value } : li));
  };

  const removeItem = (id: string) => {
    setLineItems((prev) => prev.filter((li) => li._id !== id));
  };

  const applyTemplate = (tpl: BuiltInTemplate) => {
    setTitle(tpl.defaultTitle);
    setNotes(tpl.defaultNotes);
    setWarrantyText(tpl.defaultWarranty);
    setLineItems(tpl.lineItems.map((li) => ({
      _id: uid(),
      itemType: li.itemType,
      description: li.description,
      quantity: li.quantity,
      unitCostCents: 0,
      unitPriceCents: li.unitPriceCents,
      taxable: li.taxable,
      category: li.category,
      laborHours: li.laborHours,
    })));
    setShowTemplates(false);
    toast({ title: `Template applied: ${tpl.name}` });
  };

  const searchInventory = async (q: string) => {
    if (!q.trim()) { setInventoryResults([]); return; }
    setInventoryLoading(true);
    try {
      const res = await fetch(`/api/inventory?search=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const json = await res.json();
        setInventoryResults(json.data?.items ?? []);
      }
    } catch {} finally {
      setInventoryLoading(false);
    }
  };

  const addInventoryItem = (item: InventoryResult) => {
    setLineItems((prev) => [
      ...prev,
      {
        _id: uid(),
        itemType: "PART",
        description: item.name,
        quantity: 1,
        unitCostCents: item.unitCostCents,
        unitPriceCents: item.sellPriceCents,
        taxable: true,
        category: item.category ?? "Parts",
        inventoryItemId: item.id,
      },
    ]);
    setShowInventory(false);
    setInventorySearch("");
    setInventoryResults([]);
  };

  const handleSubmit = async (asDraft = false) => {
    if (!title.trim()) { toast({ title: "Please enter a title", variant: "destructive" }); return; }
    setIsSubmitting(true);
    try {
      const payload = {
        customerId,
        vehicleId: vehicleId || undefined,
        jobId: jobId || undefined,
        title: title.trim(),
        notes: notes.trim() || undefined,
        warrantyText: warrantyText.trim() || undefined,
        expiresAt: expiresAt || undefined,
        depositCents,
        lineItems: lineItems.map((li) => ({
          itemType: li.itemType,
          inventoryItemId: li.inventoryItemId,
          description: li.description,
          quantity: li.quantity,
          unitCostCents: li.unitCostCents,
          unitPriceCents: li.unitPriceCents,
          taxable: li.taxable,
          category: li.category,
          warranty: li.warranty,
          laborHours: li.laborHours,
        })),
      };

      const url = mode === "create" ? "/api/estimates" : `/api/estimates/${estimateId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed to save", variant: "destructive" }); return; }

      const savedId = json.data.estimate.id;
      toast({ title: mode === "create" ? "Estimate created" : "Changes saved" });
      router.push(`/estimates/${savedId}`);
      router.refresh();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const byCategory = BUILTIN_TEMPLATES.reduce<Record<string, BuiltInTemplate[]>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setShowTemplates(true)}>
          <Zap className="h-3.5 w-3.5 text-yellow-500" /> Quick templates
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => { setShowInventory(true); }}>
          <Package className="h-3.5 w-3.5 text-green-600" /> Add from inventory
        </Button>
      </div>

      {/* Header fields */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Estimate title <span className="text-destructive">*</span></Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Oil change + tire rotation" className={cn(!title && "border-muted")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="expiresAt">Expiry date</Label>
            <Input id="expiresAt" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="warranty">Warranty</Label>
            <Input id="warranty" value={warrantyText} onChange={(e) => setWarrantyText(e.target.value)}
              placeholder="e.g. 12 months / 12,000 miles" />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-semibold">Line items ({lineItems.length})</Label>
          <div className="flex gap-1.5">
            {(["LABOR","PART","FEE","DISCOUNT"] as const).map((type) => {
              const cfg = ITEM_TYPE_CONFIG[type];
              return (
                <button key={type} type="button" onClick={() => addItem(type)}
                  className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors hover:opacity-80", cfg.bg, cfg.color, "border-transparent")}>
                  <cfg.icon className="h-3 w-3" />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {lineItems.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-xl py-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">No line items yet</p>
            <div className="flex gap-2 justify-center">
              <Button type="button" size="sm" variant="outline" onClick={() => addItem("LABOR")} className="gap-1.5">
                <Wrench className="h-3.5 w-3.5" /> Add labor
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => addItem("PART")} className="gap-1.5">
                <Package className="h-3.5 w-3.5" /> Add part
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Column headers */}
            <div className="grid grid-cols-[24px_1fr_80px_110px_110px_90px_32px] gap-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              <span />
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Cost</span>
              <span className="text-right">Price</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            {lineItems.map((li, idx) => {
              const cfg = ITEM_TYPE_CONFIG[li.itemType];
              const lineTotal = Math.round(li.unitPriceCents * li.quantity);
              return (
                <div key={li._id}
                  className="grid grid-cols-[24px_1fr_80px_110px_110px_90px_32px] gap-2 items-start bg-card border border-border rounded-lg p-2 group">
                  {/* Drag handle */}
                  <div className="flex flex-col items-center pt-2 gap-1">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 cursor-grab" />
                    <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded", cfg.bg, cfg.color)}>
                      {li.itemType.slice(0,1)}
                    </span>
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <Input value={li.description}
                      onChange={(e) => updateItem(li._id, "description", e.target.value)}
                      placeholder={li.itemType === "LABOR" ? "Labor description…" : li.itemType === "PART" ? "Part name…" : "Description…"}
                      className="h-8 text-sm" />
                    <div className="flex gap-1.5 flex-wrap">
                      <input
                        type="text"
                        value={li.category ?? ""}
                        onChange={(e) => updateItem(li._id, "category", e.target.value)}
                        placeholder="Category"
                        className="h-6 px-1.5 text-[11px] bg-muted border-0 rounded text-muted-foreground w-24 focus:outline-none"
                      />
                      {li.itemType === "LABOR" && (
                        <input
                          type="number"
                          value={li.laborHours ?? ""}
                          onChange={(e) => updateItem(li._id, "laborHours", parseFloat(e.target.value) || 0)}
                          placeholder="hrs"
                          step="0.25"
                          className="h-6 px-1.5 text-[11px] bg-muted border-0 rounded text-muted-foreground w-16 focus:outline-none"
                        />
                      )}
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                        <input type="checkbox" checked={li.taxable}
                          onChange={(e) => updateItem(li._id, "taxable", e.target.checked)}
                          className="h-3 w-3" />
                        Tax
                      </label>
                    </div>
                  </div>

                  {/* Qty */}
                  <Input type="number" min="0.01" step="0.25"
                    value={li.quantity}
                    onChange={(e) => updateItem(li._id, "quantity", parseFloat(e.target.value) || 1)}
                    className="h-8 text-sm text-right" />

                  {/* Cost */}
                  <Input
                    value={formatCentsInput(li.unitCostCents)}
                    onChange={(e) => updateItem(li._id, "unitCostCents", parseCentsInput(e.target.value))}
                    className="h-8 text-sm text-right"
                    placeholder="$0.00"
                  />

                  {/* Price */}
                  <Input
                    value={formatCentsInput(li.unitPriceCents)}
                    onChange={(e) => updateItem(li._id, "unitPriceCents", parseCentsInput(e.target.value))}
                    className="h-8 text-sm text-right font-medium"
                    placeholder="$0.00"
                  />

                  {/* Total */}
                  <div className="text-sm font-semibold text-right pt-1.5 tabular-nums">
                    {fmtDisplay(lineTotal)}
                  </div>

                  {/* Remove */}
                  <button type="button" onClick={() => removeItem(li._id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity mt-1.5 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add buttons row */}
        {lineItems.length > 0 && (
          <div className="flex gap-2 mt-2">
            {(["LABOR","PART","FEE","DISCOUNT"] as const).map((type) => {
              const cfg = ITEM_TYPE_CONFIG[type];
              return (
                <button key={type} type="button" onClick={() => addItem(type)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs text-muted-foreground border border-dashed border-border hover:border-primary hover:text-primary transition-colors">
                  <Plus className="h-3 w-3" /> {cfg.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Totals summary */}
      <div className="bg-muted/40 rounded-xl border border-border p-5">
        <div className="flex gap-8">
          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="deposit">Deposit required</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input id="deposit" value={depositInput}
                  onChange={(e) => { setDepositInput(e.target.value); setDepositCents(parseCentsInput(e.target.value)); }}
                  className="pl-7 h-9" placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="est-notes">Notes to customer</Label>
              <Textarea id="est-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional information for the customer…" className="min-h-[80px]" />
            </div>
          </div>

          <div className="w-52 flex-shrink-0 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{fmtDisplay(subtotal)}</span>
            </div>
            {tax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{organization.taxLabel ?? "Tax"} ({(taxRate * 100).toFixed(2)}%)</span>
                <span className="tabular-nums">{fmtDisplay(tax)}</span>
              </div>
            )}
            {depositCents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Deposit</span>
                <span className="text-muted-foreground tabular-nums">-{fmtDisplay(depositCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t border-border pt-2">
              <span>Total</span>
              <span className="tabular-nums">{fmtDisplay(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button type="button" onClick={() => handleSubmit(false)} disabled={isSubmitting} className="min-w-36">
          {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : mode === "create" ? "Create estimate" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
      </div>

      {/* Templates Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" /> Quick estimate templates
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Select a template to pre-fill this estimate. You can customize everything after.</p>
          <div className="space-y-5 mt-2">
            {Object.entries(byCategory).map(([cat, templates]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {TEMPLATE_CATEGORY_LABELS[cat] ?? cat}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {templates.map((tpl) => (
                    <button key={tpl.id} type="button" onClick={() => applyTemplate(tpl)}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 text-left transition-colors group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground group-hover:text-primary">{tpl.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span>{tpl.lineItems.length} line item{tpl.lineItems.length !== 1 ? "s" : ""}</span>
                          <span>${(tpl.lineItems.reduce((s,li)=>s+li.unitPriceCents*li.quantity,0)/100).toFixed(2)} base price</span>
                          {tpl.defaultWarranty && <span className="text-green-600">{tpl.defaultWarranty}</span>}
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-primary rotate-[-90deg] flex-shrink-0 mt-0.5" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Inventory Search Dialog */}
      <Dialog open={showInventory} onOpenChange={setShowInventory}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-green-600" /> Add from inventory
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search parts…"
              value={inventorySearch}
              onChange={(e) => { setInventorySearch(e.target.value); searchInventory(e.target.value); }}
              autoFocus
            />
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {inventoryLoading && <div className="text-center py-4 text-sm text-muted-foreground">Searching…</div>}
            {!inventoryLoading && inventoryResults.length === 0 && inventorySearch && (
              <div className="text-center py-4 text-sm text-muted-foreground">No parts found for "{inventorySearch}"</div>
            )}
            {!inventoryLoading && inventoryResults.length === 0 && !inventorySearch && (
              <div className="text-center py-6 text-sm text-muted-foreground">Type to search your inventory…</div>
            )}
            {inventoryResults.map((item) => (
              <button key={item.id} type="button" onClick={() => addInventoryItem(item)}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors text-left">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.name}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    {item.partNumber && <span>{item.partNumber}</span>}
                    {item.category && <span>{item.category}</span>}
                    <span className={cn(Number(item.quantityOnHand) > 0 ? "text-green-600" : "text-destructive")}>
                      {Number(item.quantityOnHand)} in stock
                    </span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-foreground tabular-nums ml-4">
                  ${(item.sellPriceCents / 100).toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
