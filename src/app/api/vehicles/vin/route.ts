import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { validateVinChecksum } from "@/lib/vin";

/**
 * Server-side VIN decode proxy → NHTSA vPIC API
 * Caches result on the vehicle record after decode.
 * No API key required — NHTSA is a free government service.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const vin = searchParams.get("vin")?.trim().toUpperCase();

    if (!vin) return ApiErrors.validation({ vin: ["VIN is required"] });
    if (vin.length !== 17) return ApiErrors.validation({ vin: ["VIN must be exactly 17 characters"] });
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
      return ApiErrors.validation({ vin: ["VIN contains invalid characters (I, O, Q not allowed)"] });
    }

    // Checksum validation (warns but doesn't block — some valid VINs fail)
    const checksumValid = validateVinChecksum(vin);

    const nhtsaUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${encodeURIComponent(vin)}?format=json`;

    let nhtsaData: any;
    try {
      const nhtsaRes = await fetch(nhtsaUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
        next: { revalidate: 86400 }, // cache 24h — VIN data never changes
      });

      if (!nhtsaRes.ok) {
        return ApiErrors.businessLogic(
          `NHTSA API returned ${nhtsaRes.status}. Please try again.`
        );
      }
      nhtsaData = await nhtsaRes.json();
    } catch (fetchError: any) {
      if (fetchError?.name === "TimeoutError") {
        return ApiErrors.businessLogic("NHTSA API timed out. Please try again.");
      }
      return ApiErrors.businessLogic("Could not reach NHTSA API. Check your connection.");
    }

    if (!nhtsaData?.Results || !Array.isArray(nhtsaData.Results)) {
      return ApiErrors.businessLogic("Unexpected response from NHTSA API.");
    }

    // Parse response
    const raw: Record<string, string> = {};
    for (const entry of nhtsaData.Results as Array<{ Variable: string; Value: string | null }>) {
      if (entry.Value && entry.Value !== "Not Applicable" && entry.Value !== "0" && entry.Value !== "") {
        raw[entry.Variable] = entry.Value;
      }
    }

    const get = (key: string) => raw[key] ?? null;

    // Normalize fuelType
    const fuelRaw = get("Fuel Type - Primary") ?? "";
    let fuelType: string | null = null;
    if (fuelRaw.toLowerCase().includes("gasoline")) fuelType = "gasoline";
    else if (fuelRaw.toLowerCase().includes("diesel")) fuelType = "diesel";
    else if (fuelRaw.toLowerCase().includes("hybrid") && fuelRaw.toLowerCase().includes("electric")) fuelType = "phev";
    else if (fuelRaw.toLowerCase().includes("hybrid")) fuelType = "hybrid";
    else if (fuelRaw.toLowerCase().includes("electric")) fuelType = "electric";

    // Normalize transmission
    const transRaw = get("Transmission Style") ?? "";
    let transmission: string | null = null;
    if (transRaw.toLowerCase().includes("cvt") || transRaw.toLowerCase().includes("continuously")) transmission = "cvt";
    else if (transRaw.toLowerCase().includes("dual") || transRaw.toLowerCase().includes("dsg")) transmission = "dct";
    else if (transRaw.toLowerCase().includes("automatic")) transmission = "automatic";
    else if (transRaw.toLowerCase().includes("manual")) transmission = "manual";

    // Normalize drivetrain
    const driveRaw = get("Drive Type") ?? "";
    let drivetrain: string | null = null;
    if (driveRaw.toLowerCase().includes("all wheel") || driveRaw.toLowerCase().includes("awd")) drivetrain = "awd";
    else if (driveRaw.toLowerCase().includes("4x4") || driveRaw.toLowerCase().includes("four wheel")) drivetrain = "4wd";
    else if (driveRaw.toLowerCase().includes("rear")) drivetrain = "rwd";
    else if (driveRaw.toLowerCase().includes("front")) drivetrain = "fwd";

    const cylinders = get("Number of Cylinders") ? parseInt(get("Number of Cylinders")!) || null : null;
    const displacementRaw = get("Displacement (L)");
    const displacement = displacementRaw ? `${parseFloat(displacementRaw).toFixed(1)}L` : null;

    let engine = get("Engine Configuration");
    if (displacement && cylinders && !engine) engine = `${displacement} ${cylinders}-Cyl`;
    else if (displacement && engine) engine = `${displacement} ${engine}`;

    const decoded = {
      vin,
      checksumValid,
      year: get("Model Year") ? parseInt(get("Model Year")!) || null : null,
      make: get("Make"),
      model: get("Model"),
      trim: get("Trim") || null,
      engine: engine || null,
      cylinders,
      displacement,
      transmission,
      drivetrain,
      fuelType,
      horsepower: get("Engine Brake (hp) From") ? parseInt(get("Engine Brake (hp) From")!) || null : null,
      bodyStyle: get("Body Class"),
      doors: get("Doors") ? parseInt(get("Doors")!) || null : null,
      manufacturer: get("Manufacturer Name"),
      plantCountry: get("Plant Country"),
      errors: nhtsaData.Results
        .filter((r: any) => r.Variable === "Error Text" && r.Value)
        .map((r: any) => r.Value as string),
      rawData: raw,
    };

    return successResponse({ decoded });
  } catch (error) {
    console.error("VIN decode error:", error);
    return ApiErrors.internal();
  }
}
