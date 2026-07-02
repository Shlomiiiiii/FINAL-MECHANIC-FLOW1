import { z } from "zod";

const CURRENT_YEAR = new Date().getFullYear();

export const vehicleSchema = z.object({
  year: z
    .number()
    .int()
    .min(1886, "Year must be 1886 or later")
    .max(CURRENT_YEAR + 2, `Year cannot exceed ${CURRENT_YEAR + 2}`)
    .optional(),
  make: z.string().max(100).optional().transform((v) => v?.trim()),
  model: z.string().max(100).optional().transform((v) => v?.trim()),
  trim: z.string().max(100).optional().transform((v) => v?.trim()),
  vin: z
    .string()
    .length(17, "VIN must be exactly 17 characters")
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/i, "VIN contains invalid characters")
    .optional()
    .or(z.literal(""))
    .transform((v) => v?.toUpperCase() || undefined),
  licensePlate: z.string().max(20).optional().transform((v) => v?.toUpperCase().trim()),
  colorExterior: z.string().max(50).optional().transform((v) => v?.trim()),
  colorInterior: z.string().max(50).optional().transform((v) => v?.trim()),
  engine: z.string().max(100).optional().transform((v) => v?.trim()),
  transmission: z
    .enum(["automatic", "manual", "cvt", "dct", ""])
    .optional()
    .transform((v) => v || undefined),
  drivetrain: z
    .enum(["fwd", "rwd", "awd", "4wd", "4x4", ""])
    .optional()
    .transform((v) => v || undefined),
  fuelType: z
    .enum(["gasoline", "diesel", "hybrid", "electric", "phev", ""])
    .optional()
    .transform((v) => v || undefined),
  cylinders: z.number().int().min(1).max(16).optional(),
  displacement: z.string().max(20).optional().transform((v) => v?.trim()),
  horsepower: z.number().int().min(1).max(5000).optional(),
  oilType: z.string().max(100).optional().transform((v) => v?.trim()),
  oilCapacityQt: z.number().min(0).max(50).optional(),
  tireSize: z.string().max(30).optional().transform((v) => v?.trim()),
  tirePressureFront: z.number().int().min(10).max(120).optional(),
  tirePressureRear: z.number().int().min(10).max(120).optional(),
  mileageLastSeen: z.number().int().min(0).max(9999999).optional(),
  mileageAtPurchase: z.number().int().min(0).max(9999999).optional(),
  purchaseDate: z.string().optional().transform((v) => v ? new Date(v) : undefined),
  warrantyExpiry: z.string().optional().transform((v) => v ? new Date(v) : undefined),
  warrantyMiles: z.number().int().min(0).optional(),
  warrantyNotes: z.string().max(1000).optional().transform((v) => v?.trim()),
  notes: z.string().max(5000).optional().transform((v) => v?.trim()),
  primaryPhotoUrl: z.string().url().optional().or(z.literal("")),
});

export const maintenanceReminderSchema = z.object({
  serviceType: z.enum([
    "oil_change", "brakes", "transmission", "coolant", "spark_plugs",
    "air_filter", "cabin_filter", "battery", "tires", "timing_belt",
    "serpentine_belt", "fuel_filter", "power_steering", "custom",
  ]),
  name: z.string().min(1, "Service name is required").max(200),
  notes: z.string().max(1000).optional(),
  intervalMiles: z.number().int().min(100).max(500000).optional(),
  intervalMonths: z.number().int().min(1).max(120).optional(),
  lastCompletedMiles: z.number().int().min(0).optional(),
  lastCompletedAt: z.string().optional().transform((v) => v ? new Date(v) : undefined),
  dueMiles: z.number().int().min(0).optional(),
  dueDate: z.string().optional().transform((v) => v ? new Date(v) : undefined),
  isActive: z.boolean().optional().default(true),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;
export type MaintenanceReminderInput = z.infer<typeof maintenanceReminderSchema>;
