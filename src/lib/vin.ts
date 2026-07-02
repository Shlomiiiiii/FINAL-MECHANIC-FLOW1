/**
 * VIN Decoder — NHTSA vPIC API
 *
 * Free, no API key required.
 * Documentation: https://vpic.nhtsa.dot.gov/api/
 *
 * Called client-side to avoid server network restrictions in dev.
 * In production Next.js API routes forward this request.
 */

export interface VinDecodeResult {
  vin: string;
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
  plantCountry: string | null;
  manufacturer: string | null;
  rawData: Record<string, string>;
  errors: string[];
}

const NHTSA_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

// Maps NHTSA variable names to our fields
const FIELD_MAP: Record<string, keyof VinDecodeResult> = {
  "Model Year": "year",
  "Make": "make",
  "Model": "model",
  "Trim": "trim",
  "Engine Configuration": "engine",
  "Number of Cylinders": "cylinders",
  "Displacement (L)": "displacement",
  "Transmission Style": "transmission",
  "Drive Type": "drivetrain",
  "Fuel Type - Primary": "fuelType",
  "Engine Brake (hp) From": "horsepower",
  "Body Class": "bodyStyle",
  "Doors": "doors",
  "Plant Country": "plantCountry",
  "Manufacturer Name": "manufacturer",
};

// Normalize NHTSA values → our enum values
function normalizeFuelType(val: string): string | null {
  const v = val.toLowerCase();
  if (v.includes("gasoline") || v.includes("gas")) return "gasoline";
  if (v.includes("diesel")) return "diesel";
  if (v.includes("electric") && v.includes("hybrid")) return "phev";
  if (v.includes("hybrid")) return "hybrid";
  if (v.includes("electric")) return "electric";
  return null;
}

function normalizeTransmission(val: string): string | null {
  const v = val.toLowerCase();
  if (v.includes("automatic") && (v.includes("cvt") || v.includes("continuously"))) return "cvt";
  if (v.includes("dual") || v.includes("dct") || v.includes("dsg")) return "dct";
  if (v.includes("automatic")) return "automatic";
  if (v.includes("manual")) return "manual";
  return null;
}

function normalizeDrivetrain(val: string): string | null {
  const v = val.toLowerCase();
  if (v.includes("all wheel") || v.includes("awd")) return "awd";
  if (v.includes("4x4") || v.includes("4wd") || v.includes("four wheel")) return "4wd";
  if (v.includes("rear")) return "rwd";
  if (v.includes("front")) return "fwd";
  return null;
}

export async function decodeVin(vin: string): Promise<VinDecodeResult> {
  const clean = vin.trim().toUpperCase();

  const result: VinDecodeResult = {
    vin: clean,
    year: null, make: null, model: null, trim: null,
    engine: null, cylinders: null, displacement: null,
    transmission: null, drivetrain: null, fuelType: null,
    horsepower: null, bodyStyle: null, doors: null,
    plantCountry: null, manufacturer: null,
    rawData: {}, errors: [],
  };

  const url = `${NHTSA_BASE}/DecodeVin/${encodeURIComponent(clean)}?format=json`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    result.errors.push(`NHTSA API returned ${res.status}`);
    return result;
  }

  const data = await res.json();
  if (!data?.Results || !Array.isArray(data.Results)) {
    result.errors.push("Unexpected response format from NHTSA");
    return result;
  }

  // Check for decode errors
  const errorEntry = data.Results.find(
    (r: any) => r.Variable === "Error Code" && r.Value && r.Value !== "0"
  );
  const errorText = data.Results.find((r: any) => r.Variable === "Error Text");
  if (errorEntry && errorText?.Value) {
    result.errors.push(errorText.Value);
  }

  // Extract fields
  for (const entry of data.Results as Array<{ Variable: string; Value: string | null }>) {
    if (!entry.Value || entry.Value === "Not Applicable" || entry.Value === "0" || entry.Value === "") continue;

    result.rawData[entry.Variable] = entry.Value;

    switch (entry.Variable) {
      case "Model Year":
        result.year = parseInt(entry.Value) || null;
        break;
      case "Make":
        result.make = entry.Value.trim();
        break;
      case "Model":
        result.model = entry.Value.trim();
        break;
      case "Trim":
        result.trim = entry.Value.trim() || null;
        break;
      case "Engine Configuration":
        result.engine = entry.Value.trim();
        break;
      case "Number of Cylinders":
        result.cylinders = parseInt(entry.Value) || null;
        break;
      case "Displacement (L)":
        result.displacement = `${parseFloat(entry.Value).toFixed(1)}L`;
        break;
      case "Transmission Style":
        result.transmission = normalizeTransmission(entry.Value);
        break;
      case "Drive Type":
        result.drivetrain = normalizeDrivetrain(entry.Value);
        break;
      case "Fuel Type - Primary":
        result.fuelType = normalizeFuelType(entry.Value);
        break;
      case "Engine Brake (hp) From":
        result.horsepower = parseInt(entry.Value) || null;
        break;
      case "Body Class":
        result.bodyStyle = entry.Value.trim();
        break;
      case "Doors":
        result.doors = parseInt(entry.Value) || null;
        break;
      case "Plant Country":
        result.plantCountry = entry.Value.trim();
        break;
      case "Manufacturer Name":
        result.manufacturer = entry.Value.trim();
        break;
    }
  }

  // Build engine string if we have parts
  if (result.displacement && result.cylinders && !result.engine) {
    result.engine = `${result.displacement} ${result.cylinders}-Cylinder`;
  } else if (result.displacement && result.engine) {
    result.engine = `${result.displacement} ${result.engine}`;
  }

  return result;
}

// Validate VIN checksum (digit 9)
export function validateVinChecksum(vin: string): boolean {
  const transliteration: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
    "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
    "6": 6, "7": 7, "8": 8, "9": 9,
  };
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const v = vin.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const val = transliteration[v[i]];
    if (val === undefined) return false;
    sum += val * weights[i];
  }
  const check = sum % 11;
  const checkChar = check === 10 ? "X" : String(check);
  return v[8] === checkChar;
}
