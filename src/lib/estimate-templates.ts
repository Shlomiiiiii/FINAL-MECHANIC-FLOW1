/**
 * Built-in MechanicFlow estimate templates.
 * Applied when a user selects a template in the estimate builder.
 */

export interface TemplateLineItem {
  itemType: "LABOR" | "PART" | "FEE";
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  category?: string;
  laborHours?: number;
}

export interface BuiltInTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultTitle: string;
  defaultWarranty: string;
  defaultNotes: string;
  lineItems: TemplateLineItem[];
}

export const BUILTIN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: "oil-change-synthetic",
    name: "Oil Change — Full Synthetic",
    description: "Standard full synthetic oil change with filter",
    category: "oil_change",
    defaultTitle: "Oil Change — Full Synthetic",
    defaultWarranty: "3 months / 3,000 miles",
    defaultNotes: "Includes oil filter, drain plug inspection, and fluid level check.",
    lineItems: [
      { itemType: "LABOR", description: "Oil change labor", quantity: 1, unitPriceCents: 5000, taxable: true, category: "Labor", laborHours: 0.5 },
      { itemType: "PART", description: "Full synthetic oil 5W-30 (5 qt)", quantity: 1, unitPriceCents: 3800, taxable: true, category: "Parts" },
      { itemType: "PART", description: "Oil filter", quantity: 1, unitPriceCents: 1200, taxable: true, category: "Parts" },
    ],
  },
  {
    id: "brake-pad-front",
    name: "Front Brake Pad Replacement",
    description: "Front brake pads with rotor inspection",
    category: "brakes",
    defaultTitle: "Front Brake Pad Replacement",
    defaultWarranty: "12 months / 12,000 miles",
    defaultNotes: "Includes rotor inspection. Rotor replacement quoted separately if needed.",
    lineItems: [
      { itemType: "LABOR", description: "Front brake pad replacement — labor", quantity: 1, unitPriceCents: 15000, taxable: true, category: "Labor", laborHours: 1.5 },
      { itemType: "PART", description: "Front brake pads (ceramic)", quantity: 1, unitPriceCents: 8900, taxable: true, category: "Parts" },
      { itemType: "FEE", description: "Brake cleaner & hardware kit", quantity: 1, unitPriceCents: 1500, taxable: true, category: "Supplies" },
    ],
  },
  {
    id: "brake-full",
    name: "Full Brake Service (All 4)",
    description: "All four corners — pads and rotors",
    category: "brakes",
    defaultTitle: "Full Brake Service",
    defaultWarranty: "12 months / 12,000 miles",
    defaultNotes: "Complete four-wheel brake service including pads, rotors, and hardware.",
    lineItems: [
      { itemType: "LABOR", description: "Full brake service — labor (4 corners)", quantity: 1, unitPriceCents: 32000, taxable: true, category: "Labor", laborHours: 3.0 },
      { itemType: "PART", description: "Brake pads — front (ceramic)", quantity: 1, unitPriceCents: 8900, taxable: true, category: "Parts" },
      { itemType: "PART", description: "Brake pads — rear (ceramic)", quantity: 1, unitPriceCents: 7500, taxable: true, category: "Parts" },
      { itemType: "PART", description: "Brake rotors — front (pair)", quantity: 1, unitPriceCents: 18000, taxable: true, category: "Parts" },
      { itemType: "PART", description: "Brake rotors — rear (pair)", quantity: 1, unitPriceCents: 16000, taxable: true, category: "Parts" },
      { itemType: "FEE", description: "Hardware & supplies", quantity: 1, unitPriceCents: 2500, taxable: true, category: "Supplies" },
    ],
  },
  {
    id: "ac-diagnostic",
    name: "A/C Diagnostic + Recharge",
    description: "System diagnosis with refrigerant recharge",
    category: "ac",
    defaultTitle: "A/C Diagnostic + Recharge",
    defaultWarranty: "90 days",
    defaultNotes: "Includes system pressure test, leak check, and refrigerant recharge.",
    lineItems: [
      { itemType: "LABOR", description: "A/C system diagnostic", quantity: 1, unitPriceCents: 9500, taxable: true, category: "Labor", laborHours: 1.0 },
      { itemType: "LABOR", description: "A/C recharge labor", quantity: 1, unitPriceCents: 5500, taxable: true, category: "Labor", laborHours: 0.5 },
      { itemType: "PART", description: "R-134a refrigerant", quantity: 1, unitPriceCents: 4500, taxable: true, category: "Parts" },
    ],
  },
  {
    id: "tire-rotation",
    name: "Tire Rotation + Balance",
    description: "4-tire rotation and balance check",
    category: "tires",
    defaultTitle: "Tire Rotation + Balance",
    defaultWarranty: "",
    defaultNotes: "Includes torque to spec and tire pressure check.",
    lineItems: [
      { itemType: "LABOR", description: "Tire rotation & balance", quantity: 1, unitPriceCents: 5500, taxable: true, category: "Labor", laborHours: 0.75 },
    ],
  },
  {
    id: "transmission-service",
    name: "Transmission Service",
    description: "Fluid drain and fill with filter",
    category: "transmission",
    defaultTitle: "Transmission Service",
    defaultWarranty: "12 months / 12,000 miles",
    defaultNotes: "Drain and fill service. Full flush available at additional cost.",
    lineItems: [
      { itemType: "LABOR", description: "Transmission service — labor", quantity: 1, unitPriceCents: 12000, taxable: true, category: "Labor", laborHours: 1.25 },
      { itemType: "PART", description: "Transmission fluid (4 qt)", quantity: 1, unitPriceCents: 6800, taxable: true, category: "Parts" },
      { itemType: "PART", description: "Transmission filter", quantity: 1, unitPriceCents: 2400, taxable: true, category: "Parts" },
      { itemType: "PART", description: "Gasket / pan seal", quantity: 1, unitPriceCents: 1800, taxable: true, category: "Parts" },
    ],
  },
  {
    id: "diagnostic",
    name: "Diagnostic Inspection",
    description: "OBD scan and multi-point inspection",
    category: "diagnostics",
    defaultTitle: "Diagnostic Inspection",
    defaultWarranty: "",
    defaultNotes: "Comprehensive diagnostic including OBD-II scan, visual inspection, and test drive.",
    lineItems: [
      { itemType: "LABOR", description: "Diagnostic inspection — 1 hour", quantity: 1, unitPriceCents: 9500, taxable: true, category: "Labor", laborHours: 1.0 },
    ],
  },
  {
    id: "coolant-flush",
    name: "Coolant System Flush",
    description: "Full coolant drain, flush, and refill",
    category: "cooling",
    defaultTitle: "Coolant System Flush",
    defaultWarranty: "12 months",
    defaultNotes: "Complete coolant system flush with new antifreeze/coolant mixture.",
    lineItems: [
      { itemType: "LABOR", description: "Coolant flush — labor", quantity: 1, unitPriceCents: 7500, taxable: true, category: "Labor", laborHours: 0.75 },
      { itemType: "PART", description: "Coolant/antifreeze (1 gal)", quantity: 2, unitPriceCents: 2400, taxable: true, category: "Parts" },
    ],
  },
  {
    id: "spark-plugs",
    name: "Spark Plug Replacement",
    description: "All plugs replaced with iridium tips",
    category: "engine",
    defaultTitle: "Spark Plug Replacement",
    defaultWarranty: "24 months / 24,000 miles",
    defaultNotes: "Iridium spark plugs for extended service life.",
    lineItems: [
      { itemType: "LABOR", description: "Spark plug replacement — labor", quantity: 1, unitPriceCents: 9500, taxable: true, category: "Labor", laborHours: 1.0 },
      { itemType: "PART", description: "Iridium spark plugs (set of 4)", quantity: 1, unitPriceCents: 5600, taxable: true, category: "Parts" },
    ],
  },
  {
    id: "multi-point",
    name: "Multi-Point Inspection",
    description: "30-point vehicle health inspection",
    category: "inspection",
    defaultTitle: "30-Point Vehicle Inspection",
    defaultWarranty: "",
    defaultNotes: "Comprehensive safety and maintenance inspection. Written report provided.",
    lineItems: [
      { itemType: "LABOR", description: "30-point inspection", quantity: 1, unitPriceCents: 6500, taxable: true, category: "Labor", laborHours: 0.75 },
    ],
  },
];

export const TEMPLATE_CATEGORIES = [
  { value: "oil_change", label: "Oil Change" },
  { value: "brakes", label: "Brakes" },
  { value: "tires", label: "Tires" },
  { value: "transmission", label: "Transmission" },
  { value: "ac", label: "A/C" },
  { value: "cooling", label: "Cooling" },
  { value: "engine", label: "Engine" },
  { value: "suspension", label: "Suspension" },
  { value: "diagnostics", label: "Diagnostics" },
  { value: "inspection", label: "Inspection" },
  { value: "custom", label: "Custom" },
];
