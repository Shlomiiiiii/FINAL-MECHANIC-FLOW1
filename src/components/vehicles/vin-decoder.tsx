"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface DecodedVin {
  vin: string;
  checksumValid: boolean;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine: string | null;
  cylinders: number | null;
  displacement: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  horsepower: number | null;
  bodyStyle: string | null;
  doors: number | null;
  manufacturer: string | null;
  plantCountry: string | null;
  errors: string[];
}

interface Props {
  onDecoded: (data: DecodedVin) => void;
  defaultVin?: string;
}

export function VinDecoder({ onDecoded, defaultVin = "" }: Props) {
  const [vin, setVin] = useState(defaultVin);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<DecodedVin | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDecode = async () => {
    const clean = vin.trim().toUpperCase();
    if (clean.length !== 17) { setError("VIN must be exactly 17 characters"); return; }
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/vehicles/vin?vin=${encodeURIComponent(clean)}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message ?? "Decode failed");
        return;
      }
      setResult(json.data.decoded);
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (result) onDecoded(result);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={vin}
            onChange={(e) => { setVin(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/gi, "").slice(0, 17)); setError(null); }}
            placeholder="Enter 17-character VIN…"
            className={cn("font-mono tracking-widest uppercase", error && "border-destructive")}
            maxLength={17}
          />
          <span className={cn(
            "absolute right-2.5 top-1/2 -translate-y-1/2 text-xs tabular-nums",
            vin.length === 17 ? "text-green-600" : "text-muted-foreground"
          )}>
            {vin.length}/17
          </span>
        </div>
        <Button onClick={handleDecode} disabled={isLoading || vin.length !== 17} className="gap-1.5 flex-shrink-0">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Decode VIN
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-semibold text-foreground">
                {[result.year, result.make, result.model, result.trim].filter(Boolean).join(" ")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!result.checksumValid && (
                <Badge variant="warning" className="text-xs gap-1">
                  <Info className="h-3 w-3" /> Checksum warning
                </Badge>
              )}
              {result.errors.length > 0 && (
                <Badge variant="destructive" className="text-xs">{result.errors.length} error{result.errors.length > 1 ? "s" : ""}</Badge>
              )}
              <Button size="sm" onClick={handleApply} className="h-7 text-xs">
                Apply to vehicle
              </Button>
            </div>
          </div>

          {/* Fields grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-0 divide-border">
            {[
              { label: "Year", value: result.year },
              { label: "Make", value: result.make },
              { label: "Model", value: result.model },
              { label: "Trim", value: result.trim },
              { label: "Engine", value: result.engine },
              { label: "Cylinders", value: result.cylinders },
              { label: "Transmission", value: result.transmission ? result.transmission.charAt(0).toUpperCase() + result.transmission.slice(1) : null },
              { label: "Drivetrain", value: result.drivetrain?.toUpperCase() },
              { label: "Fuel type", value: result.fuelType ? result.fuelType.charAt(0).toUpperCase() + result.fuelType.slice(1) : null },
              { label: "Horsepower", value: result.horsepower ? `${result.horsepower} hp` : null },
              { label: "Body style", value: result.bodyStyle },
              { label: "Manufacturer", value: result.manufacturer },
            ].filter((f) => f.value).map((field) => (
              <div key={field.label} className="px-4 py-2.5 border-b border-r border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{field.label}</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{field.value}</p>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div className="px-4 py-2.5 bg-destructive/5 border-t border-destructive/20">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-destructive">{e}</p>
              ))}
            </div>
          )}

          <div className="px-4 py-2 bg-muted/50 border-t border-border">
            <p className="text-[10px] text-muted-foreground">
              Decoded via NHTSA vPIC API · Free government data · No API key required
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
