"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VinDecoder } from "./vin-decoder";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface VehicleFormValues {
  vin: string; year: string; make: string; model: string; trim: string;
  licensePlate: string; colorExterior: string; colorInterior: string;
  engine: string; transmission: string; drivetrain: string; fuelType: string;
  cylinders: string; displacement: string; horsepower: string;
  oilType: string; oilCapacityQt: string; tireSize: string;
  tirePressureFront: string; tirePressureRear: string;
  mileageLastSeen: string; mileageAtPurchase: string;
  purchaseDate: string; warrantyExpiry: string;
  warrantyMiles: string; warrantyNotes: string; notes: string;
}

interface Props {
  mode: "create" | "edit";
  customerId: string;
  vehicleId?: string;
  defaultValues?: Partial<VehicleFormValues>;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1885 }, (_, i) => CURRENT_YEAR + 1 - i);

export function VehicleForm({ mode, customerId, vehicleId, defaultValues }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showVinDecoder, setShowVinDecoder] = useState(false);

  const [form, setForm] = useState<VehicleFormValues>({
    vin: defaultValues?.vin ?? "",
    year: defaultValues?.year ?? "",
    make: defaultValues?.make ?? "",
    model: defaultValues?.model ?? "",
    trim: defaultValues?.trim ?? "",
    licensePlate: defaultValues?.licensePlate ?? "",
    colorExterior: defaultValues?.colorExterior ?? "",
    colorInterior: defaultValues?.colorInterior ?? "",
    engine: defaultValues?.engine ?? "",
    transmission: defaultValues?.transmission ?? "",
    drivetrain: defaultValues?.drivetrain ?? "",
    fuelType: defaultValues?.fuelType ?? "",
    cylinders: defaultValues?.cylinders ?? "",
    displacement: defaultValues?.displacement ?? "",
    horsepower: defaultValues?.horsepower ?? "",
    oilType: defaultValues?.oilType ?? "",
    oilCapacityQt: defaultValues?.oilCapacityQt ?? "",
    tireSize: defaultValues?.tireSize ?? "",
    tirePressureFront: defaultValues?.tirePressureFront ?? "",
    tirePressureRear: defaultValues?.tirePressureRear ?? "",
    mileageLastSeen: defaultValues?.mileageLastSeen ?? "",
    mileageAtPurchase: defaultValues?.mileageAtPurchase ?? "",
    purchaseDate: defaultValues?.purchaseDate ?? "",
    warrantyExpiry: defaultValues?.warrantyExpiry ?? "",
    warrantyMiles: defaultValues?.warrantyMiles ?? "",
    warrantyNotes: defaultValues?.warrantyNotes ?? "",
    notes: defaultValues?.notes ?? "",
  });

  const set = (k: keyof VehicleFormValues, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: "" }));
  };

  const handleVinDecoded = (data: any) => {
    setForm((p) => ({
      ...p,
      vin: data.vin ?? p.vin,
      year: data.year ? String(data.year) : p.year,
      make: data.make ?? p.make,
      model: data.model ?? p.model,
      trim: data.trim ?? p.trim,
      engine: data.engine ?? p.engine,
      cylinders: data.cylinders ? String(data.cylinders) : p.cylinders,
      displacement: data.displacement ?? p.displacement,
      transmission: data.transmission ?? p.transmission,
      drivetrain: data.drivetrain ?? p.drivetrain,
      fuelType: data.fuelType ?? p.fuelType,
      horsepower: data.horsepower ? String(data.horsepower) : p.horsepower,
    }));
    setShowVinDecoder(false);
    toast({ title: "VIN decoded — fields updated from NHTSA data" });
  };

  const buildPayload = () => {
    const p: Record<string, unknown> = {};
    if (form.vin) p.vin = form.vin;
    if (form.year) p.year = parseInt(form.year);
    if (form.make) p.make = form.make;
    if (form.model) p.model = form.model;
    if (form.trim) p.trim = form.trim;
    if (form.licensePlate) p.licensePlate = form.licensePlate;
    if (form.colorExterior) p.colorExterior = form.colorExterior;
    if (form.colorInterior) p.colorInterior = form.colorInterior;
    if (form.engine) p.engine = form.engine;
    if (form.transmission) p.transmission = form.transmission;
    if (form.drivetrain) p.drivetrain = form.drivetrain;
    if (form.fuelType) p.fuelType = form.fuelType;
    if (form.cylinders) p.cylinders = parseInt(form.cylinders);
    if (form.displacement) p.displacement = form.displacement;
    if (form.horsepower) p.horsepower = parseInt(form.horsepower);
    if (form.oilType) p.oilType = form.oilType;
    if (form.oilCapacityQt) p.oilCapacityQt = parseFloat(form.oilCapacityQt);
    if (form.tireSize) p.tireSize = form.tireSize;
    if (form.tirePressureFront) p.tirePressureFront = parseInt(form.tirePressureFront);
    if (form.tirePressureRear) p.tirePressureRear = parseInt(form.tirePressureRear);
    if (form.mileageLastSeen) p.mileageLastSeen = parseInt(form.mileageLastSeen);
    if (form.mileageAtPurchase) p.mileageAtPurchase = parseInt(form.mileageAtPurchase);
    if (form.purchaseDate) p.purchaseDate = form.purchaseDate;
    if (form.warrantyExpiry) p.warrantyExpiry = form.warrantyExpiry;
    if (form.warrantyMiles) p.warrantyMiles = parseInt(form.warrantyMiles);
    if (form.warrantyNotes) p.warrantyNotes = form.warrantyNotes;
    if (form.notes) p.notes = form.notes;
    return p;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    const url = mode === "create"
      ? `/api/customers/${customerId}/vehicles`
      : `/api/vehicles/${vehicleId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.error?.details) {
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(json.error.details)) {
            mapped[k] = (v as string[])[0];
          }
          setErrors(mapped);
        } else {
          toast({ title: json.error?.message ?? "Something went wrong", variant: "destructive" });
        }
        return;
      }

      const vid = json.data.vehicle?.id ?? vehicleId;
      toast({ title: mode === "create" ? "Vehicle added" : "Changes saved" });
      router.push(`/vehicles/${vid}`);
      router.refresh();
    } catch {
      toast({ title: "Network error — please try again", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p className="text-xs text-destructive mt-1">{errors[field]}</p> : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* VIN Decoder panel */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">VIN Decoder</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Auto-fill vehicle details from NHTSA database — free, no API key needed
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1.5"
            onClick={() => setShowVinDecoder((v) => !v)}>
            <Search className="h-3.5 w-3.5" />
            {showVinDecoder ? "Hide decoder" : "Decode VIN"}
          </Button>
        </div>
        {showVinDecoder && (
          <VinDecoder onDecoded={handleVinDecoded} defaultVin={form.vin} />
        )}
        {!showVinDecoder && (
          <div className="space-y-1.5">
            <Label htmlFor="vin">VIN</Label>
            <Input id="vin" value={form.vin}
              onChange={(e) => set("vin", e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/gi, "").slice(0, 17))}
              placeholder="1HGBH41JXMN109186"
              className={cn("font-mono tracking-widest", errors.vin && "border-destructive")}
              maxLength={17} />
            <FieldError field="vin" />
          </div>
        )}
      </div>

      <Tabs defaultValue="identity">
        <TabsList className="w-full">
          <TabsTrigger value="identity" className="flex-1">Identity</TabsTrigger>
          <TabsTrigger value="specs" className="flex-1">Specs</TabsTrigger>
          <TabsTrigger value="service" className="flex-1">Service</TabsTrigger>
          <TabsTrigger value="ownership" className="flex-1">Ownership</TabsTrigger>
        </TabsList>

        {/* IDENTITY */}
        <TabsContent value="identity" className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Select value={form.year} onValueChange={(v) => set("year", v)}>
                <SelectTrigger className={cn(errors.year && "border-destructive")}>
                  <SelectValue placeholder="Select year…" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError field="year" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="make">Make</Label>
              <Input id="make" value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Toyota" className={cn(errors.make && "border-destructive")} />
              <FieldError field="make" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input id="model" value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Camry" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trim">Trim</Label>
              <Input id="trim" value={form.trim} onChange={(e) => set("trim", e.target.value)} placeholder="XSE" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="licensePlate">License plate</Label>
              <Input id="licensePlate" value={form.licensePlate}
                onChange={(e) => set("licensePlate", e.target.value.toUpperCase())}
                placeholder="ABC-1234" className="uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mileageLastSeen">Current mileage</Label>
              <Input id="mileageLastSeen" type="number" min="0" value={form.mileageLastSeen}
                onChange={(e) => set("mileageLastSeen", e.target.value)} placeholder="68,450" />
              <FieldError field="mileageLastSeen" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="colorExterior">Exterior color</Label>
              <Input id="colorExterior" value={form.colorExterior} onChange={(e) => set("colorExterior", e.target.value)} placeholder="Midnight Black" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="colorInterior">Interior color</Label>
              <Input id="colorInterior" value={form.colorInterior} onChange={(e) => set("colorInterior", e.target.value)} placeholder="Black leather" />
            </div>
          </div>
        </TabsContent>

        {/* SPECS */}
        <TabsContent value="specs" className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="engine">Engine</Label>
              <Input id="engine" value={form.engine} onChange={(e) => set("engine", e.target.value)} placeholder="2.5L 4-Cylinder DOHC" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="horsepower">Horsepower</Label>
              <Input id="horsepower" type="number" min="0" value={form.horsepower} onChange={(e) => set("horsepower", e.target.value)} placeholder="203" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Transmission</Label>
              <Select value={form.transmission} onValueChange={(v) => set("transmission", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="cvt">CVT</SelectItem>
                  <SelectItem value="dct">DCT / DSG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Drivetrain</Label>
              <Select value={form.drivetrain} onValueChange={(v) => set("drivetrain", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fwd">FWD</SelectItem>
                  <SelectItem value="rwd">RWD</SelectItem>
                  <SelectItem value="awd">AWD</SelectItem>
                  <SelectItem value="4wd">4WD / 4x4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fuel type</Label>
              <Select value={form.fuelType} onValueChange={(v) => set("fuelType", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gasoline">Gasoline</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="phev">Plug-in Hybrid</SelectItem>
                  <SelectItem value="electric">Electric</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tireSize">Tire size</Label>
              <Input id="tireSize" value={form.tireSize} onChange={(e) => set("tireSize", e.target.value)} placeholder="225/65R17" />
            </div>
            <div className="space-y-1.5">
              <Label>Tire pressure (PSI)</Label>
              <div className="flex gap-2">
                <Input type="number" value={form.tirePressureFront} onChange={(e) => set("tirePressureFront", e.target.value)} placeholder="Front" />
                <Input type="number" value={form.tirePressureRear} onChange={(e) => set("tirePressureRear", e.target.value)} placeholder="Rear" />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* SERVICE */}
        <TabsContent value="service" className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="oilType">Oil type</Label>
              <Input id="oilType" value={form.oilType} onChange={(e) => set("oilType", e.target.value)} placeholder="5W-30 Full Synthetic" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oilCapacityQt">Oil capacity (qt)</Label>
              <Input id="oilCapacityQt" type="number" step="0.5" min="0" value={form.oilCapacityQt} onChange={(e) => set("oilCapacityQt", e.target.value)} placeholder="4.5" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Any special notes about this vehicle…" className="min-h-[100px]" />
          </div>
        </TabsContent>

        {/* OWNERSHIP */}
        <TabsContent value="ownership" className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="purchaseDate">Purchase date</Label>
              <Input id="purchaseDate" type="date" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mileageAtPurchase">Mileage at purchase</Label>
              <Input id="mileageAtPurchase" type="number" min="0" value={form.mileageAtPurchase} onChange={(e) => set("mileageAtPurchase", e.target.value)} placeholder="12,000" />
            </div>
          </div>
          <div className="rounded-lg border border-border p-4 space-y-4">
            <h4 className="text-sm font-medium">Warranty</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="warrantyExpiry">Warranty expiry date</Label>
                <Input id="warrantyExpiry" type="date" value={form.warrantyExpiry} onChange={(e) => set("warrantyExpiry", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="warrantyMiles">Warranty mileage limit</Label>
                <Input id="warrantyMiles" type="number" min="0" value={form.warrantyMiles} onChange={(e) => set("warrantyMiles", e.target.value)} placeholder="36,000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="warrantyNotes">Warranty notes</Label>
              <Textarea id="warrantyNotes" value={form.warrantyNotes} onChange={(e) => set("warrantyNotes", e.target.value)} placeholder="Bumper-to-bumper, powertrain details…" className="min-h-[80px]" />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button type="submit" disabled={isLoading} className="min-w-32">
          {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> {mode === "create" ? "Adding…" : "Saving…"}</> : mode === "create" ? "Add vehicle" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>Cancel</Button>
      </div>
    </form>
  );
}
