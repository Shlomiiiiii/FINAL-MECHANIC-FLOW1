import { z } from "zod";

// Phone formatter — strips everything non-digit, validates 10 digits
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

const phoneRegex = /^[\d\s\-\(\)\+\.]{7,20}$/;

export const customerSchema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name too long")
    .transform((v) => v.trim()),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name too long")
    .transform((v) => v.trim()),
  companyName: z
    .string()
    .max(200, "Company name too long")
    .optional()
    .transform((v) => v?.trim() || undefined),
  isCommercial: z.boolean().optional().default(false),
  email: z
    .string()
    .email("Please enter a valid email address")
    .max(254)
    .optional()
    .or(z.literal(""))
    .transform((v) => v?.toLowerCase().trim() || undefined),
  phonePrimary: z
    .string()
    .regex(phoneRegex, "Please enter a valid phone number")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? formatPhone(v) : undefined)),
  phoneSecondary: z
    .string()
    .regex(phoneRegex, "Please enter a valid phone number")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? formatPhone(v) : undefined)),
  preferredContact: z
    .enum(["phone", "email", "sms"])
    .optional()
    .default("phone"),
  // Service address
  addressLine1: z.string().max(200).optional().transform((v) => v?.trim()),
  addressLine2: z.string().max(200).optional().transform((v) => v?.trim()),
  city: z.string().max(100).optional().transform((v) => v?.trim()),
  state: z.string().max(50).optional().transform((v) => v?.trim()),
  zip: z.string().max(20).optional().transform((v) => v?.trim()),
  // CRM
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
  source: z
    .enum(["google", "referral", "repeat", "walk-in", "website", "other", ""])
    .optional()
    .transform((v) => v || undefined),
  notes: z.string().max(5000).optional().transform((v) => v?.trim()),
  doNotContact: z.boolean().optional().default(false),
});

export const customerUpdateSchema = customerSchema.partial().extend({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

export const communicationLogSchema = z.object({
  type: z.enum(["call", "sms", "email", "in_person", "note"]),
  direction: z.enum(["inbound", "outbound"]).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1, "Content is required").max(10000),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type CommunicationLogInput = z.infer<typeof communicationLogSchema>;
